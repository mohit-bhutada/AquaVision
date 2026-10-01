import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pill } from './Ui';

// Real, in-browser colour analysis of the user's own image. It measures pixels only —
// it never alters them. Enhancement itself always runs on the AquaVision model (Workspace).

export type Stats = {
  url: string;
  name: string;
  mean: [number, number, number];
  hist: number[];
  brightness: number; // 0–100
  contrast: number; // luminance std-dev, 0–100 scale
  redGap: number; // % the red mean sits below the green/blue average (0 if not below)
  cast: 'Blue cast' | 'Green cast' | 'Balanced';
};

export type Analysis = {
  stats: Stats | null;
  busy: boolean;
  error: string;
  pick: (file?: File) => void;
  sample: () => void;
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('This image could not be read.'));
    img.src = src;
  });
}

async function measure(url: string, name: string): Promise<Stats> {
  const img = await loadImage(url);
  const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, sum = 0, sum2 = 0;
  const hist = new Array(32).fill(0);
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y;
    sum2 += y * y;
    hist[Math.min(31, Math.floor(y / 8))]++;
  }
  r /= n;
  g /= n;
  b /= n;
  const meanY = sum / n;
  const sd = Math.sqrt(Math.max(0, sum2 / n - meanY * meanY));
  const gb = (g + b) / 2;
  const cast = b > g * 1.08 && b > r * 1.25 ? 'Blue cast' : g >= b && g > r * 1.2 ? 'Green cast' : 'Balanced';
  const peak = Math.max(...hist);
  return {
    url,
    name,
    mean: [r, g, b],
    hist: hist.map((v) => v / peak),
    brightness: Math.round((meanY / 255) * 100),
    contrast: Math.round((sd / 128) * 100),
    redGap: gb > 0 ? Math.max(0, Math.round(((gb - r) / gb) * 100)) : 0,
    cast,
  };
}

/** A generated murky scene so the demo works without an upload. Clearly labelled "Sample". */
function sampleImage() {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 320;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#3f7a70');
  g.addColorStop(1, '#16332e');
  x.fillStyle = g;
  x.fillRect(0, 0, 480, 320);
  x.fillStyle = 'rgba(140,110,80,0.55)';
  for (let i = 0; i < 7; i++) {
    x.beginPath();
    x.ellipse(40 + i * 70, 290 - (i % 3) * 18, 50, 30 + (i % 2) * 14, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = 'rgba(200,230,220,0.18)';
  for (let i = 0; i < 90; i++) x.fillRect(Math.random() * 480, Math.random() * 320, 2, 2);
  return c.toDataURL('image/jpeg', 0.9);
}

export function useAnalysis(): Analysis {
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const last = useRef<string | null>(null);

  const run = useCallback(async (url: string, name: string, owned: boolean) => {
    setBusy(true);
    setError('');
    try {
      // Let the scan animation read as a deliberate step.
      const [s] = await Promise.all([measure(url, name), new Promise((r) => setTimeout(r, 900))]);
      if (last.current) URL.revokeObjectURL(last.current);
      last.current = owned ? url : null;
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setError('Please choose a JPEG or PNG image.');
    if (file.size > 20 * 1024 * 1024) return setError('This file is larger than 20 MB.');
    run(URL.createObjectURL(file), file.name, true);
  };
  const sample = () => run(sampleImage(), 'Sample scene', false);

  return { stats, busy, error, pick, sample };
}

/* ---------------- stage visuals ---------------- */

const Frame = ({ children }: { children: ReactNode }) => <div className="relative h-full min-h-[150px] overflow-hidden rounded-xl border border-line">{children}</div>;

export function InputVisual({ a }: { a: Analysis }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`flex h-full min-h-[150px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 text-center transition-colors duration-300 ${over ? 'border-accent bg-surface' : 'border-line-strong'}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        a.pick(e.dataTransfer.files[0]);
      }}
    >
      {a.stats ? (
        <div className="flex w-full items-center gap-4 text-left">
          <img src={a.stats.url} alt="Your selected image" className="h-24 w-32 rounded-lg object-cover" />
          <div className="min-w-0">
            <p className="truncate text-head">{a.stats.name}</p>
            <button className="ulink mt-2 text-sm text-body" onClick={() => input.current?.click()}>Change image</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[15px] text-head">Drop an underwater image to analyze it</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Pill small onClick={() => input.current?.click()}>Choose image</Pill>
            <Pill small onClick={a.sample}>Use sample</Pill>
          </div>
        </>
      )}
      {a.error && <p className="text-sm text-error" role="alert">{a.error}</p>}
      <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Choose image to analyze" onChange={(e) => a.pick(e.target.files?.[0])} />
    </div>
  );
}

export function AnalyzeVisual({ a }: { a: Analysis }) {
  const s = a.stats;
  const bars: [string, string, number][] = s
    ? [['R', '#ff6b5e', s.mean[0]], ['G', '#4fd18b', s.mean[1]], ['B', '#3fa9f5', s.mean[2]]]
    : [['R', '#ff6b5e', 60], ['G', '#4fd18b', 120], ['B', '#3fa9f5', 150]];
  return (
    <div className="relative grid h-full min-h-[150px] grid-cols-[1fr_1.2fr] gap-4" aria-live="polite">
      <div className={`flex flex-col justify-center gap-2 ${s ? '' : 'opacity-30'}`}>
        {bars.map(([k, c, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-large">{k}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <span className="block h-full origin-left rounded-full transition-transform duration-1000" style={{ background: c, transform: `scaleX(${v / 255})`, transitionTimingFunction: 'var(--ease)' }} />
            </span>
            <span className="w-8 text-right tabular-nums text-body">{Math.round(v)}</span>
          </div>
        ))}
        {s && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-full border border-line px-2 py-0.5 text-head">{s.cast}</span>
            <span className="rounded-full border border-line px-2 py-0.5">Brightness {s.brightness}%</span>
            <span className="rounded-full border border-line px-2 py-0.5">Contrast {s.contrast}%</span>
            {s.redGap > 0 && <span className="rounded-full border border-line px-2 py-0.5">Red −{s.redGap}%</span>}
          </div>
        )}
        {!s && !a.busy && <p className="text-xs text-large">Add an image in step 01.</p>}
      </div>
      <div className={`relative flex items-end gap-[2px] overflow-hidden rounded-lg border border-line p-2 ${s ? '' : 'opacity-30'}`} aria-label="Brightness histogram" role="img">
        {(s?.hist ?? Array.from({ length: 32 }, (_, i) => 0.2 + 0.6 * Math.sin(i / 5) ** 2)).map((v, i) => (
          <span key={i} className="flex-1 origin-bottom rounded-t-sm bg-accent/70 transition-transform duration-700" style={{ height: '100%', transform: `scaleY(${Math.max(0.03, v)})`, transitionDelay: `${i * 12}ms` }} />
        ))}
        {a.busy && <span className="absolute inset-y-0 left-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent)', animation: 'sweep 1s linear infinite' }} />}
      </div>
    </div>
  );
}

export function RestoreVisual({ a }: { a: Analysis }) {
  return (
    <Frame>
      {a.stats ? <img src={a.stats.url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" /> : <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#3f7a70,#16332e)' }} />}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-4">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="restore-cell border border-white/10" style={{ animationDelay: `${(i % 8) * 90 + Math.floor(i / 8) * 140}ms` }} />
        ))}
      </div>
      <span className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">Conceptual</span>
    </Frame>
  );
}

export function EnhanceVisual() {
  return (
    <div className="flex h-full min-h-[150px] flex-col items-start justify-center gap-4 rounded-xl border border-line p-5">
      <p className="text-[15px]">The AquaVision model restores color, contrast and detail in the Workspace.</p>
      <Pill to="/workspace" small solid>Enhance in Workspace</Pill>
    </div>
  );
}

export function OutputVisual() {
  const box = 'grid h-14 w-14 place-items-center rounded-2xl border border-line text-head transition-colors duration-300 group-hover:border-accent group-hover:text-accent';
  return (
    <div className="group flex h-full min-h-[150px] items-center gap-4 rounded-xl border border-line p-5">
      <span className={box} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>
      </span>
      <span className={box} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /></svg>
      </span>
      <p className="text-[15px]">Compare and download your enhanced image in the Workspace.</p>
    </div>
  );
}
