import { describe, expect, it } from 'vitest';
import {
  buildAppleAppSiteAssociation,
  getUniversalLinkPaths,
  IOS_BUNDLE_ID,
} from '@/lib/appleAppSiteAssociation';

describe('appleAppSiteAssociation', () => {
  it('includes core park and planning paths', () => {
    const paths = getUniversalLinkPaths();
    expect(paths).toContain('/parks/*');
    expect(paths).toContain('/plan-ai/*');
    expect(paths).toContain('/compare*');
    expect(paths).toContain('/parks-for-couples');
    expect(paths).toContain('/dog-friendly-parks');
  });

  it('builds valid AASA with team id and bundle', () => {
    const doc = buildAppleAppSiteAssociation('ABCDE12345');
    expect(doc.applinks.details[0].appID).toBe(`ABCDE12345.${IOS_BUNDLE_ID}`);
    expect(doc.applinks.details[0].paths.length).toBeGreaterThan(15);
  });
});
