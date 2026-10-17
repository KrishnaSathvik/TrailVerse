'use strict';

const { evaluateStructuredItineraryRequirement, STRUCTURED_REASON } = require('../structuredItineraryDecision');
const {
  resolveItineraryGenerationMode,
  getItineraryGenerationConfig,
  ITINERARY_GENERATION_MODE,
} = require('../../config/itineraryGenerationConfig');

describe('evaluateStructuredItineraryRequirement', () => {
  it('requires structured generation for itinerary requests', () => {
    const r = evaluateStructuredItineraryRequirement({ userRequestedItinerary: true });
    expect(r.requiresStructuredItinerary).toBe(true);
    expect(r.reason).toBe(STRUCTURED_REASON.REQUESTED);
  });

  it('skips non-itinerary requests', () => {
    expect(evaluateStructuredItineraryRequirement({ userRequestedItinerary: false }).requiresStructuredItinerary).toBe(false);
  });

  it('skips discovery, welcome, and conversion regardless of intent', () => {
    expect(evaluateStructuredItineraryRequirement({ userRequestedItinerary: true, openEndedDiscovery: true }).requiresStructuredItinerary).toBe(false);
    expect(evaluateStructuredItineraryRequirement({ userRequestedItinerary: true, isWelcomeMessage: true }).reason).toBe(STRUCTURED_REASON.WELCOME);
    expect(evaluateStructuredItineraryRequirement({ userRequestedItinerary: true, isConversionMessage: true }).reason).toBe(STRUCTURED_REASON.CONVERSION);
  });
});

describe('itinerary generation mode config', () => {
  const saved = process.env.TRAILIE_ITINERARY_GENERATION_MODE;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRAILIE_ITINERARY_GENERATION_MODE;
    else process.env.TRAILIE_ITINERARY_GENERATION_MODE = saved;
  });

  it('defaults to legacy when unset or invalid', () => {
    delete process.env.TRAILIE_ITINERARY_GENERATION_MODE;
    expect(getItineraryGenerationConfig().mode).toBe(ITINERARY_GENERATION_MODE.LEGACY);
    expect(resolveItineraryGenerationMode('nonsense')).toBe(ITINERARY_GENERATION_MODE.LEGACY);
    expect(resolveItineraryGenerationMode('')).toBe(ITINERARY_GENERATION_MODE.LEGACY);
  });

  it('honors tool_first', () => {
    process.env.TRAILIE_ITINERARY_GENERATION_MODE = 'tool_first';
    const c = getItineraryGenerationConfig();
    expect(c.mode).toBe(ITINERARY_GENERATION_MODE.TOOL_FIRST);
    expect(c.isToolFirst).toBe(true);
  });
});
