import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pill } from '../../components/Ui';
import {
  api,
  fmtDate,
  fmtDateTime,
  type AdminProject,
  type AdminRequest,
  type AdminUser,
  type AdminUserDetail,
  type AuditLog,
  type Page,
  type Pool,
  type RequestStatus,
} from '../../lib/api';

// Admin sections. Every number and row comes from the backend; nothing is computed or invented here.

/* ---------------- shared helpers ---------------- */

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current; // ignore responses from superseded requests
    setLoading(true);
    setError('');
    fn().then(
      (d) => n === seq.current && (setData(d), setLoading(false)),
      (e: Error) => n === seq.current && (setError(e.message), setLoading(false)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, setData, error, loading, reload };
}

/** Cursor-paginated list with "Load more". */
function usePaged<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, deps: unknown[] = []) {
  const first = useLoad(() => fetchPage(null), deps);
  const [extra, setExtra] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(first.data?.nextCursor ?? null);
  }, [first.data]);
  const loadMore = async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const p = await fetchPage(cursor);
      setExtra((xs) => [...xs, ...p.items]);
      setCursor(p.nextCursor);
    } finally {
      setMore(false);
    }
  };
  const items = first.data ? [...first.data.items, ...extra] : [];
  return { ...first, items, cursor, more, loadMore };
}

function DataState({ loading, error, empty, reload, children }: { loading: boolean; error: string; empty?: boolean; reload: () => void; children: ReactNode }) {
  if (loading) return <div className="space-y-2" role="status" aria-label="Loading">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-11 rounded-lg" />)}</div>;
  if (error)
    return (
      <div className="rounded-2xl border border-line py-12 text-center" role="alert">
        <p className="text-head">{error}</p>
        <Pill small className="mt-6" onClick={reload}>Try again</Pill>
      </div>
    );
  if (empty) return <p className="rounded-2xl border border-line py-12 text-center">Nothing here yet.</p>;
  return <>{children}</>;
}

/** Confirmation dialog that runs an action once, shows its result and blocks repeat clicks. */
function Confirm({ open, title, body, confirmLabel, danger, onClose, run }: { open: boolean; title: string; body?: ReactNode; confirmLabel: string; danger?: boolean; onClose: () => void; run: () => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) setError('');
  }, [open]);
  return (
    <Modal open={open} onClose={() => !busy && onClose()} label={title}>
      <p className="text-[22px] text-head">{title}</p>
      {body && <div className="mt-4 text-[15px]">{body}</div>}
      {error && <p className="mt-4 text-sm text-error" role="alert">{error}</p>}
      <div className="mt-8 flex gap-3">
        <Pill small onClick={onClose} disabled={busy}>Cancel</Pill>
        <button
          className={`pill pill-sm ${danger ? '!border-error !text-error' : 'pill-solid'}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await run();
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

const Th = ({ children, right }: { children?: ReactNode; right?: boolean }) => <th className={`py-3 pr-4 font-normal ${right ? 'text-right' : ''}`}>{children}</th>;
const Table = ({ head, children }: { head: ReactNode; children: ReactNode }) => (
  <div className="overflow-x-auto rounded-2xl border border-line">
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead className="text-large"><tr className="border-b border-line [&>th:first-child]:pl-4">{head}</tr></thead>
      <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&_td]:py-3 [&_td]:pr-4 [&_td:first-child]:pl-4">{children}</tbody>
    </table>
  </div>
);
const Notice = ({ text }: { text: string }) => (text ? <p className="mb-4 text-sm text-accent" role="status">{text}</p> : null);
const LoadMore = ({ cursor, more, loadMore }: { cursor: string | null; more: boolean; loadMore: () => void }) =>
  cursor ? <Pill small className="mt-6" onClick={loadMore} disabled={more}>{more ? 'Loading…' : 'Load more'}</Pill> : null;
const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/* ---------------- Overview ---------------- */

export function OverviewSection() {
  const o = useLoad(() => api.admin.overview());
  const entries = Object.entries(o.data ?? {});
  return (
    <>
      <Pill small className="mb-6" onClick={o.reload} disabled={o.loading}>Refresh</Pill>
      <DataState loading={o.loading} error={o.error} empty={!entries.length} reload={o.reload}>
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          {entries.map(([k, v]) => (
            <div key={k} className="bg-bg p-6">
              <dt className="text-sm text-large">{humanize(k)}</dt>
              <dd className="mt-2 text-[32px] tracking-[-0.03em] text-head tabular-nums">{String(v)}</dd>
            </div>
          ))}
        </dl>
      </DataState>
    </>
  );
}

/* ---------------- Users ---------------- */

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function UsersSection() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q);
  const list = usePaged<AdminUser>((cursor) => api.admin.users({ q: dq, status, cursor }), [dq, status]);
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="field max-w-xs" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="rounded-full border border-line bg-bg px-3 py-1.5 text-sm text-head">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>
      <DataState loading={list.loading} error={list.error} empty={!list.items.length} reload={list.reload}>
        <Table head={<><Th>User</Th><Th>Role</Th><Th>Status</Th><Th>Plan</Th><Th>Joined</Th></>}>
          {list.items.map((u) => (
            <tr key={u.id} className="cursor-pointer hover:bg-surface" onClick={() => setSelected(u.id)}>
              <td><button className="text-left" onClick={() => setSelected(u.id)}><span className="block text-head">{u.name || '—'}</span><span className="text-large">{u.email}</span></button></td>
              <td>{u.role}</td>
              <td className={u.status === 'SUSPENDED' ? 'text-error' : ''}>{u.status}</td>
              <td>{u.plan}</td>
              <td>{fmtDate(u.createdAt)}</td>
            </tr>
          ))}
        </Table>
        <LoadMore {...list} />
      </DataState>
      {selected && <UserDetail id={selected} onClose={() => setSelected(null)} onChanged={list.reload} />}
    </>
  );
}

function UserDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const d = useLoad<AdminUserDetail>(() => api.admin.user(id), [id]);
  const [confirm, setConfirm] = useState<'status' | 'role' | null>(null);
  const [notice, setNotice] = useState('');
  const u = d.data?.user;
  return (
    <Modal open onClose={onClose} label="User details">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-[22px] text-head">User details</p>
        <button className="pill pill-sm" onClick={onClose}>Close</button>
      </div>
      <Notice text={notice} />
      <DataState loading={d.loading} error={d.error} reload={d.reload}>
        {u && d.data && (
          <>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-large">Name</dt><dd className="text-head">{u.name || '—'}</dd></div>
              <div><dt className="text-large">Email</dt><dd className="break-all text-head">{u.email}</dd></div>
              <div><dt className="text-large">Role</dt><dd className="text-head">{u.role}</dd></div>
              <div><dt className="text-large">Status</dt><dd className="text-head">{u.status}</dd></div>
              <div><dt className="text-large">Plan</dt><dd className="text-head">{d.data.subscription.current.plan} · {d.data.subscription.current.status}</dd></div>
              <div><dt className="text-large">Plan ends</dt><dd className="text-head">{fmtDate(d.data.subscription.current.endsAt)}</dd></div>
              <div><dt className="text-large">Daily tokens</dt><dd className="text-head">{d.data.credits.daily.balance} / {d.data.credits.daily.limit}</dd></div>
              <div><dt className="text-large">Monthly tokens</dt><dd className="text-head">{d.data.credits.monthly.balance} / {d.data.credits.monthly.limit}</dd></div>
              <div><dt className="text-large">Projects</dt><dd className="text-head">{d.data.projectsCount}</dd></div>
              <div><dt className="text-large">Joined</dt><dd className="text-head">{fmtDate(u.createdAt)}</dd></div>
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className={`pill pill-sm ${u.status === 'ACTIVE' ? '!border-error !text-error' : ''}`} onClick={() => setConfirm('status')}>
                {u.status === 'ACTIVE' ? 'Suspend user' : 'Activate user'}
              </button>
              <Pill small onClick={() => setConfirm('role')}>{u.role === 'ADMIN' ? 'Remove admin role' : 'Make admin'}</Pill>
            </div>
            <Confirm
              open={confirm === 'status'}
              title={u.status === 'ACTIVE' ? `Suspend ${u.email}?` : `Activate ${u.email}?`}
              body={u.status === 'ACTIVE' ? 'They will be signed out and unable to use AquaVision until activated.' : 'They will be able to sign in again.'}
              confirmLabel={u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
              danger={u.status === 'ACTIVE'}
              onClose={() => setConfirm(null)}
              run={async () => {
                await api.admin.setStatus(u.id, u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
                setNotice('Status updated.');
                d.reload();
                onChanged();
              }}
            />
            <Confirm
              open={confirm === 'role'}
              title={u.role === 'ADMIN' ? `Remove admin role from ${u.email}?` : `Give ${u.email} admin access?`}
              confirmLabel="Change role"
              danger={u.role !== 'ADMIN'}
              onClose={() => setConfirm(null)}
              run={async () => {
                await api.admin.setRole(u.id, u.role === 'ADMIN' ? 'USER' : 'ADMIN');
                setNotice('Role updated.');
                d.reload();
                onChanged();
              }}
            />
          </>
        )}
      </DataState>
    </Modal>
  );
}

/* ---------------- Subscription requests ---------------- */

export function RequestsSection() {
  const [status, setStatus] = useState<RequestStatus | ''>('PENDING');
  const list = useLoad(() => api.admin.requests(status || undefined), [status]);
  const [act, setAct] = useState<{ r: AdminRequest; kind: 'approve' | 'reject' } | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Request status">
        {(['PENDING', 'APPROVED', 'REJECTED', ''] as const).map((s) => (
          <button key={s || 'all'} role="tab" aria-selected={status === s} onClick={() => setStatus(s)} className={`rounded-full px-4 py-1.5 text-sm ${status === s ? 'bg-invert-bg text-invert-fg' : 'border border-line text-body hover:text-head'}`}>
            {s ? humanize(s.toLowerCase()) : 'All'}
          </button>
        ))}
      </div>
      <Notice text={notice} />
      <DataState loading={list.loading} error={list.error} empty={!list.data?.length} reload={list.reload}>
        <Table head={<><Th>User</Th><Th>Plan</Th><Th>Requested</Th><Th>Status</Th><Th /></>}>
          {list.data?.map((r) => (
            <tr key={r.id}>
              <td><span className="block text-head">{r.user.name || '—'}</span><span className="text-large">{r.user.email}</span></td>
              <td className="text-head">{r.plan}</td>
              <td>{fmtDateTime(r.createdAt)}</td>
              <td>{r.status}{r.decidedAt ? ` · ${fmtDate(r.decidedAt)}` : ''}</td>
              <td className="text-right">
                {r.status === 'PENDING' && (
                  <span className="inline-flex gap-2">
                    <button className="pill pill-sm pill-solid" onClick={() => setAct({ r, kind: 'approve' })}>Approve</button>
                    <button className="pill pill-sm !border-error !text-error" onClick={() => { setReason(''); setAct({ r, kind: 'reject' }); }}>Reject</button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </DataState>
      <Confirm
        open={!!act}
        title={act ? `${act.kind === 'approve' ? 'Approve' : 'Reject'} ${act.r.plan} for ${act.r.user.email}?` : ''}
        body={
          act?.kind === 'reject' ? (
            <label className="block text-sm">
              Reason (optional, shown to the user)
              <input value={reason} onChange={(e) => setReason(e.target.value)} className="field mt-2" />
            </label>
          ) : (
            'The plan becomes active immediately and its monthly tokens are granted by the backend.'
          )
        }
        confirmLabel={act?.kind === 'approve' ? 'Approve' : 'Reject'}
        danger={act?.kind === 'reject'}
        onClose={() => setAct(null)}
        run={async () => {
          if (!act) return;
          if (act.kind === 'approve') await api.admin.approve(act.r.id);
          else await api.admin.reject(act.r.id, reason || undefined);
          setNotice(`Request ${act.kind === 'approve' ? 'approved' : 'rejected'}.`);
          list.reload();
        }}
      />
    </>
  );
}

/* ---------------- Credits ---------------- */

export function CreditsSection() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const users = useLoad(() => (dq ? api.admin.users({ q: dq }) : Promise.resolve({ items: [], nextCursor: null })), [dq]);
  const [userId, setUserId] = useState<string | null>(null);
  const detail = useLoad(() => (userId ? api.admin.user(userId) : Promise.resolve(null)), [userId]);
  const [pool, setPool] = useState<Pool>('MONTHLY');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const n = Number(amount);
  const d = detail.data;
  const current = d ? (pool === 'DAILY' ? d.credits.daily.balance : d.credits.monthly.balance) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-label="Choose user">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user by name or email" aria-label="Search user" className="field" />
        <ul className="mt-4 space-y-1">
          {users.data?.items.map((u) => (
            <li key={u.id}>
              <button onClick={() => { setUserId(u.id); setNotice(''); }} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${userId === u.id ? 'bg-invert-bg text-invert-fg' : 'hover:bg-surface'}`}>
                {u.email} <span className="opacity-60">· {u.plan}</span>
              </button>
            </li>
          ))}
          {dq && users.data && !users.data.items.length && <li className="text-sm text-large">No users match.</li>}
          {users.error && <li className="text-sm text-error">{users.error}</li>}
        </ul>
      </section>

      <section aria-label="Adjust tokens" className="rounded-2xl border border-line p-6">
        {!userId ? (
          <p>Search and select a user to adjust their tokens.</p>
        ) : (
          <DataState loading={detail.loading} error={detail.error} reload={detail.reload}>
            {d && (
              <>
                <p className="text-head">{d.user.email}</p>
                <p className="mt-1 text-sm">Daily {d.credits.daily.balance}/{d.credits.daily.limit} · Monthly {d.credits.monthly.balance}/{d.credits.monthly.limit}</p>
                <Notice text={notice} />
                <form
                  className="mt-6 space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setFormError('');
                    if (!Number.isInteger(n) || n === 0) return setFormError('Enter a whole number other than 0 (negative to remove).');
                    if (!reason.trim()) return setFormError('A reason is required for the audit log.');
                    setConfirm(true);
                  }}
                >
                  <fieldset className="flex gap-2">
                    <legend className="mb-2 text-sm text-large">Token pool</legend>
                    {(['DAILY', 'MONTHLY'] as const).map((p) => (
                      <button type="button" key={p} aria-pressed={pool === p} onClick={() => setPool(p)} className={`rounded-full px-4 py-1.5 text-sm ${pool === p ? 'bg-invert-bg text-invert-fg' : 'border border-line'}`}>
                        {p === 'DAILY' ? 'Daily' : 'Monthly / paid'}
                      </button>
                    ))}
                  </fieldset>
                  <label className="block text-sm text-large">
                    Amount (use a minus sign to remove)
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="field mt-1" placeholder="e.g. 20 or -5" />
                  </label>
                  <label className="block text-sm text-large">
                    Reason
                    <input value={reason} onChange={(e) => setReason(e.target.value)} className="field mt-1" />
                  </label>
                  {formError && <p className="text-sm text-error" role="alert">{formError}</p>}
                  <Pill solid type="submit">Review adjustment</Pill>
                </form>
                <Confirm
                  open={confirm}
                  title={`${n > 0 ? 'Add' : 'Remove'} ${Math.abs(n)} ${pool.toLowerCase()} tokens?`}
                  body={<p>{d.user.email} · current {pool.toLowerCase()} balance {current}. Reason: “{reason}”.</p>}
                  confirmLabel="Apply"
                  onClose={() => setConfirm(false)}
                  run={async () => {
                    const r = await api.admin.adjustCredits({ userId: d.user.id, pool, amount: n, reason: reason.trim() });
                    detail.setData({ ...d, credits: r.credits });
                    setNotice(`Done. New balance: daily ${r.credits.daily.balance}, monthly ${r.credits.monthly.balance}.`);
                    setAmount('');
                    setReason('');
                  }}
                />
              </>
            )}
          </DataState>
        )}
      </section>
    </div>
  );
}

/* ---------------- Projects ---------------- */

export function ProjectsSection() {
  const list = usePaged<AdminProject>((c) => api.admin.projects(c));
  return (
    <DataState loading={list.loading} error={list.error} empty={!list.items.length} reload={list.reload}>
      <Table head={<><Th>Project</Th><Th>Owner</Th><Th>Status</Th><Th>Shared</Th><Th>Created</Th></>}>
        {list.items.map((p) => (
          <tr key={p.id}>
            <td className="text-head">{p.name}</td>
            <td>{p.owner.email}</td>
            <td>{p.status}</td>
            <td>{p.shareToken ? 'Yes' : 'No'}</td>
            <td>{fmtDateTime(p.createdAt)}</td>
          </tr>
        ))}
      </Table>
      <LoadMore {...list} />
    </DataState>
  );
}

/* ---------------- Audit logs ---------------- */

export function AuditSection() {
  const list = usePaged<AuditLog>((c) => api.admin.auditLogs(c));
  return (
    <DataState loading={list.loading} error={list.error} empty={!list.items.length} reload={list.reload}>
      <Table head={<><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></>}>
        {list.items.map((l) => (
          <tr key={l.id} className="align-top">
            <td className="whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
            <td>{l.actor?.email ?? 'System'}</td>
            <td className="text-head">{l.action}</td>
            <td>{l.target ?? '—'}</td>
            <td>
              {l.metadata ? (
                <details>
                  <summary className="cursor-pointer text-large hover:text-head">View</summary>
                  <pre className="mt-2 max-w-[360px] overflow-x-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs">{JSON.stringify(l.metadata, null, 2)}</pre>
                </details>
              ) : '—'}
            </td>
          </tr>
        ))}
      </Table>
      <LoadMore {...list} />
    </DataState>
  );
}

/* ---------------- System health ---------------- */

export function HealthSection() {
  const h = useLoad(() => api.admin.health());
  const tone = h.data?.status === 'ok' ? 'bg-[#28c840]' : h.data?.status === 'degraded' ? 'bg-[#febc2e]' : 'bg-error';
  return (
    <>
      <Pill small className="mb-6" onClick={h.reload} disabled={h.loading}>Refresh</Pill>
      <DataState loading={h.loading} error={h.error} reload={h.reload}>
        <p className="flex items-center gap-2 text-head">
          <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden="true" /> Status: {h.data?.status}
        </p>
        <pre className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface p-5 text-xs leading-relaxed">{JSON.stringify(h.data, null, 2)}</pre>
      </DataState>
    </>
  );
}
