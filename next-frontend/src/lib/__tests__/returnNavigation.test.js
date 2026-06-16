import { describe, expect, it } from 'vitest';
import {
  backLabelForPath,
  buildReturnPath,
  hrefWithFrom,
  parkDetailHref,
  resolveReturnNavigation,
} from '../returnNavigation';

describe('backLabelForPath', () => {
  it('labels landing as TrailVerse, not Home', () => {
    expect(backLabelForPath('/')).toBe('TrailVerse');
  });

  it('labels logged-in feed separately', () => {
    expect(backLabelForPath('/home')).toBe('Home');
  });

  it('labels known surfaces', () => {
    expect(backLabelForPath('/explore')).toBe('Explore');
    expect(backLabelForPath('/map')).toBe('Map');
    expect(backLabelForPath('/blog/some-post')).toBe('Blog');
    expect(backLabelForPath('/events')).toBe('Events');
  });

  it('labels park return paths', () => {
    expect(backLabelForPath('/parks/yellowstone-national-park')).toBe('Back to park');
    expect(backLabelForPath('/parks/state/utah')).toBe('State parks');
  });
});

describe('parkDetailHref', () => {
  it('appends from and tab', () => {
    expect(parkDetailHref('yosemite-national-park', '/', { tab: 'activities' })).toBe(
      '/parks/yosemite-national-park?tab=activities&from=%2F'
    );
  });
});

describe('resolveReturnNavigation', () => {
  it('uses from param when present', () => {
    expect(resolveReturnNavigation('/', { defaultHref: '/explore', defaultLabel: 'Explore' })).toEqual({
      backHref: '/',
      backLabel: 'TrailVerse',
    });
  });

  it('falls back to defaults without from', () => {
    expect(resolveReturnNavigation(null, { defaultHref: '/explore', defaultLabel: 'Explore' })).toEqual({
      backHref: '/explore',
      backLabel: 'Explore',
    });
  });
});

describe('hrefWithFrom', () => {
  it('preserves existing query params on destination', () => {
    expect(hrefWithFrom('/parks/yell?tab=permits', '/explore')).toBe(
      '/parks/yell?tab=permits&from=%2Fexplore'
    );
  });
});

describe('buildReturnPath', () => {
  it('joins pathname and search', () => {
    expect(buildReturnPath('/explore', 'state=UT')).toBe('/explore?state=UT');
  });
});
