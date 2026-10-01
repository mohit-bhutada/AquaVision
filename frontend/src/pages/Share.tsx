import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CompareSlider } from '../components/CompareSlider';
import { InnerHero, PublicShell } from '../components/Layout';
import { Pill, Placeholder } from '../components/Ui';
import { api, assetUrl, type SharedProject } from '../lib/api';
import { useDevState } from '../lib/devState';
import { useAccount } from '../lib/account';

/** Public, read-only. Shows only project name, date and the two images — never account data. */
export default function Share() {
  const { token = '' } = useParams();
  const dev = useDevState(['loading', 'ok', 'unavailable'] as const);
  const [data, setData] = useState<SharedProject | null | 'error'>(dev === 'ok' ? { name: 'Sample project', createdAt: new Date().toISOString(), originalUrl: '', enhancedUrl: '' } : dev === 'unavailable' ? 'error' : null);
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';

  useEffect(() => {
    if (dev) return;
    api.shared(token).then(setData, () => setData('error'));
  }, [token, dev]);

  if (data === 'error')
    return (
      <PublicShell footer={false}>
        <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 text-center">
          {[0, 1, 2].map((i) => (
            <span key={i} className="absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border border-line" style={{ animation: `sonar 4s ease-out ${i * 1.3}s infinite` }} aria-hidden="true" />
          ))}
          <div className="relative" role="alert">
            <h1 className="text-[32px] leading-tight md:text-[48px]">This shared project is no longer available.</h1>
            <Pill to="/" className="mt-10">Back to AquaVision</Pill>
          </div>
        </div>
      </PublicShell>
    );

  const img = (src: string, alt: string, tone: 'murky' | 'clear') => (src ? <img src={assetUrl(src)} alt={alt} className="h-full w-full object-cover" /> : <Placeholder tone={tone} label="" className="h-full w-full" />);

  return (
    <PublicShell footer={false}>
      <InnerHero
        lines={['Shared', <span className="serif">AquaVision project.</span>]}
        aside={data ? <p className="text-head">{data.name} · {new Date(data.createdAt).toLocaleDateString()}</p> : <span className="skeleton inline-block h-4 w-48 rounded" />}
      />
      <div className="wrap">
        {data ? (
          <>
            <CompareSlider toggle boxClass="aspect-[16/10] rounded-3xl" beforeLabel="Original" afterLabel="Enhanced" before={img(data.originalUrl, 'Original', 'murky')} after={img(data.enhancedUrl, 'Enhanced', 'clear')} />
            <div className="mt-8 flex flex-wrap items-center justify-between gap-6">
              {data.enhancedUrl ? <a href={assetUrl(data.enhancedUrl)} download className="pill pill-solid">Download enhanced image</a> : <Pill solid disabled>Download enhanced image</Pill>}
              <Pill to={tryAquaVisionPath} small>Try AquaVision</Pill>
            </div>
          </>
        ) : (
          <div className="skeleton aspect-[16/10] rounded-3xl" role="status" aria-label="Loading shared project" />
        )}
        <p className="mb-28 mt-16 border-t border-line pt-6 text-sm text-large">Enhanced with AquaVision — AI-powered underwater image enhancement.</p>
      </div>
    </PublicShell>
  );
}
