import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from 'react';
import { reducedMotion } from '../lib/motion';
import { TLink } from './Curtain';
import { Arrow } from './Icons';

/** Text that rolls up on hover of the closest `.roll-host`. Clipped, so the duplicate never shows. */
export const Roll = ({ children }: { children: string }) => (
  <span className="roll">
    <span className="roll-inner">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  </span>
);

type PillProps = { to?: string; solid?: boolean; small?: boolean; children: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>;

export function Pill({ to, solid, small, children, className = '', ...rest }: PillProps) {
  const cls = `pill roll-host ${solid ? 'pill-solid' : ''} ${small ? 'pill-sm' : ''} ${className}`;
  const inner = typeof children === 'string' ? <Roll>{children}</Roll> : children;
  if (to)
    return (
      <TLink to={to} className={cls} data-magnetic>
        {inner}
      </TLink>
    );
  return (
    <button className={cls} data-magnetic {...rest}>
      {inner}
    </button>
  );
}

/** Big outline pill joined to a round arrow button. */
export function PillArrow({ to, children, big }: { to: string; children: string; big?: boolean }) {
  return (
    <TLink to={to} className="pill-group roll-host inline-flex items-center" data-magnetic>
      <span className={`pill ${big ? '!h-16 !px-8 text-lg md:text-xl' : ''}`}>
        <Roll>{children}</Roll>
      </span>
      <span className={`arrow-btn ${big ? '!h-16 !w-16' : ''}`}>
        <Arrow size={big ? 22 : 20} />
      </span>
    </TLink>
  );
}

export const Logo = ({ size = 40 }: { size?: number }) => (
  <img src="/aquavision.png" alt="AquaVision" width={size} height={size} className="av-logo block" style={{ width: size, height: size, objectFit: 'contain' }} />
);

/** Honest image stand-in until real AquaVision model outputs are provided. */
const GRADIENTS = {
  murky: 'radial-gradient(120% 90% at 30% 20%, #4d6a5a 0%, #2f473f 45%, #1b2a27 100%)',
  clear: 'radial-gradient(120% 90% at 30% 20%, #3fb7d6 0%, #1a6c95 45%, #0c2f4f 100%)',
  deep: 'radial-gradient(140% 100% at 50% 0%, #1d4f6e 0%, #0e2a41 50%, #07131f 100%)',
  reef: 'radial-gradient(90% 80% at 70% 70%, #d9895b 0%, #3d7f96 45%, #0e2f47 100%)',
  light: 'linear-gradient(180deg, #7fd8e6 0%, #237a9b 40%, #0b2b44 100%)',
  dusk: 'radial-gradient(120% 100% at 20% 80%, #2d5566 0%, #152c3e 50%, #080f18 100%)',
} as const;
export type Tone = keyof typeof GRADIENTS;

/** Honest stand-in, or a real photo when `src` is given (photos illustrate context only, never an AquaVision result). */
export function Placeholder({ tone = 'deep', label = 'Placeholder', className = '', children, src, alt = '', imgClass = '' }: { tone?: Tone; label?: string; className?: string; children?: ReactNode; src?: string; alt?: string; imgClass?: string }) {
  if (src)
    return (
      <div className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} overflow-hidden ${className}`} style={{ background: GRADIENTS[tone] }}>
        <img src={src} alt={alt} loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full object-cover ${imgClass}`} />
        {children}
      </div>
    );
  return (
    <div role="img" aria-label={`${label} underwater image`} className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} overflow-hidden ${className}`} style={{ background: GRADIENTS[tone] }}>
      <div className="absolute inset-0 opacity-40" style={{ background: 'repeating-linear-gradient(100deg, transparent 0 40px, rgba(255,255,255,.06) 40px 44px)' }} />
      {label && <span className="absolute top-3 right-3 rounded-full bg-black/35 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-sm">{label}</span>}
      {children}
    </div>
  );
}

export const Divider = () => <hr className="border-0 border-t border-line" />;

export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button, a, input')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-[9000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={box} className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-line bg-bg p-6">
        {children}
      </div>
    </div>
  );
}

export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  // 3D tilt + glare that follows the cursor. Mouse only; resets on leave.
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || reducedMotion()) return;
    const el = ref.current!;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateX(${-py * 6}deg) rotateY(${px * 6}deg)`;
    el.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
  };
  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => ref.current && (ref.current.style.transform = '')}
      className={`tilt relative transition-transform duration-500 ease-out ${className}`}
      data-cursor="View"
    >
      {children}
      <span className="glare pointer-events-none absolute inset-0 rounded-2xl" aria-hidden="true" />
    </div>
  );
}

/** Copies text and confirms for a moment; reports failure instead of pretending. */
export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  return (
    <Pill
      small
      onClick={() =>
        navigator.clipboard
          ?.writeText(text)
          .then(() => setState('done'), () => setState('fail'))
          .finally(() => setTimeout(() => setState('idle'), 1800))
      }
      aria-live="polite"
    >
      {state === 'done' ? 'Copied' : state === 'fail' ? 'Copy failed' : label}
    </Pill>
  );
}
