# Pass 1: activity-scoped walking measurements

Local implementation complete; production release remains held.

## Change

The distance extractor previously recognized walking-related sentences without sufficiently binding their measurements to the listed activity. Sunrise Point's source describes the 5.5-mile Rim Trail, which became the viewpoint's canonical walking distance.

Narrative mileage now requires a walking-route identity or a suitable activity listing. A physical place does not acquire route ownership merely because its body caused an inferred `hike` tag. Explicitly named neighboring routes and ambiguous sentences containing multiple named routes are excluded. Trusted structured activity measurements retain precedence. Source prose remains intact; no replacement distance or duration is invented.

This is conservative extraction, not a general natural-language proof of ownership. Ambiguous site/access descriptions can remain unmeasured. Existing text-only legacy callers retain their behavior when no entity identity is supplied. This pass does not certify every possible source format, measurement unit or activity description.

NPS activity normalization advances from v10 to v11, including the joint-unit variant. Older normalized evidence must miss the existing compatibility gate and refresh through the broker; source freshness alone cannot keep obsolete normalization current. No research request or cache/database write was performed during this work.

## Verification

- **71 tests passed across six suites**, with provider isolation reporting zero model constructors, provider dispatches and external provider HTTP requests.
- Regression covers source → NPS normalization → unchanged guard → canonical stop. The 45-minute Sunrise Point visit retains its practical note and gains no walking-distance value; the public source body is unchanged.
- Additional cases cover viewpoint/lake listings with hike tags, a neighboring trail, ambiguous multi-route prose, legitimate trail lengths, structured measurements, one-way qualifiers, geographic totals and conflicting measurements.
- Reprocessing the full frozen Zion/Bryce source-detail corpus changed Sunrise Point from 5.5 miles to unknown; the other measured source-detail row, Go Snowshoeing, retained 1 mile. This was an offline extractor check, not new research or a model replay.
- Mobility checks do not convert unknown distance into zero. The existing guard does not classify every viewpoint as a walking route; a walking activity requiring a known measurement remains unknown without one. No guard rules changed.
- Chronologically fresh v10 evidence fails compatibility; newly normalized evidence passes.

Command:

```sh
cd server
npm run test:non-network -- --runInBand \
  src/services/__tests__/activityMeasurementBinding.test.js \
  src/utils/__tests__/walkingDistanceOwnership.test.js \
  src/utils/__tests__/walkingDistanceIndependentEval.test.js \
  src/services/__tests__/npsSourcePreservation.test.js \
  src/services/__tests__/npsEvidenceProvider.test.js \
  src/utils/__tests__/evidenceContractVersions.test.js
```

## Release limits

Previously saved TripPlans and immutable captures still contain their historical values. This producer fix and evidence-version gate do not migrate saved itinerary fields. A reviewed correction of affected stored plans is still required before claiming those historical records are repaired. No production data was changed.

No prompt/model/schema/guard/UI changes, paid benchmark, commit or deployment. Passes 2–5 remain held for independent review. Browser presentation, conversational grounding and full end-to-end release acceptance are not established by these offline tests.
