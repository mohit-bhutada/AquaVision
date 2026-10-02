import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, type Credits, type SubscriptionState, type User } from './api';

// One shared view of "who is signed in" and their balances, loaded from the backend.
// Nothing here is authoritative: every value comes from the API and is re-fetched after changes.

type Status = 'loading' | 'in' | 'out' | 'error';
type Account = {
  status: Status;
  user: User | null;
  credits: Credits | null;
  subscription: SubscriptionState | null;
  error: string;
  refresh: () => Promise<void>;
  refreshCredits: (next?: Credits) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<Account | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [error, setError] = useState('');
  const inflight = useRef<Promise<void> | null>(null);
  // Bumped on every logout. A profile request that started before a logout and finishes after it
  // must not flip the UI back to "signed in".
  const epoch = useRef(0);
  const logoutInflight = useRef<Promise<void> | null>(null);

  const clear = () => {
    setUser(null);
    setCredits(null);
    setSubscription(null);
  };

  const refresh = useCallback(() => {
    // Collapse concurrent refreshes (mount + focus + login) into one request.
    const startedAt = epoch.current;
    inflight.current ??= api
      .profile()
      .then(
        (p) => {
          if (startedAt !== epoch.current) return; // a logout happened meanwhile: ignore
          setUser(p.user);
          setCredits(p.credits);
          setSubscription(p.subscription);
          setError('');
          setStatus('in');
        },
        (e: ApiError) => {
          if (startedAt !== epoch.current) return;
          clear();
          if (e.status === 401 || e.status === 403) setStatus('out');
          else {
            setError(e.message);
            setStatus(e.code === 'NO_BACKEND' ? 'out' : 'error');
          }
        },
      )
      .finally(() => (inflight.current = null));
    return inflight.current;
  }, []);

  const refreshCredits = useCallback(async (next?: Credits) => {
    if (next) return setCredits(next);
    await api.credits().then(setCredits, () => {});
  }, []);

  const refreshSubscription = useCallback(async () => {
    await Promise.all([api.subscription().then(setSubscription, () => {}), api.credits().then(setCredits, () => {})]);
  }, []);

  const logout = useCallback(() => {
    // One logout at a time: extra clicks while it is running share the same request instead of
    // firing more, so tapping repeatedly can no longer sign out and back in.
    logoutInflight.current ??= (async () => {
      epoch.current += 1;
      inflight.current = null;
      clear();
      setStatus('out'); // the UI signs out immediately
      await api.logout().catch(() => {});
      clear();
      setStatus('out');
    })().finally(() => {
      logoutInflight.current = null;
    });
    return logoutInflight.current;
  }, []);

  useEffect(() => {
    refresh();
    // Returning to the tab picks up changes made elsewhere (e.g. an admin approving a plan).
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refresh]);

  const value = useMemo(
    () => ({ status, user, credits, subscription, error, refresh, refreshCredits, refreshSubscription, logout }),
    [status, user, credits, subscription, error, refresh, refreshCredits, refreshSubscription, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAccount() {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAccount must be used inside <AccountProvider>');
  return a;
}