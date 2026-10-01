import { InnerHero, PublicShell } from '../components/Layout';
import { ClipReveal, Reveal } from '../components/Reveal';
import { ArrowUpRight } from '../components/Icons';
import { PillArrow, Placeholder, Roll, TiltCard, type Tone } from '../components/Ui';
import { useAccount } from '../lib/account';

type Member = { name: string; role: string; initials: string; tone: Tone; photo?: string; links: [label: string, href: string][] };

// Placeholders: replace with real names, roles and links. A photo goes in /public/team/<n>.jpg → photo: '/team/1.jpg'.
const TEAM: Member[] = [
  { name: 'Mohit Bhutada', role: 'DevOps and Cloud Engineer', initials: 'MB', tone: 'deep', photo: '/team/Mohit.png', links: [] },
  { name: 'Sumit Jadhav', role: 'Frontend Developer/Machine Learning', initials: 'SJ', tone: 'deep', photo: '/team/Sumit.png', links: [] },
  { name: 'Sudhanshu Bhagwat', role: 'Machine Learning Engineer', initials: 'SB', tone: 'deep', photo: '/team/Sudhanshu.png', links: [] },
];

export default function Team() {
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';

  return (
    <PublicShell>
      <InnerHero
        lines={['The people behind', <span className="serif">AquaVision.</span>]}
        aside="Three builders working on AI-based underwater image enhancement, from the model to the web app."
      />
      <section className="wrap pb-32 md:pb-44">
        <Reveal stagger className="grid gap-6 md:grid-cols-3">
          {TEAM.map((m) => (
            <TiltCard key={m.name} className="group roll-host rounded-2xl">
              <ClipReveal className="rounded-2xl">
                <Placeholder tone={m.tone} label="Aquavision Developer" className="aspect-[4/5] w-full">
                  {m.photo ? (
                    <img src={m.photo} alt={m.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]" />
                  ) : (
                    <span className="drift absolute inset-0 grid place-items-center" aria-hidden="true">
                      <span className="serif text-[120px] leading-none text-white/85 transition-transform duration-700 group-hover:scale-110 md:text-[140px]" style={{ transitionTimingFunction: 'var(--ease)' }}>
                        {m.initials}
                      </span>
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />
                </Placeholder>
              </ClipReveal>
              <div className="flex items-start justify-between gap-4 pt-5">
                <div>
                  <p className="text-[22px] tracking-[-0.02em] text-head">
                    <Roll>{m.name}</Roll>
                  </p>
                  <p className="mt-1 text-[15px]">{m.role}</p>
                </div>
                {m.links.length > 0 && (
                  <ul className="flex gap-3 pt-1 text-sm">
                    {m.links.map(([label, href]) => (
                      <li key={href}>
                        <a href={href} target="_blank" rel="noreferrer" className="ulink inline-flex items-center gap-1 text-head">
                          {label} <ArrowUpRight size={14} />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TiltCard>
          ))}
        </Reveal>
        <Reveal className="mt-24 flex flex-col items-start justify-between gap-8 border-t border-line pt-10 md:flex-row md:items-center">
          <p className="text-[28px] leading-tight tracking-[-0.03em] text-head md:text-[40px]">
            Want to see what we <span className="serif">built?</span>
          </p>
          <PillArrow to={tryAquaVisionPath}>Try AquaVision</PillArrow>
        </Reveal>
      </section>
    </PublicShell>
  );
}
