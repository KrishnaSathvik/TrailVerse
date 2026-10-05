import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: '', replace: vi.fn(), getAllPosts: vi.fn(), getBlogCategories: vi.fn(), getFeaturedPosts: vi.fn(), getPopularPosts: vi.fn(), clearBlogCache: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock('@/services/blogService', () => ({ default: mocks }));
vi.mock('@/components/blog/NewsletterWidget', () => ({ default: () => null }));
vi.mock('@/components/blog/BlogCategoryNav', () => ({ default: () => null }));
vi.mock('@/components/blog/BlogCard', () => ({ default: ({ post }) => <p>{post.title}</p> }));
vi.mock('@/components/common/OptimizedImage', () => ({ default: () => null }));
import BlogPageClient from './BlogPageClient';
const initialData = { initialTag: '', posts: [], categories: [], featuredPosts: [], popularPosts: [], totalPages: 1 };
beforeEach(() => {
  mocks.query = ''; vi.clearAllMocks();
  mocks.getAllPosts.mockResolvedValue({ data: [{ _id: 'wildlife', title: 'Wildlife story' }], total: 20 });
});
afterEach(cleanup);
it('does not refetch the three shared SSR datasets on hydration', async () => {
  render(<BlogPageClient initialData={initialData} />);
  await screen.findByText('Travel Journal');
  expect(mocks.getBlogCategories).not.toHaveBeenCalled();
  expect(mocks.getFeaturedPosts).not.toHaveBeenCalled();
  expect(mocks.getPopularPosts).not.toHaveBeenCalled();
  expect(mocks.clearBlogCache).not.toHaveBeenCalled();
});
it('deep-linked tags load the correct posts and respond to back/forward query changes', async () => {
  mocks.query = 'tag=wildlife&utm_source=test';
  const view = render(<BlogPageClient initialData={initialData} />);
  await screen.findByText('Wildlife story');
  expect(mocks.getAllPosts).toHaveBeenLastCalledWith({ page: 1, limit: 9, tag: 'wildlife' });
  mocks.query = 'tag=camping'; view.rerender(<BlogPageClient initialData={initialData} />);
  await waitFor(() => expect(mocks.getAllPosts).toHaveBeenLastCalledWith({ page: 1, limit: 9, tag: 'camping' }));
  expect(mocks.getFeaturedPosts).not.toHaveBeenCalled();
});
it('tag pagination fetches only the next archive page', async () => {
  mocks.query = 'tag=wildlife'; render(<BlogPageClient initialData={initialData} />);
  await screen.findByText('Wildlife story');
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  await waitFor(() => expect(mocks.getAllPosts).toHaveBeenLastCalledWith({ page: 2, limit: 9, tag: 'wildlife' }));
  expect(mocks.getBlogCategories).not.toHaveBeenCalled();
});
