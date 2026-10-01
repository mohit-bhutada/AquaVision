import { useGo } from '../components/Curtain';
import { AppShell, InnerHero } from '../components/Layout';
import { Pill } from '../components/Ui';
import { fmtDate, fmtDateTime, PREVIEW } from '../lib/api';
import { useAccount } from '../lib/account';

// Read-only account overview. Values come from GET /me/profile via the shared account state;
// there is no edit form because the backend contract has no profile-update endpoint.

const planName = (p: string) => p.charAt(0) + p.slice(1).toLowerCase();

export default function Profile() {
  const go = useGo();
  const { user, credits, subscription: sub, status, error, refresh, logout } = useAccount();

  const initials = (user?.name || user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  return (
    <AppShell>
      <InnerHero compact lines={['Your', <span className="serif">profile.</span>]} />
      <div className="wrap">
        {status === 'error' && (
          <div className="rounded-2xl border border-line py-16 text-center" role="alert">
            <p className="text-[24px] text-head">We couldn't load your profile.</p>
            <p className="mt-2 text-sm">{error}</p>
            <Pill className="mt-8" onClick={refresh}>Try again</Pill>
          </div>
        )}
        {status !== 'error' && !(user && credits && sub) && (
          <div className="grid gap-6 md:grid-cols-3" role="status" aria-label="Loading profile">
            {PREVIEW ? <p className="text-sm">Preview mode: connect a backend to see profile data.</p> : [0, 1, 2].map((i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}
          </div>
        )}
        {user && credits && sub && (
          <div className="grid gap-6 lg:grid-cols-3">
            <section aria-label="Account" className="rounded-2xl border border-line p-6 md:p-8">
              <div className="flex items-center gap-4">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-invert-bg text-xl text-invert-fg" aria-hidden="true">{initials}</span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-[22px] tracking-[-0.02em] text-head">{user.name || 'Unnamed account'}</p>
                  <p className="truncate text-sm">{user.email}</p>
                </div>
              </div>
              <dl className="mt-8 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-large">Member since</dt><dd className="text-head">{fmtDate(user.createdAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-large">Account status</dt><dd className="text-head">{user.status === 'ACTIVE' ? 'Active' : 'Suspended'}</dd></div>
                {user.emailVerified !== undefined && <div className="flex justify-between gap-4"><dt className="text-large">Email verified</dt><dd className="text-head">{user.emailVerified ? 'Yes' : 'No'}</dd></div>}
              </dl>
            </section>

            <section aria-label="Subscription" className="rounded-2xl border border-line p-6 md:p-8">
              <p className="text-sm text-large">Current plan</p>
              <p className="mt-1 text-[36px] tracking-[-0.04em] text-head">{planName(sub.current.plan)}</p>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-large">Status</dt><dd className="text-head">{{ ACTIVE: 'Active', EXPIRED: 'Expired', NONE: 'No subscription' }[sub.current.status]}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-large">Started</dt><dd className="text-head">{fmtDate(sub.current.startsAt)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-large">{sub.current.status === 'EXPIRED' ? 'Expired' : 'Ends'}</dt><dd className="text-head">{fmtDate(sub.current.endsAt)}</dd></div>
                {sub.pendingRequest && <div className="flex justify-between gap-4"><dt className="text-large">Pending request</dt><dd className="text-head">{planName(sub.pendingRequest.plan)}</dd></div>}
              </dl>
              <Pill small className="mt-8" to="/subscriptions">Manage plan</Pill>
            </section>

            <section aria-label="Token balance" className="rounded-2xl border border-line p-6 md:p-8">
              <p className="text-sm text-large">Total available</p>
              <p className="mt-1 text-[36px] tracking-[-0.04em] text-head">{credits.total} <span className="text-base tracking-normal text-large">tokens</span></p>
              <div className="mt-6 space-y-5 text-sm">
                {(
                  [
                    ['Daily', credits.daily.balance, credits.daily.limit, `Resets ${fmtDateTime(credits.daily.resetsAt)}`],
                    ['Monthly', credits.monthly.balance, credits.monthly.limit, sub.current.endsAt ? `Plan ends ${fmtDate(sub.current.endsAt)}` : ''],
                  ] as const
                ).map(([label, left, total, note]) => (
                  <div key={label}>
                    <div className="flex justify-between"><span>{label}</span><span className="text-head">{left} / {total}</span></div>
                    <div className="mt-2 h-px overflow-hidden bg-line"><div className="h-px origin-left bg-accent" style={{ transform: `scaleX(${total ? left / total : 0})` }} /></div>
                    {note && <p className="mt-1 text-xs text-large">{note}</p>}
                  </div>
                ))}
              </div>
              <Pill small className="mt-8" to="/history?tab=tokens">Token history</Pill>
            </section>
          </div>
        )}

        <nav aria-label="Account" className="mt-12 flex flex-wrap gap-3 border-t border-line pt-8">
          <Pill small to="/workspace">Workspace</Pill>
          <Pill small to="/history">History</Pill>
          <Pill small to="/subscriptions">Subscriptions</Pill>
          <Pill
            small
            onClick={async () => {
              await logout();
              go('/login', { replace: true });
            }}
          >
            Log out
          </Pill>
        </nav>
      </div>
    </AppShell>
  );
}
