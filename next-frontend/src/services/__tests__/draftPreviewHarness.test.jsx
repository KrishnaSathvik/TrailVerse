import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import PreviewHarness from '@/app/dev/trailie-preview/PreviewHarness';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = async ms => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
test('offline streamed days remain separate until terminal acceptance replaces the preview', async () => {
  vi.useFakeTimers(); render(<PreviewHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Replay accepted' }));
  await advance(1400);
  expect(screen.getByRole('region', { name: 'Draft itinerary preview' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Accepted itinerary' })).not.toBeInTheDocument();
  await advance(4000);
  expect(screen.queryByRole('region', { name: 'Draft itinerary preview' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Accepted itinerary' })).toBeInTheDocument();
});
test.each(['rejected', 'disconnected'])('%s stream withdraws every preview day without promoting a plan', async mode => {
  vi.useFakeTimers(); render(<PreviewHarness />);
  fireEvent.click(screen.getByRole('button', { name: `Replay ${mode}` })); await advance(6000);
  expect(screen.getByText(/Draft preview withdrawn/)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Draft itinerary preview' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Accepted itinerary' })).not.toBeInTheDocument();
});
test('cancellation withdraws immediately and late queued completion cannot restore the preview', async () => {
  vi.useFakeTimers(); render(<PreviewHarness />);
  fireEvent.click(screen.getByRole('button', { name: 'Replay accepted' })); await advance(1400);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel generation' }));
  expect(screen.getByText(/Draft preview withdrawn/)).toBeInTheDocument(); await advance(6000);
  expect(screen.queryByRole('region', { name: 'Accepted itinerary' })).not.toBeInTheDocument();
});
