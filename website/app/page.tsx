import type { Metadata } from 'next';
import LandingClient from './landing-client';

export const metadata: Metadata = {
  title: 'Link Protect — Protect Your Discord Server',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <LandingClient />;
}
