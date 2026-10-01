import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TLink, useGo } from '../../components/Curtain';
import { api, safeNext } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { AuthLayout, Field, FormError, GoogleButton, Or, PasswordField, PasswordRules, passwordOk, Submit } from './AuthLayout';

export default function Signup() {
  const go = useGo();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { status } = useAccount();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

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
    <AuthLayout title={['Create your', <span className="serif">account.</span>]}>
      <FormError message={error} />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.email) return setError('Enter your email.');
          if (!passwordOk(form.password)) return setError('Your password does not meet the requirements.');
          if (form.password !== form.confirm) return setError('Passwords do not match.');
          setBusy(true);
          setError('');
          try {
            const res = await api.signup({ name: form.name || undefined, email: form.email, password: form.password });
            const next = params.get('next');
            go(`/verify-otp/${res.verificationToken}${next ? `?next=${encodeURIComponent(next)}` : ''}`);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Name" name="name" autoComplete="name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
        <Field label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required />
        <PasswordField label="Password" name="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
        <PasswordField label="Confirm password" name="confirm" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        <PasswordRules value={form.password} confirm={form.confirm} />
        <Submit busy={busy}>Create account</Submit>
      </form>
      <Or />
      <GoogleButton next={safeNext(params.get('next'))} onError={setError} />
      <p className="mt-8 text-sm text-large">
        Already have an account?{' '}
        <TLink to="/login" className="ulink is-on text-head">
          Sign in
        </TLink>
      </p>
    </AuthLayout>
  );
}
