import type { Metadata } from 'next';
import { LegalLayout, LegalSection, LegalList } from '@/components/LegalLayout';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms for using Link Protect.',
};

const strong = (t: string) => <strong style={{ color: '#f2f3f5', fontWeight: 600 }}>{t}</strong>;

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="June 23, 2026"
      intro="These terms govern your use of the Link Protect Discord bot, website and iOS app. By adding the bot to a server or signing in, you agree to them."
    >
      <LegalSection heading="The service">
        <p>
          Link Protect is a free Discord moderation tool that automatically detects and blocks
          unwanted links, warns users, and provides a dashboard and companion app to configure these
          protections for servers you manage.
        </p>
      </LegalSection>

      <LegalSection heading="Eligibility">
        <p>
          You must meet Discord’s minimum age requirement and comply with the{' '}
          <a href="https://discord.com/terms" target="_blank" rel="noreferrer" style={{ color: '#5865f2', textDecoration: 'none' }}>
            Discord Terms of Service
          </a>{' '}
          to use Link Protect. To configure a server, you need the “Manage Server” permission on it.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <LegalList
          items={[
            <>Use the Service only for legitimate moderation of servers you are authorized to manage.</>,
            <>Do {strong('not')} attempt to abuse, disrupt, reverse-engineer, overload, or gain unauthorized access to the Service or its infrastructure.</>,
            <>You are {strong('responsible for your own configuration')} — the thresholds, blockers and whitelists you set, and the moderation actions that result from them on your server.</>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Automated moderation disclaimer">
        <p>
          Link Protect uses automated detection. Like any automated system it may occasionally
          produce false positives (blocking a legitimate link) or false negatives (missing a bad
          one). You remain responsible for moderation decisions on your server and should review your
          settings accordingly.
        </p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          The Service is provided on a best-effort basis and may be changed, interrupted or
          discontinued at any time without notice. We do not guarantee uptime or that the Service
          will be error-free.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          The Service is provided {strong('“as is” and “as available”')}, without warranties of any
          kind, whether express or implied. To the maximum extent permitted by law, we are not liable
          for any indirect, incidental or consequential damages arising from your use of, or
          inability to use, the Service.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the Service at any time by removing the bot from your servers and
          signing out of the app. We may suspend or terminate access that violates these terms or
          Discord’s policies.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms from time to time. Material changes will be reflected by the
          “Last updated” date above. Continued use after an update constitutes acceptance of the
          revised terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Reach us in the{' '}
          <a href="https://discord.gg/BjDC9t329E" target="_blank" rel="noreferrer" style={{ color: '#5865f2', textDecoration: 'none' }}>
            Link Protect support server
          </a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
