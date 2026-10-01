import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TLink, useGo } from '../../components/Curtain';
import { Logo } from '../../components/Ui';
import { safeNext } from '../../lib/api';
import { useAccount } from '../../lib/account';

/** OAuth return point: the backend has set the session cookie and redirected here with ?next=. */
export default function AuthCallback() {
  const go = useGo();
  const [params] = useSearchParams();
  const { status, refresh } = useAccount();
  const [checked, setChecked] = useState(false);
  const failed = checked && status !== 'in';

  useEffect(() => {
    refresh().then(() => setChecked(true));
  }, [refresh]);

  useEffect(() => {
    if (checked && status === 'in') go(safeNext(params.get('next')), { replace: true });
  }, [checked, status, go, params]);

  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <Logo size={48} />
        {failed || params.get('error') ? (
          <div role="alert" className="mt-8">
            <p className="text-head">We couldn't complete sign-in.</p>
            <TLink to="/login" className="ulink is-on mt-4 inline-block text-body">Back to sign in</TLink>
          </div>
        ) : (
          <div role="status" className="mt-8 flex flex-col items-center gap-4">
            <span className="h-8 w-8 animate-spin rounded-full border border-line-strong border-t-accent" aria-hidden="true" />
            <p>Signing you in…</p>
          </div>
        )}
      </div>
    </main>
  );
}
