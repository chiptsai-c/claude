import { parseMarkup } from '../engine/markup';

/** Renders content markup like "{ok:✓ Done.}" as styled spans. */
export function Rich({ text }: { text: string }) {
  return <>{parseMarkup(text).map((s, i) => (s.tone ? <span key={i} className={s.tone}>{s.text}</span> : s.text))}</>;
}
