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

  it('shows the day-by-day plan on the latest reply when the share payload stripped message ids', () => {
    // Real public shares: messages are { role, content } only, while the
    // canonical plan still carries its response identity.
    const identifiedPlan = {
      ...plan,
      responseId: 'resp_123',
      itineraryHash: 'hash_abc',
      days: [{ dayNumber: 1, title: 'Canyon Day', stops: [{ name: 'Riverside Walk', time: '9:00 AM', duration: '1h' }] }],
    };
    render(
      <SharedConversation
        sharedBy={{ name: 'Alex' }}
        canonicalPlan={identifiedPlan}
        conversation={[
          { role: 'user', content: 'Plan an easy Zion day.' },
          { role: 'assistant', content: 'Here is a relaxed plan for your Zion day.' },
          { role: 'user', content: 'Make it shorter.' },
          { role: 'assistant', content: 'Done, it is shorter now.' },
        ]}
      />
    );

    expect(screen.getByText('Make it shorter.')).toBeInTheDocument();
    expect(screen.getByText('Done, it is shorter now.')).toBeInTheDocument();
    expect(screen.getAllByText('Riverside Walk')).toHaveLength(1);
  });
});
