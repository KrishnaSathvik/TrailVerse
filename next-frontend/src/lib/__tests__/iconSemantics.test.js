import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activityIconColor, stopTypeColor, toneForActivity } from '../iconSemantics';

const libDir = dirname(fileURLToPath(import.meta.url));

describe('iconSemantics', () => {
  it('keeps lodging and visitor centers on different stop tokens', () => {
    expect(stopTypeColor('lodging')).toBe('var(--icon-stop-lodging)');
    expect(stopTypeColor('visitor_center')).toBe('var(--icon-stop-visitor)');
    expect(stopTypeColor('lodging')).not.toBe(stopTypeColor('visitor_center'));
  });

  it('gives hiking, dining, camping, and transportation their own tokens', () => {
    const colors = ['trail', 'campground', 'food', 'transport'].map(stopTypeColor);
    expect(new Set(colors).size).toBe(colors.length);
    expect(stopTypeColor('trail')).toBe('var(--icon-stop-hike)');
    expect(stopTypeColor('food')).toBe('var(--icon-stop-dining)');
  });

  it('maps activity artwork onto the shared category tokens', () => {
    expect(toneForActivity('hiking')).toBe('nature');
    expect(toneForActivity('fishing')).toBe('water');
    expect(toneForActivity('photography')).toBe('discovery');
    expect(toneForActivity('auto-and-atv')).toBe('travel');
    expect(toneForActivity('food')).toBe('event');
    expect(activityIconColor('fishing')).toBe('var(--icon-water)');
  });

  it('colors Discover activity artwork with a mask instead of dark inversion', () => {
    const source = readFileSync(join(libDir, '../discoverActivityIcons.js'), 'utf8');
    expect(source).toContain('activity-icon');
    expect(source).toContain('maskImage');
    expect(source).not.toContain('dark:invert');
  });
});
