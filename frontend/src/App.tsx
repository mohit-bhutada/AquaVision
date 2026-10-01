import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { CurtainProvider, useGo } from './components/Curtain';
import { Cursor } from './components/Cursor';
import { Preloader } from './components/Preloader';
import { Ripple } from './components/Ripple';
import { api, PREVIEW } from './lib/api';
import { AccountProvider, useAccount } from './lib/account';
import { ScrollTrigger, startSmoothScroll } from './lib/motion';
import { installSoundDelegation } from './lib/sound';

const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/auth/Login'));
const Signup = lazy(() => import('./pages/auth/Signup'));
const VerifyOtp = lazy(() => import('./pages/auth/VerifyOtp'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const AuthCallback = lazy(() => import('./pages/auth/AuthCallback'));
const Workspace = lazy(() => import('./pages/Workspace'));
const History = lazy(() => import('./pages/History'));
const Share = lazy(() => import('./pages/Share'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Team = lazy(() => import('./pages/Team'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminConsole = lazy(() => import('./pages/admin/AdminConsole'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));

/** Signed-in routes. The backend session decides; the shared account state only mirrors it. */
function RequireAuth({ children }: { children: ReactNode }) {
  const go = useGo();
  const { pathname, search } = useLocation();
  const { status, error, refresh } = useAccount();

  useEffect(() => {
    if (status === 'out' && !PREVIEW) go(`/login?next=${encodeURIComponent(pathname + search)}`, { replace: true });
  }, [status, go, pathname, search]);

  if (status === 'in' || PREVIEW) return <>{children}</>;
  if (status === 'error') return <Unavailable message={error} retry={refresh} />;
  return <div className="min-h-screen" aria-busy="true" />;
}

function Unavailable({ message, retry }: { message: string; retry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center" role="alert">
      <div>
        <p className="text-[24px] text-head">{message || 'We could not reach AquaVision.'}</p>
        <button className="pill mt-8" onClick={retry}>Try again</button>
      </div>
    </main>
  );
}

const KNOWN = /^\/($|login|signup|verify-otp|forgot-password|auth\/callback|workspace|history|profile|share\/|subscriptions|team|privacy|terms|aquavisionadmin)/;

export default function App() {
  const location = useLocation();

  useEffect(() => {
    // Safety fallback: If query parameters contain an authorization code (e.g. from site fallback redirect),
    // immediately forward to backend callback so PKCE code exchange executes and session cookies are set.
    if (location.search && location.search.includes('code=')) {
      window.location.href = api.oauthCallbackUrl(location.search);
      return;
    }
  }, [location.search]);

  useEffect(() => {
    startSmoothScroll();
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return installSoundDelegation();
  }, []);
  // The 404 page is deliberately bare: no preloader, custom cursor or ripples.
  const chrome = KNOWN.test(location.pathname);

  return (
    <CurtainProvider>
      <AccountProvider>
      {chrome && (
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10002] focus:rounded focus:bg-invert-bg focus:px-3 focus:py-2 focus:text-invert-fg">
          Skip to content
        </a>
      )}
      {chrome && (
        <>
          <Preloader />
          <Cursor />
          <Ripple />
        </>
      )}
      <Suspense fallback={<div className="min-h-screen" />}>
        <div id="main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify-otp/:verificationToken" element={<VerifyOtp />} />
            <Route path="/verify-otp" element={<VerifyOtp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/workspace" element={<RequireAuth><Workspace /></RequireAuth>} />
            <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/aquavisionadminlogin" element={<AdminLogin />} />
            <Route path="/aquavisionadmin" element={<AdminConsole />} />
            <Route path="/share/:token" element={<Share />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/team" element={<Team />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Suspense>
      </AccountProvider>
    </CurtainProvider>
  );
}

