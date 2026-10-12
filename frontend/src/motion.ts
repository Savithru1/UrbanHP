import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/** True when the person has asked their device for less movement. */
export const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canTransition = typeof document !== 'undefined' && 'startViewTransition' in document;

// Screens that the browser cross-fades itself should not also fade themselves in (see `.screen` in index.css).
if (canTransition && !calm()) document.documentElement.classList.add('vt');

/**
 * Changes what is on screen with the browser's own transition between the old picture and the new:
 * a cross-fade, and a morph for the one element both share (the report's photo).
 * Where the browser has no such thing, or movement is unwanted, the change simply happens.
 */
export function transition(update: () => void) {
  if (!canTransition || calm() || document.visibilityState !== 'visible') {
    update();
    return;
  }
  // The browser applies the change when it next draws the page. A page that is not being drawn
  // (its window is covered, or the tab is being throttled) would wait for that indefinitely, so
  // the change is made directly if the browser has not got to it within a moment.
  let applied = false;
  const apply = (flush: boolean) => {
    if (applied) return;
    applied = true;
    if (flush) flushSync(update);
    else update();
  };
  const running = document.startViewTransition(() => apply(true));
  const guard = setTimeout(() => {
    if (applied) return;
    apply(false);
    running.skipTransition();
  }, 350);
  // A second change before the first has finished cuts the first one short. That is fine: the screen
  // still ends up right, so the browser's "transition was skipped" is not an error worth reporting.
  running.updateCallbackDone.then(() => clearTimeout(guard)).catch(() => {});
  running.ready.catch(() => {});
  running.finished.catch(() => {});
}

/** Counts from the number last shown to `value`, so a figure that changes is seen to change. */
export function useCountUp(value: number, ms = 550): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const still = calm();
  useEffect(() => {
    const start = from.current;
    if (start === value || still) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const now = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
      from.current = now;
      setShown(now);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, still]);
  return still ? value : shown;
}
