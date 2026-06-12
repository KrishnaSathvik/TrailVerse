import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from '../Header';

const mockUseAuth = vi.fn();
const mockUsePathname = vi.fn(() => '/');

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
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
  ChevronDown: (props) => <svg {...props} />,
}));

describe('Header mobile navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    mockUsePathname.mockReturnValue('/');
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      authReady: false,
      initialAuthHint: false,
      user: null,
      logout: vi.fn(),
      loading: false,
    });
  });

  it('shows primary mobile links inline without opening a menu', () => {
    render(<Header />);

    const mobileNav = within(screen.getByTestId('mobile-inline-nav'));

    expect(mobileNav.getByRole('link', { name: 'Explore' })).toBeInTheDocument();
    expect(mobileNav.getByRole('link', { name: 'Blog' })).toBeInTheDocument();
    expect(mobileNav.getByRole('link', { name: 'Events' })).toBeInTheDocument();
    expect(mobileNav.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument();
    expect(mobileNav.queryByRole('link', { name: 'Trailie' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'TrailVerse home' })).toBeInTheDocument();
  });

  it('shows auth mobile nav immediately when SSR auth cookie hint is present', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      authReady: false,
      initialAuthHint: true,
      user: null,
      logout: vi.fn(),
      loading: true,
    });

    render(<Header />);

    const mobileNav = within(screen.getByTestId('mobile-inline-nav'));
    expect(mobileNav.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  });

  it('marks the current mobile nav link as selected', () => {
    mockUsePathname.mockReturnValue('/explore');

    render(<Header />);

    const exploreLink = within(screen.getByTestId('mobile-inline-nav')).getByRole('link', {
      name: 'Explore',
    });
    expect(exploreLink).toHaveAttribute('aria-current', 'page');
    expect(exploreLink.className).toContain('header-mobile-nav-item');
    expect(exploreLink).not.toHaveAttribute('style');
  });

  it('opens the mobile more menu with secondary links', async () => {
    render(<Header />);

    const mobileNav = within(screen.getByTestId('mobile-inline-nav'));
    await userEvent.click(mobileNav.getByRole('button', { name: /more/i }));

    const moreMenu = document.getElementById('more-navigation-menu-mobile');

    expect(moreMenu).toBeInTheDocument();
    expect(within(moreMenu).getByRole('menuitem', { name: 'Map' })).toBeInTheDocument();
    expect(within(moreMenu).getByRole('menuitem', { name: 'Trailie' })).toBeInTheDocument();
    expect(within(moreMenu).getByRole('menuitem', { name: 'Compare' })).toBeInTheDocument();
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Blog' })).not.toBeInTheDocument();
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Events' })).not.toBeInTheDocument();
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('keeps blog inside more for authenticated users', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      authReady: true,
      initialAuthHint: true,
      user: { role: 'user' },
      logout: vi.fn(),
      loading: false,
    });

    render(<Header />);

    const mobileNav = within(screen.getByTestId('mobile-inline-nav'));

    await waitFor(() => {
      expect(mobileNav.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    });
    expect(mobileNav.getByRole('link', { name: 'Blog' })).toBeInTheDocument();
    expect(mobileNav.getByRole('link', { name: 'Events' })).toBeInTheDocument();
    expect(mobileNav.queryByRole('link', { name: 'Map' })).not.toBeInTheDocument();

    await userEvent.click(mobileNav.getByRole('button', { name: /more/i }));

    const moreMenu = document.getElementById('more-navigation-menu-mobile');
    expect(within(moreMenu).getByRole('menuitem', { name: 'Map' })).toBeInTheDocument();
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Blog' })).not.toBeInTheDocument();
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Events' })).not.toBeInTheDocument();
    expect(within(moreMenu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  });

  it('does not show logout while auth is optimistic (SSR cookie hint, user not loaded)', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      authReady: false,
      initialAuthHint: true,
      user: null,
      logout: vi.fn(),
      loading: true,
    });

    render(<Header />);

    const mobileNav = within(screen.getByTestId('mobile-inline-nav'));
    await waitFor(() => {
      expect(mobileNav.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
    await userEvent.click(mobileNav.getByRole('button', { name: /more/i }));

    const moreMenu = document.getElementById('more-navigation-menu-mobile');
    expect(within(moreMenu).queryByRole('menuitem', { name: 'Log out' })).not.toBeInTheDocument();
  });

  it('shows logout after client mount when auth is ready', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      authReady: true,
      initialAuthHint: true,
      user: { role: 'user' },
      logout: vi.fn(),
      loading: false,
    });

    render(<Header />);

    const mobileNav = within(screen.getByTestId('mobile-inline-nav'));
    await userEvent.click(mobileNav.getByRole('button', { name: /more/i }));

    await waitFor(() => {
      const moreMenu = document.getElementById('more-navigation-menu-mobile');
      expect(within(moreMenu).getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
    });
  });
});
