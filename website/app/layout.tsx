import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import Footer from '@/components/Footer';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Script from 'next/script';

// Self-hosted via next/font — no render-blocking Google Fonts @import, no FOUT.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  metadataBase: new URL('https://link-protect.com'),
  title: {
    default: 'Link Protect — Protect Your Discord Server',
    template: '%s | Link Protect',
  },
  description:
    'Link Protect is a powerful Discord moderation bot that automatically blocks unwanted links, warns users, and keeps your server safe with zero effort.',
  keywords: ['Discord bot', 'link protection', 'moderation', 'Discord security', 'anti-spam'],
  authors: [{ name: 'Link Protect' }],
  openGraph: {
    type: 'website',
    url: 'https://link-protect.com',
    title: 'Link Protect — Protect Your Discord Server',
    description:
      'Automatically block unwanted links, warn users, and keep your server safe.',
    siteName: 'Link Protect',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Link Protect — Protect Your Discord Server',
    description:
      'Automatically block unwanted links, warn users, and keep your server safe.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0c',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Footer />
        <Analytics />
        <SpeedInsights />
        <Script
          src="https://support-chatbot-nine.vercel.app/widget.js"
          data-site="linkprotect"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
