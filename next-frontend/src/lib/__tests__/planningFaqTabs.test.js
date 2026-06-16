import { describe, expect, it } from 'vitest';
import {
  alignPlanningFaqWithTabs,
  buildFaqIntroCopy,
  buildPeakCrowdFaqAnswer,
  buildPermitFaqAnswer,
  planningFaqTabContextFromExplore,
} from '../planningFaqTabs';

describe('planningFaqTabs', () => {
  it('does not mention Permits tab when no permit inventory', () => {
    const answer = buildPermitFaqAnswer({
      shortName: 'Carlsbad Caverns',
      parkCode: 'cave',
      permits: [],
      hasPermitsTab: false,
    });
    expect(answer).not.toMatch(/Permits tab/i);
    expect(answer).toMatch(/Overview on this page/i);
    expect(answer).not.toMatch(/official website/i);
    expect(answer).not.toMatch(/Recreation\.gov/i);
  });

  it('mentions Permits tab when RIDB inventory exists', () => {
    const answer = buildPermitFaqAnswer({
      shortName: 'Yosemite',
      parkCode: 'yose',
      permits: [{ name: 'Half Dome Permit' }],
      hasPermitsTab: true,
    });
    expect(answer).toMatch(/TrailVerse lists/i);
    expect(answer).toMatch(/Permits tab/i);
    expect(answer).toMatch(/Half Dome Permit/);
  });

  it('peak crowd answer does not contradict busiest month with a low crowd label', () => {
    const answer = buildPeakCrowdFaqAnswer({
      shortName: 'Carlsbad Caverns',
      parkCode: 'cave',
      park: { parkCode: 'cave' },
      alertCount: 0,
    });
    expect(answer).toMatch(/July is usually the busiest month/);
    expect(answer).not.toMatch(/Typical crowd level/i);
    expect(answer).toMatch(/crowd calendar/i);
  });

  it('builds intro copy from visible tabs only', () => {
    expect(buildFaqIntroCopy({ alertCount: 6, hasPermitsTab: false })).toMatch(/Alerts/);
    expect(buildFaqIntroCopy({ alertCount: 6, hasPermitsTab: false })).not.toMatch(/Permits/);
    expect(buildFaqIntroCopy({ alertCount: 0, hasPermitsTab: false })).not.toMatch(/check Alerts/);
  });

  it('rewrites SSR FAQ to TrailVerse Overview when Permits tab is hidden', () => {
    const items = alignPlanningFaqWithTabs(
      [{
        q: 'Do you need reservations for Carlsbad Caverns?',
        a: 'Old answer with Permits tab.',
        href: '/parks/carlsbad-caverns-national-park?tab=permits',
        linkLabel: 'See Permits tab →',
        linkKey: 'permits',
      }],
      { fullName: 'Carlsbad Caverns National Park', parkCode: 'cave', url: 'https://www.nps.gov/cave/' },
      'carlsbad-caverns-national-park',
      { permitCount: 0, alertCount: 6, hasActivitiesTab: true, hasPlacesTab: true },
      { permits: [] },
    );

    expect(items[0].a).not.toMatch(/Permits tab/i);
    expect(items[0].href).toBe('/parks/carlsbad-caverns-national-park');
    expect(items[0].linkLabel).toBe('See Overview →');
    expect(items[0].a).toMatch(/Overview on this page/i);
  });

  it('rewrites busiest FAQ without contradictory crowd level', () => {
    const items = alignPlanningFaqWithTabs(
      [{
        q: 'When is Carlsbad Caverns busiest?',
        a: 'July is usually the busiest month. Typical crowd level: Low.',
        linkKey: 'crowd',
      }],
      { fullName: 'Carlsbad Caverns National Park', parkCode: 'cave' },
      'carlsbad-caverns-national-park',
      { permitCount: 0, alertCount: 0 },
    );

    expect(items[0].a).not.toMatch(/Typical crowd level/i);
    expect(items[0].href).toMatch(/when-to-go\?park=CAVE/);
    expect(items[0].linkLabel).toBe('View crowd calendar →');
  });

  it('derives tab context from explore cache', () => {
    const ctx = planningFaqTabContextFromExplore({
      alertCount: 2,
      permitCount: 0,
      exploreReady: true,
      exploreCache: { activities: [{ id: 1 }], places: [] },
    });
    expect(ctx.hasAlertsTab).toBe(true);
    expect(ctx.hasPermitsTab).toBe(false);
    expect(ctx.hasActivitiesTab).toBe(true);
    expect(ctx.hasPlacesTab).toBe(false);
  });
});
