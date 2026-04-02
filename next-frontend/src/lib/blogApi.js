import { getApiBaseUrl } from './apiBase';

export async function getBlogCategoriesServer() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/blogs/categories`, {
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      return { data: [], totalCount: 0 };
    }

    return response.json();
  } catch {
    return { data: [], totalCount: 0 };
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
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      return { data: [], total: 0 };
    }

    return response.json();
  } catch {
    return { data: [], total: 0 };
  }
}
