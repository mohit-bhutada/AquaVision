import { useEffect, useState } from 'react';
import { api, splitNameAndExt, type Project } from '../lib/api';
import { useAccount } from '../lib/account';
import { TLink } from './Curtain';

export type WorkspaceSidebarProps = {
  activeProjectId: string | null;
  onSelectProject: (project: Project) => void;
  onNewEnhancement: () => void;
  onShareProject?: (project: Project) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  refreshTrigger?: number;
};

export function WorkspaceSidebar({
  activeProjectId,
  onSelectProject,
  onNewEnhancement,
  onShareProject,
  mobileOpen,
  onMobileClose,
  refreshTrigger = 0,
}: WorkspaceSidebarProps) {
  const { user, credits, subscription } = useAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renameExt, setRenameExt] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchProjects = () => {
    setLoadState('loading');
    api.workspaceSummary().then(
      (summary) => {
        setProjects(summary.recentProjects || []);
        setLoadState('ready');
      },
      (err) => {
        // Fallback to api.projects() if summary fails
        api.projects().then(
          (items) => {
            setProjects(items);
            setLoadState('ready');
          },
          (fallbackErr) => {
            setErrorMsg(fallbackErr.message || err.message || 'Unable to load history');
            setLoadState('error');
          }
        );
      }
    );
  };

  useEffect(() => {
    fetchProjects();
  }, [refreshTrigger]);

  useEffect(() => {
    const handleProjectsChanged = () => fetchProjects();
    window.addEventListener('aquavision:projects-changed', handleProjectsChanged);
    return () => window.removeEventListener('aquavision:projects-changed', handleProjectsChanged);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.project-action-menu')) {
        setActionMenuId(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return '12:00 AM';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '12:00 AM';
    }
  };

  const fmtDateShort = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  const handleRenameSubmit = async (projectId: string, ext: string) => {
    if (!renameText.trim()) return setRenamingId(null);
    setBusyId(projectId);
    try {
      const fullNewName = `${renameText.trim()}${ext}`;
      const updated = await api.renameProject(projectId, fullNewName);
      setProjects((list) => list.map((p) => (p.id === projectId ? { ...p, name: updated.name } : p)));
      setRenamingId(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConfirm = async (projectId: string) => {
    setBusyId(projectId);
    try {
      await api.deleteProject(projectId);
      setProjects((list) => list.filter((p) => p.id !== projectId));
      setDeletingId(null);
      if (activeProjectId === projectId) {
        onNewEnhancement();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeShare = async (projectId: string) => {
    setBusyId(projectId);
    try {
      await api.revokeShare(projectId);
      setProjects((list) => list.map((p) => (p.id === projectId ? { ...p, shareToken: null } : p)));
      setActionMenuId(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // Single Token Bar logic (Daily-First spending order)
  const dailyBal = credits?.daily.balance ?? 0;
  const dailyLimit = credits?.daily.limit ?? 10;
  const monthlyBal = credits?.monthly.balance ?? 0;
  const monthlyLimit = credits?.monthly.limit ?? 0;
  const isPaidPlan = subscription?.current.plan && subscription.current.plan !== 'FREE';

  const activePool = dailyBal > 0 ? 'DAILY' : monthlyBal > 0 ? 'MONTHLY' : 'DAILY';
  const activeBal = activePool === 'DAILY' ? dailyBal : monthlyBal;
  const activeMax = activePool === 'DAILY' ? Math.max(1, dailyLimit) : Math.max(1, monthlyLimit || activeBal);
  const activePct = Math.min(100, Math.max(0, (activeBal / activeMax) * 100));

  const planName = isPaidPlan ? `${subscription?.current.plan} Monthly` : null;

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col justify-between">
      {/* 1. Header & Navigation / History Section */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        {/* Desktop Sidebar Collapse Toggle */}
        <div className={`flex items-center pb-3 border-b border-line/60 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && <span className="text-xs font-semibold tracking-wider text-large uppercase">Workspace</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center h-8 w-8 text-large hover:text-head rounded-xl hover:bg-surface border border-line/40 transition-colors"
            title={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
          >
            <span className="text-sm font-bold select-none">{collapsed ? '→' : '←'}</span>
          </button>
        </div>

        {/* New Enhancement Button */}
        {!collapsed ? (
          <button
            onClick={() => {
              onNewEnhancement();
              onMobileClose();
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-head px-4 py-3 text-sm font-medium text-bg transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="text-lg leading-none">+</span>
            <span>New Enhancement</span>
          </button>
        ) : (
          <button
            onClick={() => {
              onNewEnhancement();
              onMobileClose();
            }}
            className="mt-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-head text-bg mx-auto transition-transform hover:scale-105"
            title="New Enhancement"
          >
            <span className="text-xl leading-none">+</span>
          </button>
        )}

        {/* Recent Enhancements List */}
        {!collapsed && (
          <>
            <div className="mt-5 flex items-center justify-between px-1">
              <p className="text-xs font-semibold tracking-wider text-large uppercase">Recent Enhancements</p>
              <span className="text-[11px] text-large">{projects.length}</span>
            </div>

            <div data-lenis-prevent className="mt-2.5 flex-1 min-h-0 overflow-y-auto pr-1 space-y-1">
              {loadState === 'loading' && (
                <div className="space-y-2 py-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-line-strong/30" />
                  ))}
                </div>
              )}

              {loadState === 'error' && (
                <div className="rounded-xl border border-line p-3 text-center text-xs">
                  <p className="text-error">{errorMsg}</p>
                  <button onClick={fetchProjects} className="mt-2 text-accent underline">
                    Retry
                  </button>
                </div>
              )}

              {loadState === 'ready' && projects.length === 0 && (
                <div className="py-6 text-center text-xs text-large">
                  <p className="font-medium text-head">No enhancements yet</p>
                  <p className="mt-1 text-body">Your enhanced images will appear here.</p>
                </div>
              )}

              {loadState === 'ready' &&
                projects.map((p) => {
                  const isActive = activeProjectId === p.id;
                  const isRenaming = renamingId === p.id;

                  return (
                    <div key={p.id} className="relative group project-action-menu">
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5 p-1.5 rounded-xl border border-accent bg-surface">
                          <input
                            autoFocus
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit(p.id, renameExt);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="w-full bg-transparent text-xs text-head outline-none px-1"
                          />
                          {renameExt && <span className="text-xs text-large font-mono select-none pr-1 shrink-0">{renameExt}</span>}
                          <button
                            onClick={() => handleRenameSubmit(p.id, renameExt)}
                            disabled={busyId === p.id}
                            className="text-[11px] text-accent font-medium px-1.5 py-0.5 rounded hover:bg-line shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`flex items-center justify-between rounded-xl p-2 text-xs transition-colors duration-150 ${
                            isActive ? 'bg-surface border border-accent/40 text-head' : 'hover:bg-surface/60 text-body hover:text-head'
                          }`}
                        >
                          <button
                            onClick={() => {
                              onSelectProject(p);
                              onMobileClose();
                            }}
                            className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
                          >
                            <div className={`h-2 w-2 rounded-full shrink-0 ${p.status === 'COMPLETED' ? 'bg-accent' : p.status === 'FAILED' ? 'bg-error' : 'bg-large animate-pulse'}`} />
                            <div className="flex-1 overflow-hidden">
                              <p className="truncate font-medium">{p.name || 'Untitled Project'}</p>
                              <p className="text-[10px] text-large">{fmtDateShort(p.createdAt)}</p>
                            </div>
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenuId(actionMenuId === p.id ? null : p.id);
                            }}
                            className="p-1 rounded-lg text-large hover:text-head hover:bg-line/40 transition-colors"
                            aria-label="Project actions"
                          >
                            •••
                          </button>
                        </div>
                      )}

                      {/* Dropdown Action Menu */}
                      {actionMenuId === p.id && !isRenaming && (
                        <div className="absolute right-0 top-full z-30 mt-1 w-36 overflow-hidden rounded-xl border border-line bg-bg p-1 shadow-xl text-xs">
                          <button
                            onClick={() => {
                              setActionMenuId(null);
                              onSelectProject(p);
                              onShareProject?.(p);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body hover:bg-surface hover:text-head"
                          >
                            <span>Share</span>
                          </button>

                          {p.shareToken && (
                            <button
                              onClick={() => handleRevokeShare(p.id)}
                              disabled={busyId === p.id}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body hover:bg-surface hover:text-head"
                            >
                              <span>Revoke Share</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              const { stem, ext } = splitNameAndExt(p.name);
                              setActionMenuId(null);
                              setRenamingId(p.id);
                              setRenameText(stem);
                              setRenameExt(ext);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body hover:bg-surface hover:text-head"
                          >
                            <span>Rename</span>
                          </button>

                          <button
                            onClick={() => {
                              setActionMenuId(null);
                              setDeletingId(p.id);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-error hover:bg-error/10"
                          >
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            <div className="mt-2 border-t border-line/60 pt-2">
              <TLink
                to="/history"
                onClick={onMobileClose}
                className="flex items-center justify-between rounded-xl px-2 py-1 text-xs text-body hover:text-head"
              >
                <span>View All History</span>
                <span>→</span>
              </TLink>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deletingId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-line bg-bg p-5 text-center">
            <h3 className="text-base font-semibold text-head">Delete Enhancement?</h3>
            <p className="mt-2 text-xs text-body">This action cannot be undone.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 rounded-xl border border-line py-2 text-xs font-medium text-head hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConfirm(deletingId)}
                disabled={busyId === deletingId}
                className="flex-1 rounded-xl bg-error py-2 text-xs font-medium text-white hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Single Token Balance Panel (Fixed Near Bottom) */}
      {!collapsed ? (
        <div className="mt-3 border-t border-line pt-3 space-y-2.5">
          {/* Title & Active Pool Counter */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-large uppercase tracking-wider">Tokens</span>
            <span className="font-medium text-head">
              {activeBal} / {activePool === 'DAILY' ? dailyLimit : (monthlyLimit || activeBal)}
            </span>
          </div>

          {/* EXACTLY ONE Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-strong/30" aria-label="Tokens remaining">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
              style={{ width: `${activePct}%` }}
            />
          </div>

          {/* Sub-labels for Daily-first spending order */}
          <div className="text-[10px] space-y-0.5">
            {activePool === 'DAILY' ? (
              <p className="text-body font-medium">
                Daily free tokens · Resets at {credits ? fmtTime(credits.daily.resetsAt) : '12:00 AM'}
              </p>
            ) : (
              <p className="text-body font-medium">
                Monthly plan tokens ({planName || 'Plan'}) · Active pool
              </p>
            )}

            {activePool === 'DAILY' ? (
              isPaidPlan && monthlyLimit > 0 ? (
                <p className="text-large">Monthly plan tokens · {monthlyBal} remaining</p>
              ) : (
                <p className="text-large">Monthly plan tokens · No monthly token pool</p>
              )
            ) : (
              <p className="text-large">
                Daily free tokens · 0 remaining (Resets at {credits ? fmtTime(credits.daily.resetsAt) : '12:00 AM'})
              </p>
            )}
          </div>

          {/* 3. Account Area (Fixed at Very Bottom) */}
          <div className="border-t border-line/60 pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-7 w-7 rounded-full bg-surface border border-line flex items-center justify-center font-bold text-xs text-head shrink-0">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 overflow-hidden text-xs">
                <p className="truncate font-medium text-head">{user?.name || user?.email || 'User'}</p>
                <p className="truncate text-[10px] text-large">{subscription?.current.plan || 'FREE'} Plan</p>
              </div>
            </div>
            <TLink to="/profile" className="text-[11px] text-body hover:text-head underline">
              Account
            </TLink>
          </div>
        </div>
      ) : (
        <div className="mt-auto border-t border-line pt-3 flex flex-col items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-surface border border-line flex items-center justify-center font-bold text-xs text-head">
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Left Sidebar Column */}
      <aside
        className={`hidden shrink-0 border-r border-line bg-surface/30 backdrop-blur-md transition-all duration-300 lg:block lg:h-full ${
          collapsed ? 'w-16 p-3' : 'w-[280px] p-5'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Slide-Out Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
          {/* Drawer content */}
          <aside className="fixed inset-y-0 left-0 z-50 w-[300px] max-w-[85vw] bg-bg border-r border-line p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-3">
              <span className="font-semibold text-head text-xs tracking-wider uppercase">Menu</span>
              <button
                onClick={onMobileClose}
                className="text-sm text-large hover:text-head p-1"
                aria-label="Close sidebar"
              >
                ✕
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)] overflow-hidden">
              {sidebarContent}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
