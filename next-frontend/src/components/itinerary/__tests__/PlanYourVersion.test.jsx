import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlanYourVersion, { versionPrompt } from '../PlanYourVersion';

afterEach(cleanup);
const props = { title: 'Shenandoah National Park', days: 4, outline: 'Day 1: Northern ridges; Day 2: Stony Man' };
const ask = () => new URL(screen.getByRole('link', { name: /Plan my version/ }).getAttribute('href'), 'https://x.test').searchParams.get('ask');

it('EMPTY: no preview, Plan my version disabled, Explore this sample still works', () => {
  const explore = vi.fn();
  render(<PlanYourVersion {...props} onExplore={explore} />);
  expect(screen.getByRole('region', { name: 'Make this trip yours' })).toHaveAttribute('data-version-state', 'empty');
  expect(screen.getByText('Pick your season, who’s going, and your travel style to start planning with Trailie.')).toBeInTheDocument();
  expect(screen.getByText('Choose at least one preference to start your version.')).toBeInTheDocument();
  expect(screen.queryByText('I’ll ask Trailie')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Plan my version/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Plan my version/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Explore this sample' }));
  expect(explore).toHaveBeenCalledOnce();
});

it.each([['Fall'], ['Family'], ['Big hiking days']])('CUSTOMIZED: one change (%s) is enough', label => {
  render(<PlanYourVersion {...props} />);
  fireEvent.click(screen.getByRole('checkbox', { name: label }));
  expect(screen.getByRole('region', { name: 'Make this trip yours' })).toHaveAttribute('data-version-state', 'customized');
  expect(screen.getByText('I’ll ask Trailie')).toBeInTheDocument();
  expect(ask()).toMatch(/^Plan a .*4-day Shenandoah National Park trip/);
});

it('builds the natural sentence as choices accumulate, without explaining mechanics', () => {
  render(<PlanYourVersion {...props} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Fall' }));
  expect(screen.getByText('“Plan a fall 4-day Shenandoah National Park trip, similar to this sample.”')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Couple' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Scenic + relaxed' }));
  expect(screen.getByText('“Plan a fall 4-day Shenandoah National Park trip for two people, similar to this sample, with a scenic and relaxed pace.”')).toBeInTheDocument();
  expect(screen.queryByText(/outline so Trailie knows/)).not.toBeInTheDocument();
  // Trailie still receives which sample is meant; the visitor sees it in the chat.
  expect(ask()).toBe('Plan a fall 4-day Shenandoah National Park trip for two people, similar to this sample, with a scenic and relaxed pace. The sample I’m looking at: Day 1: Northern ridges; Day 2: Stony Man.');
});

it('RESET: clicking a selected chip clears it; clearing the last returns to EMPTY', () => {
  render(<PlanYourVersion {...props} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Fall' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Spring' }));
  expect(ask()).toMatch(/^Plan a spring /);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Spring' }));
  expect(screen.getByRole('checkbox', { name: 'Spring' })).not.toBeChecked();
  expect(screen.getByRole('region', { name: 'Make this trip yours' })).toHaveAttribute('data-version-state', 'empty');
  expect(screen.getByRole('button', { name: /Plan my version/ })).toBeDisabled();
});

it('has no version without a change', () => {
  expect(versionPrompt(props, {})).toBeNull();
});
