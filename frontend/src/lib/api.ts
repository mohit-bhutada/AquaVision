// AquaVision API client — the only place the frontend talks to the backend.
// The full contract (bodies, responses, status codes, business rules) is in docs/API_CONTRACT.md.
// If the backend uses different paths, change them in ENDPOINTS only.
// The frontend never enhances images or computes balances itself: the backend is authoritative.

const RAW_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '');
// An https page cannot call an http:// API (mixed content is blocked). Upgrade public hosts automatically;
// plain http stays allowed only for localhost development.
const BASE =
  RAW_BASE && typeof window !== 'undefined' && window.location.protocol === 'https:' && RAW_BASE.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(RAW_BASE)
    ? RAW_BASE.replace(/^http:\/\//, 'https://')
    : RAW_BASE;

/** Dev-only preview (no VITE_API_URL): pages render their `?state=` previews. Never true in a production build. */
export const PREVIEW = import.meta.env.DEV && !BASE;

export const ENDPOINTS = {
  // auth
  me: '/auth/me',
  signup: '/auth/signup',
  verifyToken: (token: string) => `/auth/verify-token/${encodeURIComponent(token)}`,
  verifyOtp: '/auth/verify-otp',
  resendOtp: '/auth/resend-otp',
  login: '/auth/login',
  logout: '/auth/logout',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  google: '/auth/google',
  // account
  profile: '/me/profile',
  credits: '/credits',
  ledger: '/credits/ledger',
  // projects
  enhance: '/projects/enhance',
  projects: '/projects',
  project: (id: string) => `/projects/${encodeURIComponent(id)}`,
  share: (id: string) => `/projects/${encodeURIComponent(id)}/share`,
  shared: (token: string) => `/share/${encodeURIComponent(token)}`,
  // plans & subscriptions
  plans: '/plans',
  subscription: '/subscriptions/me',
  subscriptionRequests: '/subscriptions/requests',
  // admin
  admin: {
    me: '/admin/me',
    overview: '/admin/overview',
    users: '/admin/users',
    user: (id: string) => `/admin/users/${encodeURIComponent(id)}`,
    userStatus: (id: string) => `/admin/users/${encodeURIComponent(id)}/status`,
    userRole: (id: string) => `/admin/users/${encodeURIComponent(id)}/role`,
    requests: '/admin/subscription-requests',
    approve: (id: string) => `/admin/subscription-requests/${encodeURIComponent(id)}/approve`,
    reject: (id: string) => `/admin/subscription-requests/${encodeURIComponent(id)}/reject`,
    creditsAdjust: '/admin/credits/adjust',
    projects: '/admin/projects',
    auditLogs: '/admin/audit-logs',
    health: '/admin/health',
  },
  health: '/health',
} as const;

/* ---------------- types (mirror docs/API_CONTRACT.md) ---------------- */

export type PlanId = 'FREE' | 'PRO' | 'PREMIUM';
export type Pool = 'DAILY' | 'MONTHLY';
export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type User = { id: string; name: string | null; email: string; avatarUrl?: string | null; role: Role; status: UserStatus; emailVerified?: boolean; createdAt: string };

export type Credits = {
  daily: { balance: number; limit: number; resetsAt: string };
  monthly: { balance: number; limit: number };
  total: number;
};

export type Plan = { id: PlanId; name: string; priceInr: number; dailyTokens: number; monthlyTokens: number; durationDays: number };

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SubscriptionRequest = { id: string; plan: PlanId; status: RequestStatus; createdAt: string; decidedAt?: string | null; reason?: string | null };

export type SubscriptionState = {
  current: { plan: PlanId; status: 'ACTIVE' | 'EXPIRED' | 'NONE'; startsAt: string | null; endsAt: string | null };
  pendingRequest: SubscriptionRequest | null;
  lastDecision: SubscriptionRequest | null;
  requestedToday: boolean;
  canRequest: boolean;
  nextEligibleAt: string | null;
  /** Human-readable reason from the backend when canRequest is false. */
  reason: string | null;
};

export type Profile = { user: User; credits: Credits; subscription: SubscriptionState };

export type WorkspaceSummary = {
  profile: Profile;
  stats: {
    totalProjects: number;
    completedProjects: number;
    dailyTokensRemaining: number;
    monthlyTokensRemaining: number;
  };
  recentProjects: Project[];
};

export type Project = {
  id: string;
  name: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalUrl: string;
  enhancedUrl: string | null;
  shareToken: string | null;
  width?: number | null;
  height?: number | null;
  createdAt: string;
};
export type SharedProject = { name: string; createdAt: string; originalUrl: string; enhancedUrl: string };

export type LedgerEntry = {
  id: string;
  createdAt: string;
  type: 'ENHANCEMENT' | 'DAILY_RESET' | 'PLAN_GRANT' | 'ADMIN_ADJUSTMENT' | 'REFUND';
  pool: Pool;
  amount: number; // negative = spent
  reason: string | null;
  projectId: string | null;
  balanceAfter: number | null;
};
export type Page<T> = { items: T[]; nextCursor: string | null };

// admin
export type AdminOverview = Record<string, number | string>;
export type AdminUser = User & { plan: PlanId; credits?: Credits };
export type AdminUserDetail = { user: User; credits: Credits; subscription: SubscriptionState; projectsCount: number };
export type AdminRequest = SubscriptionRequest & { user: { id: string; email: string; name: string | null } };
export type AdminProject = Project & { owner: { id: string; email: string } };
export type AuditLog = { id: string; createdAt: string; actor: { id: string; email: string } | null; action: string; target: string | null; metadata: Record<string, unknown> | null };
export type Health = { status: 'ok' | 'degraded' | 'down'; [key: string]: unknown };

/* ---------------- transport ---------------- */

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code = 'UNKNOWN', public details?: unknown) {
    super(message);
  }
}

/** True when the connected server is the dev mock (it sends X-AquaVision-Mock: 1). Drives a visible banner. */
export let isMock = false;

// A stalled network must not leave the UI waiting forever. Enhancement can legitimately take minutes
// (model cold start + inference), so it gets a longer budget.
// AbortSignal.timeout is missing on older browsers (e.g. iOS < 16); without it the request simply has no limit.
const timeoutSignal = (ms: number): AbortSignal | undefined => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(ms) : undefined);
const DEFAULT_TIMEOUT_MS = 30_000;
const ENHANCE_TIMEOUT_MS = 240_000;

async function req<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  if (!BASE) throw new ApiError('Backend not configured. Set VITE_API_URL.', 0, 'NO_BACKEND');
  let res: Response;
  try {
    res = await fetch(BASE + path, { credentials: 'include', signal: init.signal ?? timeoutSignal(timeoutMs), ...init });
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError') {
      throw new ApiError('The server took too long to respond. Please try again.', 0, 'TIMEOUT');
    }
    throw new ApiError('Cannot reach the AquaVision server. Check your connection and try again.', 0, 'NETWORK');
  }
  if (res.headers.get('X-AquaVision-Mock') === '1') isMock = true;
  if (!res.ok) {
    let message = 'Something went wrong. Please try again.';
    let code = 'HTTP_' + res.status;
    let details: unknown;
    try {
      const body = await res.json();
      const e = body?.error ?? body;
      if (typeof e?.message === 'string') message = e.message;
      if (typeof e?.code === 'string') code = e.code;
      details = e?.details;
      // The backend returns the OTP verification token at the top level of the error (not inside
      // `details`) when an unverified account tries to log in. Surface it so the login screen can
      // send the user to the OTP page.
      const verificationToken = e?.verificationToken ?? body?.verificationToken;
      if (!details && typeof verificationToken === 'string' && verificationToken) {
        details = { verificationToken, requiresVerification: true };
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code, details);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    // e.g. a proxy/CDN returned an HTML page with status 200
    throw new ApiError('The server sent an unexpected response. Please try again.', res.status, 'BAD_RESPONSE');
  }
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '') as [string, string][]).toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  me: () => req<User>(ENDPOINTS.me),
  signup: (data: { name?: string; email: string; password: string }) =>
    req<{ ok: boolean; verificationToken: string }>(ENDPOINTS.signup, send('POST', data)),
  verifyToken: (token: string) =>
    req<{ valid: boolean; purpose?: 'SIGNUP' | 'PASSWORD_RESET'; status?: string; email?: string }>(
      ENDPOINTS.verifyToken(token)
    ),
  verifyOtp: (verificationToken: string, otp: string) =>
    req<{ status: string; purpose: 'SIGNUP' | 'PASSWORD_RESET'; verificationStatus?: string; user?: User }>(
      ENDPOINTS.verifyOtp,
      send('POST', { verificationToken, otp })
    ),
  resendOtp: (verificationToken: string) =>
    req<{ ok: boolean; expiresAt: string }>(ENDPOINTS.resendOtp, send('POST', { verificationToken })),
  login: (email: string, password: string) => req<User>(ENDPOINTS.login, send('POST', { email, password })),
  logout: () => req<void>(ENDPOINTS.logout, send('POST')),
  forgotPassword: (email: string) =>
    req<{ ok: boolean; message: string; verificationToken?: string }>(
      ENDPOINTS.forgotPassword,
      send('POST', { email })
    ),
  resetPassword: (verificationToken: string, password: string) =>
    req<{ ok: boolean; message: string }>(ENDPOINTS.resetPassword, send('POST', { verificationToken, password })),
  googleUrl: (next?: string) => {
    const base = BASE || '/api/v1';
    return `${base}${ENDPOINTS.google}${qs({ next })}`;
  },
  oauthCallbackUrl: (search: string) => {
    const base = BASE || '/api/v1';
    return `${base}/auth/callback${search}`;
  },

  // account
  profile: () => req<Profile>(ENDPOINTS.profile),
  credits: () => req<Credits>(ENDPOINTS.credits),
  ledger: (cursor?: string | null, limit = 20) => req<Page<LedgerEntry>>(ENDPOINTS.ledger + qs({ cursor, limit })),

  // projects
  workspaceSummary: () => req<WorkspaceSummary>('/projects/workspace/summary'),
  enhance: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return req<{ project: Project; credits: Credits }>(ENDPOINTS.enhance, { method: 'POST', body: fd }, ENHANCE_TIMEOUT_MS).then((res) => {
      window.dispatchEvent(new Event('aquavision:projects-changed'));
      return res;
    });
  },
  projects: () => req<Project[]>(ENDPOINTS.projects),
  project: (id: string) => req<Project>(ENDPOINTS.project(id)),
  renameProject: (id: string, name: string) =>
    req<Project>(ENDPOINTS.project(id), send('PATCH', { name })).then((res) => {
      window.dispatchEvent(new Event('aquavision:projects-changed'));
      return res;
    }),
  deleteProject: (id: string) =>
    req<void>(ENDPOINTS.project(id), { method: 'DELETE' }).then((res) => {
      window.dispatchEvent(new Event('aquavision:projects-changed'));
      return res;
    }),
  deleteProjects: (ids: string[]) =>
    req<{ deletedIds: string[]; failedIds: string[] }>('/projects/bulk-delete', send('POST', { ids })).then((res) => {
      window.dispatchEvent(new Event('aquavision:projects-changed'));
      return res;
    }),
  share: (id: string) => req<{ shareToken: string }>(ENDPOINTS.share(id), send('POST')),
  revokeShare: (id: string) => req<void>(ENDPOINTS.share(id), { method: 'DELETE' }),
  shared: (token: string) => req<SharedProject>(ENDPOINTS.shared(token)),

  // plans & subscriptions
  plans: () => req<Plan[]>(ENDPOINTS.plans),
  subscription: () => req<SubscriptionState>(ENDPOINTS.subscription),
  requestPlan: (plan: PlanId) => req<SubscriptionRequest>(ENDPOINTS.subscriptionRequests, send('POST', { plan })),

  admin: {
    me: () => req<User>(ENDPOINTS.admin.me),
    overview: () => req<AdminOverview>(ENDPOINTS.admin.overview),
    users: (p: { q?: string; status?: string; cursor?: string | null } = {}) => req<Page<AdminUser>>(ENDPOINTS.admin.users + qs(p)),
    user: (id: string) => req<AdminUserDetail>(ENDPOINTS.admin.user(id)),
    setStatus: (id: string, status: UserStatus) => req<User>(ENDPOINTS.admin.userStatus(id), send('PATCH', { status })),
    setRole: (id: string, role: Role) => req<User>(ENDPOINTS.admin.userRole(id), send('PATCH', { role })),
    requests: (status?: RequestStatus) => req<AdminRequest[]>(ENDPOINTS.admin.requests + qs({ status })),
    approve: (id: string) => req<AdminRequest>(ENDPOINTS.admin.approve(id), send('POST')),
    reject: (id: string, reason?: string) => req<AdminRequest>(ENDPOINTS.admin.reject(id), send('POST', { reason })),
    adjustCredits: (body: { userId: string; pool: Pool; amount: number; reason: string }) => req<{ credits: Credits }>(ENDPOINTS.admin.creditsAdjust, send('POST', body)),
    projects: (cursor?: string | null) => req<Page<AdminProject>>(ENDPOINTS.admin.projects + qs({ cursor })),
    auditLogs: (cursor?: string | null) => req<Page<AuditLog>>(ENDPOINTS.admin.auditLogs + qs({ cursor })),
    health: () => req<Health>(ENDPOINTS.admin.health),
  },
};

export const assetUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  const origin = BASE ? BASE.replace(/\/api\/v1\/?$/, '') : '';
  return url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
};

export const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;

/** Only allow same-site relative return paths (prevents open redirects via ?next=). */
export const safeNext = (next: string | null | undefined, fallback = '/workspace') => (next && next.startsWith('/') && !next.startsWith('//') ? next : fallback);

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

export const splitNameAndExt = (fullName: string | null | undefined): { stem: string; ext: string } => {
  if (!fullName) return { stem: 'Untitled Project', ext: '' };
  const lastDot = fullName.lastIndexOf('.');
  if (lastDot > 0) {
    const candidate = fullName.substring(lastDot);
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(candidate.toLowerCase())) {
      return { stem: fullName.substring(0, lastDot), ext: candidate };
    }
  }
  return { stem: fullName, ext: '' };
};