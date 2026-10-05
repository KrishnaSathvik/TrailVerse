import type { ApiClient } from './client';
import type { AuthLoginResponse, User } from './types';

export function createAuthApi(client: ApiClient) {
  return {
    signup(firstName: string, lastName: string, email: string, password: string) {
      return client.post<{ message?: string }>('/auth/signup', {
        firstName,
        lastName,
        email,
        password,
      });
    },

    login(email: string, password: string, rememberMe = false) {
      return client.post<AuthLoginResponse>('/auth/login', { email, password, rememberMe });
    },

    getMe() {
      return client.get<User>('/auth/me');
    },

    forgotPassword(email: string) {
      return client.post<{ message?: string }>('/auth/forgot-password', { email });
    },

    resetPassword(token: string, password: string) {
      return client.put<{ message?: string }>(`/auth/reset-password/${token}`, { password });
    },

    verifyEmail(token: string) {
      return client.get<{ message?: string }>(`/auth/verify-email/${token}`);
    },

    resendVerification(email: string) {
      return client.post<{ message?: string }>('/auth/resend-verification', { email });
    },

    migrateChat(anonymousId: string) {
      return client.post<{ tripId: string }>('/auth/migrate-chat', { anonymousId });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
