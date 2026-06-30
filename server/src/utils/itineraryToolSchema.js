/**
 * Structured itinerary tool for Claude tool_use.
 * Primary extraction path for architect-mode planning; [ITINERARY_JSON] remains legacy fallback.
 */

const CREATE_ITINERARY_TOOL = {
  name: 'create_itinerary',
  description: 'Create the structured itinerary that powers the TrailVerse plan workspace.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['days'],
    properties: {
      days: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'dayNumber', 'label', 'stops'],
          properties: {
            id: { type: 'string' },
            dayNumber: { type: 'number' },
            label: { type: 'string' },
            stops: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'order', 'type', 'name', 'note', 'startTime', 'duration'],
                properties: {
                  id: { type: 'string' },
                  order: { type: 'number' },
                  type: {
                    type: 'string',
                    enum: [
                      'trail',
                      'landmark',
                      'campground',
                      'visitor_center',
                      'restaurant',
                      'lodging',
                      'custom',
                    ],
                  },
                  name: { type: 'string' },
                  note: { type: 'string' },
                  startTime: { type: 'string' },
                  duration: { type: 'number' },
                  latitude: { type: ['number', 'null'] },
                  longitude: { type: ['number', 'null'] },
                  difficulty: {
                    type: ['string', 'null'],
                    enum: ['easy', 'moderate', 'strenuous', null],
                  },
                  why: { type: ['string', 'null'] },
                  drivingTimeFromPreviousMin: { type: ['number', 'null'] },
                  alternatives: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

/** Prompt block instructing models to prefer the tool over legacy JSON when available. */
function formatItineraryToolInstruction() {
  return `\n\n--- STRUCTURED ITINERARY OUTPUT ---
For day-by-day plans, you MUST call the \`create_itinerary\` tool with the full structured itinerary (days + stops with coordinates, durations, difficulty).
Write your user-facing travel plan in normal prose first, then call create_itinerary.
If tool calling is unavailable, include the legacy [ITINERARY_JSON] block as fallback — both must describe the same plan.
--- END STRUCTURED ITINERARY OUTPUT ---\n`;
}

function isValidToolItinerary(input) {
  if (!input || !Array.isArray(input.days) || input.days.length === 0) {
    return false;
  }
  return input.days.every((d) => Array.isArray(d.stops));
}

module.exports = {
  CREATE_ITINERARY_TOOL,
  formatItineraryToolInstruction,
  isValidToolItinerary,
};
