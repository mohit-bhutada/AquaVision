import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../lib/motion';

/** Dot + lagging ring, contextual labels ([data-cursor="View"]) and magnetic buttons ([data-magnetic]). Mouse users only. */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const [enabled] = useState(() => matchMedia('(pointer: fine)').matches && !reducedMotion());
  const [state, setState] = useState<{ link: boolean; label: string }>({ link: false, label: '' });

  useEffect(() => {
    if (!enabled) return;
    document.body.classList.add('has-cursor');
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y, raf = 0;
    let magnet: HTMLElement | null = null;

    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      const t = e.target as HTMLElement;
      const labelEl = t.closest<HTMLElement>('[data-cursor]');
      const linkEl = t.closest('a, button, [role="slider"]');
      setState((s) => {
        const next = { link: !!linkEl, label: labelEl?.dataset.cursor ?? '' };
        return s.link === next.link && s.label === next.label ? s : next;
      });

      const m = t.closest<HTMLElement>('[data-magnetic]');
      if (magnet && magnet !== m) magnet.style.transform = '';
      magnet = m;
      if (m) {
        const r = m.getBoundingClientRect();
        const dx = (x - (r.left + r.width / 2)) * 0.15;
        const dy = (y - (r.top + r.height / 2)) * 0.3;
        m.style.transform = `translate(${Math.max(-8, Math.min(8, dx))}px, ${Math.max(-8, Math.min(8, dy))}px)`;
      }
    };
    const tick = () => {
      rx += (x - rx) * 0.18;
      ry += (y - ry) * 0.18;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    const hide = () => {
      if (magnet) magnet.style.transform = '';
      magnet = null;
    };
    addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', hide);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', hide);
      document.body.classList.remove('has-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <div ref={ring} className={`cursor-ring ${state.label ? 'is-label' : state.link ? 'is-link' : ''}`} aria-hidden="true">
        <span className="shape" />
        {state.label && <span className="label">{state.label}</span>}
      </div>
      <div ref={dot} className="cursor-dot" aria-hidden="true" style={{ opacity: state.label ? 0 : 1 }} />
    </>
  );
}
