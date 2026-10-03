import { InnerHero, PublicShell } from '../components/Layout';
import { ClipReveal, Reveal } from '../components/Reveal';
import { ArrowUpRight } from '../components/Icons';
import { PillArrow, Placeholder, Roll, TiltCard, type Tone } from '../components/Ui';
import { useAccount } from '../lib/account';

type Member = { name: string; role: string; initials: string; tone: Tone; photo?: string; linkedin?: string; links: [label: string, href: string][] };

const TEAM: Member[] = [
  { name: 'Mohit Bhutada', role: 'Full-Stack Development, DevOps & Cloud, Database Management', initials: 'MB', tone: 'deep', photo: '/team/Mohit.png', linkedin: 'https://www.linkedin.com/in/mohit-bhutada1', links: [['Website', 'https://mohitbhutada.com']] },
  { name: 'Sumit Jadhav', role: 'Frontend Development, Machine Learning, UI/UX', initials: 'SJ', tone: 'deep', photo: '/team/Sumit.png', linkedin: 'https://www.linkedin.com/in/sumit-jadhav-1703s', links: [['Website', 'https://mac-os-portfolio-self-nine.vercel.app']] },
  { name: 'Sudhanshu Bhagwat', role: 'Machine Learning, Deep Learning, Image Processing', initials: 'SB', tone: 'deep', photo: '/team/Sudhanshu.png', linkedin: 'https://www.linkedin.com/in/sudhanshu-bhagwat-479424288', links: [] },
];

function LinkedInIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

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
                  {m.linkedin && m.linkedin.startsWith('https://') && (
                    <a
                      href={m.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${m.name} on LinkedIn`}
                      className="ulink mt-3 inline-flex items-center gap-2 text-sm text-head"
                    >
                      <LinkedInIcon /> LinkedIn <ArrowUpRight size={14} />
                    </a>
                  )}
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