import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { permanentRedirect } from 'next/navigation';
import NewsletterLanding from '../NewsletterLanding';
import NewsletterSignupSlot from '../NewsletterSignupSlot';
import NewsletterPage from '../page';

const mockGet = vi.fn(() => null);
vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: mockGet }), permanentRedirect: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a> }));
vi.mock('@/utils/analytics', () => ({ logNewsletterSignup: vi.fn() }));
vi.mock('@/lib/apiBase', () => ({ getApiBaseUrl: () => 'http://localhost:5001/api' }));

describe('merged Where Next newsletter', () => {
  beforeEach(() => {
    mockGet.mockReturnValue(null);
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
  });

  it('offers separate launch signup without a preview or weekly-delivery promise', () => {
    render(<NewsletterLanding />);
    expect(screen.getByRole('heading', { name: 'More ideas for your next trip' })).toBeInTheDocument();
    expect(screen.getByLabelText(/your email address/i)).toBeInTheDocument();
    expect(screen.getByText(/Picking a place never subscribes you/i)).toBeInTheDocument();
    expect(screen.queryByText(/Glacier after Labor Day|Sample issue|One email a week/i)).not.toBeInTheDocument();
  });

  it('shows confirmation and hides the signup form', () => {
    mockGet.mockImplementation(key => key === 'subscribed' ? 'true' : null);
    render(<NewsletterSignupSlot />);
    expect(screen.getByRole('heading', { name: /you're in/i })).toBeInTheDocument();
    expect(screen.getByText(/subscription is confirmed/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/your email address/i)).not.toBeInTheDocument();
  });

  it('preserves legacy newsletter query parameters and targets the merged signup section', async () => {
    await NewsletterPage({ searchParams: Promise.resolve({ subscribed: 'true', utm_source: ['email', 'archive'] }) });
    expect(permanentRedirect).toHaveBeenLastCalledWith('/where-next?subscribed=true&utm_source=email&utm_source=archive#newsletter');
    await NewsletterPage({ searchParams: Promise.resolve({ unsubscribed: 'true' }) });
    expect(permanentRedirect).toHaveBeenLastCalledWith('/where-next?unsubscribed=true#newsletter');
    await NewsletterPage({ searchParams: Promise.resolve({}) });
    expect(permanentRedirect).toHaveBeenLastCalledWith('/where-next#newsletter');
  });

  it('shows unsubscribe failure without claiming the subscription was removed', () => {
    mockGet.mockImplementation(key => key === 'unsubscribe_error' ? 'server' : null);
    render(<NewsletterSignupSlot />);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn’t complete your unsubscribe request/i);
    expect(screen.queryByText(/been unsubscribed/i)).not.toBeInTheDocument();
  });
});
