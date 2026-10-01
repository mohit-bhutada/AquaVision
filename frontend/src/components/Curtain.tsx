import { createContext, useCallback, useContext, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reducedMotion, scrollToId, scrollToTop, ScrollTrigger } from '../lib/motion';
import { whoosh } from '../lib/sound';

// Measured on the reference: 6 columns, 0.9s, each column +0.15s later with a shorter duration.
const COLS = 6;
const DUR = 900;
const SHIFT = 150;

type Opts = { replace?: boolean; label?: string; curtain?: boolean };
type Go = (to: string, opts?: Opts) => void;
const Ctx = createContext<Go>(() => {});
export const useGo = () => useContext(Ctx);

const LABELS: Record<string, string> = {
  '/': 'AquaVision',
  '/workspace': 'Workspace',
  '/history': 'History',
  '/subscriptions': 'Plans',
  '/login': 'Sign in',
  '/signup': 'Create account',
};
const nameFor = (path: string, hash?: string) =>
  hash ? hash.charAt(0).toUpperCase() + hash.slice(1) : LABELS[path] ?? 'AquaVision';

export function CurtainProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<'idle' | 'covering' | 'revealing'>('idle');
  const [label, setLabel] = useState('');
  const busy = useRef(false);

  const go: Go = useCallback(
    (to, opts = {}) => {
      const [pathQuery, hash] = to.split('#');
      const target = pathQuery || location.pathname;
      const path = target.split('?')[0];
      const samePage = path === location.pathname && !target.includes('?');

      // Plain in-page anchor (e.g. "Explore the technology"): smooth scroll only.
      if (samePage && hash && !opts.curtain) return scrollToId(hash);
      if (busy.current) return;

      const land = () => {
        if (!samePage) navigate(target + (hash ? '#' + hash : ''), { replace: opts.replace });
        if (hash) setTimeout(() => scrollToId(hash, true), samePage ? 0 : 80);
        else scrollToTop();
        setTimeout(() => ScrollTrigger.refresh(), 120);
      };

      if (reducedMotion()) return land();

      busy.current = true;
      setLabel(opts.label ?? nameFor(path, hash));
      setPhase('covering');
      whoosh();
      setTimeout(() => {
        land();
        setPhase('revealing');
        setTimeout(() => {
          setPhase('idle');
          busy.current = false;
        }, DUR + 50);
      }, DUR + 150);
    },
    [navigate, location.pathname],
  );

  return (
    <Ctx.Provider value={go}>
      {children}
      <div className={`curtain ${phase === 'idle' ? '' : 'is-' + phase}`} aria-hidden="true">
        {Array.from({ length: COLS }, (_, i) => (
          <i key={i} style={{ ['--d' as string]: `${DUR - SHIFT * i}ms`, ['--delay' as string]: `${SHIFT * i}ms` }} />
        ))}
        <span className="curtain-label">
          <span>{label}</span>
        </span>
      </div>
    </Ctx.Provider>
  );
}

/** Internal link that plays the curtain. Modifier-clicks still open normally. */
export function TLink({ to, children, onClick, curtain, label, ...rest }: { to: string; curtain?: boolean; label?: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const go = useGo();
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(to, { curtain, label });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
