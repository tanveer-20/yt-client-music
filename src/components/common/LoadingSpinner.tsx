import { RiLoader4Line } from 'react-icons/ri';

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

export function LoadingSpinner({ size = 24, className = '' }: LoadingSpinnerProps) {
  return (
    <RiLoader4Line
      size={size}
      className={`animate-spin text-brand-500 ${className}`}
    />
  );
}
