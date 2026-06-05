import type { Metadata } from 'next';
import LandingClient from './landing-client';

export const metadata: Metadata = {
  title: 'LinkProtect — Protect Your Discord Server',
};

export default function HomePage() {
  return <LandingClient />;
}
