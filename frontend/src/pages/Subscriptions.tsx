import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGo } from '../components/Curtain';
import { AppShell, InnerHero, PublicShell } from '../components/Layout';
import { Reveal } from '../components/Reveal';
import { Pill } from '../components/Ui';
import { api, ApiError, fmtDate, fmtDateTime, type Plan, type PlanId } from '../lib/api';
import { useAccount } from '../lib/account';

const STATUS_LABEL = { ACTIVE: 'Active', EXPIRED: 'Expired', NONE: 'No subscription' } as const;

const DEFAULT_PLANS: Plan[] = [
  { id: 'FREE', name: 'Free Tier', priceInr: 0, dailyTokens: 10, monthlyTokens: 0, durationDays: 30 },
  { id: 'PRO', name: 'Pro', priceInr: 299, dailyTokens: 10, monthlyTokens: 100, durationDays: 30 },
  { id: 'PREMIUM', name: 'Premium', priceInr: 499, dailyTokens: 10, monthlyTokens: 200, durationDays: 30 },
];

export default function Subscriptions() {
  const go = useGo();
  const [params] = useSearchParams();
  const { status, credits, subscription: sub, refreshSubscription } = useAccount();
  const signedIn = status === 'in';
  const [plans, setPlans] = useState<Plan[]>(DEFAULT_PLANS);
  const [sending, setSending] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Non-blocking sync with backend plan configuration if available
    api.plans().then(
      (fetchedPlans) => {
        if (Array.isArray(fetchedPlans) && fetchedPlans.length > 0) {
          setPlans(fetchedPlans);
        }
      },
      () => { }, // Keep default plans on network/backend failure
    );
  }, []);

  useEffect(() => {
    if (signedIn) refreshSubscription();
  }, [signedIn, refreshSubscription]);

  const wanted = params.get('plan')?.toUpperCase();
  const current = sub?.current.status === 'ACTIVE' ? sub.current.plan : 'FREE';
  const pending = sub?.pendingRequest ?? null;

  const request = async (id: PlanId) => {
    if (!signedIn) return go(`/login?next=${encodeURIComponent(`/subscriptions?plan=${id}`)}`);
    if (sending) return;
    setSending(id);
    setMessage(null);
    try {
      await api.requestPlan(id);
      setMessage({ tone: 'ok', text: 'Request sent. An administrator will review it.' });
    } catch (err) {
      const e = err as ApiError;
      setMessage({ tone: 'error', text: e.message });
    } finally {
      await refreshSubscription(); // show the backend's view either way (e.g. after a 409)
      setSending(null);
    }
  };

  // Signed in: the app header (Workspace · History · Plans · Profile); signed out: the public layout.
  const Shell = signedIn ? AppShell : PublicShell;
  return (
    <Shell>
      {signedIn ? (
        <InnerHero compact lines={['Your', <span className="serif">plan.</span>]} />
      ) : (
        <InnerHero lines={['Plans built for', <span className="serif">every depth.</span>]} aside={<p>Choose the plan that fits how much you enhance.</p>} />
      )}
      <div className="wrap pb-32">
        {signedIn && sub && credits && (
          <section aria-label="Your subscription" className="mb-14 grid gap-8 rounded-2xl border border-line p-6 md:grid-cols-2 md:p-8">
            <div>
              <p className="text-sm text-large">Current plan</p>
              <p className="mt-1 flex flex-wrap items-center gap-3 text-[32px] tracking-[-0.03em] text-head">
                {sub.current.plan.charAt(0) + sub.current.plan.slice(1).toLowerCase()}
                <span className={`rounded-full border px-3 py-0.5 text-xs tracking-normal ${sub.current.status === 'ACTIVE' ? 'border-accent text-accent' : 'border-line text-large'}`}>{STATUS_LABEL[sub.current.status]}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-large">Started</dt><dd className="text-head">{fmtDate(sub.current.startsAt)}</dd></div>
                <div><dt className="text-large">{sub.current.status === 'EXPIRED' ? 'Expired' : 'Ends'}</dt><dd className="text-head">{fmtDate(sub.current.endsAt)}</dd></div>
              </dl>
            </div>
            <div className="space-y-5">
              {(
                [
                  ['Daily tokens', credits.daily.balance, credits.daily.limit],
                  ['Monthly tokens', credits.monthly.balance, credits.monthly.limit],
                ] as const
              ).map(([label, left, total]) => (
                <div key={label}>
                  <div className="flex justify-between text-sm"><span>{label}</span><span className="text-head">{left} / {total}</span></div>
                  <div className="mt-2 h-px overflow-hidden bg-line"><div className="h-px origin-left bg-accent" style={{ transform: `scaleX(${total ? left / total : 0})` }} /></div>
                </div>
              ))}
              <p className="text-xs text-large">Daily tokens reset {fmtDateTime(credits.daily.resetsAt)}.</p>
            </div>
            <div className="border-t border-line pt-6 text-sm md:col-span-2" aria-live="polite">
              {pending ? (
                <p className="text-head">Request for {pending.plan} is pending review · sent {fmtDateTime(pending.createdAt)}</p>
              ) : sub.lastDecision ? (
                <p className={sub.lastDecision.status === 'APPROVED' ? 'text-accent' : 'text-head'}>
                  Your {sub.lastDecision.plan} request was {sub.lastDecision.status.toLowerCase()} {fmtDateTime(sub.lastDecision.decidedAt)}
                  {sub.lastDecision.reason ? ` — ${sub.lastDecision.reason}` : ''}.
                </p>
              ) : (
                <p>No subscription requests yet.</p>
              )}
              {!sub.canRequest && (
                <p className="mt-2 text-large">
                  {sub.reason ?? (sub.requestedToday ? "You've already used today's subscription request." : 'New requests are not available right now.')}
                  {sub.nextEligibleAt && ` Next request available ${fmtDateTime(sub.nextEligibleAt)}.`}
                </p>
              )}
              {sub.canRequest && <p className="mt-2 text-large">You can send one subscription request per day.</p>}
            </div>
          </section>
        )}

        {message && (
          <p className={`mb-8 text-sm ${message.tone === 'ok' ? 'text-accent' : 'text-error'}`} role={message.tone === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        <Reveal stagger className="grid border-l border-t border-line md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = signedIn && current === p.id;
            const isPending = pending?.plan === p.id;
            const blocked = signedIn && (!sub?.canRequest || !!pending);
            return (
              <div key={p.id} className={`group flex flex-col border-b border-r p-8 transition-colors duration-300 hover:border-accent md:min-h-[440px] ${isCurrent || wanted === p.id ? 'border-accent' : 'border-line'}`}>
                <p className="text-[32px] tracking-[-0.03em] text-head">{p.name}</p>
                <p className="mt-6 text-[56px] leading-none tracking-[-0.05em] text-head">
                  ₹{p.priceInr}
                  {p.priceInr > 0 && <span className="text-[17px] tracking-normal text-large"> / {p.durationDays} days</span>}
                </p>
                <ul className="mt-10 space-y-2 text-[15px]">
                  <li>{p.dailyTokens} daily tokens</li>
                  <li>{p.monthlyTokens} monthly tokens</li>
                </ul>
                <div className="mt-auto pt-10">
                  {isCurrent ? (
                    <span className="pill w-full !cursor-default">Current plan</span>
                  ) : p.id === 'FREE' ? (
                    <Pill to={signedIn ? '/workspace' : '/signup'} className="w-full group-hover:!bg-[var(--invert-bg)] group-hover:!text-[var(--invert-fg)]">Get started</Pill>
                  ) : (
                    <Pill
                      className="w-full group-hover:!bg-[var(--invert-bg)] group-hover:!text-[var(--invert-fg)]"
                      onClick={() => request(p.id)}
                      disabled={!!sending || isPending || blocked}
                      title={blocked && !isPending ? sub?.reason ?? undefined : undefined}
                    >
                      {sending === p.id ? 'Sending…' : isPending ? 'Request pending' : signedIn ? `Request ${p.name}` : `Sign in to request ${p.name}`}
                    </Pill>
                  )}
                </div>
              </div>
            );
          })}
        </Reveal>
      </div>
    </Shell>
  );
}

