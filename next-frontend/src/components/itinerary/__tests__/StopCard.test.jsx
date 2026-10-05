import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StopCard from '../StopCard';

const baseProps = {
  dayId: 'day-1',
  dragHandleProps: {},
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
};

describe('StopCard schedule precision', () => {
  it('renders a bounded time window without formatting it as a clock time', () => {
    render(<StopCard {...baseProps} stop={{ id: 's1', name: 'Scenic walk', type: 'trail', startTime: '', timeWindow: 'Early morning · around 7–8 AM', duration: 60 }} />);
    expect(screen.getByText(/Early morning · around 7–8 AM/)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it('preserves a justified exact operational time', () => {
    render(<StopCard {...baseProps} stop={{ id: 's2', name: 'Reserved shuttle', type: 'custom', startTime: '09:30', duration: 30 }} />);
    expect(screen.getByText(/9:30 AM/)).toBeInTheDocument();
  });
});
