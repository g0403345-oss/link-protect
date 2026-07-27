import type { Metadata } from 'next';
import WelcomeClient from './welcome-client';

export const metadata: Metadata = {
  title: 'Welcome — You’re already protected',
  description:
    'You invited Link Protect — malware, phishing and nitro-scam blockers are on from the first second. Three steps to get the most out of it, plus every slash command at a glance.',
  alternates: { canonical: '/welcome' },
  openGraph: {
    title: 'Welcome to Link Protect — you’re already protected',
    description:
      'Core protection is on from the first second. Open your dashboard, pick a preset, set a log channel — done.',
  },
};

export default function WelcomePage() {
  return <WelcomeClient />;
}
