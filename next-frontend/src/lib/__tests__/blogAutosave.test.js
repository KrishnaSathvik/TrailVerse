import { describe, expect, test } from 'vitest';
import { AUTOSAVE_TARGET, resolveAutosaveTarget, toAutosavePayload } from '../blogAutosave';

describe('blog editor autosave policy', () => {
  test('new posts autosave to the browser draft slot', () => {
    expect(resolveAutosaveTarget({ isEditMode: false, postId: undefined, serverStatus: 'draft' }))
      .toBe(AUTOSAVE_TARGET.LOCAL);
  });

  test('existing drafts and scheduled posts autosave to the server', () => {
    expect(resolveAutosaveTarget({ isEditMode: true, postId: 'abc', serverStatus: 'draft' }))
      .toBe(AUTOSAVE_TARGET.SERVER);
    expect(resolveAutosaveTarget({ isEditMode: true, postId: 'abc', serverStatus: 'scheduled' }))
      .toBe(AUTOSAVE_TARGET.SERVER);
  });

  test('published posts never autosave to the live article', () => {
    expect(resolveAutosaveTarget({ isEditMode: true, postId: 'abc', serverStatus: 'published' }))
      .toBe(AUTOSAVE_TARGET.LOCAL);
  });

  test('server autosave payload carries no lifecycle fields', () => {
    const payload = toAutosavePayload({
      title: 'T',
      content: '<p>x</p>',
      status: 'draft',
      scheduledAt: null,
      publishedAt: '2026-01-01',
    });
    expect(payload).toEqual({ title: 'T', content: '<p>x</p>' });
    expect('status' in payload).toBe(false);
    expect('scheduledAt' in payload).toBe(false);
  });

  test('does not mutate the input payload', () => {
    const input = { title: 'T', status: 'published' };
    toAutosavePayload(input);
    expect(input.status).toBe('published');
  });
});
