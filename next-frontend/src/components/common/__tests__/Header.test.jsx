import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../Header';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    logout: vi.fn(),
  }),
}));

vi.mock('../ThemeSwitcher', () => ({
  default: () => <div>Theme Switcher</div>,
}));

vi.mock('../Button', () => ({
  default: ({ children, onClick, className }) => (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock('@components/icons', () => ({
  Menu: (props) => <svg {...props} />,
  X: (props) => <svg {...props} />,
  LogOut: (props) => <svg {...props} />,
  Sparkles: (props) => <svg {...props} />,
}));

describe('Header mobile navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
  });

  it('renders the mobile navigation menu into the document body when opened', async () => {
    render(<Header />);

    await userEvent.click(screen.getByRole('button', { name: /open sidebar/i }));

    const mobileNavigation = document.body.querySelector('#mobile-navigation');

    expect(mobileNavigation).toBeInTheDocument();
    expect(within(mobileNavigation).getByText('Explore')).toBeInTheDocument();
    expect(within(mobileNavigation).getByText('Blog')).toBeInTheDocument();
  });
});
