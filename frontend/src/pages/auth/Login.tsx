import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TLink, useGo } from '../../components/Curtain';
import { api, ApiError, safeNext } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { AuthLayout, Field, FormError, GoogleButton, Or, PasswordField, Submit } from './AuthLayout';

export default function Login() {
  const go = useGo();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { status, refresh } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(params.get('error') || '');

  useEffect(() => {
    if (status === 'in') {
      go(next, { replace: true });
    }
  }, [status, go, next]);

  if (status === 'loading') {
    return <div className="min-h-screen" aria-busy="true" />;
  }

  if (status === 'in') {
    return null;
  }

  return (
    <AuthLayout title={['Welcome back', <span className="serif">to the deep.</span>]}>
      {params.get('next') && (
        <p className="mb-8 text-sm text-large" role="status">
          Continue to the page you were trying to access.
        </p>
      )}
      <FormError message={error} />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email || !password) return setError('Enter your email and password.');
          setBusy(true);
          setError('');
          try {
            await api.login(email, password);
            await refresh();
            go(next, { replace: true });
          } catch (err) {
            const apiErr = err as ApiError;
            const details = (apiErr?.details as any) || {};
            const token = details.verificationToken || (apiErr as any)?.verificationToken;
            if ((apiErr?.code === 'EMAIL_NOT_VERIFIED' || details.requiresVerification || details.code === 'EMAIL_NOT_VERIFIED') && token) {
              go(`/verify-otp/${token}?reason=unverified${next ? `&next=${encodeURIComponent(next)}` : ''}`);
              return;
            }
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={setPassword} />
        <TLink to="/forgot-password" className="ulink -mt-3 mb-8 inline-block text-sm text-body">
          Forgot password?
        </TLink>
        <Submit busy={busy}>Sign in</Submit>
      </form>
      <Or />
      <GoogleButton next={next} onError={setError} />
      <p className="mt-8 text-sm text-large">
        Don't have an account?{' '}
        <TLink to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="ulink is-on text-head">
          Create account
        </TLink>
      </p>
    </AuthLayout>
  );
}
