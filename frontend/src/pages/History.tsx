import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CompareSlider } from '../components/CompareSlider';
import { More } from '../components/Icons';
import { AppShell, InnerHero } from '../components/Layout';
import { Modal, Pill, Placeholder } from '../components/Ui';
import { api, assetUrl, fmtDateTime, shareUrl, splitNameAndExt, type LedgerEntry, type Project } from '../lib/api';
import { useAccount } from '../lib/account';
import { useDevState } from '../lib/devState';

type Load = 'loading' | 'error' | 'ready';

// Dev-only sample tiles so the list can be reviewed without a backend. Never shown in production.
const SAMPLES: Project[] = Array.from({ length: 6 }, (_, i) => ({
  id: `sample-${i + 1}`,
  name: `Sample project ${i + 1}`,
  createdAt: new Date(2026, 8, 20 - i * 3).toISOString(),
  status: 'COMPLETED' as const,
  originalUrl: '',
  enhancedUrl: '',
  shareToken: i % 3 === 0 ? 'sample' : null,
}));

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const Img = ({ src, alt, tone }: { src: string | null; alt: string; tone: 'murky' | 'clear' }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return <Placeholder tone={tone} label="" className="h-full w-full" />;
  }
  return (
    <img
      src={assetUrl(src)}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setErr(true)}
    />
  );
};

export default function History() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'tokens' ? 'tokens' : 'projects';
  return (
    <AppShell>
      <InnerHero compact lines={['Your', <span className="serif">history.</span>]} />
      <div className="wrap">
        <div role="tablist" aria-label="History" className="-mt-4 flex gap-2">
          {(
            [
              ['projects', 'Projects'],
              ['tokens', 'Token history'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setParams(id === 'projects' ? {} : { tab: id }, { replace: true })}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${tab === id ? 'bg-invert-bg text-invert-fg' : 'border border-line text-body hover:text-head'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'projects' ? <Projects /> : <TokenHistory />}
    </AppShell>
  );
}

const TYPE_LABEL: Record<LedgerEntry['type'], string> = {
  ENHANCEMENT: 'Enhancement',
  DAILY_RESET: 'Daily reset',
  PLAN_GRANT: 'Plan tokens granted',
  ADMIN_ADJUSTMENT: 'Adjustment',
  REFUND: 'Refund',
};

/** Backend credit ledger. Shows only what the API returns: no local bookkeeping. */
function TokenHistory() {
  const { credits } = useAccount();
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [load, setLoad] = useState<'loading' | 'error' | 'ready' | 'more'>('loading');
  const [error, setError] = useState('');

  const fetchPage = (from: string | null) => {
    setLoad(from ? 'more' : 'loading');
    api.ledger(from).then(
      (p) => {
        setItems((xs) => (from ? [...xs, ...p.items] : p.items));
        setCursor(p.nextCursor);
        setLoad('ready');
      },
      (e: Error) => {
        setError(e.message);
        setLoad('error');
      },
    );
  };
  useEffect(() => fetchPage(null), []);

  return (
    <div className="wrap mt-10">
      {credits && (
        <dl className="grid gap-6 border-y border-line py-6 sm:grid-cols-3">
          <div><dt className="text-sm text-large">Daily tokens</dt><dd className="mt-1 text-[28px] tracking-[-0.03em] text-head">{credits.daily.balance}<span className="text-base text-large"> / {credits.daily.limit}</span></dd><dd className="text-xs text-large">Resets {fmtDateTime(credits.daily.resetsAt)}</dd></div>
          <div><dt className="text-sm text-large">Monthly tokens</dt><dd className="mt-1 text-[28px] tracking-[-0.03em] text-head">{credits.monthly.balance}<span className="text-base text-large"> / {credits.monthly.limit}</span></dd></div>
          <div><dt className="text-sm text-large">Total available</dt><dd className="mt-1 text-[28px] tracking-[-0.03em] text-head">{credits.total}</dd></div>
        </dl>
      )}
      <div className="mt-8" aria-live="polite">
        {load === 'loading' && (
          <div role="status" className="space-y-3">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-12 rounded-xl" />)}
          </div>
        )}
        {load === 'error' && (
          <div className="py-16 text-center" role="alert">
            <p className="text-[24px] text-head">We couldn't load your token history.</p>
            <p className="mt-2 text-sm">{error}</p>
            <Pill className="mt-8" onClick={() => fetchPage(null)}>Try again</Pill>
          </div>
        )}
        {(load === 'ready' || load === 'more') && items.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-[28px] tracking-[-0.03em] text-head">No token activity yet.</p>
            <p className="mt-2">Every token spent or added will be listed here.</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-large">
                <tr className="border-b border-line">
                  <th className="py-3 pr-4 font-normal">Date</th>
                  <th className="py-3 pr-4 font-normal">Type</th>
                  <th className="py-3 pr-4 font-normal">Pool</th>
                  <th className="py-3 pr-4 text-right font-normal">Tokens</th>
                  <th className="py-3 pr-4 text-right font-normal">Balance after</th>
                  <th className="py-3 font-normal">Reason</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="py-3 pr-4 whitespace-nowrap">{fmtDateTime(e.createdAt)}</td>
                    <td className="py-3 pr-4 text-head">{TYPE_LABEL[e.type] ?? e.type}</td>
                    <td className="py-3 pr-4">{e.pool === 'DAILY' ? 'Daily' : 'Monthly'}</td>
                    <td className={`py-3 pr-4 text-right tabular-nums ${e.amount < 0 ? 'text-head' : 'text-accent'}`}>{e.amount > 0 ? `+${e.amount}` : e.amount}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{e.balanceAfter ?? '–'}</td>
                    <td className="py-3">{e.reason ?? (e.projectId ? `Project ${e.projectId}` : '–')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && load !== 'loading' && load !== 'error' && (
          <Pill className="mt-8" onClick={() => fetchPage(cursor)} disabled={load === 'more'}>
            {load === 'more' ? 'Loading…' : 'Load more'}
          </Pill>
        )}
      </div>
    </div>
  );
}

function Projects() {
  const dev = useDevState(['loading', 'empty', 'error', 'list'] as const);
  const [load, setLoad] = useState<Load>(dev === 'loading' ? 'loading' : dev === 'error' ? 'error' : dev ? 'ready' : 'loading');
  const [items, setItems] = useState<Project[]>(dev === 'list' ? SAMPLES : []);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'new' | 'old'>('new');
  const [open, setOpen] = useState<Project | null>(null);
  const [confirm, setConfirm] = useState<Project | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameExt, setRenameExt] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const fetchAll = () => {
    setLoad('loading');
    api.projects().then(
      (p) => {
        setItems(p);
        setLoad('ready');
      },
      () => setLoad('error'),
    );
  };

  useEffect(() => {
    if (!dev) fetchAll();
  }, [dev]);

  useEffect(() => {
    const handleProjectsChanged = () => fetchAll();
    window.addEventListener('aquavision:projects-changed', handleProjectsChanged);
    return () => window.removeEventListener('aquavision:projects-changed', handleProjectsChanged);
  }, []);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.history-action-menu')) {
        setMenu(null);
      }
    };
    window.addEventListener('click', handleOutside);
    return () => window.removeEventListener('click', handleOutside);
  }, []);

  const shown = items
    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (sort === 'new' ? 1 : -1) * (Date.parse(b.createdAt) - Date.parse(a.createdAt)));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (shown.length > 0 && shown.every((p) => selectedIds.has(p.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(shown.map((p) => p.id)));
    }
  };

  const handleRenameSubmit = async (projectId: string, ext: string) => {
    if (!renameText.trim()) {
      setRenamingId(null);
      return;
    }
    setPending(projectId);
    try {
      const fullNewName = `${renameText.trim()}${ext}`;
      const updated = await api.renameProject(projectId, fullNewName);
      setItems((list) => list.map((x) => (x.id === projectId ? { ...x, name: updated.name } : x)));
      setOpen((o) => (o?.id === projectId ? { ...o, name: updated.name } : o));
      setRenamingId(null);
      setNotice('Project renamed.');
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  const act = async (p: Project, action: 'share' | 'revoke' | 'delete') => {
    setMenu(null);
    if (pending) return;
    setPending(p.id);
    try {
      if (action === 'share') {
        const { shareToken } = await api.share(p.id);
        setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, shareToken } : x)));
        setOpen((o) => (o?.id === p.id ? { ...o, shareToken } : o));
        const copied = await navigator.clipboard?.writeText(shareUrl(shareToken)).then(() => true, () => false);
        setNotice(copied ? 'Share link copied.' : `Share link: ${shareUrl(shareToken)}`);
      } else if (action === 'revoke') {
        await api.revokeShare(p.id);
        setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, shareToken: null } : x)));
        setOpen((o) => (o?.id === p.id ? { ...o, shareToken: null } : o));
        setNotice('Share link revoked.');
      } else {
        await api.deleteProject(p.id);
        setItems((xs) => xs.filter((x) => x.id !== p.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(p.id);
          return next;
        });
        setNotice('Project deleted.');
      }
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || pending) return;
    setPending('bulk-delete');
    try {
      const idsArray = Array.from(selectedIds);
      const { deletedIds, failedIds } = await api.deleteProjects(idsArray);
      setItems((list) => list.filter((p) => !deletedIds.includes(p.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      setBulkConfirm(false);
      if (failedIds.length > 0) {
        setNotice(`Deleted ${deletedIds.length} projects. ${failedIds.length} projects failed.`);
      } else {
        setNotice(`Successfully deleted ${deletedIds.length} project(s).`);
      }
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  const allSelected = shown.length > 0 && shown.every((p) => selectedIds.has(p.id));

  return (
    <>
      <div className="wrap">
        <p className="mt-6 text-[15px]">Your previous AquaVision enhancements.</p>

        {/* Toolbar & Filters */}
        <div className="mt-8 flex flex-col gap-4 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {shown.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-large cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-line bg-bg text-accent focus:ring-accent"
                />
                <span>Select all</span>
              </label>
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name"
              aria-label="Search projects"
              className="field max-w-xs !border-b-0"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-large">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as 'new' | 'old')} className="rounded-full border border-line bg-bg px-3 py-1.5 text-head">
              <option value="new">Newest</option>
              <option value="old">Oldest</option>
            </select>
          </label>
        </div>

        {/* Multi-Select Action Banner */}
        {selectedIds.size > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-accent/40 bg-surface/80 px-4 py-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-head">{selectedIds.size} selected</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-large hover:text-head underline">
                Clear selection
              </button>
            </div>
            <button
              onClick={() => setBulkConfirm(true)}
              disabled={!!pending}
              className="rounded-xl bg-error/10 border border-error/30 px-3.5 py-1.5 text-xs font-medium text-error hover:bg-error hover:text-white transition-colors"
            >
              Delete selected ({selectedIds.size})
            </button>
          </div>
        )}

        <p className="sr-only" aria-live="polite">{notice}</p>
        {notice && <p className="mt-4 text-sm text-accent">{notice}</p>}

        <div className="mt-6">
          {load === 'loading' && (
            <div role="status" className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
            </div>
          )}

          {load === 'error' && (
            <div className="py-20 text-center" role="alert">
              <p className="text-[24px] text-head">We couldn't load your projects.</p>
              <Pill className="mt-8" onClick={fetchAll}>Try again</Pill>
            </div>
          )}

          {load === 'ready' && shown.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-[32px] tracking-[-0.03em] text-head">No projects yet.</p>
              <p className="mt-3 text-body">Your enhanced underwater images will appear here.</p>
              <Pill to="/workspace" solid className="mt-8">Enhance your first image</Pill>
            </div>
          )}

          {load === 'ready' && shown.length > 0 && (
            <ul className="divide-y divide-line border-y border-line">
              {shown.map((p) => {
                const isSelected = selectedIds.has(p.id);
                const isRenaming = renamingId === p.id;

                return (
                  <li key={p.id} className={`group relative transition-colors ${isSelected ? 'bg-surface/60' : 'hover:bg-surface/30'}`}>
                    <div className="flex items-center gap-3.5 py-3 px-2 sm:px-4">
                      {/* Selection Checkbox */}
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        className="h-4 w-4 rounded border-line bg-bg text-accent focus:ring-accent cursor-pointer shrink-0"
                        aria-label={`Select ${p.name}`}
                      />

                      {/* Small Compact Thumbnail */}
                      <button
                        onClick={() => setOpen(p)}
                        className="relative h-11 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface cursor-pointer group-hover:border-accent/50 transition-colors"
                        aria-label={`Open ${p.name}`}
                      >
                        <Img src={p.enhancedUrl || p.originalUrl} alt={p.name} tone="murky" />
                        {p.shareToken && (
                          <span className="absolute bottom-0.5 right-0.5 rounded-full bg-accent h-2 w-2" title="Shared" />
                        )}
                      </button>

                      {/* Center Info / Rename Form */}
                      <div className="flex-1 min-w-0 pr-2">
                        {isRenaming ? (
                          <div className="flex items-center gap-2 max-w-sm">
                            <div className="flex items-center rounded-lg border border-accent bg-bg px-2.5 py-1 text-xs text-head flex-1 min-w-0">
                              <input
                                autoFocus
                                value={renameText}
                                onChange={(e) => setRenameText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRenameSubmit(p.id, renameExt);
                                  if (e.key === 'Escape') setRenamingId(null);
                                }}
                                className="w-full bg-transparent text-xs text-head outline-none"
                              />
                              {renameExt && <span className="text-xs text-large font-mono select-none pl-1 shrink-0">{renameExt}</span>}
                            </div>
                            <button
                              onClick={() => handleRenameSubmit(p.id, renameExt)}
                              disabled={pending === p.id}
                              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-bg hover:opacity-90 shrink-0"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setRenamingId(null)}
                              className="text-xs text-large hover:text-head px-1.5 py-1 shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div>
                            <button
                              onClick={() => setOpen(p)}
                              className="text-left font-medium text-head text-sm truncate block max-w-md hover:text-accent transition-colors"
                            >
                              {p.name}
                            </button>
                            <div className="flex items-center gap-2 text-xs text-large mt-0.5">
                              <span>{fmtDate(p.createdAt)}</span>
                              <span>·</span>
                              <span className={p.status === 'COMPLETED' ? 'text-accent' : p.status === 'FAILED' ? 'text-error' : 'text-large'}>
                                {p.status}
                              </span>
                              {p.shareToken && (
                                <>
                                  <span>·</span>
                                  <span className="text-accent text-[11px]">Shared</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right Action Menu */}
                      <div className="relative history-action-menu">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu(menu === p.id ? null : p.id);
                          }}
                          className="grid h-8 w-8 place-items-center rounded-lg text-large hover:bg-surface hover:text-head transition-colors"
                          aria-label={`Actions for ${p.name}`}
                          aria-expanded={menu === p.id}
                        >
                          <More />
                        </button>

                        {menu === p.id && !isRenaming && (
                          <ul className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-xl border border-line bg-bg p-1 text-xs shadow-xl" role="menu">
                            <li>
                              <button role="menuitem" className="w-full px-3 py-1.5 text-left rounded-lg hover:bg-surface hover:text-head" onClick={() => { setMenu(null); setOpen(p); }}>
                                Open
                              </button>
                            </li>
                            {p.enhancedUrl && (
                              <li>
                                <a role="menuitem" href={assetUrl(p.enhancedUrl)} download className="block px-3 py-1.5 rounded-lg hover:bg-surface hover:text-head">
                                  Download
                                </a>
                              </li>
                            )}
                            <li>
                              <button role="menuitem" className="w-full px-3 py-1.5 text-left rounded-lg hover:bg-surface hover:text-head" onClick={() => act(p, 'share')}>
                                Share
                              </button>
                            </li>
                            {p.shareToken && (
                              <li>
                                <button role="menuitem" className="w-full px-3 py-1.5 text-left rounded-lg hover:bg-surface hover:text-head" onClick={() => act(p, 'revoke')}>
                                  Revoke share
                                </button>
                              </li>
                            )}
                            <li>
                              <button
                                role="menuitem"
                                className="w-full px-3 py-1.5 text-left rounded-lg hover:bg-surface hover:text-head"
                                onClick={() => {
                                  const { stem, ext } = splitNameAndExt(p.name);
                                  setMenu(null);
                                  setRenamingId(p.id);
                                  setRenameText(stem);
                                  setRenameExt(ext);
                                }}
                              >
                                Rename
                              </button>
                            </li>
                            <li>
                              <button role="menuitem" className="w-full px-3 py-1.5 text-left rounded-lg text-error hover:bg-error/10" onClick={() => { setMenu(null); setConfirm(p); }}>
                                Delete
                              </button>
                            </li>
                          </ul>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Single Project Preview Modal */}
      <Modal open={!!open} onClose={() => setOpen(null)} label="Project viewer">
        {open && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-head font-medium">{open.name}</p>
              <button onClick={() => setOpen(null)} className="pill pill-sm">Close</button>
            </div>
            <CompareSlider toggle boxClass="aspect-[16/10] rounded-2xl" before={<Img src={open.originalUrl} alt="Original" tone="murky" />} after={<Img src={open.enhancedUrl} alt="Enhanced" tone="clear" />} />
            <div className="mt-6 flex flex-wrap gap-3">
              {open.enhancedUrl && <a href={assetUrl(open.enhancedUrl)} download className="pill pill-solid pill-sm">Download enhanced image</a>}
              <Pill small onClick={() => act(open, 'share')} disabled={pending === open.id}>{open.shareToken ? 'Copy share link' : 'Share'}</Pill>
              {open.shareToken && <Pill small onClick={() => act(open, 'revoke')} disabled={pending === open.id}>Revoke share</Pill>}
            </div>
          </>
        )}
      </Modal>

      {/* Single Project Delete Modal */}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} label="Delete project">
        <p className="text-[20px] text-head font-medium">Delete this project?</p>
        <p className="mt-2 text-sm text-body">This action cannot be undone.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Pill small onClick={() => setConfirm(null)}>Cancel</Pill>
          <button
            className="pill pill-sm !border-error !text-error hover:!bg-error hover:!text-white"
            disabled={!!pending}
            onClick={async () => {
              await act(confirm!, 'delete');
              setConfirm(null);
            }}
          >
            {pending === confirm?.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>

      {/* Bulk Delete Modal */}
      <Modal open={bulkConfirm} onClose={() => setBulkConfirm(false)} label="Delete selected projects">
        <p className="text-[20px] text-head font-medium">Delete {selectedIds.size} selected enhancements?</p>
        <p className="mt-2 text-sm text-body">This action cannot be undone.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Pill small onClick={() => setBulkConfirm(false)}>Cancel</Pill>
          <button
            className="pill pill-sm !border-error !text-error hover:!bg-error hover:!text-white"
            disabled={!!pending}
            onClick={handleBulkDelete}
          >
            {pending === 'bulk-delete' ? 'Deleting…' : `Delete ${selectedIds.size} projects`}
          </button>
        </div>
      </Modal>
    </>
  );
}
