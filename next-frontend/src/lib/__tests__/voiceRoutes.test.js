import { describe, expect, it } from 'vitest';
import { isVoiceHiddenPath } from '../voiceRoutes';

describe('isVoiceHiddenPath', () => {
  it('hides planner, map, and blog surfaces', () => {
    expect(isVoiceHiddenPath('/plan-ai')).toBe(true);
    expect(isVoiceHiddenPath('/plan-ai/abc')).toBe(true);
    expect(isVoiceHiddenPath('/map')).toBe(true);
    expect(isVoiceHiddenPath('/blog/some-post')).toBe(true);
    expect(isVoiceHiddenPath('/dev/voice-ui')).toBe(true);
  });

  it('allows browse pages', () => {
    expect(isVoiceHiddenPath('/')).toBe(false);
    expect(isVoiceHiddenPath('/explore')).toBe(false);
    expect(isVoiceHiddenPath('/parks/zion-national-park')).toBe(false);
    expect(isVoiceHiddenPath('/compare')).toBe(false);
  });
});
