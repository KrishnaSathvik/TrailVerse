import { getApiBaseUrl } from './apiBase';

export async function getLandingTestimonialsServer(limit = 3) {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/testimonials?approved=true&limit=${limit}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.data) ? payload.data : [];
  } catch {
    return [];
  }
}

export async function getLandingDailyFeedServer() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/feed/daily`, {
      next: { revalidate: 1800 },
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const data = payload?.data ?? payload;
    if (!data?.parkOfDay || !data?.natureFact) return null;
    return {
      parkOfDay: data.parkOfDay,
      natureFact: data.natureFact,
    };
  } catch {
    return null;
  }
}
