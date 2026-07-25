import { redirect } from 'next/navigation';

// /demo → the redesign preview with demo data (guild id only feeds the icon URL).
export default function DemoIndex() {
  redirect('/demo/864823666952372245');
}
