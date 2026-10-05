import type { SseEventHandlers } from './types';

/**
 * Consume an SSE response body from Trailie chat streams.
 * Handles event types: thinking, chunk, stream_end, done, error.
 */
export async function consumeAiSseStream(
  response: Response,
  handlers: SseEventHandlers = {},
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('SSE response has no readable body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let sawStreamEnd = false;
  let sawDone = false;

  const handleLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    let parsed: { type?: string; content?: string; message?: string };
    try {
      parsed = JSON.parse(line.slice(6));
    } catch {
      return;
    }

    if (parsed.type === 'thinking') handlers.onThinking?.(parsed);
    if (parsed.type === 'chunk' && parsed.content) handlers.onChunk?.(parsed.content);
    if (parsed.type === 'stream_end') {
      sawStreamEnd = true;
      handlers.onStreamEnd?.(parsed);
    }
    if (parsed.type === 'done') {
      sawDone = true;
      handlers.onDone?.(parsed);
    }
    if (parsed.type === 'error') {
      handlers.onError?.(parsed.message || 'Stream error');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        handleLine(line);
      }
    }

    if (buffer.startsWith('data: ')) {
      handleLine(buffer);
    }
  } finally {
    handlers.onClose?.({ sawStreamEnd, sawDone });
  }
}

export function resolveChatPayload(
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string,
) {
  if (systemPrompt) {
    return {
      systemPrompt,
      messages: messages.filter((m) => m.role !== 'system'),
    };
  }

  const systemIdx = messages.findIndex((m) => m.role === 'system');
  if (systemIdx === -1) {
    return { systemPrompt: undefined, messages };
  }

  return {
    systemPrompt: messages[systemIdx].content,
    messages: messages.filter((_, i) => i !== systemIdx),
  };
}
