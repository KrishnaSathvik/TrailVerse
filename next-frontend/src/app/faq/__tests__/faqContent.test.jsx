import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FAQPage from '../page';
import { FAQ_CATEGORIES } from '@/data/faqContent';

vi.mock('@/components/common/Header', () => ({ default: () => null }));
vi.mock('@/components/common/Footer', () => ({ default: () => null }));
vi.mock('@/utils/analytics', () => ({ logEvent: vi.fn() }));

describe('FAQ content and accessible answers', () => {
  it('keeps every structured answer identical to the answer available to readers', () => {
    const { container } = render(<FAQPage />);
    const schema = JSON.parse(container.querySelector('script[type="application/ld+json"]').textContent);
    const questions = FAQ_CATEGORIES.flatMap(category => category.questions);
    expect(schema.mainEntity).toHaveLength(questions.length);
    for (const entry of schema.mainEntity) {
      const button = screen.getByRole('button', { name: entry.name });
      const answer = document.getElementById(button.getAttribute('aria-controls'));
      expect(button).toHaveAttribute('aria-expanded', 'false');
      expect(answer).not.toBeVisible();
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'true');
      expect(answer).toBeVisible();
      expect(answer.textContent).toBe(entry.acceptedAnswer.text);
      fireEvent.click(button);
      expect(answer).not.toBeVisible();
    }
  });
});
