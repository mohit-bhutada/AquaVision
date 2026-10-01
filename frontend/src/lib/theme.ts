import { useEffect, useState } from 'react';
import { reducedMotion } from './motion';

export type Theme = 'dark' | 'light';

const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

function apply(next: Theme) {
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem('av-theme', next);
  } catch {
    /* storage blocked: theme still switches for this visit */
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  /** Circular reveal from the toggle (View Transitions API), instant fallback. */
  const toggle = (e?: { clientX: number; clientY: number }) => {
    const next: Theme = read() === 'dark' ? 'light' : 'dark';
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || reducedMotion()) return apply(next);
    const x = e?.clientX ?? innerWidth / 2;
    const y = e?.clientY ?? innerHeight / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(() => apply(next)).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(.6,0,.3,1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  };

  return { theme, toggle };
}
