import { useEffect, useRef, useState } from 'react';

const SECTIONS: [string, string][] = [
  ['applications', 'Applications'],
  ['product', 'Product'],
  ['technology', 'Technology'],
  ['research', 'Research'],
];

/** Fixed right-edge dive gauge for the homepage: 0 m at the top of the page, 40 m at the bottom. */
export function DepthGauge() {
  const marker = useRef<HTMLDivElement>(null);
  const [depth, setDepth] = useState(0);
  const [label, setLabel] = useState('Surface');
  const [onDark, setOnDark] = useState(true);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, scrollY / max) : 0;
      if (marker.current) marker.current.style.transform = `translateY(${p * 100}%)`;
      setDepth(Math.round(p * 40));
      let current = scrollY < innerHeight * 0.6 ? 'Surface' : 'Descent';
      for (const [id, name] of SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < innerHeight * 0.5) current = name;
      }
      setLabel(current);
      // Read what sits under the gauge so it stays legible on light and dark surfaces alike.
      const under = document.elementFromPoint(innerWidth - 40, innerHeight / 2);
      setOnDark(document.documentElement.dataset.theme !== 'light' || !!under?.closest('[data-surface="dark"]'));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    const mo = new MutationObserver(onScroll);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mo.disconnect();
      removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed right-5 top-1/2 z-40 hidden h-[46vh] -translate-y-1/2 lg:block" aria-hidden="true">
      <div className="relative h-full w-3 transition-colors duration-300" style={{ color: onDark ? '#fff' : 'var(--head)' }}>
        <div className="absolute inset-y-0 right-0 w-3" style={{ background: 'repeating-linear-gradient(to bottom, color-mix(in srgb, currentColor 45%, transparent) 0 1px, transparent 1px 12px)', maskImage: 'linear-gradient(90deg, transparent 50%, black 51%)' }} />
        <div ref={marker} className="absolute inset-x-0 top-0 h-full" style={{ transition: 'transform .2s linear' }}>
          <div className="absolute right-4 top-0 -translate-y-1/2 whitespace-nowrap text-right text-[11px] leading-tight tracking-wide">
            <span className="block tabular-nums">{depth} m</span>
            <span className="block opacity-60">{label}</span>
          </div>
          <span className="absolute right-0 top-0 h-px w-5 -translate-y-1/2 bg-current" />
        </div>
      </div>
    </div>
  );
}
