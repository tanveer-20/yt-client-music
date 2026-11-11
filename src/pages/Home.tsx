import { useQuery } from '@tanstack/react-query';
import { homeQuery } from '@/data/music/queries';
import { ShelfView } from '@/components/music/ShelfView';
import { HomeSkeleton } from '@/components/common/Skeletons';
import { ErrorState } from '@/components/common/States';
import { checkHealth } from '@/data/music/api';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { data, isLoading, isError, error, refetch } = useQuery(homeQuery());

  if (isLoading) return <HomeSkeleton />;

  if (isError) {
    return (
      <div className="page">
        <ErrorState
          message={
            error instanceof Error && error.message.includes('JSON')
              ? 'The Rem server is not reachable. Start it with npm run server.'
              : error instanceof Error
                ? error.message
                : 'Could not load your home feed.'
          }
          onRetry={() => void refetch()}
        >
          <button type="button" className="secondary-btn" onClick={() => void checkHealth()}>
            Check server
          </button>
        </ErrorState>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="mb-2">
        <div className="t-callout t-secondary">{greeting()}</div>
        <h1 className="t-large-title mt-1">Home</h1>
      </header>

      {data?.shelves.length ? (
        data.shelves.map((shelf) => <ShelfView key={shelf.title} shelf={shelf} />)
      ) : (
        <div className="empty-state">
          <h3>Nothing here yet</h3>
          <p className="t-body-reduced">Browse is empty. Check back in a moment.</p>
        </div>
      )}
    </div>
  );
}
