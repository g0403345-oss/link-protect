import type { Metadata } from 'next';
import { LegalLayout, LegalSection, LegalList } from '@/components/LegalLayout';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Link Protect handles your data.',
};

const strong = (t: string) => <strong style={{ color: '#f2f3f5', fontWeight: 600 }}>{t}</strong>;

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="June 23, 2026"
      intro="Link Protect is a Discord moderation bot and companion app that automatically blocks unwanted links and keeps servers safe. This policy explains exactly what data we use, why, and what we never touch. We keep it minimal on purpose."
    >
      <LegalSection heading="Who we are">
        <p>
          “Link Protect” (the “Service”) consists of the Link Protect Discord bot, the website at
          link-protect.com, and the Link Protect iOS app. The Service is operated as an independent
          project. You can reach us anytime through our{' '}
          <a href="https://discord.gg/BjDC9t329E" target="_blank" rel="noreferrer" style={{ color: '#5865f2', textDecoration: 'none' }}>
            support server
          </a>.
        </p>
      </LegalSection>

      <LegalSection heading="What we collect">
        <p>We only collect what is needed to run the Service:</p>
        <LegalList
          items={[
            <>{strong('Discord account basics')} — when you sign in with Discord (on the website or in the app), we use the <em>identify</em> and <em>guilds</em> OAuth scopes to read your Discord user ID, username and avatar, and the list of servers you are a member of. This is used solely to authenticate you and show the servers you can manage.</>,
            <>{strong('Server configuration')} — the settings you choose for a server (active blockers, warning thresholds, whitelists, custom blacklists, log channel). Stored per server so the bot can enforce them.</>,
            <>{strong('Moderation history')} — when the bot acts on a message (warn, timeout, kick, ban) it records the action type, the reason, the affected user’s ID, the channel ID and a timestamp. This powers warning counts, statistics and the activity log.</>,
            <>{strong('Push notifications (app only)')} — if you enable notifications, we store your device’s push token and your notification preferences so we can deliver alerts. You can turn this off anytime in iOS Settings.</>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="What we do NOT collect">
        <LegalList
          items={[
            <>We do {strong('not')} store the content of your messages. Messages are scanned in memory only to detect links, then discarded.</>,
            <>We do {strong('not')} collect your email, phone number, address or payment information.</>,
            <>We do {strong('not')} use any advertising or cross-app tracking, and the app shows no ads. There is no “Sign in with Apple” because the app is purely a client for Discord.</>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="How we use your data">
        <p>
          Your data is used only to operate the Service: to authenticate you, to show and let you
          configure the servers you manage, to enforce your protection settings, to display
          statistics and logs, and to deliver the notifications you opt into. We do not sell your
          data, and we do not share it for marketing.
        </p>
      </LegalSection>

      <LegalSection heading="Third parties">
        <p>To function, the Service necessarily interacts with:</p>
        <LegalList
          items={[
            <>{strong('Discord')} — to authenticate you and to perform moderation. Your use of Discord is governed by Discord’s own Privacy Policy.</>,
            <>{strong('Apple Push Notification service')} — used only to deliver push notifications you enable. Apple receives the device token needed for delivery.</>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Data retention & deletion">
        <p>
          Server configuration and moderation history are kept while the bot is in your server so it
          can keep working. {strong('Removing the bot from a server')} stops all data collection for
          that server, and you can request deletion of a server’s stored data through our support
          server. Push tokens are removed automatically when they become invalid (for example, when
          you disable notifications or uninstall the app).
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          The Service is not directed at children under 13, and you must meet Discord’s minimum age
          requirement to use it.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          We take reasonable technical measures to protect your data. Access tokens are stored
          securely (in the iOS Keychain on device), and no Discord client secret is ever shipped in
          the app. No method of transmission or storage is 100% secure, but we keep the data we hold
          deliberately minimal.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. Material changes will be reflected by the
          “Last updated” date above. Continued use of the Service after an update means you accept
          the revised policy.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions or data requests? Reach us in the{' '}
          <a href="https://discord.gg/BjDC9t329E" target="_blank" rel="noreferrer" style={{ color: '#5865f2', textDecoration: 'none' }}>
            Link Protect support server
          </a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
