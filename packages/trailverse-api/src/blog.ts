import type { ApiClient } from './client';

export function createBlogApi(client: ApiClient) {
  return {
    getPublishedBlogs(params?: Record<string, string | number | boolean>) {
      return client.get<unknown[]>('/blogs', {
        params: { status: 'published', ...params },
      });
    },

    getBlogBySlug(slug: string) {
      return client.get<unknown>(`/blogs/${slug}`);
    },

    trackView(slug: string) {
      return client.post<unknown>(`/blogs/${slug}/view`);
    },
  };
}

export type BlogApi = ReturnType<typeof createBlogApi>;
