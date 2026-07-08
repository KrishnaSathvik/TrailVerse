import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ParkSummary } from '@trailverse/api';

const PARK_LIST_KEY = 'trailverse_cache_park_list';
const PARK_DETAIL_PREFIX = 'trailverse_cache_park_detail_';
const MAX_DETAIL_CACHE = 10;

export type CachedEntry<T> = {
  data: T;
  fetchedAt: number;
};

export function isStale(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt > ttlMs;
}

export async function getCachedParkList(): Promise<CachedEntry<ParkSummary[]> | null> {
  try {
    const raw = await AsyncStorage.getItem(PARK_LIST_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedEntry<ParkSummary[]>;
  } catch {
    return null;
  }
}

export async function setCachedParkList(data: ParkSummary[]) {
  const entry: CachedEntry<ParkSummary[]> = { data, fetchedAt: Date.now() };
  await AsyncStorage.setItem(PARK_LIST_KEY, JSON.stringify(entry));
}

export async function getCachedParkDetail(
  parkCode: string,
): Promise<CachedEntry<Record<string, unknown>> | null> {
  try {
    const raw = await AsyncStorage.getItem(`${PARK_DETAIL_PREFIX}${parkCode}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedEntry<Record<string, unknown>>;
  } catch {
    return null;
  }
}

export async function setCachedParkDetail(parkCode: string, data: Record<string, unknown>) {
  const entry: CachedEntry<Record<string, unknown>> = { data, fetchedAt: Date.now() };
  await AsyncStorage.setItem(`${PARK_DETAIL_PREFIX}${parkCode}`, JSON.stringify(entry));

  const keys = await AsyncStorage.getAllKeys();
  const detailKeys = keys.filter((k) => k.startsWith(PARK_DETAIL_PREFIX));
  if (detailKeys.length <= MAX_DETAIL_CACHE) return;

  const entries = await Promise.all(
    detailKeys.map(async (key) => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return { key, fetchedAt: 0 };
      const parsed = JSON.parse(raw) as CachedEntry<unknown>;
      return { key, fetchedAt: parsed.fetchedAt };
    }),
  );

  entries.sort((a, b) => a.fetchedAt - b.fetchedAt);
  const toRemove = entries.slice(0, entries.length - MAX_DETAIL_CACHE);
  await AsyncStorage.multiRemove(toRemove.map((e) => e.key));
}

export const CACHE_TTL = {
  parkList: 24 * 60 * 60 * 1000,
  parkDetail: 10 * 60 * 1000,
  alerts: 5 * 60 * 1000,
  weather: 15 * 60 * 1000,
};
