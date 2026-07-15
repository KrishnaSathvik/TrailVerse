import { getApiBaseUrl } from './apiBase';

const BLOG_REVALIDATE_SECONDS = 3600;

export async function getBlogCategoriesServer() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/blogs/categories`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS }
    });

    if (!response.ok) {
      return { success: false, data: [], totalCount: 0 };
    }

    const body = await response.json();
    if (!body || body.success === false || !Array.isArray(body.data)) {
      return { success: false, data: [], totalCount: 0 };
    }

    return body;
  } catch {
    return { success: false, data: [], totalCount: 0 };
  }
}

export async function getBlogPostsServer(params = {}) {
  try {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, String(value));
      }
    });

    const response = await fetch(`${getApiBaseUrl()}/blogs?${query.toString()}`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS }
    });

    if (!response.ok) {
      return { success: false, data: [], total: 0 };
    }

    const body = await response.json();
    if (!body || body.success === false || !Array.isArray(body.data)) {
      return { success: false, data: [], total: 0 };
    }

    return body;
  } catch {
    return { success: false, data: [], total: 0 };
  }
}
