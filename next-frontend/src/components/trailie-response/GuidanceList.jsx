/** Grounded trip guidance bullets, each with its official source. */
export default function GuidanceList({ guidance }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6">
      {guidance.map(item => <li key={item.text}>{item.text} <a href={item.source} target="_blank" rel="noreferrer" className="text-[var(--text-tertiary)] underline underline-offset-2">Source</a></li>)}
    </ul>
  );
}
