import { useEffect, useState } from 'react';
import { reducedMotion } from '../lib/motion';

const KEY = 'av-preloaded';
const WORD = 'AQUAVISION';

function seen() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Wordmark rolls in beside a thin line while the depth counter surfaces 40 m → 0 m; then 6 columns lift. */
export function Preloader() {
  const [show, setShow] = useState(() => !seen() && !reducedMotion());
  const [depth, setDepth] = useState(40);
  const [stage, setStage] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (!show) return;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    document.documentElement.style.overflow = 'hidden';
    const start = performance.now();
    const DURATION = 1700;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      setDepth(Math.round(40 * (1 - p * (2 - p))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const leave = setTimeout(() => setStage('out'), DURATION + 250);
    const done = setTimeout(() => {
      setShow(false);
      document.documentElement.style.overflow = '';
    }, DURATION + 1300);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(leave);
      clearTimeout(done);
      document.documentElement.style.overflow = '';
    };
  }, [show]);

  if (!show) return null;
  const out = stage === 'out';
  return (
    <div className="fixed inset-0 z-[10001] grid grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="bg-[var(--curtain)]"
          style={{ transform: out ? 'translateY(-100%)' : 'none', transition: `transform ${900 - i * 120}ms cubic-bezier(.6,0,.3,1) ${150 + i * 120}ms` }}
        />
      ))}
      <div className="absolute inset-0 text-white" style={{ opacity: out ? 0 : 1, transition: 'opacity .35s ease' }}>
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-5">
          <span className="block h-24 w-px origin-top bg-white/40" style={{ animation: 'grow-y .8s cubic-bezier(.22,1,.36,1) both' }} />
          <p className="flex overflow-hidden text-[40px] tracking-[0.02em] md:text-[64px]">
            {[...WORD].map((c, i) => (
              <span key={i} className="inline-block" style={{ animation: `rise .9s cubic-bezier(.22,1,.36,1) ${0.15 + i * 0.05}s both` }}>
                {c}
              </span>
            ))}
          </p>
        </div>
        <p className="absolute bottom-8 left-6 text-6xl font-light tabular-nums md:left-10 md:text-8xl">
          {depth} <span className="text-[#7d8a96]">m</span>
        </p>
        <p className="absolute bottom-10 right-6 font-serif text-2xl italic text-white/70 md:right-10">Surfacing</p>
      </div>
    </div>
  );
}
