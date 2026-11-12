import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

/**
 * Keep keyboard focus inside a modal surface and restore focus when it closes.
 * The surface should already have role="dialog" and aria-modal="true".
 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>): void {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');

    const initial =
      container.querySelector<HTMLElement>('[data-autofocus]') ?? focusableElements(container)[0] ?? container;
    const frame = window.requestAnimationFrame(() => initial.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusableElements(container);
      if (!items.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener('keydown', onKeyDown);
      const target = previousFocus.current;
      previousFocus.current = null;
      if (target?.isConnected) target.focus();
    };
  }, [active, containerRef]);
}
