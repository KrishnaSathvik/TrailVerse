import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const posthog = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  stopSessionRecording: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: posthog }));

async function loadClient() {
  vi.resetModules();
  return import('../posthogClient');
}

describe('posthogClient', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_DEBUG', 'true');
    window.localStorage.clear();
    Object.values(posthog).forEach((fn) => fn.mockClear());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts PostHog on the first capture so the landing pageview is not dropped', async () => {
    const { capturePostHog } = await loadClient();
    capturePostHog('$pageview', { page_category: 'home' });

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith('$pageview', { page_category: 'home' });
    expect(posthog.init.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.capture.mock.invocationCallOrder[0]
    );
  });

  it('initializes once across early and later calls', async () => {
    const { capturePostHog, initPostHog, identifyPostHog } = await loadClient();
    capturePostHog('$pageview', {});
    initPostHog();
    identifyPostHog('user-1');

    expect(posthog.init).toHaveBeenCalledTimes(1);
    expect(posthog.identify).toHaveBeenCalledWith('user-1');
  });

  it('sends nothing without a key', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const { capturePostHog } = await loadClient();
    capturePostHog('$pageview', {});

    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('sends nothing after the visitor opts out', async () => {
    window.localStorage.setItem('analytics_opt_out', 'true');
    const { capturePostHog } = await loadClient();
    capturePostHog('$pageview', {});

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('registers the URL scrubber with PostHog', async () => {
    const { capturePostHog, scrubEvent } = await loadClient();
    capturePostHog('$pageview', {});

    expect(posthog.init.mock.calls[0][1].before_send).toBe(scrubEvent);
  });
});

describe('scrubEvent', () => {
  it('strips query strings and hashes from automatic URL properties', async () => {
    const { scrubEvent } = await loadClient();
    const event = scrubEvent({
      properties: {
        $current_url: 'https://www.nationalparksexplorerusa.com/explore?q=yellowstone#top',
        $pathname: '/explore',
        $referrer: 'https://www.google.com/search?q=private+words',
      },
    });

    expect(event.properties.$current_url).toBe('https://www.nationalparksexplorerusa.com/explore');
    expect(event.properties.$referrer).toBe('https://www.google.com/search');
    expect(JSON.stringify(event)).not.toMatch(/yellowstone|private/);
  });

  it('redacts auth tokens and private share ids in paths', async () => {
    const { scrubEvent } = await loadClient();
    const event = scrubEvent({
      properties: {
        $current_url: 'https://www.nationalparksexplorerusa.com/reset-password/abc123secret',
        $pathname: '/verify-email/tok456',
      },
      $set_once: { $initial_current_url: 'https://www.nationalparksexplorerusa.com/plan-ai/shared/share789' },
    });

    expect(event.properties.$current_url).toBe('https://www.nationalparksexplorerusa.com/reset-password/[redacted]');
    expect(event.properties.$pathname).toBe('/verify-email/[redacted]');
    expect(event.$set_once.$initial_current_url).toBe('https://www.nationalparksexplorerusa.com/plan-ai/shared/[redacted]');
  });

  it('keeps PostHog sentinels and park URLs intact', async () => {
    const { scrubEvent } = await loadClient();
    const event = scrubEvent({
      properties: {
        $referrer: '$direct',
        $current_url: 'https://www.nationalparksexplorerusa.com/parks/chiricahua-national-park',
      },
    });

    expect(event.properties.$referrer).toBe('$direct');
    expect(event.properties.$current_url).toBe('https://www.nationalparksexplorerusa.com/parks/chiricahua-national-park');
  });
});
