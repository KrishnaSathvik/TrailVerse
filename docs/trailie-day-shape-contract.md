# Trailie day-shape contract

Parent constitution: [trailie-architecture.md](./trailie-architecture.md).

Trailie plans experiences in parts of the day. Exact clock times appear only when the clock actually matters.

The model first composes the trip: what each day contributes, how areas and overnight bases connect, where major outings fit, and where recovery belongs. Arrival/highlight/contrasting-area/flexible-finish sequences are examples, not fixed three-day or five-day templates. The overview states whether arrival/departure consume itinerary days or happen outside them.

## Canonical representation

New or rewritten model-first days carry `dayStructure` alongside the existing grounded `stops`, `travelEdges`, and `overnightLocation`:

```js
{
  type: 'sightseeing', // arrival | departure | transfer | rest
  summary: 'One main hike followed by recovery near the base.',
  startPeriod: 'morning',
  endPeriod: 'evening',
  blocks: [
    {
      kind: 'outing',
      periods: ['morning', 'afternoon'],
      label: 'The main hike',
      note: 'Carry lunch and take breaks during the outing.',
      stopIds: ['resolved-hike']
    },
    {
      kind: 'downtime',
      periods: ['afternoon', 'evening'],
      label: 'Recovery and dinner',
      note: 'Return to the base, rest and eat locally.',
      stopIds: []
    }
  ]
}
```

Periods are `morning`, `midday`, `afternoon`, `evening`. Multiple periods describe one continuous span. Blocks need not be one per period; multiple morning actions and a single morning-to-afternoon hike are both valid. An afternoon arrival declares an afternoon start, and a midday departure can end at midday. No off-trip filler is required.

Block kinds: `outing`, `experience`, `meal`, `downtime`, `arrival`, `departure`, `transfer`, `outside_trip`. An outing references each grounded stop exactly once in itinerary order. Non-place blocks have no map pins. An `experience` can represent a substantial unselected bus excursion or cruise, with an estimated positive `duration` and honest service uncertainty; it must not conceal an unresolved named attraction. Such a day can be sightseeing even with no mapped stops.

Exact `startTime` is optional metadata (`HH:mm`) with `timingReason`; otherwise place stops use `timeWindow`. Non-place commitments may also carry a clock, reason and duration. Sunrise without a travel date is normally a relative window, not an invented time. Real route measurements remain exclusively in trusted `travelEdges` and use the existing road/shuttle/access formatter.

## Deterministic checks

- Declared useful span is accounted for; blocks and stop references stay ordered.
- Full sightseeing days cannot silently end in the morning. A deliberately short/rest/arrival/departure day says so.
- Empty sightseeing days are rejected; actual transfer/rest/service-experience days can have no attraction pins.
- Clock commitments are formatted, justified and non-overlapping. Intervening activity durations and known route durations must fit. Unknown route minutes are never assumed verified.
- Total represented activity/service and measured travel time cannot exceed 24 hours.
- A change in named overnight base requires an explicit transfer block. This is an accounting check, not a claim that geography or travel time was verified.
- New/replaced days require the contract. Notes-only patches to legacy plans preserve compatibility; schedule/stop changes require coherent structure. Untouched days retain their exact prior content.

There is no destination logic, minimum attraction count, minimum hike duration, automatic meal generator or automatic inferred travel time. Travel judgment, geographic suitability, meaningful use of free time, and whether a claimed timing reason is supported remain model/review responsibilities. The guard cannot determine those from a block label alone.

## Rendering and review

The shared `TrailieItinerary` workspace renders block dayparts and notes interleaved with the original stop rows and trusted route labels. Chat cards retain compact day summaries. PDF export preserves the same day shape. Legacy plans remain readable.

Public captures must correspond to the latest successful saved response. A failed mutation cannot promote an older saved plan as a new sample. Public export retains only traveler-facing day-shape fields. The importer checks every day's contract and the matching capture/review hashes before any batch replacement. Existing snapshots remain immutable by default; `--replace-reviewed-local` is the explicit local revision path used for this user-requested, unshipped batch. It never pushes or deploys.
