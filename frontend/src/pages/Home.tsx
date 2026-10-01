import { useEffect, useRef, useState } from 'react';
import { CompareSlider } from '../components/CompareSlider';
import { TLink } from '../components/Curtain';
import { Arrow as ArrowRight, ArrowDown, Drop, Eye, Ray, Upload } from '../components/Icons';
import { Shape } from '../components/Icons';
import { AnalyzeVisual, EnhanceVisual, InputVisual, OutputVisual, RestoreVisual, useAnalysis } from '../components/AnalyzeDemo';
import { DepthGauge } from '../components/DepthGauge';
import { BRANDS, TechMark } from '../components/TechLogos';
import { PublicShell } from '../components/Layout';
import { Ocean } from '../components/Ocean';
import { ClipReveal, Letters, Lines, Reveal, useGsap, W, WordScrub } from '../components/Reveal';
import { Modal, Pill, PillArrow, Placeholder, Roll, TiltCard, type Tone } from '../components/Ui';
import { gsap, isDesktop, reducedMotion, scrollVelocity } from '../lib/motion';
import { enhancedLabel, GALLERY_IMAGES, WORKSPACE_DEMO } from '../lib/demoImages';
import { useAccount } from '../lib/account';

export default function Home() {
  return (
    <PublicShell>
      <DepthGauge />
      <Hero />
      <Descend />
      <Reel />
      <Problem />
      <Pipeline />
      <Science />
      <Applications />
      <Product />
      <Technology />
      <Depth />
      <Research />
      <Gallery />
      <FinalCta />
    </PublicShell>
  );
}

/* ---------------- 01 Hero ---------------- */
function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    if (reducedMotion()) return;
    const ctx = c.getContext('2d')!;
    let w = 0, h = 0, raf = 0, visible = true;
    const dpr = Math.min(devicePixelRatio, 2);
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const N = innerWidth < 768 ? 40 : 90;
    const ps = Array.from({ length: N }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.3, v: Math.random() * 0.00025 + 0.00008, d: Math.random() * Math.PI * 2 }));
    const draw = (t: number) => {
      if (visible) {
        ctx.clearRect(0, 0, w, h);
        for (const p of ps) {
          p.y -= p.v;
          if (p.y < -0.02) p.y = 1.02;
          const x = (p.x + Math.sin(t / 3000 + p.d) * 0.004) * w;
          ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(t / 2000 + p.d));
          ctx.fillStyle = '#bff6ff';
          ctx.beginPath();
          ctx.arc(x, p.y * h, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    resize();
    addEventListener('resize', resize);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

function Hero() {
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';
  return (
    <section data-surface="dark" className="hero relative flex min-h-[100svh] flex-col overflow-hidden bg-[#06101a] text-white">
      <div className="absolute inset-0" aria-hidden="true">
        <Ocean depth={0.15} />
        <Particles />
        <div className="absolute inset-x-0 bottom-0 h-48" style={{ background: 'linear-gradient(to bottom, transparent, #06101a)' }} />
      </div>

      <div className="wrap relative flex flex-1 flex-col pb-32 pt-10 md:pb-40">
        <img src="/aquavision.png" alt="AquaVision" width={48} height={48} className="mx-auto h-12 w-12 object-contain" />
        <h1 className="mt-auto text-[52px] leading-[0.98] tracking-[-0.045em] text-white sm:text-[80px] lg:text-[112px]" aria-label="See what the water hides.">
          <span className="block"><Letters text="See what" delay={0.2} /></span>
          <span className="serif block pl-[12%] md:pl-[22%]"><Letters text="the water" delay={0.35} /></span>
          <span className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Letters text="hides." delay={0.5} />
            <Pill to={tryAquaVisionPath} className="!border-white/40 !text-white hover:!bg-white hover:!text-[#0b1520] text-base tracking-normal">Try AquaVision</Pill>
          </span>
        </h1>
        <div className="mt-14 grid gap-6 text-[15px] text-white/75 md:grid-cols-2 md:gap-24">
          <p className="max-w-xs">AI-powered underwater image enhancement</p>
          <div className="max-w-sm">
            <p>Restores clarity, color and detail from degraded underwater imagery.</p>
            <TLink to="#technology" className="ulink mt-3 inline-flex items-center gap-1 text-white">
              Explore the technology <ArrowDown size={14} />
            </TLink>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 02 Descend ---------------- */
function Descend() {
  const icon = 'mx-1 inline-block h-[0.8em] w-[0.8em] -translate-y-[0.05em] text-accent';
  return (
    <section className="relative py-32 md:py-48">
      <div className="wrap relative">
        <WordScrub className="max-w-[1030px] text-[28px] leading-[1.3] tracking-[-0.02em] text-head md:text-[42px]">
          <W>The deeper we go, the less we see. Low light,</W>
          <Drop className={icon} />
          <span className="w underline decoration-1 underline-offset-8">color </span>
          <W>distortion, suspended particles</W>
          <Ray className={icon} />
          <W>and loss of</W> <span className="w underline decoration-1 underline-offset-8">detail </span>
          <W>hide what is really there.</W>
          <Eye className={icon} />
          <W>AquaVision brings it</W> <span className="w underline decoration-1 underline-offset-8">back.</span>
        </WordScrub>
      </div>
    </section>
  );
}

/* ---------------- 03 Before / After reel ---------------- */
// Tiny drawn glyphs for the capability tiles; they animate when the tile turns on (see .cap in styles.css).
const CAP_GLYPHS = [
  <svg key="c" viewBox="0 0 40 24" className="h-6 w-10" aria-hidden="true">
    <rect x="1" y="4" width="38" height="16" rx="8" fill="#3d5a4c" />
    <rect className="cap-fill" x="1" y="4" width="38" height="16" rx="8" fill="url(#cap-g)" />
    <defs><linearGradient id="cap-g"><stop offset="0" stopColor="#1a6c95" /><stop offset="1" stopColor="#3fe0f0" /></linearGradient></defs>
  </svg>,
  <svg key="h" viewBox="0 0 40 24" className="h-6 w-10" aria-hidden="true">
    {[0.5, 0.8, 1, 0.7, 0.45].map((h, i) => (
      <rect key={i} className="cap-bar" x={3 + i * 7.5} y="2" width="4.5" height="20" rx="1.5" fill="currentColor" style={{ ['--h' as string]: h, transitionDelay: `${i * 50}ms` }} />
    ))}
  </svg>,
  <svg key="d" viewBox="0 0 40 24" className="cap-sharp h-6 w-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M3 6h34M3 12h26M3 18h30" />
  </svg>,
  <svg key="v" viewBox="0 0 40 24" className="h-6 w-10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle className="cap-ring" cx="20" cy="12" r="9" />
    <path className="cap-arrow" d="M20 17V7M16 11l4-4 4 4" />
  </svg>,
];

function Reel() {
  const [pos, setPos] = useState(50);
  const ref = useGsap<HTMLDivElement>((el) => {
    gsap.fromTo(
      el.querySelector('.panel'),
      { clipPath: 'inset(0% 10% 0% 10% round 24px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: el, start: 'top 90%', end: 'top 15%', scrub: true } },
    );
    if (reducedMotion()) return;
    // One-time hint: sweep the divider so the tiles light up in order, then settle back.
    const v = { p: 50 };
    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 35%', once: true }, onUpdate: () => setPos(v.p) })
      .to(v, { p: 12, duration: 1.4, ease: 'power2.inOut' })
      .to(v, { p: 50, duration: 1, ease: 'power2.inOut' }, '+=0.4');
  });
  const chips = ['Color restoration', 'Contrast enhancement', 'Detail recovery', 'Visibility'];
  const shown = 100 - pos; // share of the enhanced side on screen
  return (
    <section ref={ref} aria-label="Before and after">
      <div data-surface="dark" className="panel relative h-[70svh] min-h-[420px] md:h-[90svh]" style={{ clipPath: 'inset(0% 4% 0% 4% round 24px)' }}>
        <CompareSlider
          className="h-full"
          value={pos}
          onValue={setPos}
          before={<Placeholder tone="murky" label="" className="h-full w-full" />}
          after={<Placeholder tone="clear" label="" className="h-full w-full" />}
        />
        <span className="absolute left-4 top-4 z-10 rounded-full bg-black/40 px-3 py-1 text-xs text-white backdrop-blur-sm">Demo image placeholder</span>
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[5] -translate-y-1/2 overflow-hidden text-[64px] leading-none text-white/90 md:text-[150px]" aria-hidden="true">
          <div className="marquee gap-16 pr-16">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="flex gap-16 whitespace-nowrap">
                <span className="tracking-[-0.04em]">From murky</span>
                <span className="serif">to meaningful</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <Reveal stagger className="wrap grid grid-cols-2 border-b border-line text-[15px] md:grid-cols-4">
        {chips.map((c, i) => (
          <p key={c} className={`cap relative flex items-center gap-3 border-line py-6 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0 ${shown > 22 + i * 14 ? 'is-on' : ''}`}>
            {CAP_GLYPHS[i]}
            {c}
          </p>
        ))}
      </Reveal>
    </section>
  );
}

/* ---------------- 04 Problem rows ---------------- */
function useFollower() {
  // Floating preview that trails the cursor (lerped), used by the problem rows.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches) return;
    let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const loop = () => {
      const dx = x - cx;
      cx += dx * 0.14;
      cy += (y - cy) * 0.14;
      if (box.current) box.current.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) rotate(${Math.max(-8, Math.min(8, dx * 0.08))}deg)`;
      raf = requestAnimationFrame(loop);
    };
    addEventListener('pointermove', move, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return box;
}

function Problem() {
  const rows: { word: string; shape: 'drop' | 'burst' | 'sonar' | 'ring'; tone: Tone }[] = [
    { word: 'COLOR', shape: 'drop', tone: 'reef' },
    { word: 'CLARITY', shape: 'burst', tone: 'clear' },
    { word: 'CONTRAST', shape: 'sonar', tone: 'light' },
    { word: 'DETAIL', shape: 'ring', tone: 'dusk' },
  ];
  const [hover, setHover] = useState<number | null>(null);
  const box = useFollower();
  const ref = useGsap<HTMLElement>((el) => {
    if (reducedMotion()) return;
    // "color." slowly regains its hue as you scroll, murky green to accent (solid color, theme aware).
    gsap.fromTo(el.querySelector('.hue'), { '--mix': 0 }, { '--mix': 100, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 20%', scrub: true } });
    // Rows drift in from alternating sides, tied to scroll.
    el.querySelectorAll('.prow-word').forEach((w, i) =>
      gsap.fromTo(w, { x: i % 2 ? 90 : -90 }, { x: 0, ease: 'none', scrollTrigger: { trigger: w, start: 'top 95%', end: 'top 55%', scrub: true } }),
    );
  });
  return (
    <section ref={ref} className="py-32 md:py-44">
      <div className="wrap grid gap-8 md:grid-cols-2 md:items-end">
        <Lines lines={['Underwater images', <>lose more than <span className="hue serif" style={{ color: 'color-mix(in srgb, var(--accent) calc(var(--mix, 100) * 1%), #5f7d6c)' }}>color.</span></>]} className="text-[36px] leading-[1.05] md:text-[52px]" />
        <WordScrub className="max-w-sm text-[15px] leading-relaxed text-head md:justify-self-end">
          <W>Light absorption, scattering, color attenuation, turbidity and low visibility degrade every underwater image.</W>
        </WordScrub>
      </div>
      <ul className="mt-20" onPointerLeave={() => setHover(null)}>
        {rows.map((r, i) => (
          <li
            key={r.word}
            onPointerEnter={() => setHover(i)}
            className={`roll-host group relative flex items-center justify-center border-t border-line py-3 transition-colors duration-300 last:border-b md:py-2 ${hover !== null && hover !== i ? 'text-line-strong' : 'text-large'}`}
          >
            <span className="absolute left-5 hidden text-[15px] md:left-16 md:block">Lost</span>
            <span className="prow-word flex items-center gap-4 text-[44px] leading-none tracking-[-0.04em] transition-colors duration-300 group-hover:text-head sm:text-[72px] lg:text-[112px]">
              <span className="transition-[color,transform] duration-500 group-hover:rotate-90 group-hover:text-accent">
                <Shape kind={r.shape} size={56} className="h-[0.5em] w-[0.5em]" />
              </span>
              <Roll>{r.word}</Roll>
            </span>
            <span className="absolute right-5 hidden text-[15px] transition-colors group-hover:text-accent md:right-16 md:block">Restored</span>
          </li>
        ))}
      </ul>
      <div ref={box} className="pointer-events-none fixed left-0 top-0 z-30 hidden h-[160px] w-[230px] md:block" aria-hidden="true">
        <div className={`h-full w-full overflow-hidden rounded-xl shadow-2xl transition-[opacity,transform] duration-500 ${hover === null ? 'scale-75 opacity-0' : 'scale-100 opacity-100'}`}>
          {rows.map((r, i) => (
            <Placeholder key={r.word} tone={r.tone} src={`/images/problem-${r.word.toLowerCase()}.webp`} label="" className={`absolute inset-0 transition-opacity duration-500 ${hover === i ? 'opacity-100' : 'opacity-0'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 05 Pipeline (pinned stack + real analyze demo) ---------------- */
const STAGES = [
  ['01', 'Input', 'Raw underwater image.'],
  ['02', 'Analyze', 'AI examines degradation.'],
  ['03', 'Restore', 'Model reconstructs visual information.'],
  ['04', 'Enhance', 'Color, contrast and details are improved.'],
  ['05', 'Output', 'Enhanced underwater image.'],
];
function Pipeline() {
  const a = useAnalysis();
  const ref = useGsap<HTMLElement>((el) => {
    if (!isDesktop()) return;
    const cards = el.querySelectorAll<HTMLElement>('.card');
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: `+=${cards.length * 70}%`, scrub: 0.6, pin: true } });
    cards.forEach((c, i) => {
      if (i === 0) return;
      tl.fromTo(c, { yPercent: 130 }, { yPercent: 0, duration: 1, ease: 'power2.out' });
      tl.to(el.querySelector('.counter'), { y: `${-i * 1.2}em`, duration: 1, ease: 'power2.out' }, '<');
    });
  });
  const visuals = [<InputVisual a={a} />, <AnalyzeVisual a={a} />, <RestoreVisual a={a} />, <EnhanceVisual />, <OutputVisual />];
  return (
    <section ref={ref} className="flex min-h-screen items-center py-24">
      <div className="wrap grid items-center gap-16 [&>*]:min-w-0 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Lines lines={['An AI system', <>built for <span className="serif">the deep.</span></>]} className="text-[30px] leading-[1.05] min-[400px]:text-[36px] md:text-[56px]" />
          <p className="mt-6 max-w-sm text-[15px]">Every image moves through the AquaVision pipeline. Drop one into step 01 for a quick color check in your browser.</p>
          <div className="mt-12 hidden h-[1.2em] overflow-hidden text-[96px] leading-none tracking-[-0.05em] text-head lg:block" aria-hidden="true">
            <div className="counter">
              {STAGES.map(([n]) => (
                <div key={n} className="flex h-[1.2em] items-center leading-none">
                  {n}
                  <span className="text-large">/05</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 hidden max-w-xs text-xs text-large lg:block">The color check only measures your pixels. Enhancement runs on the AquaVision model in the Workspace.</p>
        </div>
        <ol className="relative grid gap-4 [&>*]:min-w-0 lg:block lg:h-[470px] lg:overflow-hidden lg:pb-14 lg:pr-14">
          {STAGES.map(([n, t, d], i) => (
            <li
              key={n}
              className="card flex min-w-0 flex-col gap-5 rounded-2xl border border-line bg-bg p-5 sm:p-7 shadow-[0_20px_60px_-30px_rgba(0,0,0,.35)] lg:absolute lg:left-0 lg:right-14 lg:top-0 lg:h-[400px]"
              style={isDesktop() ? { transform: `translate(${i * 12}px, ${i * 12}px)`, zIndex: i } : undefined}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <p className="text-[30px] tracking-[-0.03em] text-head">
                  <span className="mr-3 align-top text-sm tracking-normal text-large">{n}</span>
                  {t}
                </p>
                <p className="text-[15px] text-body">{d}</p>
              </div>
              <div className="flex-1">{visuals[i]}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------- 06 Science (interactive dive) ---------------- */
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// Approximate, clear ocean water: red mostly gone by ~10 m, orange by ~40 m, yellow persists deeper.
const SPECTRUM: [string, string, number][] = [
  ['#ff5a4f', '650 nm', 10],
  ['#ffa041', '600 nm', 40],
  ['#f2e05a', '570 nm', 100],
  ['#4fd18b', '520 nm', 200],
  ['#3fa9f5', '470 nm', 400],
];
function mix(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
}

function ScienceVisual({ kind, d }: { kind: number; d: number }) {
  const box = 'relative h-36 overflow-hidden rounded-xl border border-line';
  if (kind === 0)
    return (
      <div className={`${box} flex items-end gap-2 p-3`}>
        {SPECTRUM.map(([c, nm, gone]) => (
          <div key={nm} className="flex flex-1 flex-col items-center gap-1">
            <span className="w-full origin-bottom rounded-md transition-[transform,opacity] duration-500" style={{ height: 88, background: c, opacity: 0.15 + 0.85 * clamp01(1 - d / gone), transform: `scaleY(${0.1 + 0.9 * clamp01(1 - d / gone)})` }} />
            <span className="text-[10px] text-large">{nm}</span>
          </div>
        ))}
      </div>
    );
  if (kind === 1)
    return (
      <div className={box}>
        <svg viewBox="0 0 200 140" className="h-full w-full" aria-hidden="true">
          <path d="M-10 0 L120 140" stroke="var(--accent)" strokeWidth="3" opacity={0.9 - d / 60} />
          {[[60, 50], [95, 85], [40, 100], [140, 40], [150, 110], [110, 20]].map(([x, y], i) => (
            <g key={i} className="drift" style={{ animationDelay: `${i * 0.4}s` }}>
              <circle cx={x} cy={y} r={3 + d / 6} fill="var(--accent)" opacity={0.08 + d / 120} />
              <circle cx={x} cy={y} r="2" fill="var(--head)" opacity=".7" />
            </g>
          ))}
        </svg>
      </div>
    );
  if (kind === 2)
    return (
      <div className={`${box} grid place-items-center`} style={{ background: mix('#1b3a4f', '#0b2436', clamp01(d / 40)) }}>
        <svg viewBox="0 0 100 100" className="h-24 w-24 transition-colors duration-500" aria-hidden="true" style={{ color: mix('#ff6b5e', '#2f8f8a', clamp01(d / 25)) }}>
          <path fill="currentColor" d="M50 95V60M50 60c0-15-20-18-20-35 0-6 4-10 8-10s6 6 6 12c0-10 3-18 6-18s6 8 6 18c0-6 2-12 6-12s8 4 8 10c0 17-20 20-20 35Z" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
        </svg>
        <span className="absolute bottom-2 right-3 text-[11px] text-white/80">{d < 8 ? 'Red coral' : d < 20 ? 'Looks brown' : 'Looks blue-green'}</span>
      </div>
    );
  if (kind === 3)
    return (
      <div className={box}>
        {Array.from({ length: 60 }, (_, i) => (
          <span
            key={i}
            className="drift absolute h-1.5 w-1.5 rounded-full bg-large transition-opacity duration-500"
            style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, opacity: i / 60 < d / 40 ? 0.75 : 0, animationDelay: `${(i % 7) * 0.3}s` }}
          />
        ))}
        <span className="absolute inset-0 transition-[backdrop-filter] duration-500" style={{ backdropFilter: `blur(${d / 12}px)` }} />
      </div>
    );
  const light = Math.exp(-d / 15);
  return (
    <div className={`${box} flex flex-col items-center justify-center gap-4`}>
      <span className="h-14 w-14 rounded-full transition-opacity duration-500" style={{ background: 'radial-gradient(circle, #fff6c8, #ffd36b 60%, transparent 70%)', opacity: 0.15 + 0.85 * light }} />
      <span className="h-1.5 w-3/4 overflow-hidden rounded-full bg-line">
        <span className="block h-full origin-left bg-accent transition-transform duration-500" style={{ transform: `scaleX(${light})` }} />
      </span>
      <span className="text-[11px] text-large">{Math.round(light * 100)}% of surface light</span>
    </div>
  );
}

function Science() {
  const [d, setD] = useState(0);
  const ref = useGsap<HTMLElement>((el) => {
    const proxy = { v: 0 };
    gsap.to(proxy, { v: 25, duration: 2.4, ease: 'power2.inOut', onUpdate: () => setD(Math.round(proxy.v)), scrollTrigger: { trigger: el, start: 'top 60%', once: true } });
  });
  const cols = [
    ['Absorption', 'Different wavelengths disappear at different depths.'],
    ['Scattering', 'Particles scatter light and reduce visibility.'],
    ['Attenuation', 'Colors shift as depth increases.'],
    ['Turbidity', 'Suspended particles reduce image clarity.'],
    ['Low light', 'Less available light reduces detail.'],
  ];
  return (
    <section ref={ref} className="py-32 md:py-44">
      <div className="wrap">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
          <Lines lines={[<>Why underwater images <span className="serif">degrade.</span></>]} className="text-[36px] leading-[1.05] md:text-[52px]" />
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="dive" className="text-[15px] text-head">Drag to dive</label>
              <span className="text-[40px] leading-none tracking-[-0.04em] text-head tabular-nums">{d} m</span>
            </div>
            <input id="dive" type="range" min={0} max={40} value={d} onChange={(e) => setD(+e.target.value)} className="dive-range mt-4 w-full" aria-valuetext={`${d} metres`} />
            <p className="mt-2 text-xs text-large">Approximate, for clear ocean water.</p>
          </div>
        </div>
        <Reveal stagger className="mt-14 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-5">
          {cols.map(([t, desc], i) => (
            <div key={t} className="group flex flex-col gap-6 border-b border-r border-line bg-bg p-6 transition-colors duration-300 hover:bg-surface">
              <h3 className="text-[28px] tracking-[-0.03em] transition-colors duration-300 group-hover:text-accent md:text-[30px]">{t}</h3>
              <ScienceVisual kind={i} d={d} />
              <p className="text-[15px] leading-relaxed">{desc}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- 07 Applications ---------------- */
const APPS: [string, string, Tone, string, string][] = [
  ['Marine research', 'Improve underwater imagery for analysis and documentation.', 'reef', 'md:col-span-2 aspect-[16/10]', 'marine-research'],
  ['Ocean exploration', 'Improve visibility in underwater exploration environments.', 'light', 'aspect-[4/5] md:aspect-auto', 'ocean-exploration'],
  ['Marine biology', 'Assist visual analysis of underwater organisms and habitats.', 'clear', 'aspect-[4/5]', 'marine-biology'],
  ['Underwater robotics', 'Enhance imagery captured by underwater robotic systems.', 'dusk', 'aspect-[4/5]', 'underwater-robotics'],
  ['Environmental monitoring', 'Improve visual documentation of underwater environments.', 'deep', 'aspect-[4/5]', 'environmental-monitoring'],
  ['Aquatic inspection', 'Support clearer visual inspection of submerged structures.', 'murky', 'md:col-span-3 aspect-[21/9]', 'aquatic-inspection'],
];
function Applications() {
  return (
    <section id="applications" className="py-32 md:py-44">
      <div className="wrap">
        <Reveal stagger className="grid gap-4 border-t border-line pt-6 text-[15px] md:grid-cols-3">
          <p className="text-head">Where AquaVision can help</p>
          <p>From marine research to underwater robotics.</p>
          <p className="md:text-right">Clearer images at every depth.</p>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {APPS.map(([title, text, tone, span, img]) => (
            <TiltCard key={title} className={`group ${span}`}>
              <ClipReveal className="h-full rounded-2xl">
                <Placeholder tone={tone} src={`/images/app-${img}.webp`} alt={title} imgClass={img === 'underwater-robotics' ? 'object-[50%_85%]' : ''} className="h-full min-h-[260px] w-full transition-transform duration-700 group-hover:scale-[1.06]">
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
                    <span className="rounded-full border border-white/40 px-3 py-1 text-xs">Application</span>
                    <p className="mt-4 text-[26px] tracking-[-0.03em] transition-transform duration-500 group-hover:-translate-y-1 md:text-[32px]">{title}</p>
                    <p className="mt-1 max-w-md text-sm text-white/75">{text}</p>
                  </div>
                </Placeholder>
              </ClipReveal>
            </TiltCard>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 08 Product ---------------- */
function ToggleKnob() {
  // Clickable murky ↔ clear switch; flips once on its own when scrolled into view.
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return setOn(true);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setTimeout(() => setOn(true), 350);
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <button
      ref={ref}
      onClick={() => setOn((v) => !v)}
      role="switch"
      aria-checked={on}
      aria-label="Toggle murky and enhanced preview"
      className="toggle relative inline-flex h-[0.8em] w-[1.9em] items-center rounded-full p-[0.06em] align-middle transition-[filter] duration-500 hover:brightness-110"
      style={{ background: on ? 'linear-gradient(90deg,#1e7f9c,#3fe0f0)' : 'linear-gradient(90deg,#4d6a5a,#6c8c7c)' }}
      data-magnetic
    >
      <span className="knob block aspect-square h-full overflow-hidden rounded-full border-2 border-white/80 shadow-lg transition-transform duration-700" style={{ transform: on ? 'translateX(1.1em)' : 'none', transitionTimingFunction: 'var(--ease)' }}>
        <Placeholder tone={on ? 'clear' : 'murky'} label="" className="h-full w-full transition-opacity duration-500" />
      </span>
    </button>
  );
}

function Product() {
  const steps = ['Upload', 'Process', 'Enhance', 'Compare', 'Download'];
  return (
    <section id="product" className="py-32 md:py-44">
      <div className="wrap text-center">
        <h2 className="text-[48px] leading-[1.02] tracking-[-0.045em] md:text-[104px] lg:text-[120px]">
          <span className="block">From research</span>
          <span className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            to <ToggleKnob /> <span className="serif">reality.</span>
          </span>
        </h2>
        <p className="mx-auto mt-8 max-w-md text-[15px]">Upload, process, enhance, compare and download in one workspace.</p>
        <div className="mt-10 flex justify-center">
          <PillArrow to="/workspace" big>Open workspace</PillArrow>
        </div>
      </div>
      <div className="wrap mt-24">
        <WorkspaceMock steps={steps} />
      </div>
    </section>
  );
}

function WorkspaceMock({ steps }: { steps: string[] }) {
  const [step, setStep] = useState(0);
  const demo = WORKSPACE_DEMO;
  const ref = useGsap<HTMLDivElement>((el) => {
    gsap.fromTo(el, { scale: 0.9 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 35%', scrub: true } });
    const q = (s: string) => el.querySelector(s)!;
    const out = q('.m-output') as HTMLElement;
    const cursor = q('.m-cursor') as unknown as HTMLElement;
    // Where to move the cursor so its tip lands on `sel`, in the cursor's own (unscaled) coordinates.
    const at = (sel: string, fx = 0.5, fy = 0.5) => {
      const box = (cursor.parentElement as HTMLElement).getBoundingClientRect();
      const k = (cursor.parentElement as HTMLElement).offsetWidth / box.width || 1; // undo the section's scale
      const r = q(sel).getBoundingClientRect();
      return { x: (r.left + r.width * fx - box.left) * k - 40, y: (r.top + r.height * fy - box.top) * k - 40 };
    };
    const ride = () => gsap.set(cursor, at('.m-knob', 0.45, 0.55));
    if (reducedMotion()) {
      // Static final frame: result shown, handle centred.
      gsap.set(q('.m-empty'), { opacity: 0 });
      gsap.set(q('.m-out'), { opacity: 1 });
      gsap.set(out, { '--p': 50 });
      setStep(3);
      return;
    }
    // Story: empty output → drag file in → upload + scan → result wipes in → compare → download.
    const tl = gsap.timeline({ repeat: -1, paused: true, defaults: { ease: 'power3.inOut' }, onRepeat: () => tl.invalidate() });
    tl.call(() => setStep(0))
      .set(q('.m-file'), { x: 0, y: 0, opacity: 0, scale: 1 })
      .set(q('.m-cursor'), { x: -40, y: 220, scale: 1 })
      .set(q('.m-scan'), { opacity: 0 })
      .set(q('.m-progress'), { scaleX: 0 })
      .set(q('.m-busy'), { opacity: 1 })
      .set(q('.m-done'), { opacity: 0 })
      .set(q('.m-empty'), { opacity: 1 })
      .set(q('.m-out'), { opacity: 0 })
      .set(out, { '--p': 94 })
      .set(q('.m-knob'), { scale: 1 })
      .set(q('.m-drop'), { borderColor: 'var(--line-strong)' })
      .to({}, { duration: 0.6 })
      .to(q('.m-file'), { opacity: 1, duration: 0.3 })
      .to([q('.m-cursor'), q('.m-file')], { x: () => at('.m-drop', 0.4, 0.4).x, y: () => at('.m-drop', 0.4, 0.4).y, duration: 1.2 })
      .to(q('.m-drop'), { borderColor: 'var(--accent)', duration: 0.2 }, '-=0.3')
      .to(q('.m-file'), { opacity: 0, scale: 0.6, duration: 0.3 })
      .call(() => setStep(1))
      .to(q('.m-scan'), { opacity: 1, duration: 0.4 })
      .to(q('.m-progress'), { scaleX: 1, duration: 2.4, ease: 'power1.inOut' }, '<')
      .fromTo(q('.m-scan-line'), { xPercent: -100 }, { xPercent: 300, duration: 1.2, ease: 'none', repeat: 1 }, '<')
      .call(() => setStep(2), [], '-=1.2')
      .to(q('.m-busy'), { opacity: 0, duration: 0.2 })
      .to(q('.m-done'), { opacity: 1, duration: 0.2 }, '<')
      .to(q('.m-empty'), { opacity: 0, duration: 0.3 })
      .to(q('.m-out'), { opacity: 1, duration: 0.4 }, '<')
      // The cursor grabs the compare handle and drags it sideways; it rides the knob exactly.
      .to(q('.m-cursor'), { x: () => at('.m-knob', 0.45, 0.55).x, y: () => at('.m-knob', 0.45, 0.55).y, duration: 0.9 })
      .call(() => setStep(3))
      .to(q('.m-cursor'), { scale: 0.85, duration: 0.15, transformOrigin: '20% 15%' })
      .to(q('.m-knob'), { scale: 0.92, duration: 0.15 }, '<')
      .to(out, { '--p': 8, duration: 1.5, ease: 'power2.inOut', onUpdate: ride })
      .to(out, { '--p': 78, duration: 1.1, ease: 'power2.inOut', onUpdate: ride }, '+=0.25')
      .to(out, { '--p': 50, duration: 0.7, ease: 'power2.inOut', onUpdate: ride })
      .to(q('.m-cursor'), { scale: 1, duration: 0.15 })
      .to(q('.m-knob'), { scale: 1, duration: 0.15 }, '<')
      .call(() => setStep(4))
      .to(q('.m-cursor'), { x: () => at('.m-dl', 0.35, 0.55).x, y: () => at('.m-dl', 0.35, 0.55).y, duration: 0.9 }, '+=0.2')
      .to(q('.m-cursor'), { scale: 0.85, duration: 0.12, yoyo: true, repeat: 1, transformOrigin: '20% 15%' })
      .to(q('.m-dl'), { scale: 0.94, duration: 0.12, yoyo: true, repeat: 1 }, '<')
      .to({}, { duration: 2 });
    const st = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 20%', onToggle: (self) => (self.isActive ? tl.play() : tl.pause()) } });
    return () => {
      tl.kill();
      st.kill();
    };
  });
  const tag = 'rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur-sm';
  return (
    <div ref={ref} className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_40px_120px_-60px_rgba(0,0,0,.5)]">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="traffic group/tl flex gap-2" aria-hidden="true">
          {(['#ff5f57', '#febc2e', '#28c840'] as const).map((c, i) => (
            <span key={c} className="grid h-3 w-3 place-items-center rounded-full" style={{ background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${c} 55%, white), ${c} 60%)`, boxShadow: `inset 0 0 0 0.5px color-mix(in srgb, ${c} 70%, black)` }}>
              <svg viewBox="0 0 8 8" className="h-[7px] w-[7px] opacity-0 transition-opacity duration-150 group-hover/tl:opacity-100" fill="none" stroke="rgba(0,0,0,.55)" strokeWidth="1.3" strokeLinecap="round">
                <path d={['M2 2l4 4M6 2 2 6', 'M1.5 4h5', 'M4 1.5v5M1.5 4h5'][i]} />
              </svg>
            </span>
          ))}
        </span>
        <span className="mx-auto rounded-full border border-line px-4 py-1 text-xs text-large">aquavision / workspace</span>
        <span className="text-xs text-large">Product preview</span>
      </div>
      <div className="flex items-center justify-between border-b border-line px-6 py-3 text-sm">
        <span className="flex items-center gap-2 text-head"><img src="/aquavision.png" alt="" className="h-5 w-5" /> AquaVision</span>
        <span className="flex items-center gap-5 text-large"><span className="text-head">Workspace</span><span>History</span><span className="rounded-full border border-line px-2.5 py-0.5 text-xs">Credits –</span></span>
      </div>
      <ol className="flex flex-wrap gap-x-6 gap-y-1 px-6 pt-5 text-sm md:px-10" aria-label="Demo progress">
        {steps.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 transition-colors duration-300 ${i <= step ? 'text-head' : 'text-large'}`}>
            <span className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${i === step ? 'bg-accent' : i < step ? 'bg-head' : 'bg-line-strong'}`} />
            {s}
          </li>
        ))}
      </ol>
      <div className="relative grid gap-6 p-6 md:grid-cols-2 md:p-10">
        {/* Input */}
        <div className="m-drop relative grid min-h-[300px] place-items-center overflow-hidden rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <div>
            <Upload className="mx-auto text-large" size={28} />
            <p className="mt-4 text-head">Drag and drop your image here</p>
            <p className="mt-2 text-sm text-large">JPEG, PNG · max 20 MB</p>
          </div>
          <div className="m-scan absolute inset-0 opacity-0">
            <img src={demo.original} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="m-scan-line absolute inset-y-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent)' }} />
            <div className="absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-3 text-left text-white backdrop-blur-md">
              <div className="flex items-center justify-between text-xs"><span>{demo.fileName}</span><span className="relative text-white/70"><span className="m-busy">Enhancing…</span><span className="m-done absolute right-0 top-0 whitespace-nowrap text-accent opacity-0">Done</span></span></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20"><div className="m-progress h-full origin-left rounded-full bg-accent" /></div>
            </div>
          </div>
        </div>
        {/* Output */}
        <div className="flex flex-col gap-4">
          <div className="m-output relative min-h-[260px] flex-1 overflow-hidden rounded-2xl" style={{ ['--p' as string]: 94 }}>
            <div className="m-empty absolute inset-0 grid place-items-center rounded-2xl border border-dashed border-line-strong text-center">
              <div>
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-line text-large" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /></svg>
                </span>
                <p className="mt-4 text-head">Your result will appear here</p>
                <p className="mt-1 text-sm text-large">Original and enhanced, side by side</p>
              </div>
            </div>
            <div className="m-out absolute inset-0 opacity-0">
              <img src={demo.original} alt="Original underwater photo (demo)" className="absolute inset-0 h-full w-full object-cover" />
              <img src={demo.enhanced} alt={`${enhancedLabel(demo)} (demo)`} className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: 'inset(0 0 0 calc(var(--p) * 1%))' }} />
              <span className="absolute inset-y-0 w-px bg-white/85" style={{ left: 'calc(var(--p) * 1%)' }}>
                <span className="m-knob absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[#0b1520] shadow-lg">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" /></svg>
                </span>
              </span>
              <span className={`absolute bottom-3 left-3 ${tag}`}>Original</span>
              <span className={`absolute bottom-3 right-3 ${tag}`}>{enhancedLabel(demo)}</span>
              {demo.simulated && <span className={`absolute right-3 top-3 !text-[11px] ${tag}`}>Simulated · not a model output</span>}
            </div>
          </div>
          <span className="m-dl pill pill-sm self-start" aria-hidden="true">Download enhanced image</span>
        </div>
        <span className="m-file pointer-events-none absolute left-10 top-10 flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-xs text-head opacity-0 shadow-xl" aria-hidden="true">
          <img src={demo.original} alt="" className="h-6 w-8 rounded object-cover" /> {demo.fileName}
        </span>
        <svg className="m-cursor pointer-events-none absolute left-10 top-10 h-6 w-6 drop-shadow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 3l7 17 2.5-7L21 10.5z" fill="var(--head)" stroke="var(--bg)" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
}

/* ---------------- 09 Technology ---------------- */
const STACK: [string, string[]][] = [
  ['AI', ['PyTorch', 'AquaVision inference pipeline']],
  ['Backend', ['Node.js', 'Express', 'FastAPI', 'Uvicorn']],
  ['Database', ['PostgreSQL', 'Supabase']],
  ['Frontend', ['React', 'TypeScript', 'Vite', 'Tailwind CSS']],
  ['Security', ['HTTP-only cookies', 'Server-side authorization', 'Secure API validation']],
];
function Technology() {
  const logos = Object.keys(BRANDS);
  return (
    <section id="technology" className="py-32 md:py-44">
      <div className="wrap">
        <div className="grid gap-8 md:grid-cols-2 md:items-end">
          <Lines lines={['Built as an', <span className="serif">AI-powered platform.</span>]} className="text-[36px] leading-[1.05] md:text-[64px]" />
          <Reveal className="max-w-sm text-[15px] leading-relaxed md:justify-self-end">Only the technologies AquaVision actually runs on — from the PyTorch model to the secure web app.</Reveal>
        </div>
      </div>
      <div className="logo-band mt-14 overflow-hidden border-y border-line py-6 text-large [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]" aria-hidden="true">
        <div className="marquee gap-14 pr-14">
          {[0, 1].map((k) => (
            <span key={k} className="flex items-center gap-14">
              {logos.map((n) => (
                <span key={n} className="flex items-center gap-3 whitespace-nowrap text-[18px]">
                  <TechMark name={n} /> {n}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className="wrap">
        <Reveal stagger className="mt-14 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-5">
          {STACK.map(([cat, items]) => (
            <div key={cat} className="tech-cell border-b border-r border-line p-6 transition-colors duration-300 hover:bg-surface md:min-h-[280px]">
              <p className="text-sm text-large">{cat}</p>
              <ul className="mt-10 space-y-4 text-[17px] text-head">
                {items.map((i) => (
                  <li key={i} className="tech-row flex items-start gap-3">
                    <TechMark name={i} />
                    <span className="leading-snug">{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- 10 Built for depth ---------------- */
function GradShape({ kind, className = '' }: { kind: 'ring' | 'wave' | 'drop' | 'sonar' | 'burst' | 'checker'; className?: string }) {
  return (
    <span className={`inline-block ${className}`}>
      <Shape kind={kind} size={160} paint="url(#av-grad)" className="h-full w-full" />
    </span>
  );
}

function Depth() {
  const ref = useGsap<HTMLElement>((el) => {
    const st = { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.8 };
    gsap.fromTo(el.querySelectorAll('.to-left'), { xPercent: -5 }, { xPercent: -30, ease: 'none', scrollTrigger: st });
    gsap.fromTo(el.querySelector('.to-right'), { xPercent: -30 }, { xPercent: -5, ease: 'none', scrollTrigger: st });
    gsap.to(el.querySelectorAll('.spin-scroll'), { rotate: 360, ease: 'none', scrollTrigger: st });
    // Skew the whole block with scroll velocity, easing back to 0.
    const skew = gsap.quickTo(el.querySelector('.skew'), 'skewY', { duration: 0.6, ease: 'power3.out' });
    const onTick = () => void skew(Math.max(-4, Math.min(4, scrollVelocity() * 0.12)));
    gsap.ticker.add(onTick);
    return () => gsap.ticker.remove(onTick);
  });
  const row = 'flex w-max items-center gap-8 whitespace-nowrap md:gap-12';
  const shape = 'h-[0.7em] w-[0.7em] shrink-0';
  const outline = 'depth-outline transition-colors duration-300';
  const Row1 = () => (
    <>
      <span>Built</span>
      <GradShape kind="burst" className={`${shape} spin-scroll`} />
      <span className={outline}>for</span>
      <GradShape kind="drop" className={shape} />
    </>
  );
  const Row2 = () => (
    <>
      <GradShape kind="wave" className={shape} />
      <span className="serif">for depth</span>
      <GradShape kind="sonar" className={shape} />
      <span className={`${outline} serif`}>for clarity</span>
    </>
  );
  const Row3 = () => (
    <>
      <GradShape kind="ring" className={`${shape} spin-scroll`} />
      <span>depth.</span>
      <GradShape kind="checker" className={shape} />
      <span className={outline}>depth.</span>
    </>
  );
  return (
    <section ref={ref} className="overflow-hidden py-28 text-[72px] leading-[1.02] tracking-[-0.05em] text-head sm:text-[120px] lg:text-[190px]" aria-label="Built for depth.">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient id="av-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#3fe0f0" />
            <stop offset="1" stopColor="#1e7f9c" />
          </linearGradient>
        </defs>
      </svg>
      <div className="skew" aria-hidden="true">
        {[Row1, Row2, Row3].map((R, i) => (
          <div key={i} className={`${i === 1 ? 'to-right' : 'to-left'} ${row}`}>
            <R /><R /><R />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 11 Research + results ---------------- */
const METRICS: [string, string, string, string][] = [
  ['PSNR', 'Peak signal-to-noise ratio', 'Pixel-level fidelity to a reference image, in decibels.', 'Full-reference'],
  ['SSIM', 'Structural similarity', 'How closely structure, contrast and luminance match a reference (0–1).', 'Full-reference'],
  ['UIQM', 'Underwater image quality measure', 'Combines colorfulness, sharpness and contrast of the image itself.', 'No-reference'],
  ['UCIQE', 'Underwater color image quality evaluation', 'Combines chroma, saturation and contrast of the image itself.', 'No-reference'],
];
function Research() {
  const keys = ['Computer Vision', 'Deep Learning', 'Image Enhancement', 'Underwater Imaging', 'AI', 'Color Restoration', 'PyTorch'];
  return (
    <section id="research" className="py-32 md:py-44">
      <div className="wrap grid gap-10 md:grid-cols-[1.2fr_1fr]">
        <Lines lines={['An engineering approach', <span className="serif">to underwater vision.</span>]} className="text-[36px] leading-[1.05] md:text-[60px]" />
        <Reveal className="self-end text-[17px] leading-relaxed">
          AquaVision explores AI-based underwater image enhancement to improve the visual quality and interpretability of degraded underwater imagery.
        </Reveal>
      </div>
      <div className="key-band mt-12 overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]" aria-label="Research areas">
        <div className="marquee gap-3 pr-3">
          {[0, 1].map((k) => (
            <span key={k} className="flex gap-3" aria-hidden={k === 1}>
              {keys.map((w) => (
                <span key={w} className="whitespace-nowrap rounded-full border border-line-strong px-5 py-2.5 text-sm text-head transition-colors duration-300 hover:border-accent hover:text-accent">{w}</span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <div className="wrap mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="text-[28px] tracking-[-0.03em] text-head">Image quality</p>
          <p className="flex items-center gap-2 text-sm text-large">
            <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" /><span className="relative h-2 w-2 rounded-full bg-accent" /></span>
            Awaiting verified results — no numbers until experiments are complete.
          </p>
        </div>
        <Reveal stagger className="mt-8 grid border-l border-t border-line sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map(([m, full, def, kind]) => (
            <div key={m} className="metric group relative border-b border-r border-line">
              <span className="absolute inset-x-0 top-0 z-10 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 group-hover:scale-x-100" aria-hidden="true" />
              <div className="flex h-full flex-col p-6 transition-[background-color,transform] duration-500 group-hover:-translate-y-1 group-hover:bg-surface md:py-9">
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full border border-line px-2.5 py-1 text-large">{kind}</span>
                <span className="text-large" title="Higher is better">↑ higher is better</span>
              </div>
              <p className="mt-10 text-[56px] leading-none tracking-[-0.05em] text-head md:text-[64px]">{m}</p>
              <p className="mt-3 min-h-[2.8em] text-sm leading-snug text-head">{full}</p>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed">{def}</p>
              <p className="mt-8 border-t border-line pt-4 text-xs text-large">Result: pending verified experiments</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- 12 Gallery + CTA ---------------- */
const GALLERY: [string, Tone, string][] = [
  ['Coral', 'reef', 'aspect-[4/5]'],
  ['Marine life', 'clear', 'aspect-[4/3]'],
  ['Underwater structures', 'murky', 'aspect-square'],
  ['Divers', 'light', 'aspect-[3/4]'],
  ['ROV view', 'dusk', 'aspect-[4/3]'],
  ['Low-light scene', 'deep', 'aspect-[4/5]'],
];
function Gallery() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="py-32 md:py-44">
      <div className="wrap">
        <Lines lines={[<>Underwater, <span className="serif">seen differently.</span></>]} className="text-[36px] leading-[1.05] md:text-[64px]" />
        <div className="mt-14 columns-1 gap-6 sm:columns-2 lg:columns-3">
          {GALLERY.map(([name, tone, ratio], i) => (
            <button key={name} onClick={() => setOpen(i)} className="group mb-6 block w-full break-inside-avoid text-left" data-cursor="View" aria-label={`Open ${name} comparison`}>
              <ClipReveal className="rounded-2xl">
                <Placeholder tone={tone} src={GALLERY_IMAGES[name].original} alt={`${name}: original photo`} className={`${ratio} w-full rounded-2xl`}>
                  {/* Hover wipes in the corrected version; clip-path only. */}
                  <img
                    src={GALLERY_IMAGES[name].enhanced}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-[clip-path] duration-700 [clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0_0_0)] group-focus-visible:[clip-path:inset(0_0_0_0)]"
                    style={{ transitionTimingFunction: 'var(--ease)' }}
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-0">Original</span>
                  <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white opacity-0 backdrop-blur-sm transition-opacity duration-300 group-hover:opacity-100">{enhancedLabel(GALLERY_IMAGES[name])}</span>
                </Placeholder>
              </ClipReveal>
              <p className="mt-3 flex items-center justify-between text-[15px] text-body group-hover:text-head">
                {name}
                <span className="text-xs text-large">Hover to compare</span>
              </p>
            </button>
          ))}
        </div>
      </div>
      <Modal open={open !== null} onClose={() => setOpen(null)} label="Image comparison">
        {open !== null && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-head">{GALLERY[open][0]}</p>
              <button onClick={() => setOpen(null)} className="pill pill-sm">Close</button>
            </div>
            <div className="aspect-[16/10] overflow-hidden rounded-2xl">
              <CompareSlider
                className="h-full"
                afterLabel={enhancedLabel(GALLERY_IMAGES[GALLERY[open][0]])}
                before={<img src={GALLERY_IMAGES[GALLERY[open][0]].original} alt={`${GALLERY[open][0]}: original`} className="h-full w-full object-cover" />}
                after={<img src={GALLERY_IMAGES[GALLERY[open][0]].enhanced} alt={`${GALLERY[open][0]}: ${enhancedLabel(GALLERY_IMAGES[GALLERY[open][0]]).toLowerCase()}`} className="h-full w-full object-cover" />}
              />
            </div>
            {GALLERY_IMAGES[GALLERY[open][0]].simulated && (
              <p className="mt-4 text-sm text-large">Simulated preview: simple color correction on a public-domain photo, not an AquaVision model output.</p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}

function FinalCta() {
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';
  const ref = useGsap<HTMLElement>((el) => {
    gsap.fromTo(
      el.querySelector('.panel'),
      { clipPath: 'inset(6% 5% 6% 5% round 32px)' },
      { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: el, start: 'top 85%', end: 'top 10%', scrub: true } },
    );
  });
  return (
    <section ref={ref} className="relative" aria-label="Get started">
      <div data-surface="dark" className="panel relative flex min-h-[100svh] items-center overflow-hidden bg-[#06101a] text-white" style={{ clipPath: 'inset(6% 5% 6% 5% round 32px)' }}>
        <Ocean depth={0.55} />
        <Particles />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_55%,rgba(6,16,26,.55),transparent)]" aria-hidden="true" />
        <div className="wrap relative py-32 text-center">
          <p className="mb-8 text-sm tracking-wide text-white/60">The deepest point of the dive</p>
          <h2 className="text-[64px] leading-[0.95] tracking-[-0.05em] text-white md:text-[150px]" aria-label="See what's below.">
            <span className="block"><Letters text="See what's" /></span>
            <span className="serif block"><Letters text="below." delay={0.2} /></span>
          </h2>
          <p className="mx-auto mt-8 max-w-md text-[17px] text-white/75">Experience underwater image enhancement with AquaVision.</p>
          <div className="mt-12 flex flex-col items-center gap-6">
            <TLink to={tryAquaVisionPath} className="pill-group roll-host inline-flex items-center" data-magnetic>
              <span className="pill !border-white/40 !text-white backdrop-blur-md group-hover:!text-[#0b1520]">
                <Roll>Try AquaVision</Roll>
              </span>
              <span className="arrow-btn !border-white/40 !text-white backdrop-blur-md">
                <ArrowRight />
              </span>
            </TLink>
            <TLink to="#research" className="ulink text-white/85">Explore the project</TLink>
          </div>
        </div>
      </div>
    </section>
  );
}
