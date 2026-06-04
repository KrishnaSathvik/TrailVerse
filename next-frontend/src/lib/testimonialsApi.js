import { getApiBaseUrl } from './apiBase';

/**
 * Server-side fetch for approved testimonials (SSR / crawlers).
 */
export async function getApprovedTestimonialsServer({ limit = 20, featured } = {}) {
  try {
    const query = new URLSearchParams({
      approved: 'true',
      limit: String(limit),
    });
    if (featured) {
      query.set('featured', 'true');
    }

    const response = await fetch(`${getApiBaseUrl()}/testimonials?${query.toString()}`, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return { data: [], count: 0 };
    }

    const json = await response.json();
    return {
      data: json.data ?? [],
      count: json.count ?? json.data?.length ?? 0,
    };
  } catch {
    return { data: [], count: 0 };
  }
}
