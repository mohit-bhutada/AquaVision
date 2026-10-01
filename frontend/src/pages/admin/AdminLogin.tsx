import { useEffect, useState } from 'react';
import { useGo } from '../../components/Curtain';
import { api, ApiError } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { AuthLayout, Field, FormError, PasswordField, Submit } from '../auth/AuthLayout';

/** Separate admin sign-in. Admin access is confirmed by GET /admin/me, never by a frontend flag. */
export default function AdminLogin() {
  const go = useGo();
  const { refresh, logout } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <AuthLayout title={['AquaVision', <span className="serif">admin.</span>]}>
      <FormError message={error} />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          if (!email || !password) return setError('Enter your email and password.');
          setBusy(true);
          setError('');
          try {
            await api.login(email, password);
            try {
              await api.admin.me();
            } catch (err) {
              if ((err as ApiError).status === 403) {
                await logout();
                return setError('This account is not an administrator.');
              }
              throw err;
            }
            await refresh();
            go('/aquavisionadmin', { replace: true });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Admin email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={setPassword} />
        <Submit busy={busy}>Sign in to admin</Submit>
      </form>
    </AuthLayout>
  );
}
