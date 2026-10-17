import { ApiError } from './errors';
import type { ApiClient } from './client';
import { consumeAiSseStream, resolveChatPayload } from './sse';
import type { ChatMessage, ChatMetadata, SseEventHandlers } from './types';

export type ChatRequest = {
  messages: ChatMessage[];
  systemPrompt?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  conversationId?: string | null;
  metadata?: ChatMetadata;
  anonymousId?: string;
  signal?: AbortSignal;
};

export type StreamChatRequest = ChatRequest & SseEventHandlers;

export function createAiApi(client: ApiClient) {
  async function handleStreamResponse(
    response: Response,
    handlers: SseEventHandlers,
  ) {
    if (!response.ok) {
      const errBody = await response.text();
      let parsed: { error?: string } | null = null;
      try {
        parsed = JSON.parse(errBody);
      } catch {
        parsed = null;
      }
      throw new ApiError(
        parsed?.error || errBody || `Stream failed with status ${response.status}`,
        response.status,
        parsed,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      handlers.onDone?.(json.data || json);
      return;
    }

    await consumeAiSseStream(response, handlers);
  }

  return {
    chat(request: ChatRequest) {
      const resolved = resolveChatPayload(request.messages, request.systemPrompt);
      return client.post<unknown>(
        '/ai/chat',
        {
          messages: resolved.messages,
          systemPrompt: resolved.systemPrompt,
          provider: request.provider,
          model: request.model,
          temperature: request.temperature ?? 0.4,
          top_p: request.top_p ?? 0.9,
          max_tokens: request.max_tokens ?? 2000,
          conversationId: request.conversationId,
          metadata: request.metadata,
        },
        { signal: request.signal, timeoutMs: 120_000 },
      );
    },

    chatAnonymous(request: ChatRequest) {
      const resolved = resolveChatPayload(request.messages, request.systemPrompt);
      return client.post<unknown>(
        '/ai/chat-anonymous',
        {
          messages: resolved.messages,
          systemPrompt: resolved.systemPrompt,
          provider: request.provider,
          model: request.model,
          temperature: request.temperature ?? 0.4,
          top_p: request.top_p ?? 0.9,
          max_tokens: request.max_tokens ?? 2000,
          metadata: request.metadata,
          anonymousId: request.anonymousId,
        },
        { signal: request.signal, timeoutMs: 120_000, skipAuth: true },
      );
    },

    async chatStream(request: StreamChatRequest) {
      const resolved = resolveChatPayload(request.messages, request.systemPrompt);
      const {
        onChunk,
        onStreamEnd,
        onDone,
        onError,
        onThinking,
        onClose,
        signal,
        ...rest
      } = request;

      const response = await client.fetchRaw('/ai/chat-stream', {
        method: 'POST',
        body: JSON.stringify({
          messages: resolved.messages,
          systemPrompt: resolved.systemPrompt,
          provider: rest.provider,
          temperature: rest.temperature ?? 0.4,
          top_p: rest.top_p ?? 0.9,
          maxTokens: rest.max_tokens ?? 2000,
          conversationId: rest.conversationId,
          metadata: rest.metadata,
        }),
        signal,
      });

      await handleStreamResponse(response, {
        onChunk,
        onStreamEnd,
        onDone,
        onError,
        onThinking,
        onClose,
      });
    },

    async chatAnonymousStream(request: StreamChatRequest) {
      const resolved = resolveChatPayload(request.messages, request.systemPrompt);
      const {
        onChunk,
        onStreamEnd,
        onDone,
        onError,
        onThinking,
        onClose,
        signal,
        ...rest
      } = request;

      const response = await client.fetchRaw('/ai/chat-anonymous-stream', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          messages: resolved.messages,
          systemPrompt: resolved.systemPrompt,
          provider: rest.provider,
          model: rest.model,
          temperature: rest.temperature ?? 0.4,
          top_p: rest.top_p ?? 0.9,
          maxTokens: rest.max_tokens ?? 8000,
          metadata: rest.metadata,
          anonymousId: rest.anonymousId,
        }),
        signal,
      });

      await handleStreamResponse(response, {
        onChunk,
        onStreamEnd,
        onDone,
        onError,
        onThinking,
        onClose,
      });
    },

    getConversations() {
      return client.get<unknown[]>('/ai/conversations');
    },

    getConversation(id: string) {
      return client.get<unknown>(`/ai/conversations/${id}`);
    },

    deleteConversation(id: string) {
      return client.delete<void>(`/ai/conversations/${id}`);
    },

    updateConversationTitle(id: string, title: string) {
      return client.put<unknown>(`/ai/conversations/${id}`, { title });
    },
  };
}

export type AiApi = ReturnType<typeof createAiApi>;
