import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewsletterWidget from '../NewsletterWidget';

const logNewsletterSignup = vi.fn();

vi.mock('@/utils/analytics', () => ({
  logNewsletterSignup: (...args) => logNewsletterSignup(...args),
}));

vi.mock('@/lib/apiBase', () => ({
  getApiBaseUrl: () => 'http://localhost:5001/api',
}));

function mockIntersectingObserver() {
  class ImmediateIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback([{ isIntersecting: true }]);
    }

    disconnect() {}

    unobserve() {}
  }

  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
}

describe('NewsletterWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIntersectingObserver();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders email only, without a first-name field', () => {
    render(<NewsletterWidget source="newsletter-page" />);

    expect(screen.getByLabelText(/your email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/your email address/i)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/your email address/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /get where next\?/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join free/i })).toBeInTheDocument();
  });

  it('uses blog-footer copy and CTA', () => {
    render(<NewsletterWidget source="blog-footer" embedded />);

    expect(screen.getByText(/not sure where to go next\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join where next\?/i })).toBeInTheDocument();
  });

  it('fires newsletter_signup_view once with source', () => {
    const { rerender } = render(<NewsletterWidget source="newsletter-page" />);

    expect(logNewsletterSignup).toHaveBeenCalledWith(
      'newsletter_signup_view',
      expect.objectContaining({ source: 'newsletter-page' })
    );

    rerender(<NewsletterWidget source="newsletter-page" />);
    const viewCalls = logNewsletterSignup.mock.calls.filter(([action]) => action === 'newsletter_signup_view');
    expect(viewCalls).toHaveLength(1);
  });

  it('submits newsletter-page source without firstName', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ success: true }),
    });

    render(<NewsletterWidget source="newsletter-page" />);
    await userEvent.type(screen.getByLabelText(/your email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join free/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.source).toBe('newsletter-page');
    expect(body.email).toBe('reader@example.com');
    expect(body).not.toHaveProperty('firstName');
  });

  it('submits blog-footer source', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ success: true }),
    });

    render(<NewsletterWidget source="blog-footer" embedded />);
    await userEvent.type(screen.getByLabelText(/your email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join where next\?/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).source).toBe('blog-footer');
  });

  it('shows pending confirmation copy, not a confirmed state', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ success: true }),
    });

    render(<NewsletterWidget source="newsletter-page" />);
    await userEvent.type(screen.getByLabelText(/your email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join free/i }));

    expect(await screen.findByRole('heading', { name: /check your inbox/i })).toBeInTheDocument();
    expect(screen.getByText(/confirmation link/i)).toBeInTheDocument();
    expect(screen.queryByText(/you're in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/you're subscribed/i)).not.toBeInTheDocument();
  });

  it('disables the submit button while loading', async () => {
    let resolveFetch;
    global.fetch.mockReturnValue(new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    render(<NewsletterWidget source="newsletter-page" />);
    await userEvent.type(screen.getByLabelText(/your email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join free/i }));

    const button = screen.getByRole('button', { name: /joining/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    resolveFetch({ json: async () => ({ success: true }) });
    expect(await screen.findByRole('heading', { name: /check your inbox/i })).toBeInTheDocument();
  });

  it('keeps the email and shows a useful error when signup fails', async () => {
    global.fetch.mockResolvedValue({
      json: async () => ({ success: false, error: 'Something went wrong. Try again.' }),
    });

    render(<NewsletterWidget source="newsletter-page" />);
    const input = screen.getByLabelText(/your email address/i);
    await userEvent.type(input, 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join free/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(input).toHaveValue('reader@example.com');
    expect(screen.getByRole('button', { name: /join free/i })).not.toBeDisabled();
  });

  it('fires submit, success, and error analytics with source and without PII', async () => {
    global.fetch
      .mockResolvedValueOnce({ json: async () => ({ success: true }) })
      .mockResolvedValueOnce({ json: async () => ({ success: false, error: 'Try again.' }) });

    const { unmount } = render(<NewsletterWidget source="newsletter-page" />);
    await userEvent.type(screen.getByLabelText(/your email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join free/i }));

    await waitFor(() => {
      expect(logNewsletterSignup).toHaveBeenCalledWith(
        'newsletter_signup_submit',
        expect.objectContaining({ source: 'newsletter-page' })
      );
      expect(logNewsletterSignup).toHaveBeenCalledWith(
        'newsletter_signup_success',
        expect.objectContaining({ source: 'newsletter-page' })
      );
    });

    const successPayload = logNewsletterSignup.mock.calls.find(([action]) => action === 'newsletter_signup_success')[1];
    expect(JSON.stringify(successPayload)).not.toMatch(/reader@example.com/i);

    unmount();
    render(<NewsletterWidget source="blog-footer" embedded />);
    await userEvent.type(screen.getByLabelText(/your email address/i), 'reader@example.com');
    await userEvent.click(screen.getByRole('button', { name: /join where next\?/i }));

    await waitFor(() => {
      expect(logNewsletterSignup).toHaveBeenCalledWith(
        'newsletter_signup_error',
        expect.objectContaining({ source: 'blog-footer' })
      );
    });
  });
});
