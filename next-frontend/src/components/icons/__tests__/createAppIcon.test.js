import {
  inferIconPixelSize,
  resolveIconWeight,
  stripIconSizeClasses,
} from '../createAppIcon';

describe('createAppIcon helpers', () => {
  it('maps Tailwind h-/w- pairs to pixel sizes', () => {
    expect(inferIconPixelSize('h-4 w-4 shrink-0')).toBe(16);
    expect(inferIconPixelSize('h-5 w-5')).toBe(20);
    expect(inferIconPixelSize('h-6 w-6')).toBe(24);
    expect(inferIconPixelSize('h-3 w-3')).toBe(16);
  });

  it('strips size utilities so SVG is not double-scaled', () => {
    expect(stripIconSizeClasses('h-5 w-5 shrink-0 text-red-500')).toBe(
      'shrink-0 text-red-500'
    );
  });

  it('uses bold weight for small icons when not overridden', () => {
    expect(resolveIconWeight(undefined, 16)).toBe('bold');
    expect(resolveIconWeight('fill', 16)).toBe('fill');
    expect(resolveIconWeight(undefined, 24)).toBe('regular');
  });
});
