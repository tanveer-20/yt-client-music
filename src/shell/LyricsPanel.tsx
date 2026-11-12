import { useEffect, useMemo, useRef } from 'react';
import { Mic2, X } from 'lucide-react';
import { usePlayerStore } from '@/state/player';
import { useUIStore } from '@/state/ui';
import { useLyrics } from '@/lyrics/useLyrics';
import { EmptyState, LoadingState } from '@/components/common/States';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export function LyricsPanel() {
  const panel = useUIStore((s) => s.panel);
  const closePanel = useUIStore((s) => s.closePanel);
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(panel === 'lyrics', panelRef);

  const track = usePlayerStore((s) => s.currentTrack);
  const progress = usePlayerStore((s) => s.progress);
  const seek = usePlayerStore((s) => s.seek);
  const { lyrics, loading } = useLyrics(track);

  const lineRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced || !lyrics.lines.length) return -1;
    const ms = progress * 1000;
    let active = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].time <= ms) active = i;
      else break;
    }
    return active;
  }, [lyrics, progress]);

  useEffect(() => {
    if (activeIndex < 0) return;
    lineRefs.current[activeIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIndex]);

  if (panel !== 'lyrics') return null;

  return (
    <aside ref={panelRef} className="side-panel" role="dialog" aria-modal="true" aria-label="Lyrics">
      <div className="panel-head">
        <div>
          <div className="panel-title">Lyrics</div>
          <div className="t-footnote t-secondary truncate" style={{ maxWidth: 200 }}>
            {track ? `${track.title} — ${track.artist}` : 'Nothing playing'}
          </div>
        </div>
        <button type="button" className="icon-btn" onClick={closePanel} aria-label="Close lyrics" data-autofocus>
          <X size={18} />
        </button>
      </div>

      {!track ? (
        <EmptyState icon={<Mic2 size={28} />} title="Nothing playing" description="Start a song to see its lyrics." />
      ) : loading ? (
        <LoadingState label="Finding lyrics" />
      ) : !lyrics || !lyrics.lines.length ? (
        <EmptyState
          icon={<Mic2 size={28} />}
          title="No lyrics found"
          description="This track does not have lyrics available yet."
        />
      ) : (
        <>
          <div className="lyrics-scroll scroll-area">
            {lyrics.lines.map((line, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={`${line.time}:${index}`}
                  ref={(el) => {
                    lineRefs.current[index] = el;
                  }}
                  type="button"
                  className="lyrics-line"
                  data-active={active}
                  onClick={() => lyrics.synced && seek(line.time / 1000)}
                >
                  {line.words?.length
                    ? line.words.map((word, wordIndex) => {
                        const sung = progress * 1000 >= word.time;
                        return (
                          <span
                            key={wordIndex}
                            className="word"
                            data-sung={sung}
                            style={{ ['--word-fill' as string]: sung ? '100%' : '0%' }}
                          >
                            {word.text}
                          </span>
                        );
                      })
                    : line.text}
                </button>
              );
            })}
          </div>
          <div className="px-5 pb-4 t-caption t-tertiary">
            {lyrics.synced ? 'Synced lyrics' : 'Plain lyrics'} · {lyrics.provider}
          </div>
        </>
      )}
    </aside>
  );
}
