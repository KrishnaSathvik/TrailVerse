import { describe, expect, it } from 'vitest';
import {
  applyHeadingIdsToElement,
  collectHeadingsFromElement,
  injectHeadingIdsIntoHtml,
  parseBlogHeadingsFromHtml
} from '../blogHeadings';

describe('blogHeadings utilities', () => {
  it('parses standard headings from html', () => {
    const headings = parseBlogHeadingsFromHtml(`
      <h2>The Quick Math</h2>
      <p>Intro</p>
      <h3>Scenario 1</h3>
    `);

    expect(headings).toEqual([
      expect.objectContaining({ text: 'The Quick Math', level: 2, id: 'heading-0-the-quick-math' }),
      expect.objectContaining({ text: 'Scenario 1', level: 3, id: 'heading-1-scenario-1' })
    ]);
  });

  it('applies ids and collects rendered headings from the article container', () => {
    document.body.innerHTML = `
      <article>
        <div class="blog-prose">
          <h2>The Quick Math</h2>
          <p>Intro</p>
          <h3>Scenario 1</h3>
        </div>
      </article>
    `;

    const container = document.querySelector('.blog-prose');
    const headings = parseBlogHeadingsFromHtml(container.innerHTML);

    applyHeadingIdsToElement(container, headings);
    const collected = collectHeadingsFromElement(container);

    expect(container.querySelector('h2')?.id).toBe('heading-0-the-quick-math');
    expect(container.querySelector('h3')?.id).toBe('heading-1-scenario-1');
    expect(collected).toEqual([
      expect.objectContaining({ text: 'The Quick Math', level: 2, id: 'heading-0-the-quick-math' }),
      expect.objectContaining({ text: 'Scenario 1', level: 3, id: 'heading-1-scenario-1' })
    ]);
  });

  it('injects heading ids into html before render', () => {
    const html = `
      <h2>The Quick Math</h2>
      <p>Intro</p>
      <h3>Scenario 1</h3>
    `;

    const headings = parseBlogHeadingsFromHtml(html);
    const withIds = injectHeadingIdsIntoHtml(html, headings);

    expect(withIds).toContain('id="heading-0-the-quick-math"');
    expect(withIds).toContain('id="heading-1-scenario-1"');
  });
});
