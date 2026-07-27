import { notFound, redirect } from 'next/navigation';

// /demo → the redesign preview with demo data (guild id only feeds the icon URL).
export default function DemoIndex() {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEMO) notFound();
  redirect('/demo/864823666952372245');
}
