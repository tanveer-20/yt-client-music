/**
 * ProgressBar — reusable seek/progress bar with iOS-style design.
 */

import { useRef, useState, useCallback } from 'react';

interface ProgressBarProps {
  value: number;        // 0–1
  onChange: (value: number) => void;
  className?: string;
  height?: number;
  activeColor?: string;
}

export function ProgressBar({
  value,
  onChange,
  className = '',
  height = 4,
  activeColor = 'bg-brand-500',
}: ProgressBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const getValueFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent) => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as MouseEvent).clientX;
      const x = clientX - rect.left;
      return Math.max(0, Math.min(1, x / rect.width));
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const val = getValueFromEvent(e);
      onChange(val);

      const handleMove = (ev: MouseEvent) => {
        const v = getValueFromEvent(ev);
        onChange(v);
      };

      const handleUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [onChange, getValueFromEvent]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true);
      const val = getValueFromEvent(e);
      onChange(val);

      const handleMove = (ev: TouchEvent) => {
        ev.preventDefault();
        const v = getValueFromEvent(ev);
        onChange(v);
      };

      const handleEnd = () => {
        setIsDragging(false);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', handleEnd);
      };

      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', handleEnd);
    },
    [onChange, getValueFromEvent]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setHoverValue(getValueFromEvent(e));
    },
    [getValueFromEvent]
  );

  const displayValue = isDragging ? value : value;
  const expandedHeight = isDragging ? height + 4 : height;

  return (
    <div
      ref={barRef}
      className={`relative cursor-pointer group ${className}`}
      style={{ height: 24, display: 'flex', alignItems: 'center' }}
      onMouseDown={handlePointerDown}
      onTouchStart={handleTouchStart}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverValue(null)}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
    >
      {/* Track */}
      <div
        className="w-full rounded-full overflow-hidden transition-all duration-200"
        style={{ height: expandedHeight }}
      >
        {/* Background */}
        <div className="absolute inset-0 rounded-full bg-white/[0.12]" style={{ height: expandedHeight, top: '50%', transform: 'translateY(-50%)' }} />

        {/* Fill */}
        <div
          className={`absolute left-0 rounded-full ${activeColor} transition-all duration-75`}
          style={{
            width: `${displayValue * 100}%`,
            height: expandedHeight,
            top: '50%',
            transform: 'translateY(-50%)',
          }}
        />
      </div>

      {/* Thumb (visible on hover/drag) */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg 
          transition-all duration-150 ${isDragging ? 'scale-125' : 'scale-0 group-hover:scale-100'}`}
        style={{ left: `calc(${displayValue * 100}% - 8px)` }}
      />
    </div>
  );
}
