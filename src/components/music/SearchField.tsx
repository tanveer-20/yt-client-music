import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search',
  autoFocus,
  className = '',
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <form
      className={`search-field ${className}`}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(value.trim());
      }}
    >
      <Search size={15} className="shrink-0 text-[var(--systemTertiary)]" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          className="icon-btn"
          style={{ width: 22, height: 22 }}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </form>
  );
}
