import type { ReactNode } from 'react';
import { AlertCircle, Loader2, SearchX } from 'lucide-react';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="empty-state" role="status" aria-live="polite">
      <Loader2 size={26} className="animate-spin" />
      <span className="t-callout">{label}</span>
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function ErrorState({ message, onRetry, children }: ErrorStateProps) {
  return (
    <div className="empty-state" role="alert">
      <AlertCircle size={30} />
      <h3>Something went wrong</h3>
      <p className="t-body-reduced">{message || 'The request could not be completed.'}</p>
      {children}
      {onRetry && (
        <button type="button" className="secondary-btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ?? <SearchX size={30} />}
      <h3>{title}</h3>
      {description && <p className="t-body-reduced">{description}</p>}
      {action}
    </div>
  );
}
