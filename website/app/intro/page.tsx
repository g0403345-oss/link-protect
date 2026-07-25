import type { Metadata } from 'next';
import IntroClient from './intro-client';

export const metadata: Metadata = {
  title: 'Meet Link Protect',
  description: 'A 30-second animated introduction to Link Protect — scam links, raids and spam, handled automatically.',
};

export default function IntroPage() {
  return <IntroClient />;
}
