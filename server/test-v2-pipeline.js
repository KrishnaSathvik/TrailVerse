/**
 * Full V2 Pipeline Simulation — tests the entire correction pipeline
 * with a mock AI response containing strenuous trails for a beginner.
 */
const { extractItineraryJSON, validateItineraryFeasibility } = require('./src/utils/extractItineraryJSON');
const { parseConstraints, validateItineraryConstraints, detectIntent } = require('./src/utils/constraintEngine');
const { correctItinerary, computeConfidence, scoreItinerary } = require('./src/utils/itineraryCorrector');

// Mock AI response with [ITINERARY_JSON] — strenuous trails for a beginner photographer
const mockAIResponse = `
Here is your 2-day Zion plan!

[ITINERARY_JSON]
{
  "days": [
    {
      "id": "day-1", "dayNumber": 1, "label": "Day 1",
      "stops": [
        {
          "id": "s1-1", "order": 0, "type": "trail", "name": "Angels Landing",
          "note": "Iconic chains section", "startTime": "06:30", "duration": 240,
          "latitude": 37.2692, "longitude": -112.9471, "difficulty": "strenuous",
          "why": "Best sunrise viewpoint for photography",
          "alternatives": [
            {"name": "Canyon Overlook Trail", "type": "trail", "difficulty": "easy", "duration": 60, "latitude": 37.213, "longitude": -112.9405, "note": "Short hike epic views"}
          ]
        },
        {
          "id": "s1-2", "order": 1, "type": "trail", "name": "The Narrows",
          "note": "River hike", "startTime": "12:00", "duration": 300,
          "latitude": 37.317, "longitude": -112.9482, "difficulty": "hard",
          "drivingTimeFromPreviousMin": 15,
          "why": "Unique slot canyon photography",
          "alternatives": [
            {"name": "Riverside Walk", "type": "trail", "difficulty": "easy", "duration": 90, "latitude": 37.285, "longitude": -112.948, "note": "Flat paved riverside"}
          ]
        },
        {
          "id": "s1-3", "order": 2, "type": "campground", "name": "Watchman Campground",
          "note": "Reserve ahead", "startTime": "18:00", "duration": 720,
          "latitude": 37.2005, "longitude": -112.9832, "drivingTimeFromPreviousMin": 20,
          "why": "Closest campground to shuttle"
        }
      ]
    },
    {
      "id": "day-2", "dayNumber": 2, "label": "Day 2",
      "stops": [
        {
          "id": "s2-1", "order": 0, "type": "landmark", "name": "Zion Scenic Drive",
          "note": "Shuttle the canyon", "startTime": "08:00", "duration": 120,
          "latitude": 37.25, "longitude": -112.95,
          "why": "Scenic drive with wildlife at dawn"
        },
        {
          "id": "s2-2", "order": 1, "type": "visitor_center", "name": "Human History Museum",
          "note": "Cultural exhibits", "startTime": "10:30", "duration": 60,
          "latitude": 37.206, "longitude": -112.983, "drivingTimeFromPreviousMin": 10,
          "why": "Great rainy-day option"
        }
      ]
    }
  ],
  "highlights": ["Angels Landing sunrise", "Narrows canyon light"],
  "packingList": ["camera", "tripod"],
  "permits": [{"name": "None", "required": false}],
  "estimatedCost": {"total": "200"},
  "bestTimeToVisit": "March-May",
  "gettingThere": "Las Vegas 2.5hr"
}
[/ITINERARY_JSON]
`;

console.log('=== FULL V2 PIPELINE SIMULATION ===\n');

// Step 1: Extract
const { cleanContent, itineraryData } = extractItineraryJSON(mockAIResponse);
const allStops = itineraryData.days.flatMap(d => d.stops);
console.log('1. EXTRACT ITINERARY');
console.log(`   Has itinerary: ${Boolean(itineraryData)} | Days: ${itineraryData.days.length} | Total stops: ${allStops.length}`);
console.log(`   Stops with "why": ${allStops.filter(s => s.why).length}`);
console.log(`   Stops with "alternatives": ${allStops.filter(s => s.alternatives).length}`);

// Step 2: Constraints
const constraints = parseConstraints(
  { formData: { fitnessLevel: 'beginner', numDays: 2, accommodation: 'camping', interests: ['photography'] } },
  'I love photography sunrise Zion'
);
console.log('\n2. CONSTRAINTS');
console.log(`   fitness=${constraints.fitnessLevel} accom=${constraints.accommodation} interests=${constraints.interests}`);

// Step 3: Intent
const intent = detectIntent('I love photography and want to capture sunrise at Zion', constraints);
console.log('\n3. INTENT DETECTION');
console.log(`   Primary: ${intent.primaryIntent}`);
console.log(`   All: ${intent.intents.map(i => `${i.type}:${i.confidence.toFixed(2)}`).join(', ')}`);

// Step 4: Validate
const issues = validateItineraryConstraints(itineraryData, constraints);
console.log('\n4. CONSTRAINT VALIDATION');
console.log(`   ${issues.length} issues found:`);
for (const i of issues) console.log(`   - ${i.type}: ${i.details}`);

// Step 5: Correct (smart replacement)
const result = correctItinerary(itineraryData, constraints, issues, null);
console.log('\n5. SMART CORRECTION');
console.log(`   ${result.corrections.length} corrections | ${result.gaps.length} gaps | ${result.removedCount} removals`);
for (const c of result.corrections) console.log(`   - ${c}`);
const day1 = result.correctedItinerary.days[0].stops;
console.log('\n   Day 1 stops after correction:');
for (const s of day1) {
  console.log(`     ${s.name} (${s.difficulty || 'n/a'}) ${s._isReplacement ? '[REPLACED]' : ''}`);
}

// Step 6: Confidence
const confidence = computeConfidence(result.corrections, result.removedCount, result.originalCount);
console.log(`\n6. CONFIDENCE: ${confidence.level} (${confidence.score})`);

// Step 7: Score
const score = scoreItinerary(result.correctedItinerary, constraints);
console.log(`\n7. PLAN SCORE: ${score.overall} (${score.label})`);
console.log(`   compliance=${score.dimensions.compliance} diversity=${score.dimensions.diversity} pacing=${score.dimensions.pacing} interestMatch=${score.dimensions.interestMatch} geoEfficiency=${score.dimensions.geoEfficiency}`);

// Step 8: Feasibility
const feasibility = validateItineraryFeasibility(result.correctedItinerary);
console.log(`\n8. FEASIBILITY: ${feasibility.length} warnings`);
for (const w of feasibility) console.log(`   - ${w}`);

// Summary
console.log('\n======= VERIFICATION RESULTS =======');
const checks = [
  ['Intent = photographer', intent.primaryIntent === 'photographer'],
  ['Per-stop "why" on all 5 stops', allStops.filter(s => s.why).length === 5],
  ['Alternatives on 2 hard trails', allStops.filter(s => s.alternatives).length === 2],
  ['Smart replace: Angels Landing -> Canyon Overlook', result.corrections.some(c => c.includes('Replaced') && c.includes('Canyon Overlook'))],
  ['Smart replace: Narrows -> Riverside Walk', result.corrections.some(c => c.includes('Replaced') && c.includes('Riverside Walk'))],
  ['Zero gaps (all stops replaced)', result.gaps.length === 0],
  ['Zero removals (replace not remove)', result.removedCount === 0],
  ['Replacement stops tagged _isReplacement', day1.filter(s => s._isReplacement).length === 2],
  ['Plan score computed', score.overall > 0 && Boolean(score.label)],
  ['Score has all 5 dimensions', Object.keys(score.dimensions).length === 5],
  ['Confidence computed', Boolean(confidence.level)],
  ['Clean content stripped JSON', !cleanContent.includes('ITINERARY_JSON')],
];

let passed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} | ${name}`);
  if (ok) passed++;
}
console.log(`\n  ${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
