/** Standard Express API envelope */
export type ApiEnvelope<T> = {
  success?: boolean;
  data: T;
  message?: string;
  error?: string;
};

export type PaginatedParks = {
  data: ParkSummary[];
  total: number;
  page: number;
  pages: number;
  hasMore?: boolean;
};

export type ParkSummary = {
  parkCode: string;
  fullName: string;
  states?: string;
  designation?: string;
  latitude?: string | number;
  longitude?: string | number;
  images?: Array<{ url: string; altText?: string }>;
  description?: string;
};

export type ParkSearchResult = {
  parks: ParkSummary[];
  count: number;
  searchId?: string | null;
};

export type User = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email: string;
  createdAt?: string;
  role?: string;
};

export type AuthLoginResponse = {
  token: string;
  data: User;
};

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ChatMetadata = Record<string, unknown>;

export type SseEventHandlers = {
  onChunk?: (content: string) => void;
  onStreamEnd?: (payload: unknown) => void;
  onDone?: (payload: unknown) => void;
  onError?: (message: string) => void;
  onThinking?: (payload: unknown) => void;
  onClose?: (info: { sawStreamEnd: boolean; sawDone: boolean }) => void;
};
