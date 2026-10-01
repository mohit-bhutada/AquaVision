import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ThemeToggle } from '../../components/BottomNav';
import { useGo } from '../../components/Curtain';
import { Logo } from '../../components/Ui';
import { MockBanner } from '../../components/Layout';
import { api, ApiError, type User } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { AuditSection, CreditsSection, HealthSection, OverviewSection, ProjectsSection, RequestsSection, UsersSection } from './sections';

const TABS = [
  ['overview', 'Overview', OverviewSection],
  ['users', 'Users', UsersSection],
  ['subscriptions', 'Subscriptions', RequestsSection],
  ['credits', 'Credits', CreditsSection],
  ['projects', 'Projects', ProjectsSection],
  ['audit', 'Audit logs', AuditSection],
  ['health', 'System health', HealthSection],
] as const;

/** Admin-only shell. Every render is gated on GET /admin/me succeeding (backend-verified role). */
export default function AdminConsole() {
  const go = useGo();
  const { logout } = useAccount();
  const [params, setParams] = useSearchParams();
  const [admin, setAdmin] = useState<User | null>(null);
  const [denied, setDenied] = useState<'forbidden' | 'error' | null>(null);
  const [errorText, setErrorText] = useState('');

  const check = () => {
    setDenied(null);
    api.admin.me().then(setAdmin, (e: ApiError) => {
      if (e.status === 401) go('/aquavisionadminlogin', { replace: true });
      else if (e.status === 403) setDenied('forbidden');
      else {
        setErrorText(e.message);
        setDenied('error');
      }
    });
  };
  useEffect(check, []);

  const tab = TABS.find(([id]) => id === params.get('tab')) ?? TABS[0];
  const Section = tab[2];

  const signOut = async () => {
    await logout();
    go('/aquavisionadminlogin', { replace: true });
  };

  if (denied)
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center" role="alert">
        <div>
          <p className="text-[28px] tracking-[-0.03em] text-head">{denied === 'forbidden' ? 'Not authorized.' : "Couldn't verify admin access."}</p>
          <p className="mt-2 text-sm">{denied === 'forbidden' ? 'This account does not have administrator access.' : errorText}</p>
          <div className="mt-8 flex justify-center gap-3">
            {denied === 'error' && <button className="pill" onClick={check}>Try again</button>}
            <button className="pill" onClick={signOut}>Sign in as admin</button>
          </div>
        </div>
      </main>
    );
  if (!admin) return <main className="min-h-screen" aria-busy="true" />;

  return (
    <div className="min-h-screen bg-bg">
      <MockBanner />
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-line lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <span className="flex items-center gap-2 text-head">
              <Logo size={26} /> Admin
            </span>
            <ThemeToggle />
          </div>
          <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:flex-col lg:overflow-visible">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setParams(id === 'overview' ? {} : { tab: id })}
                aria-current={tab[0] === id ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-left transition-colors ${tab[0] === id ? 'bg-invert-bg text-invert-fg' : 'text-body hover:bg-surface hover:text-head'}`}
              >
                {label}
              </button>
            ))}
            <button onClick={signOut} className="whitespace-nowrap rounded-lg px-3 py-2 text-left text-large hover:text-head lg:mt-6">
              Log out
            </button>
          </nav>
          <p className="hidden truncate px-5 text-xs text-large lg:block">{admin.email}</p>
        </aside>
        <main className="min-w-0 px-5 py-8 md:px-10">
          <h1 className="mb-8 text-[32px] tracking-[-0.03em] text-head">{tab[1]}</h1>
          <Section />
        </main>
      </div>
    </div>
  );
}
