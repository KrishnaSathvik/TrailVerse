// Structured comparisons are optional; prose/Markdown tables remain the legacy fallback.
export default function TrailieComparison({ comparison }) {
  const columns = comparison?.columns;
  const rows = comparison?.rows;
  if (!Array.isArray(columns) || columns.length < 2 || columns.length > 3
    || columns.some(c => typeof c !== 'string' || !c.trim()) || !Array.isArray(rows)) return null;
  const safeRows = rows.filter(row => typeof row?.label === 'string' && Array.isArray(row.values)
    && row.values.length === columns.length && row.values.every(v => typeof v === 'string')).slice(0, 8);
  if (!safeRows.length) return null;
  return <section aria-label="Destination comparison" data-blocks-rendered="comparison" className="min-w-0 max-w-[var(--public-rich-width)]">
    <div className="hidden sm:block"><table className="w-full table-fixed border-collapse text-sm"><thead><tr><th scope="col" className="p-3 text-left">Consideration</th>{columns.map((column, i) => <th key={i} scope="col" className="break-words p-3 text-left">{column}</th>)}</tr></thead><tbody>{safeRows.map((row, i) => <tr key={i} className="border-t border-[var(--border)]"><th scope="row" className="break-words p-3 text-left">{row.label}</th>{row.values.map((value, j) => <td key={j} className="break-words p-3 align-top">{value}</td>)}</tr>)}</tbody></table></div>
    <div className="space-y-4 sm:hidden">{columns.map((column, i) => <section key={i}><h3 className="font-semibold">{column}</h3><dl className="mt-2 space-y-2 text-sm">{safeRows.map((row, j) => <div key={j}><dt className="font-medium">{row.label}</dt><dd className="break-words text-[var(--text-secondary)]">{row.values[i]}</dd></div>)}</dl></section>)}</div>
    {typeof comparison.recommendation === 'string' && <p className="mt-3 text-sm"><strong>Trailie’s pick: </strong>{comparison.recommendation}</p>}
  </section>;
}
