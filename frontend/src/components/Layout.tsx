import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { isMock, PREVIEW, type Credits } from '../lib/api';
import { useAccount } from '../lib/account';
import { BottomNav, SoundToggle, ThemeToggle } from './BottomNav';
import { TLink, useGo } from './Curtain';
import { gsap, scrollToTop } from '../lib/motion';
import { Ocean } from './Ocean';
import { Lines, useGsap } from './Reveal';
import { Logo, Pill, PillArrow, Roll } from './Ui';

/** Inner-page hero: logo on top, huge mixed statement, slowly rotating thin arcs. */
export function InnerHero({ lines, aside, compact = false }: { lines: ReactNode[]; aside?: ReactNode; compact?: boolean }) {
  return (
    <header className={`relative overflow-hidden ${compact ? 'pb-10 pt-10' : 'pb-16 pt-12 md:pb-24'}`}>
      <Arcs />
      <div className="wrap relative">
        {!compact && (
          <TLink to="/" className="mx-auto mb-14 block w-fit md:mb-20" aria-label="AquaVision home">
            <Logo size={44} />
          </TLink>
        )}
        <Lines as="h1" lines={lines} className="text-[44px] leading-[1.02] md:text-[88px] lg:text-[104px]" />
        {aside && <div className="mt-8 max-w-md text-[15px] leading-relaxed md:ml-auto md:mr-[8%] md:mt-[-3rem]">{aside}</div>}
      </div>
    </header>
  );
}

export function Arcs() {
  return (
    <svg className="pointer-events-none absolute -right-[20%] -top-[30%] h-[160%] w-[90%] text-line spin-slow" viewBox="0 0 800 800" fill="none" aria-hidden="true">
      <circle cx="400" cy="400" r="390" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="220" cy="520" r="300" stroke="currentColor" strokeWidth="1.5" />
      <path d="M0 250 C 250 180, 550 180, 800 120" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Wordmark() {
  const ref = useGsap<HTMLParagraphElement>((el) => {
    gsap.from(el.querySelectorAll('.wl'), { yPercent: 105, duration: 1.2, ease: 'expo.out', stagger: 0.04, scrollTrigger: { trigger: el, start: 'top 95%', once: true } });
  });
  return (
    <p ref={ref} className="wordmark flex overflow-hidden text-[19vw] leading-[0.82] tracking-[-0.06em] text-head md:text-[13vw]" aria-label="AquaVision">
      {[...'AquaVision'].map((c, i) => (
        <span key={i} aria-hidden="true" className="wl inline-block">
          <span className="wi inline-block" style={{ ['--i' as string]: i }}>{c}</span>
        </span>
      ))}
    </p>
  );
}

export function Footer() {
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';
  const cols: [string, [string, string][]][] = [
    ['Explore', [['Product', '/#product'], ['Technology', '/#technology'], ['Research', '/#research'], ['Applications', '/#applications'], ['Team', '/team']]],
    ['Account', [['Workspace', tryAquaVisionPath], ['History', '/history'], ['Plans', '/subscriptions'], ['Sign in', '/login']]],
    ['Legal', [['Privacy Policy', '/privacy'], ['Terms of Service', '/terms']]],
  ];
  // If the footer is taller than the viewport, drop the sticky reveal so nothing is clipped.
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const fit = () => ref.current && (ref.current.style.position = ref.current.offsetHeight > innerHeight ? 'relative' : '');
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
  return (
    <footer ref={ref} className="sticky bottom-0 z-0 overflow-hidden bg-bg pt-16 md:pt-20">
      <div className="footer-ocean pointer-events-none absolute inset-0 opacity-[0.22] [mask-image:linear-gradient(to_bottom,transparent,black_70%)]">
        <Ocean depth={0.7} intensity={0.8} />
      </div>
      <div className="wrap relative">
        <div className="grid gap-14 md:grid-cols-[1.4fr_1fr]">
          <div>
            <Lines lines={['Ready to', <span className="serif">dive in?</span>]} className="text-[48px] leading-[0.95] md:text-[72px]" />
            <p className="mt-6 max-w-sm text-[17px]">AI-powered underwater image enhancement.</p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <PillArrow to={tryAquaVisionPath}>Try AquaVision</PillArrow>
              <Pill to="/subscriptions">See plans</Pill>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 self-end text-[15px]">
            {cols.map(([title, links]) => (
              <div key={title}>
                <p className="mb-4 text-sm text-large">{title}</p>
                <ul className="space-y-2.5">
                  {links.map(([label, to]) => (
                    <li key={label}>
                      <TLink to={to} curtain className="roll-host text-body hover:text-head">
                        <Roll>{label}</Roll>
                      </TLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10"><Wordmark /></div>
        <div className="flex items-center justify-between border-t border-line pt-5 text-sm text-large">
          <span>© 2026 AquaVision</span>
          <button onClick={() => scrollToTop(true)} className="roll-host flex items-center gap-2 hover:text-head">
            <Roll>Back to top</Roll> <span aria-hidden="true">↑</span>
          </button>
        </div>
        <div className="h-24 md:h-28" />
      </div>
    </footer>
  );
}

/** Public pages: content slides over the sticky footer; bottom nav on top. */
export function PublicShell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  return (
    <>
      <main className="relative z-10 bg-bg">{children}</main>
      {footer && <Footer />}
      <BottomNav />
    </>
  );
}

const APP_LINKS: [string, string][] = [
  ['Workspace', '/workspace'],
  ['History', '/history'],
  ['Plans', '/subscriptions'],
  ['Profile', '/profile'],
];

/** "Daily 7/10 · Monthly 100/100", straight from the backend. */
export function CreditsText({ credits }: { credits: Credits | null }) {
  if (!credits) return <span className="inline-block h-3 w-16 rounded skeleton align-middle" aria-label="Loading credits" />;
  return (
    <>
      Daily {credits.daily.balance}/{credits.daily.limit} · Monthly {credits.monthly.balance}/{credits.monthly.limit}
    </>
  );
}

export function MockBanner() {
  if (PREVIEW)
    return (
      <div className="bg-accent px-4 py-1.5 text-center text-xs text-[#0b1520]" role="status">
        Preview mode — backend not connected. Set VITE_API_URL to use real data.
      </div>
    );
  if (isMock)
    return (
      <div className="bg-[#febc2e] px-4 py-1.5 text-center text-xs text-[#0b1520]" role="status">
        Mock backend — for development only. Images are not enhanced.
      </div>
    );
  return null;
}

/** Signed-in pages (workspace, history, profile). */
export function AppShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  const go = useGo();
  const { credits, logout } = useAccount();
  const { pathname } = useLocation();
  const [menu, setMenu] = useState(false);
  const signOut = async () => {
    setMenu(false);
    await logout();
    go('/login', { replace: true });
  };

  return (
    <>
      <MockBanner />
      <header className="sticky top-0 z-40 w-full border-b border-line bg-[var(--glass)] backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <TLink to="/" className="flex items-center gap-2 text-head shrink-0" aria-label="AquaVision home">
            <Logo size={30} />
            <span className="hidden text-[15px] font-medium sm:inline">AquaVision</span>
          </TLink>
          <nav aria-label="App" className="flex items-center gap-3 text-[15px] md:gap-6 shrink-0">
            {APP_LINKS.map(([l, to]) => (
              <TLink key={l} to={to} aria-current={pathname === to ? 'page' : undefined} className={`roll-host hidden md:inline ${pathname === to ? 'text-head' : 'text-large hover:text-head'}`}>
                <Roll>{l}</Roll>
              </TLink>
            ))}
            <TLink to="/profile" className="hidden rounded-full border border-line px-3 py-1 text-xs text-body transition-colors hover:border-accent hover:text-head lg:inline" aria-label="Token balance, open profile">
              <CreditsText credits={credits} />
            </TLink>
            <SoundToggle />
            <ThemeToggle />
            <button className="hidden text-sm text-large hover:text-head md:inline" onClick={signOut}>
              Log out
            </button>
            <button className="text-sm text-head md:hidden" onClick={() => setMenu(true)} aria-expanded={menu} aria-controls="app-menu">
              Menu
            </button>
          </nav>
        </div>
      </header>
      <div
        id="app-menu"
        className={`fixed inset-0 z-[60] flex flex-col bg-bg px-6 pb-10 pt-6 transition-opacity duration-300 md:hidden ${menu ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        aria-hidden={!menu}
      >
        <div className="flex items-center justify-between">
          <Logo size={32} />
          <button onClick={() => setMenu(false)} className="text-sm text-head" tabIndex={menu ? 0 : -1}>
            Close
          </button>
        </div>
        <p className="mt-10 rounded-full border border-line px-4 py-2 text-center text-sm text-body">
          <CreditsText credits={credits} />
        </p>
        <ul className="mt-auto space-y-3">
          {APP_LINKS.map(([l, to]) => (
            <li key={l}>
              <button
                tabIndex={menu ? 0 : -1}
                className={`text-5xl ${pathname === to ? 'text-accent' : 'text-head'}`}
                onClick={() => {
                  setMenu(false);
                  go(to);
                }}
              >
                {l}
              </button>
            </li>
          ))}
          <li>
            <button tabIndex={menu ? 0 : -1} className="text-5xl text-large" onClick={signOut}>
              Log out
            </button>
          </li>
        </ul>
      </div>
      <main className={`min-h-[80vh] pb-24 ${className}`}>{children}</main>
    </>
  );
}
