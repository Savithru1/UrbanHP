import { useLayoutEffect, useRef } from 'react';
import { useCountUp } from '../motion';

/** The mark and the name. The mark is the pin-on-a-map ring that is also the page icon. */
export function Brand({ note, onClick }: { note?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="brand group flex shrink-0 items-center gap-2.5 text-lg font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="size-7" aria-hidden>
        <rect width="24" height="24" rx="7" className="fill-ink" />
        <circle cx="12" cy="12" r="4.6" fill="none" stroke="#fefdfb" strokeWidth="1.9" className="brand-ring" />
        <circle cx="12" cy="12" r="1.3" fill="#fefdfb" />
      </svg>
      <span className="flex items-baseline gap-2">
        UrbanHP {note && <span className="text-sm font-medium text-faint">{note}</span>}
      </span>
    </button>
  );
}

interface TabsProps<T extends string> {
  tabs: { id: T; label: React.ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  /** What the row of tabs is, for screen readers. */
  label: string;
  className?: string;
}

/** A row of text tabs with one underline that slides to whichever is chosen. */
export function Tabs<T extends string>({ tabs, value, onChange, label, className = '' }: TabsProps<T>) {
  const row = useRef<HTMLElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  const order = tabs.map((t) => t.id).join();

  // The underline is placed by measuring the chosen tab, and again whenever anything in the row changes size.
  useLayoutEffect(() => {
    const el = row.current;
    const line = ink.current;
    if (!el || !line) return;
    const place = () => {
      const active = el.querySelector<HTMLElement>('[aria-selected="true"]');
      line.style.opacity = active ? '1' : '0';
      if (active) {
        line.style.width = `${active.offsetWidth}px`;
        line.style.transform = `translateX(${active.offsetLeft}px)`;
      }
    };
    place();
    // It slides only after it has been put in place once: it should not fly in from the corner.
    const armed = requestAnimationFrame(() => line.classList.add('is-armed'));
    const watch = new ResizeObserver(place);
    watch.observe(el);
    el.querySelectorAll('[role="tab"]').forEach((t) => watch.observe(t));
    return () => {
      cancelAnimationFrame(armed);
      watch.disconnect();
    };
  }, [value, order]);

  return (
    <nav ref={row} role="tablist" aria-label={label} className={`tab-row relative ${className}`}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className="nav-link">
          {t.label}
        </button>
      ))}
      <span ref={ink} className="tab-ink" aria-hidden />
    </nav>
  );
}

/** A number that counts to its new value when it changes. */
export function Count({ value }: { value: number }) {
  return <span className="tabular-nums">{useCountUp(value)}</span>;
}

/** A grey bar standing in for a line of text that is still loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden />;
}

/** Placeholder rows shaped like the list they stand in for. */
export function SkeletonRows({ rows = 6, thumb = false }: { rows?: number; thumb?: boolean }) {
  return (
    <ul className="divide-y divide-line border-y border-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3.5 px-2 py-3.5" style={{ opacity: 1 - i * 0.12 }}>
          {thumb && <Skeleton className="size-14 shrink-0 rounded-[10px]" />}
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </span>
          <Skeleton className="h-3.5 w-20 shrink-0" />
        </li>
      ))}
    </ul>
  );
}
