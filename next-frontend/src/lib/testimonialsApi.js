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
      // Keep the local page in sync with local moderation/data changes.
      ...(process.env.NODE_ENV === 'development' ? { cache: 'no-store' } : { next: { revalidate: 300 } }),
    });

    if (!response.ok) {
      return { data: [], count: 0, error: true };
    }

    const json = await response.json();
    if (!Array.isArray(json.data) || json.success === false) {
      return { data: [], count: 0, error: true };
    }
    return {
      error: false,
      data: json.data.filter((story) => story.approved === true),
      count: json.count ?? json.data?.length ?? 0,
    };
  } catch {
    return { data: [], count: 0, error: true };
  }
}
