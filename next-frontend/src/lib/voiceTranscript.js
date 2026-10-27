/**
 * Pure Realtime transcript reducer — accumulates user/assistant turns without
 * inventing text. UI layers must never slice/clamp this content away.
 */

function upsertById(prev, id, role, patch) {
  if (!id) return null;
  const idx = prev.findIndex((m) => m.id === id && m.role === role);
  if (idx === -1) return null;
  const next = prev.slice();
  next[idx] = { ...next[idx], ...patch };
  return next;
}

function appendOrMergeUser(prev, text, id) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length <= 1) return prev;

  if (id) {
    const byId = upsertById(prev, id, 'user', { text: trimmed, streaming: false });
    if (byId) return byId;
    return [...prev, { id, role: 'user', text: trimmed }];
  }

  const last = prev[prev.length - 1];
  if (last?.role === 'user' && !last.id) {
    // Same utterance may arrive as both item.done and transcription.completed
    if (last.text.includes(trimmed) || trimmed.includes(last.text)) {
      return [...prev.slice(0, -1), { ...last, text: trimmed.length > last.text.length ? trimmed : last.text }];
    }
    return [...prev.slice(0, -1), { ...last, text: `${last.text} ${trimmed}`.trim() }];
  }
  return [...prev, { role: 'user', text: trimmed }];
}

function appendAssistantDelta(prev, delta, id) {
  if (!delta) return prev;

  if (id) {
    const idx = prev.findIndex((m) => m.id === id && m.role === 'assistant');
    if (idx !== -1) {
      const cur = prev[idx];
      const next = prev.slice();
      next[idx] = { ...cur, text: `${cur.text || ''}${delta}`, streaming: true };
      return next;
    }
    return [...prev, { id, role: 'assistant', text: delta, streaming: true }];
  }

  const last = prev[prev.length - 1];
  if (last?.role === 'assistant' && last.streaming && !last.id) {
    return [...prev.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...prev, { role: 'assistant', text: delta, streaming: true }];
}

function finalizeAssistant(prev, transcript, id) {
  const finalText = typeof transcript === 'string' ? transcript : null;

  if (id) {
    const idx = prev.findIndex((m) => m.id === id && m.role === 'assistant');
    if (idx !== -1) {
      const cur = prev[idx];
      const text = (finalText && finalText.length >= (cur.text || '').length)
        ? finalText
        : (cur.text || finalText || '');
      const next = prev.slice();
      next[idx] = { ...cur, text, streaming: false, incomplete: false };
      return next;
    }
    if (finalText) {
      return [...prev, { id, role: 'assistant', text: finalText, streaming: false }];
    }
    return prev;
  }

  const last = prev[prev.length - 1];
  if (last?.role === 'assistant' && last.streaming) {
    const text = (finalText && finalText.length >= (last.text || '').length)
      ? finalText
      : (last.text || finalText || '');
    return [...prev.slice(0, -1), { ...last, text, streaming: false, incomplete: false }];
  }
  if (finalText && (!last || last.role !== 'assistant' || last.text !== finalText)) {
    return [...prev, { role: 'assistant', text: finalText, streaming: false }];
  }
  return prev;
}

function markIncompleteStreaming(prev) {
  let changed = false;
  const next = prev.map((m) => {
    if (m.role === 'assistant' && m.streaming) {
      changed = true;
      return { ...m, streaming: false, incomplete: true };
    }
    return m;
  });
  return changed ? next : prev;
}

/**
 * @param {Array<{id?: string, role: string, text: string, streaming?: boolean, incomplete?: boolean}>} prev
 * @param {object} event Realtime server event
 */
export function applyVoiceTranscriptEvent(prev, event) {
  if (!event || !event.type) return prev;
  const list = Array.isArray(prev) ? prev : [];

  switch (event.type) {
    case 'conversation.item.input_audio_transcription.delta': {
      const delta = event.delta;
      if (!delta) return list;
      const id = event.item_id || null;
      if (id) {
        const idx = list.findIndex((m) => m.id === id && m.role === 'user');
        if (idx !== -1) {
          const cur = list[idx];
          const next = list.slice();
          next[idx] = { ...cur, text: `${cur.text || ''}${delta}`, streaming: true };
          return next;
        }
        return [...list, { id, role: 'user', text: delta, streaming: true }];
      }
      return list;
    }

    case 'conversation.item.input_audio_transcription.completed': {
      const id = event.item_id || null;
      const trimmed = String(event.transcript || '').trim();
      if (id) {
        const idx = list.findIndex((m) => m.id === id && m.role === 'user');
        if (idx !== -1) {
          const cur = list[idx];
          const next = list.slice();
          next[idx] = {
            ...cur,
            text: trimmed.length >= (cur.text || '').length ? trimmed : (cur.text || trimmed),
            streaming: false,
          };
          return next;
        }
      }
      return appendOrMergeUser(list, trimmed, id);
    }

    case 'conversation.item.done': {
      if (event.item?.role !== 'user') return list;
      const parts = event.item.content || [];
      const text = parts
        .filter((p) => p.transcript)
        .map((p) => String(p.transcript).trim())
        .filter(Boolean)
        .join(' ');
      return appendOrMergeUser(list, text, event.item?.id || event.item_id || null);
    }

    case 'response.output_audio_transcript.delta':
    case 'response.output_text.delta': {
      return appendAssistantDelta(list, event.delta, event.item_id || null);
    }

    case 'response.output_audio_transcript.done':
    case 'response.output_text.done': {
      const text = event.transcript ?? event.text ?? null;
      return finalizeAssistant(list, text, event.item_id || null);
    }

    case 'response.cancelled': {
      return markIncompleteStreaming(list);
    }

    case 'response.done': {
      const status = event.response?.status;
      if (status === 'cancelled' || status === 'failed' || status === 'incomplete') {
        return markIncompleteStreaming(list);
      }
      // Successful done: clear streaming flags if a .done transcript event was missed
      return list.map((m) => (
        m.role === 'assistant' && m.streaming
          ? { ...m, streaming: false }
          : m
      ));
    }

    // Tool calls must never erase prior conversation turns.
    case 'response.output_item.added':
    default:
      return list;
  }
}
