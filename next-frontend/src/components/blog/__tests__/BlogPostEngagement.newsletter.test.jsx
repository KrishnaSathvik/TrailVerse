import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogPostEngagement from '../BlogPostEngagement';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../LikeFavorite', () => ({
  default: () => null,
}));

vi.mock('../CommentSection', () => ({
  default: () => null,
}));

vi.mock('../AuthorBioCard', () => ({
  default: () => null,
  isKnownBlogAuthor: () => false,
}));

vi.mock('../NewsletterWidget', () => ({
  default: ({ source }) => <div data-testid="newsletter-widget" data-source={source} />,
}));

describe('blog footer newsletter CTA', () => {
  it('reuses NewsletterWidget with source=blog-footer', () => {
    render(
      <BlogPostEngagement
        post={{ _id: '1', category: 'trip-planning', tags: [], author: 'TrailVerse' }}
        onPostUpdate={() => {}}
      />
    );

    expect(screen.getByTestId('newsletter-widget')).toHaveAttribute('data-source', 'blog-footer');
    expect(screen.getByRole('region', { name: /where next\? newsletter signup/i })).toBeInTheDocument();
  });
});
