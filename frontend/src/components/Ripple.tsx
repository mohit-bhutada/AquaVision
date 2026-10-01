import { useEffect } from 'react';
import { reducedMotion } from '../lib/motion';

/** Water rings expand from every click. Pure DOM + CSS keyframes (transform/opacity only). */
export function Ripple() {
  useEffect(() => {
    if (reducedMotion()) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      for (let i = 0; i < 2; i++) {
        const r = document.createElement('span');
        r.className = 'ripple';
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        r.style.animationDelay = `${i * 120}ms`;
        document.body.appendChild(r);
        r.addEventListener('animationend', () => r.remove());
      }
    };
    addEventListener('pointerdown', onDown, { passive: true });
    return () => removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
