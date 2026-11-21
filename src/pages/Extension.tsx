import { Download, Puzzle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useExtension } from '@/bridge/useExtension';
import { LoadingState } from '@/components/common/States';

export default function ExtensionPage() {
  const { status, version, lastCheckedAt, recheck } = useExtension();

  return (
    <div className="page max-w-[760px]">
      <header className="mb-5">
        <h1 className="t-large-title">Companion extension</h1>
        <p className="t-callout t-secondary mt-1">
          A small MV3 extension adds the browser headers and CORS response headers YouTube expects,
          enabling direct audio playback on desktop.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--labelDivider)] p-5">
        <div className="row gap-2 mb-3">
          <Puzzle size={17} className="text-[var(--keyColor)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>Status</h2>
        </div>
        {status === 'checking' ? (
          <LoadingState label="Checking for Rem Companion" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="t-body-em" style={{ color: status === 'present' ? 'var(--systemGreen)' : 'var(--systemOrange)' }}>
                {status === 'present' ? 'Installed and detected' : 'Not detected'}
              </div>
              <div className="t-footnote t-secondary mt-1">
                {version ? `Version ${version}` : 'Install or reload the extension to connect it.'}
                {lastCheckedAt ? ` · checked ${new Date(lastCheckedAt).toLocaleTimeString()}` : ''}
              </div>
            </div>
            <button type="button" className="secondary-btn" onClick={recheck}>
              <RefreshCw size={14} /> Recheck
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-4">
        <div className="row gap-2 mb-3">
          <Download size={17} />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>Install</h2>
        </div>
        <ol className="t-callout t-secondary list-decimal pl-5 flex flex-col gap-2">
          <li>
            Chrome / Edge: open <code>chrome://extensions</code>, enable Developer mode, choose “Load
            unpacked”, and select the <code>extension/</code> folder in this repository.
          </li>
          <li>
            Firefox: open <code>about:debugging#/runtime/this-firefox</code>, choose “Load Temporary
            Add-on”, and select <code>extension/manifest.json</code>.
          </li>
          <li>
            After updating the extension files, click <strong>Reload</strong> on{' '}
            <code>chrome://extensions</code> so the new rules and permissions take effect.
          </li>
          <li>Reload Rem, then press Recheck above.</li>
        </ol>
      </section>

      <section className="rounded-xl border border-[var(--labelDivider)] p-5 mt-4">
        <div className="row gap-2 mb-2">
          <ShieldCheck size={17} className="text-[var(--systemGreen)]" />
          <h2 className="t-title-3" style={{ fontWeight: 700 }}>What it enables</h2>
        </div>
        <p className="t-callout t-secondary">
          It rewrites Origin/Referer on YouTube requests, exposes CORS response headers, and lets
          Rem ask YouTube for audio from your own IP. Audio bytes go straight from Google to this
          tab; nothing is proxied through your PC or the cloud server.
        </p>
        <p className="t-footnote mt-3" style={{ color: 'var(--systemOrange)' }}>
          Playback uses YouTube's VISIONOS client, which returns plain audio URLs and needs no PO
          token. Rem falls back to its server proxy automatically when the extension is not
          present.
        </p>
      </section>
    </div>
  );
}
