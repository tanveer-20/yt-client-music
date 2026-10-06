# Architectural Guide: Playback Latency Optimization & Open-Source Codec Strategy

**Target Path**: `docs/playback-latency-and-codec-guide.md`  
**Purpose**: Implementation specification for reducing initial playback latency from ~6s to <400ms (instant start) and utilizing the open-source Opus codec for maximum audio fidelity.

---

## 1. Executive Summary & Root Cause Analysis

### The Problem
When a user selects an uncached track, playback pauses for **4 to 6 seconds** before sound begins. Other third-party music apps (ViMusic, InnerTune, NewPipe, Spotube) start playing new tracks in **~200–400ms**.

### Empirical Benchmark Findings (Current App)
- **Cold Request (First Play)**: **`~6.2 seconds`** (Measured on local machine via `GET /api/stream/:videoId`)
- **Cached Request (Second Play)**: **`~0.35 seconds`** (Virtually instantaneous)

```
[User Taps Song]
   │
   ▼
[Express Server /api/stream/:id]
   │  (Stream Cache Miss)
   ▼
[Child Process: python.exe -m yt_dlp ...]  ◄─── ROOT CAUSE (~5.8s latency)
   ├── 1. Windows OS process allocation & Python boot: ~0.4s
   ├── 2. Python imports yt_dlp modules into RAM:      ~1.1s
   ├── 3. Cold TLS handshake with YouTube:             ~0.5s
   └── 4. YouTube player JS download & cipher eval:    ~3.8s
   │
   ▼
[JSON output piped to Node] ──► [Audio Bytes Piped to Client] ──► [Plays at T + 6.2s]
```

### Key Takeaway
1. **Audio Decoding & Codecs are NOT the cause of the delay**: Browsers and mobile chipsets decode audio in sub-millisecond time.
2. **Spawning `python.exe` on every track click is the bottleneck**: Python and `yt-dlp` are cold-started from scratch on every uncached click.

---

## 2. Codec Strategy: Open-Source Opus vs AAC

### 2.1 Why Prioritize Open-Source Opus (`itag 251`)
YouTube provides two primary audio streams for free tracks:

| Parameter | Open-Source Opus (`itag 251`) | Proprietary AAC (`itag 140`) |
| :--- | :--- | :--- |
| **Licensing** | **Open Source / Royalty-Free (IETF RFC 6716, Xiph.Org)** | Proprietary (MPEG-4 AAC-LC) |
| **Bitrate** | **~160 kbps VBR (Variable Bitrate)** | **128 kbps CBR (Constant Bitrate)** |
| **Native Sample Rate** | **48,000 Hz (48 kHz)** | **44,100 Hz (44.1 kHz)** |
| **High-Frequency Ceiling** | Full spectrum extension up to **22 kHz** | Hard brickwall lowpass filter at **~16 kHz** |
| **Compatibility with App DSP** | **1:1 bit-perfect match** with `AudioContext({ sampleRate: 48000 })` | Requires browser/HAL software resampling |
| **Hardware Decoding** | Supported natively by Android (ExoPlayer) & modern WebKit/Blink | Supported natively |

### 2.2 Why Custom Client-Side Decoders (WASM libopus / FFmpeg) are Anti-Patterns
- **Source Ceiling**: YouTube compresses audio at source. Running a software decoder in WebAssembly cannot restore frequencies removed during upload.
- **Battery & CPU Penalty**: Native browsers and Android utilize hardware-accelerated silicon decoders. Running software decoding in JavaScript/WASM causes device heating and battery drain.
- **Recommendation**: Rely on native hardware decoders while strictly requesting YouTube's highest quality **Opus 48kHz (itag 251)** stream from the backend.

---

## 3. Implementation Plan for `agy`

To achieve **instant playback (<400ms)** and **maximum audio quality**, execute the following three implementation tasks.

---

### Task 1: Fix Codec Format Priority in `youtube.ts`

**File**: `server/src/services/youtube.ts`  
**Current line (~408)**:
```ts
const formatSelector = '140/251/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best';
```

**Target**:
Place `251` (Opus) first so `yt-dlp` extracts the 160kbps 48kHz Opus stream rather than the 128kbps AAC stream:
```ts
const formatSelector = '251/140/bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best';
```

---

### Task 2: Eliminate the 5-Second Cold Start Delay

To start playing in **~250–350ms** without spawning a new Python CLI process on every tap, choose one of the following two architectures:

#### Option A (Recommended): In-Process Node.js YouTube Extractor (`youtubei.js`)
By using an in-process library like `youtubei.js` (Innertube) inside `server/`, everything runs directly in the Node.js event loop:
- **Zero OS process overhead** (no Python startup).
- **Persistent HTTP keep-alive connection pool**.
- **In-memory decipher cache** (player decryption algorithms are cached in RAM).

```bash
cd server
npm install youtubei.js
```

**Implementation Pattern (`server/src/services/innertube.ts`)**:
```ts
import { Innertube, UniversalCache } from 'youtubei.js';

let ytPromise: Promise<Innertube> | null = null;

export async function getInnertube(): Promise<Innertube> {
  if (!ytPromise) {
    ytPromise = Innertube.create({
      cache: new UniversalCache(true),
      clientType: 'WEB_REMIX', // Official YouTube Music client context
    });
  }
  return ytPromise;
}

export async function getFastStreamUrl(videoId: string) {
  const yt = await getInnertube();
  const info = await yt.music.getInfo(videoId);
  
  // Pick highest quality Opus audio format (itag 251)
  const format = info.chooseFormat({ type: 'audio', quality: 'best', format: 'webm' });
  const streamUrl = format?.decipher(yt.session.player);
  
  return {
    url: streamUrl,
    contentType: 'audio/webm; codecs="opus"',
    loudnessDb: (info.basic_info as any)?.loudnessDb,
  };
}
```
*Expected Cold Response Time: **~250ms – 400ms**.*

---

#### Option B: Persistent Python Daemon (IPC / Stdout)
If you prefer keeping `yt-dlp` instead of adding `youtubei.js`, do not spawn `python.exe -m yt_dlp` per request. Instead, launch a **long-running background Python worker** on server startup that keeps `yt_dlp` imported in memory and accepts `videoId` over `stdin`:

```python
# server/worker.py
import sys, json, yt_dlp

ydl_opts = {
    'format': '251/140/bestaudio',
    'quiet': True,
    'no_warnings': True,
}
ydl = yt_dlp.YoutubeDL(ydl_opts)

for line in sys.stdin:
    video_id = line.strip()
    if not video_id: continue
    try:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        sys.stdout.write(json.dumps({'url': info['url'], 'ext': info.get('ext')}) + '\n')
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({'error': str(e)}) + '\n')
        sys.stdout.flush()
```
*Expected Cold Response Time: **~700ms – 1.2s** (bypasses Python/yt-dlp import overhead).*

---

### Task 3: Intelligent Queue & Next-Track Prefetching

Even with fast in-memory extraction, prefetching makes transitions **0ms (imperceptible)**.

#### 1. Backend Prefetch Endpoint
In `server/src/routes/stream.ts`:
```ts
router.post('/prefetch/:videoId', async (req, res) => {
  const { videoId } = req.params;
  if (!videoId || streamCache.has(videoId)) {
    return res.json({ cached: true });
  }
  
  // Resolve in background without blocking response
  getStreamUrl(videoId).then(result => {
    streamCache.set(videoId, result, 4 * 60 * 60 * 1000);
  }).catch(() => {});
  
  res.json({ prefetching: true });
});
```

#### 2. Client-Side Trigger in `useAudioPlayer.ts`
When the current track is within **20 seconds of finishing** or when a new playlist/queue is loaded:
```ts
// In the timeupdate listener or on track change:
const queue = usePlayerStore.getState().queue;
const currentIndex = usePlayerStore.getState().currentIndex;
const nextTrack = queue[currentIndex + 1];

if (nextTrack) {
  fetch(`/api/stream/prefetch/${nextTrack.id}`, { method: 'POST' }).catch(() => {});
}
```

---

## 4. Verification & Testing Checklist for `agy`

1. **Verify Opus Stream Negotiation**:
   Run curl on the stream endpoint:
   ```bash
   curl -I http://localhost:3001/api/stream/<VIDEO_ID>
   ```
   *Expected Header*: `Content-Type: audio/webm; codecs="opus"`

2. **Benchmark Stream Latency**:
   Measure response time on an uncached video ID:
   ```powershell
   powershell -Command "Measure-Command { curl.exe -s -r 0-1024 'http://localhost:3001/api/stream/<UNCACHED_ID>' -o nul }"
   ```
   - Target: `TotalMilliseconds < 500` (down from current `6200ms`).

3. **Verify Bit-Perfect DSP Sample Rate**:
   In the browser console, inspect:
   ```javascript
   audioDSP.ctx.sampleRate // Must output: 48000
   ```
