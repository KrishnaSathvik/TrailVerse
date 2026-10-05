import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SharedConversation from '../SharedConversation';

const plan = {
  parkName: 'Zion National Park',
  days: [
    {
      dayNumber: 1,
      title: 'Virgin River',
      stops: [{ name: 'Pa’rus Trail', time: 'Late afternoon', duration: '1h 30m' }],
    },
  ],
};

describe('SharedConversation', () => {
  it('renders assistant answers through TrailieResponse and attaches the canonical plan', () => {
    render(
      <SharedConversation
        sharedBy={{ name: 'Alex' }}
        canonicalPlan={plan}
        conversation={[
          { id: 'u1', role: 'user', content: 'Plan an easy Zion day.' },
          {
            id: 'a1',
            role: 'assistant',
            content: 'Here is a relaxed plan.\n\n## At a glance\n\n### Day 1\n\n- Pa’rus Trail',
          },
        ]}
      />
    );

    expect(screen.getByText('Plan an easy Zion day.')).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Assistant message' })).toBeInTheDocument();
    expect(screen.getAllByText('Pa’rus Trail')).toHaveLength(1);
  });
});
