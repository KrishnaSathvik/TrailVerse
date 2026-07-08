import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '@trailverse/api';
import { getApi } from '@/src/lib/api';
import { useAuth, getOrCreateAnonymousId as getAnonId } from '@/src/providers/AuthProvider';
import { useNetworkStatus } from '@/src/components/OfflineBanner';

export type TrailieMessage = ChatMessage & { id: string };

function makeId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useTrailieChat(initialPark?: string, initialName?: string) {
  const { isAuthenticated, migrateAnonymousChat } = useAuth();
  const { isConnected } = useNetworkStatus();
  const [messages, setMessages] = useState<TrailieMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const systemPrompt =
    initialPark && initialName
      ? `User is viewing ${initialName} (${initialPark}). Help them plan a trip there.`
      : undefined;

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      if (!isConnected) {
        setError('Trailie requires an internet connection.');
        return;
      }

      setError(null);
      const userMessage: TrailieMessage = { id: makeId(), role: 'user', content: text.trim() };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setStreaming(true);

      const assistantId = makeId();
      setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      const controller = new AbortController();
      abortRef.current = controller;
      const api = getApi();

      const payload = {
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
        systemPrompt,
        signal: controller.signal,
        onChunk: (chunk: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: m.content + chunk } : m,
            ),
          );
        },
        onError: (message: string) => setError(message),
      };

      try {
        if (isAuthenticated) {
          await api.ai.chatStream(payload);
        } else {
          const anonymousId = await getAnonId();
          await api.ai.chatAnonymousStream({ ...payload, anonymousId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message';
        setError(message);
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, systemPrompt, isAuthenticated, isConnected],
  );

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const clearChat = useCallback(() => {
    cancelStream();
    setMessages([]);
    setError(null);
  }, [cancelStream]);

  const runMigration = useCallback(
    async (anonymousId: string) => migrateAnonymousChat(anonymousId),
    [migrateAnonymousChat],
  );

  return {
    messages,
    streaming,
    error,
    sendMessage,
    cancelStream,
    clearChat,
    runMigration,
    isOnline: isConnected,
  };
}
