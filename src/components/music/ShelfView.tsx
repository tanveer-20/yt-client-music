import type { Shelf } from '@/types';
import { Lockup } from './Lockups';

interface ShelfViewProps {
  shelf: Shelf;
  limit?: number;
}

export function ShelfView({ shelf, limit }: ShelfViewProps) {
  if (!shelf.items.length) return null;
  const items = limit ? shelf.items.slice(0, limit) : shelf.items;

  return (
    <section className="shelf" aria-label={shelf.title}>
      <div className="shelf-head">
        <h2 className="shelf-title">{shelf.title}</h2>
      </div>
      <div className="shelf-rail">
        {items.map((item, index) => (
          <Lockup key={`${item.kind}:${item.id}`} item={item} eager={index < 4} />
        ))}
      </div>
    </section>
  );
}
