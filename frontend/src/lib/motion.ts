import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

let lenis: Lenis | null = null;

export function startSmoothScroll() {
  if (lenis || reducedMotion()) return;
  lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis?.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function scrollToTop(smooth = false) {
  if (lenis) lenis.scrollTo(0, smooth ? { duration: 1.6 } : { immediate: true });
  else window.scrollTo({ top: 0, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
}

export function scrollToId(id: string, immediate = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lenis) lenis.scrollTo(el, immediate ? { immediate: true } : { duration: 1.4 });
  else el.scrollIntoView({ behavior: immediate || reducedMotion() ? 'auto' : 'smooth' });
}

/** Current scroll velocity (px/frame-ish), 0 without Lenis. */
export const scrollVelocity = () => lenis?.velocity ?? 0;
