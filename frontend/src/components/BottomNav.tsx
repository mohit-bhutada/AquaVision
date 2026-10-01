import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { useSound } from '../lib/sound';
import { useTheme } from '../lib/theme';
import { TLink, useGo } from './Curtain';
import { ArrowUpRight, Moon, Sun, Close } from './Icons';
import { Logo, Roll } from './Ui';

const LINKS = [
  { id: 'product', label: 'Product' },
  { id: 'technology', label: 'Technology' },
  { id: 'research', label: 'Research' },
  { id: 'applications', label: 'Applications' },
];

export function ThemeToggle({ className = 'text-head' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={(e) => toggle(e)}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`grid h-9 w-9 place-items-center rounded-full transition-[transform,background-color] duration-500 hover:rotate-45 hover:bg-[var(--line)] ${className}`}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/** Speaker with animated equaliser bars; bars rest flat when muted. */
export function SoundToggle({ className = 'text-head' }: { className?: string }) {
  const { on, toggle } = useSound();
  return (
    <button onClick={toggle} aria-label={on ? 'Mute sounds' : 'Turn sounds on'} aria-pressed={on} className={`grid h-9 w-9 place-items-center rounded-full transition-colors duration-300 hover:bg-[var(--line)] ${className}`}>
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`eq-bar w-[2px] rounded-full bg-current ${on ? 'is-on' : ''}`} style={{ animationDelay: `${i * 0.13}s` }} />
        ))}
      </span>
    </button>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();
  const go = useGo();
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';
  const onHome = pathname === '/';
  const [compact, setCompact] = useState(!onHome);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState('');
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState('');
  const [hl, setHl] = useState<{ l: number; r: number } | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      setCompact(!onHome || scrollY > 100);
      setProgress(max > 0 ? scrollY / max : 0);
    };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
    return () => removeEventListener('scroll', onScroll);
  }, [onHome]);

  useEffect(() => {
    if (!onHome) return setActive('');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setActive((a) => (e.isIntersecting ? e.target.id : a === e.target.id ? '' : a))),
      { rootMargin: '-45% 0px -50% 0px' },
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [onHome, pathname]);

  // Sliding capsule behind the hovered link (falls back to the active section). clip-path only, no layout animation.
  const target = hover || active;
  useEffect(() => {
    const box = bar.current;
    const el = target ? box?.querySelector<HTMLElement>(`[data-hl="${target}"]`) : null;
    if (!box || !el) return setHl(null);
    const measure = () => {
      const b = box.getBoundingClientRect(), e = el.getBoundingClientRect();
      setHl({ l: e.left - b.left - 12, r: b.right - e.right - 12 });
    };
    measure();
    // The pill width morphs for .5s; re-measure once it settles.
    const t = setTimeout(measure, 520);
    addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      removeEventListener('resize', measure);
    };
  }, [target, compact]);

  const to = (id: string) => (onHome ? `#${id}` : `/#${id}`);
  // Over the hero the backdrop is always deep water, so the row is always light.
  const onHero = onHome && !compact;
  const idle = onHero ? 'text-white/70 hover:text-white' : 'text-body hover:text-head';
  const strong = onHero ? 'text-white' : 'text-head';

  return (
    <>
      {/* Desktop / tablet */}
      <nav
        aria-label="Primary"
        className="fixed bottom-6 left-1/2 z-50 hidden -translate-x-1/2 md:block"
        style={{
          width: compact ? 760 : 'min(1030px, calc(100vw - 128px))',
          transition: 'width .5s var(--ease)',
        }}
      >
        <div
          ref={bar}
          onMouseLeave={() => setHover('')}
          className={`relative flex items-center justify-between overflow-hidden rounded-xl border px-4 py-2 text-[15px] transition-[background-color,border-color] duration-500 ${
            compact ? 'nav-shell border-line bg-[var(--glass)] backdrop-blur-xl' : 'border-transparent bg-transparent'
          }`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1.5 inset-x-0 rounded-lg transition-[clip-path,opacity] duration-500"
            style={{
              background: onHero ? 'rgba(255,255,255,.12)' : 'color-mix(in srgb, var(--accent) 14%, transparent)',
              clipPath: hl ? `inset(0 ${hl.r}px 0 ${hl.l}px round 999px)` : 'inset(0 50% 0 50% round 999px)',
              opacity: hl ? 1 : 0,
              transitionTimingFunction: 'var(--ease)',
            }}
          />
          <span className="relative flex items-center">
            <TLink
              to="/"
              aria-label="AquaVision home"
              tabIndex={compact ? 0 : -1}
              className="nav-logo mr-1 grid h-9 place-items-center overflow-hidden transition-[opacity,transform] duration-500"
              style={{ opacity: compact ? 1 : 0, transform: compact ? 'none' : 'scale(.6)', pointerEvents: compact ? 'auto' : 'none' }}
            >
              <Logo size={26} />
            </TLink>
            <ThemeToggle className={strong} />
            <span className={`mx-1 h-4 w-px ${onHero ? 'bg-white/30' : 'bg-line-strong'}`} aria-hidden="true" />
            <SoundToggle className={strong} />
          </span>
          {LINKS.map((l) => (
            <TLink
              key={l.id}
              to={to(l.id)}
              curtain
              data-hl={l.id}
              onMouseEnter={() => setHover(l.id)}
              onFocus={() => setHover(l.id)}
              onBlur={() => setHover('')}
              className={`roll-host relative transition-colors duration-300 ${active === l.id ? (onHero ? 'text-white' : 'text-accent') : hover === l.id ? strong : idle}`}
            >
              <Roll>{l.label}</Roll>
            </TLink>
          ))}
          <TLink
            to={tryAquaVisionPath}
            data-hl={onHero ? 'try' : undefined}
            onMouseEnter={() => setHover(onHero ? 'try' : '')}
            className={`roll-host relative flex items-center gap-1.5 transition-colors duration-500 ${onHero ? strong : 'h-9 rounded-full bg-invert-bg px-4 text-invert-fg'}`}
            data-magnetic
          >
            <Roll>Try AquaVision</Roll>
            <ArrowUpRight size={16} />
          </TLink>
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-3 right-3 h-[2px] origin-left rounded-full"
            style={{ transform: `scaleX(${compact ? progress : 0})`, background: 'linear-gradient(90deg, transparent, var(--accent))' }}
          />
        </div>
      </nav>

      {/* Mobile */}
      <div className="fixed inset-x-3 bottom-3 z-50 flex items-center justify-between rounded-xl border border-line bg-[var(--glass)] px-3 py-2 backdrop-blur-xl md:hidden">
        <TLink to="/" aria-label="AquaVision home">
          <Logo size={28} />
        </TLink>
        <span className="flex items-center gap-1">
          <SoundToggle />
          <button className="px-3 py-2 text-head" onClick={() => setMenu(true)} aria-expanded={menu} aria-controls="mobile-menu">
            Menu
          </button>
        </span>
      </div>
      <div
        id="mobile-menu"
        className={`fixed inset-0 z-[60] flex flex-col bg-bg px-6 pb-10 pt-6 transition-opacity duration-300 md:hidden ${menu ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!menu}
      >
        <div className="flex items-center justify-between">
          <Logo size={32} />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => setMenu(false)} aria-label="Close menu" className="grid h-10 w-10 place-items-center text-head">
              <Close />
            </button>
          </div>
        </div>
        <ul className="mt-auto space-y-3">
          {[...LINKS.map((l) => ({ to: to(l.id), label: l.label })), { to: '/team', label: 'Team' }, { to: '/subscriptions', label: 'Plans' }, { to: tryAquaVisionPath, label: 'Try AquaVision' }].map((l, i) => (
            <li key={l.label} className="overflow-hidden">
              <button
                onClick={() => {
                  setMenu(false);
                  go(l.to, { curtain: true });
                }}
                className="block text-5xl text-head transition-transform duration-700"
                style={{ transform: menu ? 'none' : 'translateY(110%)', transitionDelay: menu ? `${80 + i * 60}ms` : '0ms', transitionTimingFunction: 'var(--ease)' }}
                tabIndex={menu ? 0 : -1}
              >
                {l.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
