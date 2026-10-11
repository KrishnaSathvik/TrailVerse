'use client';
import { useState } from 'react';

export default function ConversationRecoveryNotice({ recovery, notice, busy = false, onRestore, onContinue, onRetry }) {
  const [reviewing, setReviewing] = useState(false);
  const missing = recovery?.deviceOnlyMessages || [];
  const showRecovery = missing.some(m => m.role === 'user' && m.content?.trim() && !m.hiddenFromUi);
  if (!showRecovery && !notice) return null;
  const actionClass = 'min-h-11 px-1 text-xs underline underline-offset-2 disabled:opacity-50';
  return (
    <div className="mb-1 text-xs leading-5 text-[var(--text-secondary)]" aria-label="Conversation status">
      {showRecovery && <>
        <div className="flex flex-wrap items-center gap-x-2">
          <span>{missing.length} {missing.length === 1 ? 'message from this device wasn’t' : 'messages from this device weren’t'} saved</span>
          <button type="button" aria-expanded={reviewing} onClick={() => setReviewing(value => !value)} className={actionClass}>Review</button>
          {recovery.canRestore && <button type="button" disabled={busy} onClick={onRestore} className={actionClass}>Restore</button>}
          <button type="button" disabled={busy} onClick={onContinue} className={actionClass}>Continue</button>
        </div>
        {reviewing && <div className="pb-2">
          <p>Your saved chat is open. These messages are backed up on this device.</p>
          {!recovery.canRestore && <p>Restoring these messages could conflict with your saved chat. You can copy any text you want to keep.</p>}
          <ol className="mt-2 space-y-2">{missing.map((m, i) => <li key={i} className="whitespace-pre-wrap break-words"><strong>{m.role === 'user' ? 'You' : 'Trailie'}: </strong>{m.content}</li>)}</ol>
        </div>}
      </>}
      {notice && <p role="status">{notice}</p>}
      {onRetry && <button type="button" onClick={onRetry} className={actionClass}>Reconnect</button>}
    </div>
  );
}
