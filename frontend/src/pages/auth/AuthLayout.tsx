import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Arcs, PublicShell } from '../../components/Layout';
import { Ocean } from '../../components/Ocean';
import { TLink } from '../../components/Curtain';
import { Lines } from '../../components/Reveal';
import { Logo } from '../../components/Ui';
import { api } from '../../lib/api';

export function AuthLayout({ title, children }: { title: ReactNode[]; children: ReactNode }) {
  return (
    <PublicShell footer={false}>
      <div className="relative min-h-[100svh] overflow-hidden">
        <Arcs />
        {/* Bottom padding keeps the last link clear of the fixed nav pill. */}
        <div className="wrap relative grid min-h-[100svh] gap-14 pb-36 pt-10 lg:grid-cols-2 lg:items-center lg:py-24 lg:pb-36">
          <div className="flex flex-col">
            <TLink to="/" aria-label="AquaVision home" className="w-fit">
              <Logo size={40} />
            </TLink>
            <Lines as="h1" lines={title} className="mt-16 text-[48px] leading-[1] md:text-[88px] lg:mt-12" />
            <div data-surface="dark" className="relative mt-12 hidden h-[220px] max-w-[460px] overflow-hidden rounded-3xl text-white lg:block">
              <Ocean depth={0.45} intensity={0.8} />
              <div className="relative flex h-full flex-col justify-end p-6">
                <p className="max-w-[260px] text-[15px] leading-snug text-white/85">Enhance, compare and download in one workspace.</p>
                <ol className="mt-4 flex gap-2 text-xs" aria-label="How it works">
                  {['Upload', 'Enhance', 'Download'].map((s, i) => (
                    <li key={s} className="rounded-full border border-white/25 px-3 py-1 text-white/85 backdrop-blur-sm" style={{ animation: `rise .8s var(--ease) ${0.4 + i * 0.12}s both` }}>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[460px] rounded-3xl border border-line bg-surface p-6 shadow-[0_24px_60px_-36px_rgba(11,21,32,.35)] sm:p-8 lg:justify-self-end">{children}</div>
        </div>
      </div>
    </PublicShell>
  );
}

export function Field({ label, error, hint, ...input }: { label: string; error?: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? input.name;
  return (
    <div className="mb-7">
      <label htmlFor={id} className="mb-1 block text-sm text-large">
        {label}
      </label>
      <span className="field-wrap">
        <input id={id} className="field" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...input} />
      </span>
      {hint}
      {error && (
        <p id={`${id}-err`} className="mt-2 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: { label: string; name: string; value: string; onChange: (v: string) => void; error?: string; autoComplete?: string; hint?: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Field
        label={props.label}
        name={props.name}
        type={show ? 'text' : 'password'}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        error={props.error}
        hint={props.hint}
        required
      />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-0 top-7 text-sm text-large hover:text-head" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

// ponytail: rules are a guess; mirror the backend's real password policy.
export const PASSWORD_RULES: [string, (p: string) => boolean][] = [
  ['At least 8 characters', (p) => p.length >= 8],
  ['At least 1 letter', (p) => /[a-z]/i.test(p)],
  ['At least 1 number', (p) => /\d/.test(p)],
];
export const passwordOk = (p: string) => PASSWORD_RULES.every(([, ok]) => ok(p));

/** Live checklist: each rule turns green with a drawn check mark as it is met. */
export function PasswordRules({ value, confirm }: { value: string; confirm?: string }) {
  const rows: [string, boolean][] = PASSWORD_RULES.map(([label, ok]) => [label, ok(value)]);
  if (confirm !== undefined) rows.push(['Passwords match', confirm.length > 0 && confirm === value]);
  return (
    <ul className="pw-rules mb-8 space-y-1.5 text-[15px]" aria-label="Password requirements">
      {rows.map(([label, met]) => (
        <li key={label} className={`flex items-center gap-2.5 transition-colors duration-300 ${met ? 'is-met text-head' : 'text-large'}`}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 12.5 10 18 19.5 6.5" className="pw-base" />
            <path d="M4.5 12.5 10 18 19.5 6.5" className="pw-draw" pathLength={1} />
          </svg>
          {label}
          <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
        </li>
      ))}
    </ul>
  );
}

export function Submit({ busy, children }: { busy: boolean; children: string }) {
  return (
    <button type="submit" disabled={busy} className="pill pill-solid w-full" aria-busy={busy}>
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-label="Loading" /> : children}
    </button>
  );
}

export function FormError({ message }: { message: string }) {
  return message ? (
    <p className="mb-6 rounded-xl border border-error/40 px-4 py-3 text-sm text-error" role="alert">
      {message}
    </p>
  ) : null;
}

export function GoogleButton({ next, onError }: { next?: string; onError: (msg: string) => void }) {
  return (
    <button
      type="button"
      className="pill w-full"
      onClick={() => {
        // Google OAuth is handled by the backend, which redirects back to /auth/callback?next=…
        const url = api.googleUrl(next);
        if (url) window.location.href = url;
        else onError('Google sign-in is unavailable: backend not connected.');
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.7 7.1-17z" />
        <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6a24 24 0 0 0 0 21.4l7.8-6z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.6 2.2-8.7 2.2-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
      </svg>
      Continue with Google
    </button>
  );
}

export const Or = () => (
  <div className="my-6 flex items-center gap-4 text-sm text-large">
    <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
  </div>
);
