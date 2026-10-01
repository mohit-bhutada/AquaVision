import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { TLink, useGo } from '../../components/Curtain';
import { api, safeNext } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { AuthLayout, FormError, PasswordField, PasswordRules, passwordOk, Submit } from './AuthLayout';

const COOLDOWN = 60;

export default function VerifyOtp() {
  const go = useGo();
  const routeParams = useParams<{ verificationToken?: string }>();
  const [queryParams] = useSearchParams();
  const token = routeParams.verificationToken || queryParams.get('token') || queryParams.get('verificationToken') || '';
  const nextParam = queryParams.get('next');

  const { refresh } = useAccount();

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [purpose, setPurpose] = useState<'SIGNUP' | 'PASSWORD_RESET'>('SIGNUP');
  const [step, setStep] = useState<'OTP_INPUT' | 'NEW_PASSWORD'>('OTP_INPUT');
  const [targetEmail, setTargetEmail] = useState('');

  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [wait, setWait] = useState(COOLDOWN);

  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // Check verification token validity on mount
  useEffect(() => {
    if (!token) {
      setChecking(false);
      setTokenValid(false);
      return;
    }

    api
      .verifyToken(token)
      .then((res) => {
        setChecking(false);
        if (res.valid && res.purpose) {
          setTokenValid(true);
          setPurpose(res.purpose);
          if (res.status === 'OTP_VERIFIED' && res.purpose === 'PASSWORD_RESET') {
            setStep('NEW_PASSWORD');
          } else {
            setStep('OTP_INPUT');
          }
          if (res.email) setTargetEmail(res.email);
        } else {
          setTokenValid(false);
        }
      })
      .catch(() => {
        setChecking(false);
        setTokenValid(false);
      });
  }, [token]);

  // Resend cooldown timer
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Handle wrong page / invalid token redirection
  useEffect(() => {
    if (!checking && !tokenValid) {
      const t = setTimeout(() => {
        go('/', { replace: true });
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [checking, tokenValid, go]);

  const putDigit = (i: number, value: string) => {
    const chars = value.replace(/\D/g, '').split('');
    if (!chars.length) return setDigits((d) => d.map((x, j) => (j === i ? '' : x)));
    setDigits((d) => {
      const next = [...d];
      chars.slice(0, 6 - i).forEach((c, k) => (next[i + k] = c));
      return next;
    });
    boxes.current[Math.min(5, i + chars.length)]?.focus();
  };

  if (checking) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div role="status" className="flex flex-col items-center gap-4">
          <span className="h-8 w-8 animate-spin rounded-full border border-line-strong border-t-accent" aria-hidden="true" />
          <p className="text-head">Validating verification session…</p>
        </div>
      </main>
    );
  }

  if (!tokenValid) {
    return (
      <AuthLayout title={['Wrong', <span className="serif">page.</span>]}>
        <div role="alert" className="text-center py-6">
          <p className="text-xl font-medium text-head mb-4">You're on the wrong page. Please go to Home.</p>
          <p className="text-sm text-large">Redirecting you to home page…</p>
          <TLink to="/" className="pill mt-6 inline-block">Go to Home</TLink>
        </div>
      </AuthLayout>
    );
  }

  const title = step === 'NEW_PASSWORD'
    ? ['Set your new', <span className="serif">password.</span>]
    : purpose === 'SIGNUP'
    ? ['Verify your', <span className="serif">email.</span>]
    : ['Reset your', <span className="serif">password.</span>];

  return (
    <AuthLayout title={title}>
      {successMsg ? (
        <div role="status" className="py-6 text-center">
          <p className="text-head text-lg">{successMsg}</p>
        </div>
      ) : step === 'OTP_INPUT' ? (
        <>
          <p className="mb-8 text-[15px]">
            {queryParams.get('reason') === 'unverified'
              ? "Your account isn't verified yet. We've sent a verification code to your email. Verify your account to continue."
              : <>Enter the 6-digit verification code sent to {targetEmail ? <strong className="text-head">{targetEmail}</strong> : 'your email'}.</>}
          </p>
          <FormError message={error} />
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const code = digits.join('');
              if (code.length < 6) return setError('Enter all 6 digits.');
              setBusy(true);
              setError('');
              try {
                const res = await api.verifyOtp(token, code);
                if (res.purpose === 'SIGNUP') {
                  await refresh();
                  setSuccessMsg('Your email is verified. Taking you in…');
                  setTimeout(() => go(safeNext(nextParam), { replace: true }), 1000);
                } else if (res.purpose === 'PASSWORD_RESET') {
                  setStep('NEW_PASSWORD');
                }
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset className="mb-8 flex gap-2 sm:gap-3">
              <legend className="sr-only">Verification code</legend>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (boxes.current[i] = el)}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={6}
                  aria-label={`Digit ${i + 1}`}
                  value={d}
                  onChange={(e) => putDigit(i, e.target.value)}
                  onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && boxes.current[i - 1]?.focus()}
                  className="h-14 w-full min-w-0 rounded-xl border border-line-strong bg-transparent text-center text-2xl text-head outline-none transition-colors focus:border-accent"
                />
              ))}
            </fieldset>
            <Submit busy={busy}>Verify Code</Submit>
          </form>
          <div className="mt-8 flex items-center justify-between text-sm">
            <button
              disabled={wait > 0 || resending}
              className="text-head disabled:text-large"
              onClick={async () => {
                setError('');
                setResending(true);
                try {
                  await api.resendOtp(token);
                  setWait(COOLDOWN);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setResending(false);
                }
              }}
            >
              {wait > 0 ? `Resend code in 0:${String(wait).padStart(2, '0')}` : 'Resend code'}
            </button>
            <TLink to="/login" className="ulink text-body">Back to sign in</TLink>
          </div>
        </>
      ) : (
        <>
          <p className="mb-8 text-[15px]">Create a new password for your account.</p>
          <FormError message={error} />
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (!passwordOk(newPassword)) return setError('Your password does not meet the requirements.');
              if (newPassword !== confirmPassword) return setError('Passwords do not match.');
              setBusy(true);
              setError('');
              try {
                await api.resetPassword(token, newPassword);
                setSuccessMsg('Password updated successfully! Redirecting to sign in…');
                setTimeout(() => go('/login', { replace: true }), 1500);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <PasswordField label="New password" name="newPassword" autoComplete="new-password" value={newPassword} onChange={setNewPassword} />
            <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
            <PasswordRules value={newPassword} confirm={confirmPassword} />
            <Submit busy={busy}>Update Password</Submit>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
