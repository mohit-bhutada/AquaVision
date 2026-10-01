import { useEffect } from 'react';
import { InnerHero, PublicShell } from '../components/Layout';
import { Reveal } from '../components/Reveal';
import { TLink } from '../components/Curtain';
import { useAccount } from '../lib/account';

export default function Terms() {
  const { status } = useAccount();
  const tryAquaVisionPath = status === 'in' ? '/workspace' : '/login';

  useEffect(() => {
    document.title = 'Terms of Service | AquaVision';
  }, []);

  return (
    <PublicShell>
      <InnerHero
        lines={['Terms of', <span className="serif">Service.</span>]}
        aside="The terms, conditions, and guidelines governing your access to and use of AquaVision."
        compact
      />
      <section className="wrap pb-32 md:pb-44">
        <Reveal className="mx-auto max-w-4xl space-y-12 text-[16px] leading-relaxed text-body">
          {/* Metadata banner */}
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <p className="text-sm text-large">
              <strong className="text-head">Effective Date:</strong> October 1, 2026
            </p>
            <p className="mt-2 text-sm text-large">
              <strong className="text-head">Platform:</strong> AquaVision Underwater Image Enhancement
            </p>
          </div>

          {/* 1. Acceptance of Terms */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing, registering for, or using AquaVision (&quot;the Service&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, you may not access or use AquaVision.
            </p>
          </div>

          {/* 2. Description of Service */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">2. Description of Service</h2>
            <p>
              AquaVision is an AI-powered web platform designed to restore color, improve contrast, and enhance clarity in underwater photographs. The Service includes user account management, image uploading, machine learning enhancement processing, project history management, asset downloading, and optional public link sharing.
            </p>
          </div>

          {/* 3. User Accounts & Registration */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">3. User Accounts &amp; Registration</h2>
            <ul className="list-disc space-y-2 pl-6 text-body">
              <li>
                <strong className="text-head">Account Registration:</strong> You may register an account using your email address (verified via One-Time Password) or via Google OAuth 2.0.
              </li>
              <li>
                <strong className="text-head">Account Security:</strong> You are responsible for maintaining the confidentiality of your login session credentials and for all activities that occur under your account.
              </li>
              <li>
                <strong className="text-head">Account Accuracy:</strong> You agree to provide accurate and current account information.
              </li>
            </ul>
          </div>

          {/* 4. Acceptable Use Policy */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">4. Acceptable Use Policy</h2>
            <p>You agree not to misuse AquaVision. Specifically, you agree that you will not:</p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-body">
              <li>Upload malicious code, viruses, corrupted files, or files containing malware.</li>
              <li>Upload images or content that violates applicable local, national, or international laws.</li>
              <li>Attempt to bypass authentication mechanisms, rate limits, access controls, or system security measures.</li>
              <li>Use automated scripts, bots, or scrapers to access the Service in an unauthorized manner.</li>
              <li>Interfere with or disrupt the operation of our servers, network edge, or machine learning infrastructure.</li>
            </ul>
          </div>

          {/* 5. Uploaded Content & Intellectual Property Ownership */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">5. Uploaded Content &amp; Intellectual Property</h2>
            <ul className="list-disc space-y-2 pl-6 text-body">
              <li>
                <strong className="text-head">User Ownership:</strong> You retain full copyright and intellectual property ownership of all original underwater photographs uploaded by you to AquaVision, as well as the resulting enhanced output files.
              </li>
              <li>
                <strong className="text-head">Limited Service License:</strong> By uploading media to AquaVision, you grant us a worldwide, non-exclusive, royalty-free, limited license solely to host, process, format, and store your images as required to deliver the enhancement service to you and display them in your account.
              </li>
              <li>
                <strong className="text-head">No Public Distribution:</strong> We do not publish, sell, or publicly distribute your uploaded images without your explicit instruction (such as when you choose to generate a public share link).
              </li>
            </ul>
          </div>

          {/* 6. AI Processing & Result Disclaimers */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">6. AI Processing &amp; Enhancement Results</h2>
            <p>
              AquaVision processes images using deep learning neural networks trained for underwater color restoration.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-body">
              <li>
                <strong className="text-head">Variability of Results:</strong> Enhancement results depend on the quality, water clarity, lighting, depth, and color degradation of the original photograph. We do not guarantee specific aesthetic or forensic outcomes for every image.
              </li>
              <li>
                <strong className="text-head">As-Is Processing:</strong> Image enhancement outputs are provided on an &quot;as-is&quot; basis.
              </li>
            </ul>
          </div>

          {/* 7. Credits, Subscriptions & Token Usage */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">7. Credits, Subscriptions &amp; Token Usage</h2>
            <p>Access to image processing is governed by our credit system:</p>
            <ul className="mt-4 list-disc space-y-2 pl-6 text-body">
              <li>
                <strong className="text-head">Daily &amp; Monthly Balances:</strong> Accounts receive token allocations based on their plan (Free, Pro, Premium). Daily tokens reset automatically each calendar day.
              </li>
              <li>
                <strong className="text-head">Credit Consumption:</strong> One credit is deducted per completed image enhancement. If processing or storage insertion fails, reserved credits are automatically refunded to your balance.
              </li>
              <li>
                <strong className="text-head">Plan Upgrades:</strong> Subscription tier upgrade requests are processed and reviewed according to platform availability.
              </li>
            </ul>
          </div>

          {/* 8. Public Link Sharing & Revocation */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">8. Public Link Sharing &amp; Revocation</h2>
            <p>
              When you generate a public share link for a project, a unique public access URL is created. Anyone with access to the link can view and download the original and enhanced assets. You are solely responsible for managing the sharing of your links. You may revoke a share token at any time, immediately ending public access.
            </p>
          </div>

          {/* 9. Account Suspension & Termination */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">9. Account Suspension &amp; Termination</h2>
            <p>
              We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, attempt system security exploitation, or abuse platform resources. Suspended accounts lose access to processing features and account data.
            </p>
          </div>

          {/* 10. Disclaimers of Warranties */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">10. Disclaimers of Warranties</h2>
            <p>
              AQUAVISION IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE AT ALL TIMES.
            </p>
          </div>

          {/* 11. Limitation of Liability */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, AQUAVISION AND ITS DEVELOPERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, LOSS OF PROFITS, OR LOSS OF BUSINESS OPPORTUNITY, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
            </p>
          </div>

          {/* 12. Changes to Terms */}
          <div>
            <h2 className="text-[28px] font-medium tracking-tight text-head mb-4">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify or replace these Terms at any time. Updated Terms will be posted on this page with a revised effective date. Continued use of AquaVision after changes become effective constitutes acceptance of the updated Terms.
            </p>
          </div>

          {/* 13. Contact Information */}
          <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
            <h2 className="text-[24px] font-medium tracking-tight text-head mb-3">13. Contact Information</h2>
            <p className="text-body">
              If you have any questions or inquiries regarding these Terms of Service, please contact us at:
            </p>
            <p className="mt-4 font-mono text-head">
              [AquaVision Contact Email]
            </p>
          </div>

          {/* Back link */}
          <div className="border-t border-line pt-8">
            <TLink to={tryAquaVisionPath} className="ulink is-on inline-flex items-center gap-2 text-head">
              ← Back to AquaVision
            </TLink>
          </div>
        </Reveal>
      </section>
    </PublicShell>
  );
}
