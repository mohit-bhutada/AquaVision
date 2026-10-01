import { siExpress, siFastapi, siNodedotjs, siPostgresql, siPytorch, siReact, siSupabase, siTailwindcss, siTypescript, siVite } from 'simple-icons';
import type { ReactNode } from 'react';

type Brand = { title: string; path: string; hex: string };

// Brand marks from simple-icons (CC0). Monochrome by default, brand colour on hover.
export const BRANDS: Record<string, Brand> = {
  PyTorch: siPytorch,
  'Node.js': siNodedotjs,
  Express: siExpress,
  FastAPI: siFastapi,
  PostgreSQL: siPostgresql,
  Supabase: siSupabase,
  React: siReact,
  TypeScript: siTypescript,
  Vite: siVite,
  'Tailwind CSS': siTailwindcss,
};

const line = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

// Neutral marks for items without a brand logo.
const GENERIC: Record<string, ReactNode> = {
  Uvicorn: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontFamily="Inter, sans-serif" fill="currentColor">U</text>
    </svg>
  ),
  'AquaVision inference pipeline': line(<><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" /><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" /></>),
  'HTTP-only cookies': line(<><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r="1" /><circle cx="14.5" cy="14" r="1" /><circle cx="14" cy="8.5" r=".6" /></>),
  'Server-side authorization': line(<><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>),
  'Secure API validation': line(<><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 7l2 2M14 9l2 2" /></>),
};

export function TechMark({ name }: { name: string }) {
  const b = BRANDS[name];
  if (!b)
    return <span className="tech-mark inline-grid h-[22px] w-[22px] place-items-center">{GENERIC[name]}</span>;
  return (
    <span className="tech-mark inline-grid h-[22px] w-[22px] place-items-center" style={{ ['--brand' as string]: `#${b.hex}` }}>
      <svg viewBox="0 0 24 24" width="22" height="22" role="img" aria-label={`${b.title} logo`}>
        <path d={b.path} fill="currentColor" />
      </svg>
    </span>
  );
}
