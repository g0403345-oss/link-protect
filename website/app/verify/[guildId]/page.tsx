import type { Metadata } from 'next';
import VerifyClient from './verify-client';

export const metadata: Metadata = {
  title: 'Verify your Discord account — Link Protect',
  description: 'One click with your Discord account to unlock this server — Link Protect keeps scam bots out.',
  robots: { index: false },
};

export default async function VerifyPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  return <VerifyClient guildId={guildId} />;
}
