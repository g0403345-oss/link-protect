// Wraps every route in a light fade-up so page-to-page navigation doesn't
// hard-cut (CSS-only; respects prefers-reduced-motion via globals.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
