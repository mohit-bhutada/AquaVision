import { useRef, useState, type ReactNode } from 'react';

/** Accessible before/after comparison. Keyboard: arrows ±5, Home/End. Pointer + touch drag. */
export function CompareSlider({
  before,
  after,
  beforeLabel = 'Original',
  afterLabel = 'AquaVision Enhanced',
  className = '',
  toggle = false,
  boxClass = '',
  value,
  onValue,
}: {
  before: ReactNode;
  after: ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  toggle?: boolean;
  boxClass?: string;
  /** Optional controlled position (0–100, share of the "before" side). */
  value?: number;
  onValue?: (pos: number) => void;
}) {
  const [inner, setInner] = useState(50);
  const pos = value ?? inner;
  const setPos = (next: number | ((p: number) => number)) => {
    const n = typeof next === 'function' ? next(pos) : next;
    setInner(n);
    onValue?.(n);
  };
  const [side, setSide] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const setFromX = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };

  const tag = 'absolute bottom-3 z-10 rounded-full bg-black/45 px-3 py-1 text-xs text-white backdrop-blur-sm';

  return (
    <div className={className}>
      {toggle && (
        <div className="mb-3 flex justify-end gap-1 text-sm" role="group" aria-label="Comparison mode">
          {['Slider', 'Side by side'].map((m, i) => (
            <button
              key={m}
              onClick={() => setSide(i === 1)}
              aria-pressed={side === (i === 1)}
              className={`rounded-full px-3 py-1.5 transition-colors ${side === (i === 1) ? 'bg-invert-bg text-invert-fg' : 'text-large hover:text-head'}`}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {side ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[
            [before, beforeLabel],
            [after, afterLabel],
          ].map(([node, label]) => (
            <div key={String(label)} className="relative aspect-[4/3] overflow-hidden rounded-2xl">
              {node}
              <span className={`${tag} left-3`}>{label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={box}
          data-cursor="Drag"
          className={`relative h-full w-full select-none overflow-hidden rounded-[inherit] touch-pan-y ${boxClass || 'min-h-[240px]'}`}
          onPointerDown={(e) => {
            dragging.current = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setFromX(e.clientX);
          }}
          onPointerMove={(e) => dragging.current && setFromX(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="absolute inset-0">{after}</div>
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
            {before}
          </div>
          <span className={`${tag} left-3`}>{beforeLabel}</span>
          <span className={`${tag} right-3`}>{afterLabel}</span>
          <div className="absolute inset-y-0 z-10 w-px bg-white/80" style={{ left: `${pos}%` }}>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Comparison position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pos)}
              aria-valuetext={`${Math.round(pos)}% original`}
              onKeyDown={(e) => {
                const step = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5 }[e.key];
                if (step) setPos((p) => Math.max(0, Math.min(100, p + step)));
                else if (e.key === 'Home') setPos(0);
                else if (e.key === 'End') setPos(100);
                else return;
                e.preventDefault();
              }}
              className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b1520] shadow-lg"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M9 6 3 12l6 6M15 6l6 6-6 6" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
