'use strict';

const fs = require('fs');
const path = require('path');
const { resolveResponseMode } = require('../trailieResponseMode');
const { shouldRequestItineraryJson } = require('../discoveryQuery');
const {
  resolveOperationalConstraints,
  applyOperationalConstraints,
  normalizeSchedulePrecision,
} = require('../trailieOperationalConstraints');
const { resolveDestinationDisplayName } = require('../resolvedDestinationDisplay');
const { enrichKnownStopLocations } = require('../knownOutdoorLocations');
const { normalizeCoordinates } = require('../coordinateValidation');
const { parseConstraints, detectConflicts } = require('../constraintEngine');
const { messagesAreHistoricallyEquivalent } = require('../../validation/tripWriteContract');
const { preserveHistoricalAssistantTurns } = require('../canonicalPersistence');

const plan = (stops) => ({ days: [{ id: 'day-1', dayNumber: 1, label: 'Day 1', stops }] });
const stop = (name, extra = {}) => ({ id: name, order: 0, type: 'trail', name, note: '', startTime: '12:00', duration: 60, ...extra });

describe('consolidated Trailie product repairs', () => {
  it('does not turn a negated exposure preference into a hard-trail request', () => {
    expect(detectConflicts(
      { fitnessLevel: 'moderate' },
      'We want no exposed or scary trails.'
    )).toEqual([]);
  });

  it('contains no runtime Haiku model selection in the Trailie server', () => {
    const root = path.resolve(__dirname, '..', '..');
    const productionFiles = [
      'config/aiModels.js', 'config/resolveProviderModel.js', 'services/trailieLiteLlm.js',
      'services/claudeService.js', 'routes/ai.js',
    ];
    const text = productionFiles.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    expect(text).not.toMatch(/claude-haiku|haiku-4/i);
    expect(text).toMatch(/claude-sonnet-5/);
    expect(fs.readFileSync(path.join(root, 'services/trailieLiteLlm.js'), 'utf8')).not.toMatch(/temperature:/);
  });

  it('forces a loaded-plan refinement through Phase A in the real route', () => {
    const route = fs.readFileSync(path.resolve(__dirname, '..', '..', 'routes/ai.js'), 'utf8');
    expect(route).toMatch(/refinementFollowUp && Boolean\(savedTripPlan\?\.plan\?\.days\?\.length\)/);
    expect(route).toMatch(/\(refinementFollowUp \|\| constraintRefinement\) && activePlan[\s\S]{0,100}openEndedDiscovery = false/);
  });

  it.each([
    'make Day 2 easier',
    'make it more relaxed',
    'remove shuttle-heavy stops',
    'add a sunset spot',
  ])('routes an existing plan refinement through structured architect mode: %s', (message) => {
    const metadata = { priorResponseVersion: 1, activeTripContext: { primaryDestination: { name: 'Zion National Park', parkCode: 'zion' } } };
    expect(resolveResponseMode([{ role: 'user', content: message }], metadata)).toBe('architect');
    expect(shouldRequestItineraryJson({
      userMessage: message,
      metadata,
      constraints: { hasConstraints: true, dates: { numDays: 2 } },
      allExtractedParks: [{ parkCode: 'zion', parkName: 'Zion National Park' }],
      conversationUserText: `Plan a 2-day Zion trip. ${message}`,
    })).toBe(true);
  });

  it('removes a closed trail from primary and alternative stops when evidence supplies the closure', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example State Park',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        operationalEvidence: [{
          id: 'seasonal-trail-closures',
          type: 'seasonal_closure',
          destination: 'Example State Park',
          subjects: ['Fire Wave', 'White Domes Trail', 'White Domes Loop'],
          plannerRule: 'Named trails are seasonally closed; this does not mean the approach road or the entire area is closed.',
          closureScope: 'trail_only',
          effectiveFrom: '2026-05-01',
          effectiveThrough: '2026-09-30',
        }],
      },
    });
    const input = plan([
      stop('Fire Wave', { alternatives: [{ name: 'White Domes Loop' }] }),
      stop('White Domes Trail'),
      stop('White Domes Road Scenic Drive', { type: 'transport' }),
      stop('Rainbow Vista'),
    ]);
    const out = applyOperationalConstraints(input, rules);
    expect(out.itinerary.days[0].stops.map((item) => item.name)).toEqual([
      'White Domes Road Scenic Drive', 'Rainbow Vista',
    ]);
    expect(JSON.stringify(out.itinerary)).not.toMatch(/Fire Wave|White Domes Trail/i);
    expect(out.corrections.join(' ')).toMatch(/does not mean its approach road or the entire area is closed/i);
  });

  it('detects parking-duration conflict and requires a ticket acknowledgement from evidence', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        operationalEvidence: [
          {
            type: 'parking_time_limit',
            destination: 'Example National Park',
            subjects: ['Logan Pass'],
            maxMinutes: 180,
            plannerRule: 'Parking at this overlook is limited to 180 minutes.',
          },
          {
            type: 'shuttle_ticket_required',
            destination: 'Example National Park',
            subjects: ['Highline Trail'],
            plannerRule: 'This outing requires a reserved shuttle ticket.',
          },
        ],
      },
    });
    const out = applyOperationalConstraints(plan([
      stop('Logan Pass', { duration: 181 }),
      stop('Highline Trail', { duration: 300 }),
      stop('Highline Trail ticketed outing', { duration: 300, note: 'Reserved shuttle ticket required.' }),
    ]), rules);
    expect(out.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'parking_duration_conflict' }),
    ]));
    expect(out.itinerary.days[0].stops.map((item) => item.name)).toContain('Highline Trail ticketed outing');
    expect(out.itinerary.days[0].stops.map((item) => item.name)).not.toContain('Highline Trail');
    expect(out.itinerary.days[0].stops.map((item) => item.name)).not.toContain('Logan Pass');
  });

  it('keeps a stop that fits exactly within an evidence parking window', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        operationalEvidence: [{
          type: 'parking_time_limit',
          destination: 'Example National Park',
          subjects: ['Logan Pass'],
          maxMinutes: 180,
          plannerRule: 'Parking is limited to 180 minutes.',
        }],
      },
    });
    const out = applyOperationalConstraints(plan([
      stop('Logan Pass wildlife watching', { duration: 180, type: 'landmark' }),
      stop('Evening ranger program', { duration: 60, type: 'visitor_center' }),
    ]), rules);
    expect(out.itinerary.days[0].stops.map((item) => item.name)).toEqual([
      'Logan Pass wildlife watching',
      'Evening ranger program',
    ]);
    expect(out.conflicts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'parking_duration_conflict' }),
    ]));
  });

  it('separates physical difficulty from exposure and filters confirmed-exposed trails', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      userText: 'easy-to-moderate and no exposed scary trails',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        avoidExposure: true,
        operationalEvidence: [{
          type: 'exposure_constraint',
          destination: 'Example National Park',
          subjects: [],
          plannerRule: 'Do not use trails with moderate or high exposure.',
        }],
      },
    });
    const out = applyOperationalConstraints(plan([
      stop('Canyon Overlook', { difficulty: 'moderate', exposureLevel: 'high' }),
      stop("Pa'rus Trail", { exposureLevel: 'low', difficulty: 'easy' }),
    ]), rules);
    expect(out.itinerary.days[0].stops.map((item) => item.name)).toEqual(["Pa'rus Trail"]);
  });

  it('applies a generic dedicated-corridor rule from evidence, not destination hardcodes', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        operationalEvidence: [{
          type: 'route_geography',
          destination: 'Example National Park',
          subjects: ['Timber Creek Overlook'],
          incompatibleWithOtherStops: true,
          plannerRule: 'This overlook requires a dedicated travel corridor.',
        }],
      },
    });
    const revised = applyOperationalConstraints(plan([
      stop('Main highway scenic drive'),
      stop('Timber Creek Overlook'),
    ]), rules);
    expect(revised.itinerary.days[0].stops.map((item) => item.name)).toEqual([
      'Main highway scenic drive',
    ]);
  });

  it('does not invent trail classification or notes when no evidence is present', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Zion National Park',
      userText: 'make it more relaxed',
      now: '2026-08-08T12:00:00Z',
    });
    expect(rules).toEqual([]);
    const revised = applyOperationalConstraints(plan([
      stop('Watchman Trail Overlook Sunset Return', { difficulty: null }),
    ]), rules);
    expect(revised.itinerary.days[0].stops[0].difficulty).toBeNull();
    expect(revised.itinerary.days[0].stops[0].exposureLevel).toBeUndefined();
  });

  it('does not rewrite stop times as a preferred trip design', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Valley of Fire State Park',
      now: '2026-08-08T12:00:00Z',
    });
    const revised = applyOperationalConstraints(plan([
      stop('Midday retreat — lunch and AC break in Overton', { type: 'custom', startTime: '12:00' }),
      stop('Drive from Las Vegas', { type: 'transport', startTime: '10:00' }),
      stop('Elephant Rock', { type: 'trail', startTime: '11:30' }),
      stop('Rainbow Vista', { startTime: '13:00' }),
    ]), rules);
    expect(revised.corrections).toEqual([]);
    expect(revised.itinerary.days[0].stops.map((item) => item.startTime)).toEqual([
      '12:00', '10:00', '11:30', '13:00',
    ]);
  });

  it('removes a photo-access-prohibited stop when evidence supplies the rule', () => {
    const rules = resolveOperationalConstraints({
      destination: 'Example National Park',
      now: '2026-08-08T12:00:00Z',
      constraints: {
        operationalEvidence: [{
          type: 'photo_access',
          destination: 'Example National Park',
          subjects: ['Canyon Junction Bridge sunset view'],
          plannerRule: 'Do not use this bridge as a planned photo stop.',
        }],
      },
    });
    const revised = applyOperationalConstraints(plan([
      stop('Canyon Junction Bridge sunset view'), stop("Pa'rus Trail"),
    ]), rules);
    expect(revised.itinerary.days[0].stops.map((item) => item.name)).toEqual(["Pa'rus Trail"]);
  });

  it('does not invent destination-specific effort notes', () => {
    const sequoiaRules = resolveOperationalConstraints({
      destination: 'Sequoia National Park',
      now: '2026-08-08T12:00:00Z',
    });
    const precise = applyOperationalConstraints(
      plan([stop('General Sherman Tree Trail')]),
      sequoiaRules
    ).itinerary.days[0].stops[0];
    expect(precise.note).toBe('');
    expect(precise.physicalDifficulty).toBeUndefined();
  });

  it('uses bounded windows for generic stops but preserves operational exact times', () => {
    const itinerary = plan([
      stop('Scenic walk', { startTime: '07:00' }),
      stop('Reserved tour', { startTime: '09:30', note: 'Tour departs at 9:30 AM.' }),
    ]);
    normalizeSchedulePrecision(itinerary);
    expect(itinerary.days[0].stops[0]).toMatchObject({ startTime: '', timeWindow: 'Early morning · around 7–8 AM' });
    expect(itinerary.days[0].stops[1].startTime).toBe('09:30');
    expect(itinerary.days[0].stops[1].timeWindow).toBeUndefined();
  });

  it('keeps the explicit couple composition in structured constraints', () => {
    expect(parseConstraints({}, 'Plan a realistic 2-day Zion trip for a couple.')).toMatchObject({ groupSize: 2 });
    expect(parseConstraints({}, 'Plan a solo weekend in Zion.')).toMatchObject({ groupSize: 1 });
  });

  it.each([
    'Glacier National Park',
    'Valley of Fire State Park',
    'Zion National Park',
  ])('preserves the resolved destination title %s', (parkName) => {
    expect(resolveDestinationDisplayName({ resolvedMetadata: { parkName } })).toBe(parkName);
  });

  it('resolves known stops with trusted coordinates and leaves unknown stops quiet', () => {
    const itinerary = plan([stop('Logan Pass'), stop('A user-created picnic spot')]);
    const diagnostics = enrichKnownStopLocations(itinerary);
    const known = itinerary.days[0].stops[0];
    expect(normalizeCoordinates({ latitude: known.latitude, longitude: known.longitude, source: known.coordinateSource }).valid).toBe(true);
    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ stopName: 'Logan Pass', coordinatesPresent: true }),
      expect.objectContaining({ stopName: 'A user-created picnic spot', coordinatesPresent: false }),
    ]));
  });

  it('accepts a sparse but unchanged prior assistant projection and restores stored history', () => {
    const stored = { id: 2, role: 'assistant', content: 'turn one', responseId: 'r1', responseVersion: 1, responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'c1', itineraryHash: 'i1' };
    const sparse = { ...stored, responseRevision: undefined, lifecycleStatus: undefined };
    const current = { id: 4, role: 'assistant', content: '', responseId: 'r2', responseVersion: 2, responseRevision: 1, lifecycleStatus: 'itinerary_ready', contentHash: null, itineraryHash: 'i2' };
    expect(messagesAreHistoricallyEquivalent(sparse, stored)).toBe(true);
    const merged = preserveHistoricalAssistantTurns({ storedConversation: [stored], incomingConversation: [sparse, current], targetResponseId: 'r2' });
    expect(merged[0]).toEqual(stored);
    expect(merged[1]).toEqual(current);
  });

  it('treats an assistant numeric display-id change as sparse historical projection', () => {
    const stored = {
      id: 100, role: 'assistant', content: 'saved prose', responseId: 'r1', responseVersion: 1,
      responseRevision: 2, lifecycleStatus: 'prose_ready', contentHash: 'c1', itineraryHash: 'i1',
    };
    expect(messagesAreHistoricallyEquivalent({ ...stored, id: 200 }, stored)).toBe(true);
  });
});
