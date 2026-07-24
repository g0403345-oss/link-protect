import type { Metadata } from 'next';
import UpdatesClient from './updates-client';

export const metadata: Metadata = {
  title: 'Changelog — Link Protect Updates',
  description:
    'Every Link Protect update in one place — new bot features, website releases and iOS app versions, from the V2 relaunch to today.',
  alternates: { canonical: '/update' },
  openGraph: {
    title: 'Changelog — Link Protect Updates',
    description: 'New bot features, website releases and iOS app versions — all in one timeline.',
  },
};

export default function UpdatePage() {
  return <UpdatesClient />;
}
