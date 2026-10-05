import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import GuestLimitMessageExtras from '../GuestLimitMessageExtras';

describe('GuestLimitMessageExtras — Phase 7B conversion treatment', () => {
  afterEach(cleanup);

  it('keeps one restrained sign-in action without assistant sparkle chrome', () => {
    const { container } = render(<GuestLimitMessageExtras onSignup={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Sign in to continue' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});
