import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import NewsletterLanding from '../NewsletterLanding';
import NewsletterSignupSlot from '../NewsletterSignupSlot';
import NewsletterSampleIssue from '../NewsletterSampleIssue';
import { NEWSLETTER_BENEFITS } from '@/lib/newsletterLanding';

const mockGet = vi.fn(() => null);

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('@/components/common/IconGlyph', () => ({
  default: ({ name }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/utils/analytics', () => ({
  logNewsletterSignup: vi.fn(),
}));

vi.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:5001/api',
}));

describe('/newsletter landing', () => {
  beforeEach(() => {
    mockGet.mockReturnValue(null);
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
  });

  it('renders Where Next? positioning, email-only signup, cards, and sample issue', () => {
    render(<NewsletterLanding />);

    expect(screen.getByRole('heading', { name: 'Where Next?' })).toBeInTheDocument();
    expect(screen.getByText('One place worth going. Every week.')).toBeInTheDocument();
    expect(screen.getByLabelText(/your email address/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what you'll get/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One destination' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Why now' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How to do it' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan it with Trailie' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /see what an issue looks like/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /glacier after labor day/i })).toBeInTheDocument();
    expect(NEWSLETTER_BENEFITS.map((card) => card.title)).toEqual([
      'One destination',
      'Why now',
      'How to do it',
      'Plan it with Trailie',
    ]);
  });

  it('shows confirmed state for ?subscribed=true and hides the form', () => {
    mockGet.mockImplementation((key) => (key === 'subscribed' ? 'true' : null));
    render(<NewsletterSignupSlot />);

    expect(screen.getByRole('heading', { name: /you're in/i })).toBeInTheDocument();
    expect(screen.getByText(/welcome to where next\?/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your email address/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /check your inbox/i })).not.toBeInTheDocument();
  });

  it('renders the static sample issue preview', () => {
    render(<NewsletterSampleIssue />);

    expect(screen.getByText(/where next\? · sample issue/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /plan it with trailie/i })).toHaveAttribute(
      'href',
      '/plan-ai?park=glac&name=Glacier%20National%20Park'
    );
  });
});
