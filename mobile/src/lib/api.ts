import {
  createTrailVerseApi,
  resolveApiBaseUrl,
  type TrailVerseApi,
  type User,
} from '@trailverse/api';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'trailverse_auth_token';
const USER_KEY = 'trailverse_user';
const ANONYMOUS_ID_KEY = 'trailverse_anonymous_id';

let apiInstance: TrailVerseApi | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export function getApi(): TrailVerseApi {
  if (!apiInstance) {
    apiInstance = createTrailVerseApi({
      baseUrl: resolveApiBaseUrl(),
      getToken: () => getStoredToken(),
      onUnauthorized: () => unauthorizedHandler?.(),
    });
  }
  return apiInstance;
}

export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredToken(token: string | null) {
  if (token) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export async function getStoredUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: User | null) {
  if (user) {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } else {
    await SecureStore.deleteItemAsync(USER_KEY);
  }
}

export async function clearStoredAuth() {
  await setStoredToken(null);
  await setStoredUser(null);
}

export async function getOrCreateAnonymousId(): Promise<string> {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  const existing = await AsyncStorage.getItem(ANONYMOUS_ID_KEY);
  if (existing) return existing;
  const id = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(ANONYMOUS_ID_KEY, id);
  return id;
}

export async function clearAnonymousId() {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
  await AsyncStorage.removeItem(ANONYMOUS_ID_KEY);
}
