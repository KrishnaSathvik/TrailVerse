import { getApiBaseUrl } from './apiBase';

const BLOG_REVALIDATE_SECONDS = 3600;

export async function getBlogPostServer(slug) {
  const response = await fetch(`${getApiBaseUrl()}/blogs/${encodeURIComponent(slug)}`, {
    next: { revalidate: BLOG_REVALIDATE_SECONDS },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Blog post unavailable: ${response.status}`);
  const body = await response.json();
  if (body?.success === false || !body?.data?.slug || !body.data.title) {
    throw new Error('Invalid blog post response');
  }
  return body.data;
}

export async function getBlogCategoriesServer() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/blogs/categories`, {
      next: { revalidate: BLOG_REVALIDATE_SECONDS }
    });

    if (!response.ok) {
      throw new Error('Blog categories unavailable');
    }

    const body = await response.json();
    if (!body || body.success === false || !Array.isArray(body.data)) {
      throw new Error('Blog categories unavailable');
    }

    return body;
  } catch {
    throw new Error('Blog categories unavailable');
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
      throw new Error('Blog posts unavailable');
    }

    const body = await response.json();
    if (!body || body.success === false || !Array.isArray(body.data)) {
      throw new Error('Blog posts unavailable');
    }

    return body;
  } catch {
    throw new Error('Blog posts unavailable');
  }
}
