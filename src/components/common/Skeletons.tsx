export function ShelfSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="shelf" aria-hidden="true">
      <div className="shelf-head">
        <div className="skeleton" style={{ width: 160, height: 24 }} />
      </div>
      <div className="shelf-rail">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="skeleton" style={{ aspectRatio: '1', width: '100%' }} />
            <div className="skeleton" style={{ width: '82%', height: 12 }} />
            <div className="skeleton" style={{ width: '58%', height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="page" aria-hidden="true">
      <div className="skeleton mb-8" style={{ width: 240, height: 38 }} />
      <ShelfSkeleton />
      <ShelfSkeleton />
      <ShelfSkeleton />
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="page" aria-hidden="true">
      <div className="detail-head">
        <div className="skeleton detail-art" />
        <div className="flex flex-col gap-3 grow">
          <div className="skeleton" style={{ width: 70, height: 12 }} />
          <div className="skeleton" style={{ width: '60%', height: 40 }} />
          <div className="skeleton" style={{ width: 210, height: 16 }} />
          <div className="skeleton" style={{ width: 160, height: 34, borderRadius: 999 }} />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="skeleton" style={{ width: 40, height: 40 }} />
            <div className="flex flex-col gap-2 grow">
              <div className="skeleton" style={{ width: `${55 - (i % 3) * 8}%`, height: 12 }} />
              <div className="skeleton" style={{ width: `${32 - (i % 2) * 6}%`, height: 10 }} />
            </div>
            <div className="skeleton" style={{ width: 34, height: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2">
          <div className="skeleton" style={{ width: 40, height: 40 }} />
          <div className="flex flex-col gap-2 grow">
            <div className="skeleton" style={{ width: `${50 - (i % 3) * 7}%`, height: 12 }} />
            <div className="skeleton" style={{ width: '28%', height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
