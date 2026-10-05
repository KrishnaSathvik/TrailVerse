import { describe, it, expect, afterEach } from 'vitest';
import { getTrailieCapabilities, getSharedViewerCapabilities } from '@/lib/trailieCapabilities';

const KEY = 'NEXT_PUBLIC_TRAILIE_PROSE_RECOVERY';

describe('Stage 14.5 §4 — recovery capability exposure', () => {
  afterEach(() => { delete process.env[KEY]; });

  it('defaults to disabled', () => {
    expect(getTrailieCapabilities()).toEqual({ trailieProseRecoveryEnabled: false });
  });

  it.each([['true', true], ['TRUE', true], ['false', false], ['1', false], ['', false]])(
    '%s → %s', (value, expected) => {
      process.env[KEY] = value;
      expect(getTrailieCapabilities().trailieProseRecoveryEnabled).toBe(expected);
    }
  );

  it('never reads the server flag name', () => {
    const source = String(getTrailieCapabilities);
    expect(source).not.toMatch(/process\.env\.TRAILIE_PROSE_RECOVERY\b/);
    expect(source).not.toMatch(/PROSE_RECOVERY_LEASE_MS|PROSE_RECOVERY_MAX_RUNTIME_MS/);
  });

  it('exposes only the bounded capability set', () => {
    process.env[KEY] = 'true';
    expect(Object.keys(getTrailieCapabilities())).toEqual(['trailieProseRecoveryEnabled']);
  });

  it('shared viewers never receive a capability, even when the build enables it', () => {
    process.env[KEY] = 'true';
    expect(getSharedViewerCapabilities().trailieProseRecoveryEnabled).toBe(false);
  });
});
