import { useState } from 'react';
import { TLink, useGo } from '../../components/Curtain';
import { api } from '../../lib/api';
import { useDevState } from '../../lib/devState';
import { AuthLayout, Field, FormError, Submit } from './AuthLayout';

export default function ForgotPassword() {
  const go = useGo();
  const dev = useDevState(['success'] as const);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(dev === 'success');

  return (
    <AuthLayout title={['Forgot your', <span className="serif">password?</span>]}>
      {sent ? (
        <p className="text-[17px] text-head" role="status">Check your email for password reset instructions.</p>
      ) : (
        <>
          <p className="mb-8 text-[15px]">Enter your email and we'll send instructions to reset your password.</p>
          <FormError message={error} />
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (!email) return setError('Enter your email.');
              setBusy(true);
              setError('');
              try {
                const res = await api.forgotPassword(email);
                if (res.verificationToken) {
                  go(`/verify-otp/${res.verificationToken}`);
                } else {
                  setSent(true);
                }
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Submit busy={busy}>Send reset link</Submit>
          </form>
        </>
      )}
      <TLink to="/login" className="ulink mt-8 inline-block text-sm text-body">Back to sign in</TLink>
    </AuthLayout>
  );
}
