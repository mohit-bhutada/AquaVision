import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react';
import { gsap, reducedMotion } from '../lib/motion';

const EASE = 'expo.out';

/** Run a gsap setup scoped to a ref, skipped under reduced motion, cleaned up on unmount. */
export function useGsap<T extends HTMLElement>(setup: (el: T) => void, deps: unknown[] = []) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (!ref.current || reducedMotion()) return;
    const ctx = gsap.context(() => setup(ref.current!), ref);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Each letter slides up from a mask (hero headline). */
export function Letters({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  const ref = useGsap<HTMLSpanElement>((el) => {
    gsap.from(el.querySelectorAll('.ch'), { yPercent: 110, duration: 1.1, ease: EASE, stagger: 0.02, delay });
  });
  return (
    <span ref={ref} className={className} aria-label={text}>
      {text.split(' ').map((word, w) => (
        <span key={w} aria-hidden="true" className="inline-block overflow-hidden whitespace-nowrap pb-[0.12em] align-bottom">
          {[...word].map((c, i) => (
            <span key={i} className="ch inline-block">
              {c}
            </span>
          ))}
          {w < text.split(' ').length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </span>
  );
}

/** Lines slide up from masks when scrolled into view. */
export function Lines({ lines, as: Tag = 'h2', className = '' }: { lines: ReactNode[]; as?: ElementType; className?: string }) {
  const ref = useGsap<HTMLElement>((el) => {
    gsap.from(el.querySelectorAll('.ln'), {
      yPercent: 110,
      duration: 1.1,
      ease: EASE,
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  });
  return (
    <Tag ref={ref} className={className}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.08em]">
          <span className="ln block">{l}</span>
        </span>
      ))}
    </Tag>
  );
}

/** Fade + rise; children with [data-stagger] animate one after another. */
export function Reveal({ children, className = '', as: Tag = 'div', stagger = false, id }: { children: ReactNode; className?: string; as?: ElementType; stagger?: boolean; id?: string }) {
  const ref = useGsap<HTMLElement>((el) => {
    const targets = stagger ? el.querySelectorAll(':scope > *') : el;
    gsap.from(targets, { y: 24, opacity: 0, duration: 0.9, ease: EASE, stagger: 0.08, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });
  return (
    <Tag ref={ref} className={className} id={id}>
      {children}
    </Tag>
  );
}

/** Rounded clip window opens to full size while the content zooms out. */
export function ClipReveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useGsap<HTMLDivElement>((el) => {
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    tl.from(el, { clipPath: 'inset(15% round 24px)', duration: 1.1, ease: EASE }).from(el.firstElementChild, { scale: 1.15, duration: 1.4, ease: EASE }, 0);
  });
  return (
    <div ref={ref} className={`overflow-hidden ${className}`} style={{ clipPath: 'inset(0% round 16px)' }}>
      <div className="h-full w-full">{children}</div>
    </div>
  );
}

/** Words brighten one by one as the block scrolls through the viewport. */
export function WordScrub({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useGsap<HTMLParagraphElement>((el) => {
    gsap.fromTo(
      el.querySelectorAll('.w'),
      { opacity: 0.18 },
      { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 75%', end: 'bottom 45%', scrub: true } },
    );
  });
  return (
    <p ref={ref} className={className}>
      {children}
    </p>
  );
}

/** Helper for WordScrub: wraps each word of a string in a .w span. */
export const W = ({ children }: { children: string }) => (
  <>
    {children.split(' ').map((w, i) => (
      <span key={i} className="w">
        {w}{' '}
      </span>
    ))}
  </>
);
