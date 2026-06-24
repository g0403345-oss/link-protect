import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  title: {
    default: 'LinkProtect — Protect Your Discord Server',
    template: '%s | LinkProtect',
  },
  description:
    'LinkProtect is a powerful Discord moderation bot that automatically blocks unwanted links, warns users, and keeps your server safe with zero effort.',
  keywords: ['Discord bot', 'link protection', 'moderation', 'Discord security', 'anti-spam'],
  authors: [{ name: 'LinkProtect' }],
  openGraph: {
    type: 'website',
    title: 'LinkProtect — Protect Your Discord Server',
    description:
      'Automatically block unwanted links, warn users, and keep your server safe.',
    siteName: 'LinkProtect',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LinkProtect — Protect Your Discord Server',
    description:
      'Automatically block unwanted links, warn users, and keep your server safe.',
  },
};

export const viewport: Viewport = {
  themeColor: '#5865f2',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
