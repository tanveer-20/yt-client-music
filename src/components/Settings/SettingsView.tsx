/**
 * SettingsView — user preferences, themes, audio quality, server connection, and cache controls.
 */

import { useState } from 'react';
import {
  RiMoonClearLine,
  RiSunLine,
  RiContrastDropLine,
  RiSoundModuleLine,
  RiInfinityLine,
  RiDeleteBinLine,
  RiCheckLine,
  RiVolumeUpLine,
  RiServerLine,
  RiWifiLine,
  RiRefreshLine,
  RiInformationLine,
} from 'react-icons/ri';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePlaylistStore } from '../../stores/playlistStore';
import { usePlayerStore } from '../../stores/playerStore';
import type { ThemeMode, AudioQuality } from '../../types';

export function SettingsView() {
  const {
    theme,
    setTheme,
    audioQuality,
    setAudioQuality,
    autoPlaySimilar,
    setAutoPlaySimilar,
    normalizeVolume,
    setNormalizeVolume,
    serverUrl,
    setServerUrl,
    serverStatus,
    serverPingMs,
    checkConnection,
  } = useSettingsStore();

  const { clearQueue } = usePlayerStore();
  const [clearedMessage, setClearedMessage] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const showClearedToast = (msg: string) => {
    setClearedMessage(msg);
    setTimeout(() => setClearedMessage(null), 2500);
  };

  const handleSaveAndTestServer = async () => {
    setIsTesting(true);
    setTestResult(null);
    const cleaned = inputUrl.trim();
    setServerUrl(cleaned);

    const res = await checkConnection(cleaned);
    setTestResult({ ok: res.ok, message: res.message });
    setIsTesting(false);

    if (res.ok) {
      showClearedToast('Connected to server successfully!');
    }
  };

  const handleClearCache = () => {
    localStorage.removeItem('yt-music-player');
    showClearedToast('Audio playback cache cleared');
  };

  const themeOptions: { id: ThemeMode; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'oled',
      label: 'OLED Black',
      icon: <RiContrastDropLine size={20} />,
      desc: 'True pure black #000, best for battery on OLED screens',
    },
    {
      id: 'dark',
      label: 'Midnight Dark',
      icon: <RiMoonClearLine size={20} />,
      desc: 'Subtle deep dark slate gray theme',
    },
    {
      id: 'light',
      label: 'Light Mode',
      icon: <RiSunLine size={20} />,
      desc: 'Clean iOS bright aesthetic',
    },
  ];

  const qualityOptions: { id: AudioQuality; label: string; badge: string; desc: string }[] = [
    {
      id: 'high',
      label: 'High Quality',
      badge: '256 kbps AAC',
      desc: 'Maximum bit-depth and acoustic clarity (Closest to Apple Music)',
    },
    {
      id: 'medium',
      label: 'Standard Quality',
      badge: '160 kbps Opus',
      desc: 'Fast streaming with high definition fidelity',
    },
    {
      id: 'saver',
      label: 'Data Saver',
      badge: '128 kbps',
      desc: 'Reduced cellular bandwidth consumption',
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] safe-scroll-bottom max-w-2xl mx-auto">
        <h1 className="page-title mb-6">Settings</h1>

        {/* Toast */}
        {clearedMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2 animate-fade-in">
            <RiCheckLine size={18} />
            {clearedMessage}
          </div>
        )}

        {/* ── Section: Streaming Server & Network ── */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/40">
              Streaming Server & Network
            </h2>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  serverStatus === 'connected'
                    ? 'bg-emerald-400 animate-pulse'
                    : serverStatus === 'checking'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span
                className={`text-xs font-semibold ${
                  serverStatus === 'connected'
                    ? 'text-emerald-400'
                    : serverStatus === 'checking'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {serverStatus === 'connected'
                  ? `Connected (${serverPingMs ?? 0}ms)`
                  : serverStatus === 'checking'
                  ? 'Checking...'
                  : 'Server Offline / Direct Mode'}
              </span>
            </div>
          </div>

          <div className="card p-4 sm:p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/60 mb-2">
                Backend Server URL
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="e.g. http://192.168.1.50:3001"
                  className="search-bar text-sm flex-1 py-2.5 px-3.5 font-mono"
                />
                <button
                  onClick={handleSaveAndTestServer}
                  disabled={isTesting}
                  className="btn-primary py-2.5 px-5 text-xs sm:text-sm flex items-center justify-center gap-2 shrink-0"
                >
                  <RiRefreshLine size={16} className={isTesting ? 'animate-spin' : ''} />
                  {isTesting ? 'Testing...' : 'Save & Test'}
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  testResult.ok
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                }`}
              >
                {testResult.ok ? <RiCheckLine size={16} /> : <RiInformationLine size={16} />}
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="pt-2 border-t border-white/[0.06] text-xs text-white/40 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-white/60 flex items-center gap-1.5">
                <RiWifiLine size={14} className="text-brand-400" />
                How to connect your phone APK:
              </p>
              <p>
                1. On your PC terminal, run <code className="text-white/80 bg-white/[0.08] px-1 py-0.5 rounded">npm run server</code>.
              </p>
              <p>
                2. Make sure your phone and PC are connected to the <strong>same Wi-Fi network</strong>.
              </p>
              <p>
                3. Enter your PC's Local IP address above (e.g. <code className="text-white/80 bg-white/[0.08] px-1 py-0.5 rounded">http://192.168.x.x:3001</code>) and tap <strong>Save & Test</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* ── Section: Appearance / Theme ── */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3 px-1">
            Appearance
          </h2>
          <div className="space-y-2">
            {themeOptions.map((opt) => {
              const isSelected = theme === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setTheme(opt.id)}
                  className={`card w-full p-4 flex items-center justify-between text-left transition-all ${
                    isSelected ? 'border-brand-500/50 bg-brand-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                          : 'bg-white/[0.05] text-white/60'
                      }`}
                    >
                      {opt.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{opt.label}</p>
                      <p className="text-xs text-white/40 mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                      <RiCheckLine size={14} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Section: Audio Quality ── */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3 px-1">
            Audio Streaming Quality
          </h2>
          <div className="space-y-2">
            {qualityOptions.map((opt) => {
              const isSelected = audioQuality === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setAudioQuality(opt.id)}
                  className={`card w-full p-4 flex items-center justify-between text-left transition-all ${
                    isSelected ? 'border-brand-500/50 bg-brand-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                          : 'bg-white/[0.05] text-white/60'
                      }`}
                    >
                      <RiSoundModuleLine size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{opt.label}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300">
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                      <RiCheckLine size={14} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Section: Playback Behavior ── */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3 px-1">
            Playback & Experience
          </h2>
          <div className="card divide-y divide-white/[0.06] overflow-hidden">
            {/* Auto-Play Similar */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-brand-400">
                  <RiInfinityLine size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Auto-Play Similar Songs</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Keep music going with recommendations when queue ends
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoPlaySimilar}
                onChange={(e) => setAutoPlaySimilar(e.target.checked)}
                className="w-5 h-5 accent-brand-500 rounded cursor-pointer"
              />
            </div>

            {/* Volume Normalization */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/70">
                  <RiVolumeUpLine size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Volume Normalization</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Maintains consistent audio loudness across all songs
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={normalizeVolume}
                onChange={(e) => setNormalizeVolume(e.target.checked)}
                className="w-5 h-5 accent-brand-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* ── Section: Storage & Maintenance ── */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-white/40 mb-3 px-1">
            Storage & Maintenance
          </h2>
          <div className="card divide-y divide-white/[0.06] overflow-hidden">
            <button
              onClick={handleClearCache}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/60">
                  <RiDeleteBinLine size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Clear Playback Cache</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    Resets queue history and cached stream state
                  </p>
                </div>
              </div>
              <span className="text-xs text-brand-400 font-medium">Clear</span>
            </button>

            <button
              onClick={() => {
                clearQueue();
                showClearedToast('Queue cleared');
              }}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/60">
                  <RiDeleteBinLine size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Clear Active Queue</p>
                  <p className="text-xs text-white/40 mt-0.5">Empties all pending tracks</p>
                </div>
              </div>
              <span className="text-xs text-white/40 font-medium">Reset</span>
            </button>
          </div>
        </section>

        {/* ── Section: Device & Build Info ── */}
        <section className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
              <RiServerLine size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">YT Music · Android Edition</p>
              <p className="text-xs text-white/50 font-medium mt-0.5">
                Optimized for Android 14/15 Edge-to-Edge & OLED Displays
              </p>
            </div>
          </div>
          <p className="text-xs text-white/40 mt-3 leading-relaxed">
            High-fidelity YouTube audio streamer with AAC 256kbps capability, dynamic safe area adaptation, and low-latency proxy streaming.
          </p>
        </section>
      </div>
    </div>
  );
}
