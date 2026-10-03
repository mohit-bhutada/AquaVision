import { useEffect, useRef, useState } from 'react';
import { CompareSlider } from '../components/CompareSlider';
import { TLink, useGo } from '../components/Curtain';
import { Upload } from '../components/Icons';
import { AppShell } from '../components/Layout';
import { CopyButton, Modal, Pill, Placeholder } from '../components/Ui';
import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import { api, ApiError, assetUrl, shareUrl, type Project } from '../lib/api';
import { useDevState } from '../lib/devState';
import { useAccount } from '../lib/account';

type State = 'empty' | 'selected' | 'processing' | 'complete' | 'error';
const STEPS = ['Upload', 'Process', 'Enhance', 'Compare', 'Download'];
const STEP_OF: Record<State, number> = { empty: 0, selected: 0, processing: 1, complete: 3, error: 1 };
const MAX = 20 * 1024 * 1024;
// The enhancement engine only accepts JPEG and PNG, up to 2,073,600 pixels (e.g. 1920×1080) and 4,096 px per side.
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png'];
const MAX_PIXELS = 2_073_600;
const MAX_SIDE = 4096;

type Picked = { file: File; url: string; width: number; height: number };

const fmtSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export default function Workspace() {
  const go = useGo();
  const dev = useDevState(['empty', 'selected', 'processing', 'complete', 'error'] as const);
  const [state, setState] = useState<State>(dev ?? 'empty');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<Project | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState(0);
  const [error, setError] = useState<{ msg: string; noCredits: boolean } | null>(
    dev === 'error' ? { msg: 'Something went wrong while enhancing your image.', noCredits: false } : null,
  );
  const [fileError, setFileError] = useState('');
  const [drag, setDrag] = useState(false);
  const [share, setShare] = useState<{ open: boolean; link: string; busy: boolean; err: string }>({ open: false, link: '', busy: false, err: '' });
  const input = useRef<HTMLInputElement>(null);
  const { refreshCredits } = useAccount();
  const busy = useRef(false);

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener('dragover', preventDefaults);
    window.addEventListener('drop', preventDefaults);
    return () => {
      window.removeEventListener('dragover', preventDefaults);
      window.removeEventListener('drop', preventDefaults);
    };
  }, []);

  const pick = (file?: File) => {
    setFileError('');
    if (!file) return;
    const typeLower = (file.type || '').toLowerCase();
    const extLower = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase() : '';
    const isValid = ALLOWED_TYPES.includes(typeLower) || ALLOWED_EXTS.includes(extLower);
    if (!isValid) return setFileError('Unsupported file type. Please upload a JPEG or PNG image.');
    if (file.size > MAX) return setFileError('This file is larger than 20 MB.');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
        URL.revokeObjectURL(url);
        return setFileError(
          `This image is ${w}×${h}. The maximum is ${MAX_PIXELS.toLocaleString('en-US')} pixels (for example 1920×1080). Please resize it and try again.`,
        );
      }
      setPicked({ file, url, width: w, height: h });
      setState('selected');
    };
    img.onerror = () => setFileError('This image could not be read.');
    img.src = url;
  };

  const enhance = async () => {
    if (!picked || busy.current) return;
    busy.current = true;
    setState('processing');
    setError(null);
    try {
      const { project, credits } = await api.enhance(picked.file);
      setResult(project);
      setActiveProjectId(project.id);
      refreshCredits(credits); // the backend returns the balance after this enhancement
      setState('complete');
      setRefreshSidebarTrigger((n) => n + 1);
    } catch (err) {
      const e = err as ApiError;
      setError({ msg: e.message || 'Something went wrong while enhancing your image.', noCredits: e.code === 'INSUFFICIENT_CREDITS' || e.status === 402 });
      setState('error');
      refreshCredits();
    } finally {
      busy.current = false;
    }
  };

  const reset = () => {
    setPicked(null);
    setResult(null);
    setError(null);
    setState('empty');
    setActiveProjectId(null);
  };

  const handleSelectProject = (project: Project) => {
    setResult(project);
    setActiveProjectId(project.id);
    if (project.originalUrl) {
      setPicked({
        file: null as any,
        url: assetUrl(project.originalUrl),
        width: project.width || 800,
        height: project.height || 600,
      });
    } else {
      setPicked(null);
    }
    setState('complete');
    setError(null);
  };

  const openShareModal = async (project: Project) => {
    if (share.busy) return;
    setShare({ open: true, link: '', busy: true, err: '' });
    try {
      const { shareToken } = await api.share(project.id);
      setShare({ open: true, link: shareUrl(shareToken), busy: false, err: '' });
    } catch (err) {
      setShare({ open: true, link: '', busy: false, err: (err as Error).message });
    }
  };

  const preview = picked ? <img src={assetUrl(picked.url)} alt="Selected underwater image" className="h-full w-full object-contain" /> : <Placeholder tone="murky" label="Preview placeholder" className="h-full w-full" />;

  return (
    <AppShell className="lg:h-[calc(100vh-4rem)] lg:overflow-hidden lg:pb-0">
      <div className="flex h-full min-h-0 flex-col lg:flex-row lg:items-stretch lg:overflow-hidden">
        <WorkspaceSidebar
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onNewEnhancement={reset}
          onShareProject={openShareModal}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          refreshTrigger={refreshSidebarTrigger}
        />

        <div data-lenis-prevent className="min-w-0 flex-1 min-h-0 lg:h-full lg:overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            {/* Mobile History & Tokens trigger */}
            <div className="mb-4 flex items-center justify-between lg:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-large">Workspace</span>
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-head shadow-sm hover:border-accent"
              >
                <span>History & Tokens</span>
              </button>
            </div>

            {/* Main Workspace Initial Heading & Instruction */}
            {state === 'empty' && (
              <div className="mb-6">
                <h1 className="text-[36px] font-normal leading-[1.05] tracking-[-0.03em] md:text-[54px] lg:text-[64px] text-head">
                  Enhance your <span className="serif italic font-normal">underwater images.</span>
                </h1>
                <p className="mt-3 text-[15px] text-body">Upload an underwater image to begin.</p>
              </div>
            )}

            {/* Selected Image State Header */}
            {state === 'selected' && (
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[24px] font-medium tracking-[-0.02em] text-head">Selected image</h2>
                <button
                  onClick={reset}
                  className="text-xs text-large hover:text-head underline"
                >
                  Choose another image
                </button>
              </div>
            )}

            <ol className="flex flex-wrap gap-x-6 gap-y-2 border-y border-line py-4 text-sm" aria-label="Progress">
              {STEPS.map((s, i) => (
                <li key={s} className={i === STEP_OF[state] ? 'font-medium text-head' : 'text-large'} aria-current={i === STEP_OF[state] ? 'step' : undefined}>
                  {s}
                </li>
              ))}
            </ol>

            <div className="mt-8" aria-live="polite">
              {state === 'empty' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDrag(true);
                  }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDrag(false);
                    pick(e.dataTransfer.files[0]);
                  }}
                  className={`grid min-h-[400px] place-items-center rounded-3xl border border-dashed p-8 text-center transition-colors duration-300 ${drag ? 'border-accent bg-surface' : 'border-line-strong'}`}
                >
                  <div>
                    <Upload size={32} className={`mx-auto ${drag ? 'text-accent' : 'text-large'}`} />
                    <p className="mt-5 text-[22px] text-head">Drag and drop your image here</p>
                    <Pill className="mt-6" onClick={() => input.current?.click()}>Upload image</Pill>
                    <p className="mt-5 text-sm text-large">JPEG, PNG · max 20 MB · up to 1920×1080</p>
                    {fileError && <p className="mt-4 text-sm text-error" role="alert">{fileError}</p>}
                  </div>
                  <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Upload image" onChange={(e) => pick(e.target.files?.[0])} />
                </div>
              )}

              {(state === 'selected' || state === 'processing') && (
                <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-line bg-surface flex items-center justify-center p-2">
                    <div className={state === 'processing' ? 'h-full w-full opacity-40' : 'h-full w-full'}>{preview}</div>
                    {state === 'processing' && (
                      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
                        <div className="absolute inset-y-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent)', animation: 'sweep 2.2s cubic-bezier(.6,0,.3,1) infinite' }} />
                      </div>
                    )}
                  </div>
                  <aside className="flex flex-col gap-6">
                    {state === 'processing' ? (
                      <div role="status">
                        <p className="text-[28px] tracking-[-0.03em] text-head">Enhancing…</p>
                        <p className="mt-2 text-[15px]">Your image is being processed by AquaVision.</p>
                      </div>
                    ) : (
                      <dl className="space-y-3 text-[15px]">
                        <div><dt className="text-sm text-large">File</dt><dd className="break-all text-head font-medium">{picked?.file ? picked.file.name : 'underwater-sample.jpg'}</dd></div>
                        <div><dt className="text-sm text-large">Resolution</dt><dd className="text-head font-medium">{picked ? `${picked.width} × ${picked.height}` : '–'}</dd></div>
                        <div><dt className="text-sm text-large">Size</dt><dd className="text-head font-medium">{picked?.file ? fmtSize(picked.file.size) : '–'}</dd></div>
                      </dl>
                    )}
                    <div className="mt-auto flex flex-col gap-3">
                      <Pill solid onClick={enhance} disabled={state === 'processing' || !picked}>Enhance</Pill>
                      <div className="grid grid-cols-2 gap-3">
                        <Pill small onClick={() => input.current?.click()} disabled={state === 'processing'}>Replace</Pill>
                        <Pill small onClick={reset} disabled={state === 'processing'}>Remove</Pill>
                      </div>
                      <input ref={input} type="file" accept="image/jpeg,image/png" className="sr-only" aria-label="Replace image" onChange={(e) => pick(e.target.files?.[0])} />
                      {fileError && <p className="text-sm text-error" role="alert">{fileError}</p>}
                    </div>
                  </aside>
                </div>
              )}

              {state === 'complete' && (
                <div>
                  <p className="mb-6 text-[28px] tracking-[-0.03em] text-head" role="status">
                    {result?.name || 'Enhancement complete'}
                  </p>
                  <div className="overflow-hidden rounded-3xl">
                    <CompareSlider
                      toggle
                      boxClass="aspect-[16/10] rounded-3xl"
                      before={picked ? <img src={assetUrl(picked.url)} alt="Original" className="h-full w-full object-cover" /> : <Placeholder tone="murky" className="h-full w-full" />}
                      after={result?.enhancedUrl ? <img src={assetUrl(result.enhancedUrl)} alt="AquaVision enhanced" className="h-full w-full object-cover" /> : <Placeholder tone="clear" className="h-full w-full" />}
                    />
                  </div>
                  <div className="mt-8 flex flex-wrap gap-3">
                    {result?.enhancedUrl ? (
                      <a href={assetUrl(result.enhancedUrl)} download className="pill pill-solid" data-magnetic>Download enhanced image</a>
                    ) : (
                      <Pill solid disabled>Download enhanced image</Pill>
                    )}
                    <Pill
                      onClick={async () => {
                        if (share.busy) return;
                        setShare({ open: true, link: '', busy: true, err: '' });
                        try {
                          const { shareToken } = await api.share(result!.id);
                          setShare({ open: true, link: shareUrl(shareToken), busy: false, err: '' });
                        } catch (err) {
                          setShare({ open: true, link: '', busy: false, err: (err as Error).message });
                        }
                      }}
                    >
                      Share
                    </Pill>
                    <Pill onClick={reset}>Enhance another image</Pill>
                    <Pill to="/history">View history</Pill>
                  </div>
                </div>
              )}

              {state === 'error' && error && (
                <div className="rounded-3xl border border-line p-10 text-center" role="alert">
                  <p className="text-[24px] text-head">{error.noCredits ? "You've used your available credits." : error.msg}</p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    {error.noCredits ? (
                      <Pill solid onClick={() => go('/subscriptions')}>View plans</Pill>
                    ) : (
                      <Pill solid onClick={enhance} disabled={!picked}>Try again</Pill>
                    )}
                    <Pill onClick={reset}>Choose another image</Pill>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal open={share.open} onClose={() => setShare((s) => ({ ...s, open: false }))} label="Share project">
        <p className="text-[22px] text-head">Share project</p>
        {share.busy && <p className="mt-4" role="status">Creating a secure link…</p>}
        {share.err && <p className="mt-4 text-error" role="alert">{share.err}</p>}
        {share.link && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input readOnly value={share.link} className="field flex-1" aria-label="Share link" onFocus={(e) => e.target.select()} />
            <CopyButton text={share.link} />
            <Pill
              small
              disabled={share.busy}
              onClick={async () => {
                setShare((s) => ({ ...s, busy: true, err: '' }));
                try {
                  await api.revokeShare(result!.id);
                  setShare({ open: false, link: '', busy: false, err: '' });
                } catch (err) {
                  setShare((s) => ({ ...s, busy: false, err: (err as Error).message }));
                }
              }}
            >
              Revoke link
            </Pill>
          </div>
        )}
        <div className="mt-8 flex justify-between text-sm">
          <TLink to="/history" className="ulink text-body">Manage shares in History</TLink>
          <button onClick={() => setShare((s) => ({ ...s, open: false }))} className="text-large hover:text-head">Close</button>
        </div>
      </Modal>
    </AppShell>
  );
}