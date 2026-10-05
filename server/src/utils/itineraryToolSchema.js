/**
 * Structured itinerary tool for Claude tool_use.
 * Primary extraction path for architect-mode planning; [ITINERARY_JSON] remains legacy fallback.
 */

const BASE_ITINERARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intro', 'days'],
  properties: {
    intro: {
      type: 'string',
      description: 'The traveler-facing opening, read before the itinerary. Usually 1–3 sentences: the shape of the trip or the one tradeoff that actually matters. Go longer only when something genuinely needs it (a real conflict, an unusual condition) — do not pad by default. Do not restate the days, do not advertise Trailie or say what Trailie is, and do not say "At a glance", mention evidence or tools, or invent a backup. Write like someone who knows the park explaining their own plan — never mechanical planning-process language like "designed to optimize" or "this itinerary has been designed to".',
    },
    narrativeSections: {
      type: 'array',
      description: 'Traveler-facing context around the plan (max 3). Include after_plan only for a material issue (permit, seasonal access, major drive, critical timing). Never generic check-access footers or "Let me know if you\'d like changes". before_plan optional. Do not restate every day.',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['placement', 'markdown'],
        properties: {
          placement: {
            type: 'string',
            enum: ['before_plan', 'after_plan'],
          },
          heading: {
            type: ['string', 'null'],
            description: 'Optional short heading. Omit or null when the section should read as continuing prose.',
          },
          markdown: {
            type: 'string',
            description: 'Ordinary traveler language. No evidence-system jargon, no "At a glance", no restating every stop.',
          },
        },
      },
    },
    days: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'dayNumber', 'label', 'stops'],
        properties: {
          id: { type: 'string' },
          dayNumber: { type: 'number' },
          label: {
            type: 'string',
            description: 'An editorial subtitle for the day, e.g. "Badlands Loop + sunset overlooks" or '
              + '"An easy west-side afternoon" — what the day is FOR, in plain trip language. Do not start '
              + 'with "Day N" (the day number is shown separately) and do not describe the day\'s planning '
              + 'status or how it was assembled (no "priority", "coverage", "conditions check", "return", '
              + '"district" alone as the whole title). Name the place or experience.',
          },
          // Optional overnight base for the day (town/lodge). Enables the
          // Stage 13.1 overnight-consistency check; omit when not applicable.
          overnightLocation: {
            type: ['string', 'null'],
            description: 'A concrete area, town, or lodge the day is based from, only when the itinerary '
              + 'genuinely establishes one — e.g. "Springdale" or "Moose, WY", not generic filler like "near '
              + 'the park" or "in the area". Use null when no specific base is actually grounded; a '
              + 'plausible-sounding placeholder is worse than omitting it.',
          },
          stops: {
            type: 'array',
            description: 'Build the day around park-defining experiences (trail, viewpoint, scenic_drive, '
              + 'landmark, wildlife, geothermal, historic, lake, beach, boat, photography) rather than '
              + 'operational stops (visitor_center, museum, picnic, restaurant, lodging). Operational stops '
              + 'are fine when the traveler asked for them or they are genuinely useful for that day, but '
              + 'should not be the reason the day exists.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'order', 'type', 'name', 'note', 'startTime', 'duration'],
              properties: {
                id: { type: 'string' },
                evidenceRef: { type: ['string', 'null'], description: 'Evidence ID of the visitable anchor from PUBLIC EVIDENCE. Required for an experienceSubject; never invent a reference.' },
                executionBindings: { type: ['array', 'null'], description: 'Optional grounded execution facets beyond the anchor. Reference only supplied evidence explicitly linked to this anchor; allocate planned minutes. Unbound wider activity earns no credit. Use separate grounded stops for unrelated routes.', items: { type: 'object', additionalProperties: false, required: ['evidenceRef', 'durationMinutes'], properties: { evidenceRef: {type:'string'}, durationMinutes: {type:'number'} } } },
                experienceSubject: { type: ['string', 'null'], description: 'Non-navigable subject being viewed or photographed. Use only when the referenced anchor evidence explicitly supports this viewing activity. Otherwise null. Geography comes from the anchor.' },

                order: { type: 'number' },
                type: {
                  type: 'string',
                  enum: [
                    'trail',
                    'walk',
                    'viewpoint',
                    'scenic_drive',
                    'landmark',
                    'lake',
                    'visitor_center',
                    'historic',
                    'ranger_program',
                    'museum',
                    'lodge',
                    'wildlife',
                    'photography',
                    'picnic',
                    'accessible',
                    'geothermal',
                    'beach',
                    'boat',
                    'campground',
                    'restaurant',
                    'lodging',
                    'custom',
                  ],
                },
                name: { type: 'string' },
                note: {
                  type: 'string',
                  description: 'What the traveler needs to know about THIS stop: what to do there, a concrete '
                    + 'thing to check or bring, or what makes it worth the time. Ordinary trip language only — '
                    + 'never mention evidence, sources, validators, repairs, obligations, or how this stop was '
                    + 'chosen. State a material uncertainty once as a concrete instruction ("Check the morning '
                    + 'road status before heading out"), not as repeated hedging ("I could not verify...").',
                },
                // Optional park identity. Populate ONLY from resolved NPS
                // metadata — never infer a code from a stop name.
                parkCode: { type: ['string', 'null'] },
                parkName: { type: ['string', 'null'] },
                startTime: {
                  type: 'string',
                  description: 'Use HH:mm only when an exact time is operationally required; otherwise use an empty string and populate timeWindow.',
                },
                timeWindow: {
                  type: ['string', 'null'],
                  description: 'A bounded daypart/window such as "Early morning · around 7–8 AM" or "Late afternoon" when exact clock precision is not justified.',
                },
                physicalDifficulty: {
                  type: ['string', 'null'],
                  enum: ['easy', 'moderate', 'strenuous', null],
                },
                exposureLevel: {
                  type: ['string', 'null'],
                  enum: ['low', 'moderate', 'high', null],
                },
                duration: { type: 'number' },
                walkingDistanceMiles: {
                  type: ['number', 'null'],
                  description: 'Total walking distance only when explicitly present in the Frozen EvidenceBundle. Never estimate or infer it.',
                },
                latitude: { type: ['number', 'null'] },
                longitude: { type: ['number', 'null'] },
                difficulty: {
                  type: ['string', 'null'],
                  enum: ['easy', 'moderate', 'strenuous', null],
                },
                why: {
                  type: ['string', 'null'],
                  description: 'Why THIS stop belongs in THIS traveler\'s plan, at this point in the trip — '
                    + 'how it fits their stated preferences, pace, or the rest of the day. Not a restatement '
                    + 'of `note`. Never explain plan mechanics (not "this satisfies", "adds coverage", "is a '
                    + 'valid replacement", "keeps the existing stop unchanged") — write it the way a travel '
                    + 'companion would explain their own recommendation.',
                },
                drivingTimeFromPreviousMin: { type: ['number', 'null'] },
                alternatives: {
                  type: 'array',
                  description: 'Concrete fallback options for this stop when access/parking/conditions fail.',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      name: { type: 'string' },
                      note: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
          // Phase 9C.1B — continuous-activity grouping. Use ONLY when a
          // single continuous traveler experience is represented as multiple
          // separate stop entries (e.g. a hike authored as trailhead →
          // viewpoint → chalet). Do NOT use to merely cluster nearby
          // attractions or reduce how many stops a day has.
          activityGroups: {
            type: 'array',
            description: 'Optional. An activity group is one uninterrupted traveler activity with multiple '
              + 'physical stages or waypoints: one hike with waypoints, one scenic drive with its own '
              + 'pullouts/stages, one boat trip with stops, or a guided continuous tour. '
              + 'Geographic clustering, being "clustered", "nearby", in the "same area" or "same basin", '
              + 'a shared theme, or geographic convenience are not reasons to group independent experiences '
              + 'that are merely convenient to visit together. Visitor centers, museums, information stations, '
              + 'meals/rest stops, or other separate visits must not be grouped with an attraction merely '
              + 'because they are adjacent to it. This tells the system not to treat movement between these '
              + 'specific stops as an independent drive. It does not change the stops themselves, their names, '
              + 'or their order — omit entirely when every stop already stands on its own.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'stopIds'],
              properties: {
                id: { type: 'string' },
                stopIds: {
                  type: 'array',
                  description: 'The exact stop ids (from this same day\'s stops) that belong to this one '
                    + 'continuous activity, in order. At least two.',
                  items: { type: 'string' },
                },
              },
            },
          },
          // Phase 9C.1D.3 — generation activation of the Phase 9C.1D.2
          // canonical edge. EXACTLY the shape `travelEdgeValidation.js`
          // reconstructs: no id, mode, duration, distance, verification,
          // provider or coordinate field is authorable. That validator — not
          // this schema — stays the structural authority after generation.
          travelEdges: {
            type: 'array',
            description: 'Optional. Each entry marks an intentional transfer on this day: the traveler finishes '
              + 'one experience and moves on to a separate, independent experience at another place in the same '
              + 'destination (e.g. from Old Faithful to Grand Prismatic Spring). An edge says only that a transfer '
              + 'happens, never how — by itself it does not assert driving, walking, a shuttle, or transit, and it '
              + 'carries no duration, no distance, and no claim that a route is feasible. The optional modeIntent '
              + 'is the only mode statement, and it is limited to "drive" (see that field); omit it whenever the '
              + 'mode is uncertain. '
              + 'It is not the same thing as activityGroups: stops in one continuous activity are already connected '
              + 'by their group, so never author an edge between two stops in the same activity group. When a '
              + 'transfer enters a group, target the group\'s first stop; when it leaves a group, the source is the '
              + 'group\'s last stop. '
              + 'When the day moves from one destination to a different destination, do not author an edge for '
              + 'that change — travel between destinations is handled separately. '
              + 'An edge is not needed for every pair of consecutive stops: author one only where the plan '
              + 'genuinely moves the traveler between independent experiences, and omit the field entirely when '
              + 'no such transfer exists.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['sourceStopId', 'targetStopId', 'relationship'],
              properties: {
                sourceStopId: {
                  type: 'string',
                  description: 'The exact id of the stop the traveler leaves, from this same day\'s stops. It '
                    + 'must come earlier in the day than the target.',
                },
                targetStopId: {
                  type: 'string',
                  description: 'The exact id of the stop the traveler moves on to, from this same day\'s stops.',
                },
                relationship: {
                  type: 'string',
                  enum: ['transfer'],
                },
                // Phase 9C.1F.2 — the only positive mode. Model-authored per
                // edge, server-authorized against the traveler's durable
                // transport policy; unauthorized values are stripped and the
                // transfer edge is kept.
                modeIntent: {
                  type: 'string',
                  enum: ['drive'],
                  description: 'Optional. Set to "drive" only when this specific transfer is intentionally made by '
                    + 'private vehicle AND the traveler context explicitly supports having or driving a vehicle '
                    + '(for example the traveler has said they are driving or have a rental car). Do not infer '
                    + 'driving merely because two stops are far apart, in a national park, on the same day, '
                    + 'inconvenient to walk between, or because a route could theoretically be driven. If the '
                    + 'traveler said they will not have a car, will not drive, or will use the shuttle, walk or '
                    + 'bike only, never set it. If the transport mode is uncertain, omit this field — omitting it '
                    + 'is the correct answer, not an incomplete one. It states planning intent only, never that a '
                    + 'drive route exists or how long it takes.',
                },
              },
            },
          },
        },
      },
    },
    alternatives: {
      type: 'array',
      description: 'Trip-level backup/contingency plan when the traveler asked for a Plan B. List identifiable places/activities that remain usable if the uncertain primary fails.',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: { type: 'string' },
          note: { type: 'string' },
          when: { type: 'string' },
        },
      },
    },
  },
};

/**
 * TIER-1 GENERATION CONTRACT REDUCTION.
 *
 * Fields the model was asked to author that no consumer needs from it:
 * `startTime` was `""` on 159/159 corpus stops; `drivingTimeFromPreviousMin` is
 * overwritten by verified Maps minutes; `physicalDifficulty` has one reader, an
 * alias fallback. `utils/generationContractBinding` restores every one of them
 * deterministically before the first consumer runs.
 *
 * Coordinates are deliberately NOT in this list — see COORDINATE_STOP_FIELDS.
 *
 * This reduces ONLY the generation contract. `BASE_ITINERARY_SCHEMA`, the
 * canonical plan, and the refinement patch contract are unchanged — the patch
 * tool below still derives its stop shape from the full base schema.
 */
const TIER1_REMOVED_STOP_FIELDS = Object.freeze([
  'startTime',
  'drivingTimeFromPreviousMin',
  'physicalDifficulty',
]);

/** Server-known on a single-destination turn; model-authored otherwise. */
const PARK_IDENTITY_STOP_FIELDS = Object.freeze(['parkCode', 'parkName']);

/**
 * COORDINATES ARE OPT-IN, AND OFF BY DEFAULT.
 *
 * The audit expected the known-stop catalog and evidence to supply what the
 * model no longer would. Replaying 43 captured plans measured otherwise: of the
 * 36 stops that carried coordinates, `enrichKnownStopLocations` reproduces 16
 * and cannot reproduce 20 (7.3% of all stops). Those 20 were schema-captured
 * `coordinateSource: 'tool'` values, and `ItineraryMapView` / `DayCardList`
 * render a map pin and a maps link ONLY for stops with numeric coordinates.
 *
 * So dropping them buys output tokens with visible traveler value. The lever
 * exists for measurement; the default keeps the model authoring coordinates.
 */
const COORDINATE_STOP_FIELDS = Object.freeze(['latitude', 'longitude']);

function reduceStopGenerationContract(schema, { bindParkIdentity, bindCoordinates }) {
  const stop = schema.properties.days.items.properties.stops.items;
  const removed = [
    ...TIER1_REMOVED_STOP_FIELDS,
    ...(bindParkIdentity ? PARK_IDENTITY_STOP_FIELDS : []),
    ...(bindCoordinates ? COORDINATE_STOP_FIELDS : []),
  ];
  for (const field of removed) delete stop.properties[field];
  stop.required = (stop.required || []).filter((field) => !removed.includes(field));
  return schema;
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.requireAlternatives] traveler asked for a backup plan
 * @param {boolean} [options.reduced]             emit the Tier-1 generation contract
 * @param {boolean} [options.bindParkIdentity]    server owns stop-level park identity
 *   (single-destination turns only — a multi-park plan must keep authoring it)
 * @param {boolean} [options.bindCoordinates]      also drop latitude/longitude
 *   (measurement lever; see COORDINATE_STOP_FIELDS for why this is off by default)
 */
/**
 * TOP-LEVEL OUTPUT ORDER — production order, not semantics.
 *
 * Measured on the 2026-08-27 THRO run (artifacts/trailie-shadow-structure-…):
 *
 *   first artifact byte   7,441 ms
 *   intro                 7,449 ms
 *   narrativeSections     9,845 ms
 *   days                 11,043 ms   <- 3,602 ms, 22% of the stream, before
 *   day 1 complete       15,238 ms      a single day had begun
 *   tool complete        23,712 ms
 *
 * The model emitted properties in schema order, so every structural milestone
 * was shifted later by the time spent writing plan-level prose first. Emitting
 * `days` first asks whether the SAME validated artifact can become structurally
 * available earlier — it changes nothing about what is produced.
 *
 * There is also no semantic reason for `intro` to precede `days`. `intro` is
 * validated against the FINALIZED itinerary, so "construct the plan, then
 * introduce what was constructed" is if anything the more natural authoring
 * order than "summarise, then build the thing being summarised". No quality
 * claim is made either way; that is what the live benchmark is for.
 *
 * IMPORTANT: this tool is dispatched with `strict: false` (see `convertTools`
 * in providers/openaiResponsesAdapter.js), so property order is ADVISORY, not
 * constrained decoding. The model followed schema order on the measured run,
 * which is the entire evidence base for expecting it to follow this one. Live
 * telemetry settles it.
 *
 * Ordering only: no field is added, removed, renamed, redescribed, or made
 * more/less required, and no validator changes.
 */
const TOP_LEVEL_OUTPUT_ORDER = Object.freeze(['days', 'intro', 'narrativeSections', 'alternatives']);

/**
 * Rebuild an object's keys in a declared order. Keys not named in the order are
 * appended in their original relative position, so an added schema field cannot
 * be silently dropped by this helper.
 */
function orderKeys(source, order) {
  const out = {};
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  for (const key of Object.keys(source)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = source[key];
  }
  return out;
}

/**
 * STRICT-MODE REPRESENTATION — experiment only, default OFF.
 *
 * OpenAI documents two things this experiment depends on:
 *
 *   "Structured Outputs ensure that generated content follows the exact order
 *    of keys defined in the provided schema."
 *   "Strict mode ... schemas must have additionalProperties set to false, and
 *    all fields in properties must be marked as required. Optional fields can
 *    be handled by including null as a type option."
 *
 * The 2026-08-27 live benchmark showed that under `strict: false` the model
 * ignores schema key order outright (emitted `intro → days` against a
 * days-first schema). Strict mode is the documented mechanism that would make
 * the ordering binding rather than advisory.
 *
 * `minItems` / `maxItems` are RETAINED. They are supported in strict schemas
 * (the docs' own strict example carries `minItems`); they are only restricted
 * for fine-tuned models, which is not this path.
 *
 * SCOPE: `create_itinerary` only. `PATCH_ITINERARY_TOOL` is a separate schema
 * object and is untouched, and non-itinerary turns dispatch no tools at all.
 */

/**
 * Which currently-optional, currently-NON-nullable fields become nullable under
 * strict, rather than merely required.
 *
 * This is a semantic decision per field, not a mechanical one, so it is declared
 * rather than inferred:
 *
 *   - `name` on either `alternatives` item stays REQUIRED AND NON-NULL: a
 *     fallback without a name is not actionable, and `hasActionableOutdoorBackup`
 *     reads exactly that field.
 *   - `note` / `when` become NULLABLE: they are descriptive, and their absence
 *     today means "not supplied", which `null` represents faithfully.
 *
 * Optional ARRAYS are deliberately absent from this list. They become required
 * and emit `[]`, which the audit proved indistinguishable from absent — the
 * backup gate reads `collectStructuredAlternatives(...).length > 0`.
 */
// Phase 9C.1F.2 — `modeIntent` is optional by design (absent = unknown); under
// strict it must be nullable so the model is never forced to pick a mode.
const STRICT_NULLABLE_FIELDS = Object.freeze(new Set(['note', 'when', 'heading', 'modeIntent']));

/**
 * SCHEMA-REQUIRED IS NOT CONTENT-REQUIRED.
 *
 * The 2026-08-28 strict benchmark showed that making an array required does not
 * make the model emit `[]` — it makes the model FILL it. Stop-level
 * `alternatives` went 0/9 → 9/9 on a turn that never asked for a backup,
 * `narrativeSections` went 0 → 1, and `intro` (the spoken answer) shrank 21%
 * while output tokens rose 25%. The model read "required" as "wanted".
 *
 * These clauses are appended ONLY in the strict representation, because only
 * there is "required array" a true statement. The non-strict schema keeps its
 * descriptions byte-identical: those arrays really are optional there, and
 * telling the model otherwise would be false.
 *
 * The empty state is stated normatively, not as a style preference.
 */
const STRICT_EMPTY_ARRAY_GUIDANCE = Object.freeze({
  '$.days[].stops[].alternatives': ' SCHEMA-REQUIRED, NOT CONTENT-REQUIRED: this array must be '
    + 'present, and [] is the correct value. Use [] unless the traveler explicitly requested a '
    + 'backup or Plan B, or the planning contract requires an alternative for this specific stop. '
    + 'Do not invent alternatives merely because the field is required.',
  '$.narrativeSections': ' SCHEMA-REQUIRED, NOT CONTENT-REQUIRED: this array must be present, and '
    + '[] is the correct value. Use [] when no additional section materially improves the answer. '
    + 'Do not create a section merely to populate this field.',
  '$.alternatives': ' SCHEMA-REQUIRED, NOT CONTENT-REQUIRED: this array must be present, and [] is '
    + 'the correct value. Use [] unless trip-level backup options were requested by the traveler '
    + 'or are required by the planning contract. Do not invent a backup merely because the field '
    + 'is required.',
  // Phase 9C.1D.3 — the exact failure mode above would turn a required edge
  // array into an edge for every adjacency, which is the heuristic this
  // contract replaces.
  '$.days[].travelEdges': ' SCHEMA-REQUIRED, NOT CONTENT-REQUIRED: this array must be present, and [] '
    + 'is the correct value whenever the day has no intentional transfer between independent experiences. '
    + 'Do not create an edge merely because the field is required.',
});

/**
 * Rewrite a schema into its strict-compatible representation. Values, field
 * names, descriptions, enums and cardinality bounds are all preserved; only
 * `required`, `additionalProperties` and nullability change.
 */
function toStrictSchema(node, { path = '$', backupRequested = false } = {}) {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map((item) => toStrictSchema(item, { path, backupRequested }));
  const out = { ...node };
  if (out.type === 'object' || out.properties) {
    const props = out.properties || {};
    const previouslyRequired = new Set(out.required || []);
    const next = {};
    for (const key of Object.keys(props)) {
      let child = toStrictSchema(props[key], { path: `${path}.${key}`, backupRequested });
      // An array that strict forces to be present is told, in the contract the
      // model actually reads, that [] is a correct answer. Skipped for
      // trip-level alternatives when a backup WAS requested: there the existing
      // description already says the model MUST populate it, and adding a
      // "use []" clause would contradict it.
      const guidance = STRICT_EMPTY_ARRAY_GUIDANCE[`${path}.${key}`];
      const suppress = `${path}.${key}` === '$.alternatives' && backupRequested;
      if (guidance && !suppress && child.type === 'array') {
        child = { ...child, description: `${child.description || ''}${guidance}`.trim() };
      }
      const isOptional = !previouslyRequired.has(key);
      const alreadyNullable = Array.isArray(child.type) && child.type.includes('null');
      if (isOptional && !alreadyNullable && STRICT_NULLABLE_FIELDS.has(key)) {
        child = { ...child, type: [child.type, 'null'] };
        // An enum must admit null once the type does.
        if (Array.isArray(child.enum) && !child.enum.includes(null)) child.enum = [...child.enum, null];
      }
      next[key] = child;
    }
    out.properties = next;
    // Every declared property required, in the SAME order as `properties` — the
    // ordering signal and the required list must not disagree.
    out.required = Object.keys(next);
    out.additionalProperties = false;
  }
  if (out.type === 'array' && out.items) {
    out.items = toStrictSchema(out.items, { path: `${path}[]`, backupRequested });
  }
  return out;
}

function getCreateItineraryTool({
  requireAlternatives = false,
  reduced = false,
  bindParkIdentity = false,
  bindCoordinates = false,
  // EXPERIMENT SWITCH. Default false: production is byte-identical to today
  // apart from the (inert) key ordering already landed. The strict-compatible
  // rewrite is gated with the flag rather than applied always, because forcing
  // every property to be required under `strict: false` would push the model to
  // emit nulls for no benefit at all.
  strict = false,
} = {}) {
  let schema = JSON.parse(JSON.stringify(BASE_ITINERARY_SCHEMA));
  if (reduced) schema = reduceStopGenerationContract(schema, { bindParkIdentity, bindCoordinates });
  if (requireAlternatives) {
    schema.required = [...new Set([...(schema.required || []), 'alternatives'])];
    schema.properties.alternatives.description =
      'REQUIRED trip-level backup/contingency plan. Include at least one identifiable outdoor place/activity from the Frozen EvidenceBundle that remains usable if the named access/parking subject fails. Do not use vague conditions-check wording.';
    schema.properties.alternatives.minItems = 1;
  }
  // Production order applied LAST, after every other schema transform, so no
  // later mutation can reintroduce the old ordering.
  schema.properties = orderKeys(schema.properties, TOP_LEVEL_OUTPUT_ORDER);
  // `required` follows the same order. The SET is unchanged — this is the same
  // ordering signal, not a change to what is required.
  schema.required = TOP_LEVEL_OUTPUT_ORDER.filter((k) => (schema.required || []).includes(k))
    .concat((schema.required || []).filter((k) => !TOP_LEVEL_OUTPUT_ORDER.includes(k)));
  if (strict) schema = toStrictSchema(schema, { backupRequested: requireAlternatives });
  return {
    name: 'create_itinerary',
    // The adapter reads `tool.strict === true`; false and undefined are the same
    // to it, so an unflagged tool is dispatched exactly as it is today.
    ...(strict ? { strict: true } : {}),
    description: requireAlternatives
      ? 'Emit structured days for the traveler-facing plan. intro is a short opening. Include after_plan only for a material issue. Because the traveler asked for a backup/contingency, you MUST populate plan-level alternatives with an independent fallback from park facts.'
      : 'Emit structured days when the traveler asked for day-by-day planning. intro is a short opening (destination, shaping priority, day organization). Include after_plan only for a material issue — never a canned footer. Optional before_plan only when useful.',
    input_schema: schema,
  };
}

const CREATE_ITINERARY_TOOL = getCreateItineraryTool();

const DAY_SCHEMA = BASE_ITINERARY_SCHEMA.properties.days.items;
const STOP_SCHEMA = DAY_SCHEMA.properties.stops.items;
const PARTIAL_STOP_SCHEMA = {
  ...JSON.parse(JSON.stringify(STOP_SCHEMA)),
  required: [],
};

/**
 * PATCH GENERATION CONTRACT — what the model is told BEFORE attempt 1.
 *
 * `applyPlanPatch` refuses ambiguous targets, targetless stop operations and
 * evidence-bound field rewrites. Enforcing rules the generator has never seen
 * would only test whether the repair ladder can teach after a failure, so the
 * contract is stated up front. Generation guidance only — it decides nothing.
 */
const PATCH_GENERATION_INSTRUCTION = [
  'Call patch_itinerary. Return only explicit operations for the traveler-requested scope.',
  'Do not regenerate, reorder, or restate unaffected days; the server owns the prior full plan',
  'and applies your patch deterministically.',
  '',
  'TARGETING. Every update_stop and remove_stop must identify its target: never omit both stopId',
  'and stopName. Use the exact stopId from the current canonical itinerary whenever the stop has',
  'one. Only fall back to stopName when there is no stopId, and then copy the name exactly as it',
  'appears — abbreviating or paraphrasing it will not match.',
  '',
  'WHAT A PREFERENCE MAY CHANGE. A traveler preference changes the PLAN, not the facts about a',
  'place. When an operation keeps the same stop identity, preserve that stop\'s evidence-bound',
  'properties — exposure, access, difficulty and walking distance — unless authoritative evidence',
  'in this turn supports a different value. To make an experience easier, change what is',
  'traveler-controlled instead: duration, timing and time window, sequencing, activity scope, or',
  'which stops are selected. If the traveler needs a genuinely different place, remove the stop',
  'and add the replacement, which may carry its own different properties.',
  '',
  'RESPONSE TEXT. Describe only what this patch actually changed. Do not describe a before-to-after',
  'change that did not occur, and do not claim to have removed or reduced something the prior plan',
  'did not contain. Write it as Trailie continuing the conversation — "I made Day 2 easier — later',
  'start, one less stop, and a gentler afternoon" — never as an explanation of how the change was',
  'applied. Never say patch, operation, canonical itinerary, stopId, evidence, or scope.',
].join('\n');

/**
 * Reason-aware repair text. A failed patch should be told which rule it broke,
 * not just that it was bounded wrong — an escalation dispatched with generic
 * text is the 2026-08-24 blind-repair defect in miniature.
 */
const PATCH_REPAIR_BASE = 'Return a valid bounded patch for the requested scope only. '
  + 'Unaffected days are owned by the prior canonical itinerary and must remain unchanged.';

function patchRepairInstruction(reasonCodes = []) {
  const codes = new Set((reasonCodes || []).filter(Boolean));
  const parts = [PATCH_REPAIR_BASE];
  if (codes.has('plan_patch_target_not_found')) {
    parts.push('The stop you targeted does not exist on that day. Use the exact stopId as it appears '
      + 'in the current canonical itinerary, or the stop name copied character for character.');
  }
  if (codes.has('plan_patch_target_ambiguous')) {
    parts.push('That name matched more than one stop on the day, so the target is ambiguous. '
      + 'Identify the stop by its stopId instead.');
  }
  if (codes.has('plan_patch_target_missing')) {
    parts.push('The operation carried no target. Every update_stop and remove_stop must supply '
      + 'stopId or stopName.');
  }
  if (codes.has('plan_patch_evidence_field_mutation')) {
    parts.push('You changed a factual property of a stop whose identity did not change. Exposure, '
      + 'access, difficulty and walking distance describe the place itself: preserve them unchanged. '
      + 'Adjust duration, timing, sequencing or activity scope instead, or remove the stop and add a '
      + 'different one if the traveler needs a genuinely different place.');
  }
  if (codes.has('patch_operation_exceeds_requested_scope')) {
    parts.push('That operation changes more of the itinerary than the traveler asked about. '
      + 'They referred to one part of one day, so patch only the stops in that part; do not '
      + 'replace the whole day.');
  }
  if (codes.has('patch_target_outside_scope') || codes.has('patch_target_missing_in_scope')) {
    parts.push('The stop you targeted is not one the traveler referred to. Patch only the stops '
      + 'listed as the refinement target for this turn.');
  }
  if (codes.has('refinement_mutation_outside_requested_scope')) {
    parts.push('Your patch changed content outside the part of the day the traveler asked about. '
      + 'Stops elsewhere may shift in time if the change genuinely moves the schedule, but they '
      + 'must not be added, removed, or altered.');
  }
  if (codes.has('refinement_target_unresolved')) {
    parts.push('It is not clear which part of the itinerary the traveler meant. Do not guess a '
      + 'target.');
  }
  return parts.join(' ');
}

/**
 * The resolved refinement target, handed to the generator as CONTEXT.
 *
 * The machine already knows which stop the traveler meant. Asking the model to
 * re-author that identity is what failed live, twice. Where the target is
 * singular the execution layer injects it and says so; where several stops
 * legitimately belong to the referenced part of the day, the model chooses from
 * a closed list rather than free-typing an identity.
 */
function renderRefinementTargetForPrompt(scope) {
  if (!scope?.resolved) return '';
  const where = scope.dayNumber ? `day ${scope.dayNumber}` : 'this trip';

  if (scope.mutationGranularity === 'stop') {
    const conflicts = (scope.affectedStops || [])
      .map((stop) => `  - day ${stop.dayNumber}: ${stop.id} — ${stop.name}`)
      .join('\n');
    const frozen = (scope.frozenSiblingStops || [])
      .map((stop) => `  - day ${stop.dayNumber}: ${stop.id} — ${stop.name}`)
      .join('\n');
    const reasons = Object.entries(scope.dayRewriteReasons || {})
      .map(([day, reason]) => `Day ${day} may be rewritten because ${reason.replaceAll('_', ' ')}.`)
      .join(' ');
    return `REFINEMENT TARGET\nOnly these stops conflict with the trip change:\n${conflicts}\n`
      + (frozen ? `These sibling stops stay structurally unchanged:\n${frozen}\n` : '')
      + 'Prefer update_stop, remove_stop, or add_stop for a conflicting stop. '
      + 'Do not use update_day unless this target says that day may be rewritten. '
      + (reasons || 'No day-level rewrite is authorized.');
  }
  if (scope.level === 'day') {
    const impact = (scope.reasonCodes || []).includes('scope_itinerary_impact')
      ? ' A saved stop on this day conflicts with the trip change, or its exposure was never recorded. Replace or remove only what conflicts. '
      : ' ';
    return `REFINEMENT TARGET\nThe traveler referred to the whole of ${where}.${impact}`
      + 'Use update_day for that day when the day itself should change, and include every stop that remains. '
      + 'No other day is in scope.';
  }
  if (scope.level === 'affected_days') {
    const days = (scope.dayNumbers || []).join(', ');
    return `REFINEMENT TARGET\nOnly days ${days} are affected by this trip change. `
      + 'Use update_day for a day you are rewriting. Do not change any other day.';
  }
  if (scope.level === 'whole_plan') {
    return 'REFINEMENT TARGET\nThe traveler referred to the whole itinerary.';
  }

  const part = scope.daypart ? `the ${scope.daypart} of ${where}` : where;
  const list = (scope.allowedStops || [])
    .map((stop) => `  - ${stop.id} — ${stop.name}${stop.timeWindow ? ` (${stop.timeWindow})` : ''}`)
    .join('\n');

  if (scope.singularTargetId) {
    return `REFINEMENT TARGET\nThe traveler referred to ${part}, which is exactly one stop:\n${list}\n`
      + 'This target is already resolved and is supplied for you — you do not need to name it. '
      + 'Decide what should change about it.';
  }
  return `REFINEMENT TARGET\nThe traveler referred to ${part}. Choose from only these stops:\n${list}\n`
    + 'Reference one of these ids exactly; do not target anything else.';
}

const PATCH_ITINERARY_TOOL = {
  name: 'patch_itinerary',
  description: 'Refine the existing canonical itinerary with explicit bounded operations. Do not regenerate or restate unaffected days. Target only the day or stop the traveler asked to change; the server deterministically applies the patch to the prior full plan.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['response', 'operations'],
    properties: {
      response: {
        type: 'string',
        description: 'Write this as Trailie continuing the conversation, not as a changelog: '
          + '"I made Day 2 easier — later start, one less stop, and a gentler afternoon." Say only what '
          + 'actually changed and any tradeoff worth knowing. Never say patch, operation, canonical '
          + 'itinerary, stopId, apply, or scope — describe the trip, not the mechanism.',
      },
      operations: {
        type: 'array',
        minItems: 1,
        maxItems: 16,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['op', 'dayNumber'],
          properties: {
            op: {
              type: 'string',
              enum: ['update_day', 'update_stop', 'add_stop', 'remove_stop', 'reorder_stops'],
            },
            dayNumber: { type: 'number' },
            day: JSON.parse(JSON.stringify(DAY_SCHEMA)),
            stopId: {
              type: ['string', 'null'],
              description: 'The exact stable stopId copied from the current canonical itinerary. '
                + 'For update_stop and remove_stop, prefer stopId whenever it is present on the target stop.',
            },
            stopName: {
              type: ['string', 'null'],
              description: 'Fallback only, when the target stop has no stopId. Copy the exact stop name '
                + 'from the current canonical itinerary; do not abbreviate, rename, paraphrase or reformat it. '
                + 'If two stops on the day share a name, use stopId instead.',
            },
            stop: PARTIAL_STOP_SCHEMA,
            stopOrder: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

function isValidPlanPatch(input) {
  if (!input || typeof input !== 'object') return false;
  if (typeof input.response !== 'string' || !input.response.trim()) return false;
  if (!Array.isArray(input.operations) || input.operations.length === 0) return false;
  const supported = new Set(['update_day', 'update_stop', 'add_stop', 'remove_stop', 'reorder_stops']);
  return input.operations.every((operation) => (
    operation
    && supported.has(operation.op)
    && Number.isInteger(Number(operation.dayNumber))
    && Number(operation.dayNumber) > 0
  ));
}

/** Prompt block instructing models to prefer the tool over legacy JSON when available. */
function formatItineraryToolInstruction() {
  return `\n\n--- STRUCTURED ITINERARY OUTPUT ---
For day-by-day plans, you MUST call the \`create_itinerary\` tool with \`intro\` plus the full structured itinerary (days + stops with coordinates, durations, difficulty).
Every stop's \`duration\` is minutes of traveler time and MUST be greater than zero — a stop with duration 0 is not a plan, and the day it sits on will be rejected. Give the realistic time a traveler spends there; do not pad, and do not leave it at 0 because you are unsure.
\`intro\` is the short traveler-facing opening, usually 1–3 sentences: the destination, the priority that shapes the trip, and how the days are organized. Do not restate every day, and do not use it as the entire companion essay.
Include after_plan only for a material issue (permit, seasonal access, major drive, critical timing). Never canned footers. before_plan is optional filler-free context only.
Do not write "At a glance", restate every day in prose, mention evidence or tools, or invent a backup. For revisions, say what changed in the same voice.
Write like a travel companion. Never say evidence-supported, supplied information, compatible candidate, canonical itinerary, validator, or call a place a candidate.
Each day's \`label\` is an editorial subtitle ("Badlands Loop + sunset overlooks"), not a planning-status name — no "priority", "coverage", or "conditions check" as the whole title, and do not start it with "Day N".
Each stop's \`note\` and \`why\` are read by the traveler as an ordinary part of their plan: what to do there and why it fits them, never why the system included it. State a real uncertainty once as a concrete instruction ("Check the morning road status") rather than repeated hedging.
Do not list the same place twice under a renamed suffix.
If tool calling is unavailable, include the legacy [ITINERARY_JSON] block as fallback — both must describe the same plan.
--- END STRUCTURED ITINERARY OUTPUT ---\n`;
}

function diagnoseToolItineraryShape(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ code: 'invalid_type', path: '$', message: 'Expected an object' }],
    };
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'days')) {
    return {
      ok: false,
      issues: [{ code: 'missing_required_field', path: 'days', message: 'Required field is missing' }],
    };
  }
  if (!Array.isArray(input.days)) {
    return {
      ok: false,
      issues: [{ code: 'invalid_type', path: 'days', message: 'Expected an array' }],
    };
  }
  if (input.days.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'empty_array', path: 'days', message: 'Expected at least one item' }],
    };
  }
  for (let index = 0; index < input.days.length; index += 1) {
    const day = input.days[index];
    if (!day || typeof day !== 'object' || Array.isArray(day)) {
      return {
        ok: false,
        issues: [{ code: 'invalid_type', path: `days.${index}`, message: 'Expected an object' }],
      };
    }
    if (!Object.prototype.hasOwnProperty.call(day, 'stops')) {
      return {
        ok: false,
        issues: [{
          code: 'missing_required_field',
          path: `days.${index}.stops`,
          message: 'Required field is missing',
        }],
      };
    }
    if (!Array.isArray(day.stops)) {
      return {
        ok: false,
        issues: [{ code: 'invalid_type', path: `days.${index}.stops`, message: 'Expected an array' }],
      };
    }
  }
  return { ok: true, issues: [] };
}

function isValidToolItinerary(input) {
  return diagnoseToolItineraryShape(input).ok;
}

function normalizeItineraryIntro(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.replace(/^\*{0,2}\s*at a glance\s*\*{0,2}\s*[:.]?\s*/i, '').trim();
}

const NARRATIVE_PLACEMENTS = Object.freeze(['before_plan', 'after_plan']);

function normalizeNarrativeSections(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((section) => {
    if (!section || typeof section !== 'object') return [];
    const markdown = String(section.markdown || '').trim();
    if (!markdown) return [];
    const placement = NARRATIVE_PLACEMENTS.includes(section.placement)
      ? section.placement
      : 'after_plan';
    const heading = String(section.heading || '').trim() || null;
    return [{ placement, heading, markdown }];
  });
}

function renderProseFromToolItinerary(toolItinerary) {
  if (!isValidToolItinerary(toolItinerary)) return '';
  return normalizeItineraryIntro(toolItinerary.intro);
}

module.exports = {
  TOP_LEVEL_OUTPUT_ORDER,
  STRICT_NULLABLE_FIELDS,
  STRICT_EMPTY_ARRAY_GUIDANCE,
  toStrictSchema,
  BASE_ITINERARY_SCHEMA,
  COORDINATE_STOP_FIELDS,
  TIER1_REMOVED_STOP_FIELDS,
  CREATE_ITINERARY_TOOL,
  PATCH_ITINERARY_TOOL,
  PATCH_GENERATION_INSTRUCTION,
  patchRepairInstruction,
  renderRefinementTargetForPrompt,
  getCreateItineraryTool,
  formatItineraryToolInstruction,
  diagnoseToolItineraryShape,
  isValidToolItinerary,
  isValidPlanPatch,
  normalizeItineraryIntro,
  normalizeNarrativeSections,
  renderProseFromToolItinerary,
};
