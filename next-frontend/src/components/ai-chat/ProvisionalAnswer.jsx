'use client';

export default function ProvisionalAnswer({ answer, onCancel }) {
  if (!answer?.content || answer.withdrawn) return null;
  return <section aria-label="Trailie provisional answer" aria-busy="true" className="min-w-0 space-y-3 pb-8">
    <p role="status" className="text-sm text-[var(--text-secondary)]">Trailie · Provisional answer · Not saved yet</p>
    <div className="whitespace-pre-wrap break-words text-[var(--text-primary)]">{answer.content}</div>
    <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)]">Stop response</button>
  </section>;
}
