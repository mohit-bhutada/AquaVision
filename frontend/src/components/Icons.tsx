import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = ({ size = 20, ...p }: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const Arrow = (p: P) => (<svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const ArrowUpRight = (p: P) => (<svg {...base(p)}><path d="M7 17 17 7M8 7h9v9" /></svg>);
export const ArrowDown = (p: P) => (<svg {...base(p)}><path d="M12 5v14M6 13l6 6 6-6" /></svg>);
export const Sun = (p: P) => (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
export const Moon = (p: P) => (<svg {...base(p)}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></svg>);
export const Drop = (p: P) => (<svg {...base(p)}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /></svg>);
export const Ray = (p: P) => (<svg {...base(p)}><path d="M12 2v6M7 3l2 5M17 3l-2 5M4 21l5-9h6l5 9" /></svg>);
export const Eye = (p: P) => (<svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>);
export const Upload = (p: P) => (<svg {...base(p)}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>);
export const Close = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const More = (p: P) => (<svg {...base(p)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>);
export const Check = (p: P) => (<svg {...base(p)}><path d="M5 12.5 10 17l9-10" /></svg>);

// Geometric marine shapes (filled, used as big decorative glyphs).
export const Shape = ({ kind, size = 120, className = '', paint = 'currentColor' }: { kind: 'ring' | 'wave' | 'drop' | 'sonar' | 'burst' | 'checker'; size?: number; className?: string; paint?: string }) => {
  const s = { width: size, height: size, viewBox: '0 0 100 100', className, 'aria-hidden': true as const };
  const currentColor = paint;
  switch (kind) {
    case 'ring':
      return (<svg {...s}><circle cx="50" cy="50" r="38" fill="none" stroke={currentColor} strokeWidth="10" /></svg>);
    case 'wave':
      return (<svg {...s}><path d="M5 40q11-14 22 0t23 0 22 0 23 0v20q-11 14-22 0t-23 0-22 0-23 0Z" fill={currentColor} /></svg>);
    case 'drop':
      return (<svg {...s}><path d="M50 6s30 32 30 54a30 30 0 0 1-60 0C20 38 50 6 50 6Z" fill={currentColor} /></svg>);
    case 'sonar':
      return (<svg {...s} fill="none" stroke={currentColor} strokeWidth="6"><circle cx="50" cy="50" r="8" fill={currentColor} /><path d="M28 72a31 31 0 0 1 0-44M72 28a31 31 0 0 1 0 44M16 84a48 48 0 0 1 0-68M84 16a48 48 0 0 1 0 68" /></svg>);
    case 'burst':
      return (<svg {...s}>{Array.from({ length: 16 }, (_, i) => (<rect key={i} x="47" y="4" width="6" height="28" rx="3" fill={currentColor} transform={`rotate(${i * 22.5} 50 50)`} />))}<circle cx="50" cy="50" r="12" fill={currentColor} /></svg>);
    case 'checker':
      return (<svg {...s} fill={currentColor}><rect x="4" y="4" width="30" height="30" /><rect x="66" y="4" width="30" height="30" /><rect x="35" y="35" width="30" height="30" /><rect x="4" y="66" width="30" height="30" /><rect x="66" y="66" width="30" height="30" /></svg>);
  }
};
