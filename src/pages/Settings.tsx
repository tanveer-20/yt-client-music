import { useEffect, useState } from 'react';
import { CheckCircle2, Keyboard, Play, Server, SlidersHorizontal, XCircle } from 'lucide-react';
import { useSettingsStore, type Quality } from '@/state/settings';
import { useAutomixStore } from '@/playback/automix';
import { checkHealth } from '@/data/music/api';
import { NerdStats } from '@/shell/NerdStats';
import { usePlayerStore } from '@/state/player';

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--labelDivider)] p-5">
      <div className="row gap-2 mb-3">
        <span className="text-[var(--keyColor)]">{icon}</span>
        <h2 className="t-title-3" style={{ fontWeight: 700 }}>
          {title}
        </h2>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6">
      <span className="min-w-0">
        <span className="block t-body-em">{label}</span>
        {description && <span className="block t-footnote t-secondary mt-0.5">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
        style={{ background: checked ? 'var(--keyColor)' : 'var(--systemGray4)' }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
          style={{ left: 2, transform: checked ? 'translateX(20px)' : 'none' }}
        />
      </button>
    </label>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['Space / K', 'Play or pause'],
  ['← / →', 'Seek 5 seconds'],
  ['Shift + ← / →', 'Previous or next track'],
  ['↑ / ↓', 'Volume'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['R', 'Repeat mode'],
  ['Q', 'Up Next panel'],
  ['L', 'Lyrics panel'],
  ['F', 'Full-screen player'],
  ['Esc', 'Close panel'],
];

export default function SettingsPage() {
  const settings = useSettingsStore();
  const automix = useAutomixStore();
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const [serverUrl, setServerUrl] = useState(settings.serverUrl);
  const [health, setHealth] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');

  useEffect(() => {
    setServerUrl(settings.serverUrl);
  }, [settings.serverUrl]);

  const testServer = async () => {
    setHealth('checking');
    const ok = await checkHealth();
    setHealth(ok ? 'ok' : 'fail');
  };

  const qualities: Array<{ id: Quality; label: string }> = [
    { id: 'high', label: 'High' },
    { id: 'medium', label: 'Medium' },
  ];

  return (
    <div className="page max-w-[760px]">
      <header className="mb-5">
        <h1 className="t-large-title">Settings</h1>
        <p className="t-callout t-secondary mt-1">Playback, server and interface preferences.</p>
      </header>

      <div className="flex flex-col gap-4">
        <Section title="Playback" icon={<Play size={17} />}>
          <div>
            <div className="flex justify-between t-body-em">
              <span>Crossfade</span>
              <span className="t-secondary tabular">
                {settings.crossfadeSec === 0 ? 'Off' : `${settings.crossfadeSec}s`}
              </span>
            </div>
            <input
              type="range"
              className="slider mt-2"
              min={0}
              max={12}
              step={1}
              value={settings.crossfadeSec}
              aria-label="Crossfade duration"
              style={{ ['--fill' as string]: `${(settings.crossfadeSec / 12) * 100}%` }}
              onChange={(event) => settings.setCrossfadeSec(Number(event.target.value))}
            />
            <p className="t-footnote t-secondary mt-1">
              Overlap the end of one track with the start of the next. 0 disables crossfade.
            </p>
          </div>

          <Toggle
            label="Automix"
            description="Analyse each track and adapt the transition — calm songs blend longer, high-energy songs cut."
            checked={automix.enabled}
            onChange={automix.setEnabled}
          />

          {automix.enabled && (
            <div>
              <div className="flex justify-between t-body-em">
                <span>Automix length</span>
                <span className="t-secondary tabular">{automix.transitionSec}s</span>
              </div>
              <input
                type="range"
                className="slider mt-2"
                min={1}
                max={12}
                step={1}
                value={automix.transitionSec}
                aria-label="Automix transition length"
                style={{ ['--fill' as string]: `${(automix.transitionSec / 12) * 100}%` }}
                onChange={(event) => automix.setTransitionSec(Number(event.target.value))}
              />
              <p className="t-footnote t-secondary mt-1">
                Base overlap while Rem analyses the audio; the plan adjusts per track.
              </p>
            </div>
          )}

          <Toggle
            label="Autoplay similar songs"
            description="Keep the music going with related tracks when the queue ends."
            checked={settings.autoplaySimilar}
            onChange={settings.setAutoplaySimilar}
          />

          <Toggle
            label="Skip silence"
            description="Trim silent intros and outros while playing."
            checked={settings.skipSilence}
            onChange={settings.setSkipSilence}
          />

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="t-body-em">Playback speed</div>
              <div className="t-footnote t-secondary">Applies immediately to the active deck.</div>
            </div>
            <div className="row gap-1 rounded-full p-1" style={{ background: 'var(--segmentedControlBG)' }}>
              {[0.75, 1, 1.25, 1.5].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className="rounded-full px-2.5 py-1 t-callout-em"
                  style={
                    playbackRate === rate
                      ? { background: 'var(--segmentedControlSelectedBG)' }
                      : { color: 'var(--systemSecondary)' }
                  }
                  onClick={() => setPlaybackRate(rate)}
                >
                  {rate}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="t-body-em">Stream quality</div>
              <div className="t-footnote t-secondary">Preferred audio bitrate when available.</div>
            </div>
            <div className="row gap-1 rounded-full p-1" style={{ background: 'var(--segmentedControlBG)' }}>
              {qualities.map((quality) => (
                <button
                  key={quality.id}
                  type="button"
                  className="rounded-full px-3 py-1 t-callout-em"
                  style={
                    settings.quality === quality.id
                      ? { background: 'var(--segmentedControlSelectedBG)' }
                      : { color: 'var(--systemSecondary)' }
                  }
                  onClick={() => settings.setQuality(quality.id)}
                >
                  {quality.label}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Server" icon={<Server size={17} />}>
          <label className="block">
            <span className="t-body-em">Proxy server URL</span>
            <span className="block t-footnote t-secondary mt-0.5">
              Leave empty to use the built-in cloud API and direct resolver. Set this only when
              you run your own Rem server, for example http://192.168.1.20:3001.
            </span>
            <div className="mt-2 flex gap-2">
              <input
                value={serverUrl}
                onChange={(event) => setServerUrl(event.target.value)}
                placeholder="http://192.168.1.20:3001"
                className="grow rounded-lg border border-[var(--labelDivider)] bg-transparent px-3 py-2 t-body outline-none focus:border-[var(--keyColor)]"
                spellCheck={false}
              />
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  settings.setServerUrl(serverUrl.trim());
                  void testServer();
                }}
              >
                Save
              </button>
            </div>
          </label>

          <div className="flex items-center justify-between gap-4">
            <div className="row gap-2 t-callout">
              {health === 'ok' ? (
                <>
                  <CheckCircle2 size={16} className="text-[var(--systemGreen)]" /> Server reachable
                </>
              ) : health === 'fail' ? (
                <>
                  <XCircle size={16} className="text-[var(--systemRed)]" /> Server offline or not JSON
                </>
              ) : health === 'checking' ? (
                <>Checking…</>
              ) : (
                <span className="t-secondary">Not checked yet</span>
              )}
            </div>
            <button type="button" className="secondary-btn" onClick={() => void testServer()}>
              Test connection
            </button>
          </div>
        </Section>

        <Section title="Interface" icon={<SlidersHorizontal size={17} />}>
          <Toggle
            label="Show nerd stats"
            description="Expose technical playback diagnostics in Settings."
            checked={settings.showNerdStats}
            onChange={settings.setShowNerdStats}
          />
        </Section>

        {settings.showNerdStats && <NerdStats />}

        <Section title="Keyboard shortcuts" icon={<Keyboard size={17} />}>
          <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="kv">
                <span>{action}</span>
                <span className="t-footnote">{keys}</span>
              </div>
            ))}
          </div>
        </Section>

        <section className="rounded-xl border border-[var(--labelDivider)] p-5">
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>
            About Rem
          </h2>
          <p className="t-callout t-secondary mt-2">
            Rem is an Apple Music-inspired YouTube Music client. Playback streams directly from
            YouTube with the companion extension, and falls back to YouTube's own player when it
            is not installed. Built as a clean-room reimplementation.
          </p>
          <p className="t-footnote t-tertiary mt-2">Version 2.0.0 · rewrite branch</p>
        </section>
      </div>
    </div>
  );
}
