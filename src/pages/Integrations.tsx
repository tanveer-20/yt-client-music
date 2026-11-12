import { Link } from 'react-router-dom';
import { Cloud, MessageCircle, Puzzle, Users } from 'lucide-react';
import { useExtension } from '@/bridge/useExtension';
import { useIntegrationsStore } from '@/state/integrations';

export default function IntegrationsPage() {
  const extension = useExtension();
  const spotify = useIntegrationsStore((s) => s.spotifyConnected);
  const discord = useIntegrationsStore((s) => s.discordConnected);

  const cards = [
    { to: '/spotify', title: 'Spotify', description: 'Import playlists and match them to YouTube Music.', icon: Cloud, status: spotify },
    { to: '/discord', title: 'Discord', description: 'Publish listening as rich presence.', icon: MessageCircle, status: discord },
    { to: '/listen-together', title: 'Listen Together', description: 'Host a synced party room.', icon: Users, status: false },
    { to: '/extension', title: 'Companion extension', description: 'Direct audio and signed-in features.', icon: Puzzle, status: extension.status === 'present' },
  ];

  return (
    <div className="page max-w-[860px]">
      <header className="mb-5">
        <h1 className="t-large-title">Integrations</h1>
        <p className="t-callout t-secondary mt-1">Connect Rem to other services and devices.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="rounded-xl border border-[var(--labelDivider)] p-5 transition-colors hover:bg-[var(--tracklistHoverColor)]"
          >
            <div className="row gap-2">
              <card.icon size={18} className="text-[var(--keyColor)]" />
              <h2 className="t-title-2">{card.title}</h2>
            </div>
            <p className="t-callout t-secondary mt-2">{card.description}</p>
            <span
              className="t-caption mt-3 inline-block rounded-full px-2.5 py-1"
              style={{
                background: card.status ? 'color-mix(in srgb, var(--systemGreen) 18%, transparent)' : 'var(--segmentedControlBG)',
                color: card.status ? 'var(--systemGreen)' : 'var(--systemSecondary)',
              }}
            >
              {card.status ? 'Connected' : 'Not connected'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
