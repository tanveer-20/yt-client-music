import type { ReactNode } from 'react';
import { usePageTint } from '@/hooks/usePageTint';
import { Artwork } from '@/components/common/Artwork';

interface DetailHeaderProps {
  kind: string;
  title: string;
  artwork?: string;
  round?: boolean;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function DetailHeader({
  kind,
  title,
  artwork,
  round,
  subtitle,
  meta,
  actions,
}: DetailHeaderProps) {
  usePageTint(artwork);

  return (
    <header className="detail-head">
      <div className={`detail-art ${round ? 'round' : ''}`}>
        <Artwork src={artwork} alt={title} size={544} eager />
      </div>
      <div className="detail-meta">
        <span className="detail-kind">{kind}</span>
        <h1 className="detail-title">{title}</h1>
        {subtitle && <div className="detail-sub">{subtitle}</div>}
        {meta && <div className="detail-sub t-footnote">{meta}</div>}
        {actions && <div className="detail-actions">{actions}</div>}
      </div>
    </header>
  );
}
