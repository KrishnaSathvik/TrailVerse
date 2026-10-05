# Trailie v2 — Exact Demo Q1 Seasonal Suitability Result

## Verdict

**PASS — ready for one final paid exact-Q1 revalidation, when separately authorized.**

The existing paid answer remains unsuitable for capture. This pass changes only the offline evidence-selection contract; it does not mutate demo fixtures or create a replacement live answer.

## Root cause

The exact Q1 month was available only in the user request (`late September`). NPS activity rows had no normalized seasonal status, and prompt packing ranked `difficulty=easy` plus a hiking activity type without reconciling strong winter/ski signals in the title, description, or activity taxonomy. Winter routes therefore became primary easy-hike evidence.

## Generic fix

Before prompt packing, activity evidence is now classified from:

- requested month/season in the user request, with temporal requirement dates as fallback;
- explicit operating-month ranges and normalized seasonal status;
- authoritative year-round language;
- winter-route naming and ski/snowshoe/snowmobile activity or description signals;
- explicit summer-only language.

A hard date mismatch is omitted. Uncertain seasonal evidence remains available, is labeled as uncertain, is prohibited as a primary recommendation anchor in the rendered context, and receives a packing penalty. An incidental word such as `Summer` in a historical title is not treated as a hard restriction.

No park, Q1, activity-name, or desired-winner branch was added.

## Captured Q1 offline replay

The exact unchanged Q1 was rendered against the frozen evidence bundle from the prior paid run under the normal 1,200-token evidence budget.

- 7 Yosemite rows and 7 Sequoia rows were included.
- All included Sequoia activity rows use `nps-activities-v2+joint-scope-v2`.
- `Big Trees Trail Wildlife`, `Crescent Meadow`, `Cold Springs Nature Trail`, `Big Stump`, and other non-winter Sequoia evidence remain.
- `Crescent Winter Trail`, `Discover a Winter Meadow`, `Sunset Rock Winter Trail`, other winter routes, ski/snowshoe rows, and the explicitly summer-only Wuksachi route are excluded for late September.
- `General Grant`, `Grant Grove`, and `Roaring River Falls` remain absent.
- Meaningful Yosemite hiking, accessible-trail, meadow, and scenic-driving evidence remains under the same budget.
- No model, provider, or network call was made.

Machine-readable replay summary: [q1-seasonal-suitability-offline-replay.json](../artifacts/trailie-v2-demo-final-validation/q1-evidence-scoping-v2-paid-reval/q1-seasonal-suitability-offline-replay.json)

## Regression result

Bounded offline verification passed 10 suites / 119 tests covering the prompt renderer, prompt-v2 assembly, exact Q1–Q4 guards, evidence planner, broker, store, and EvidenceBundle. The final renderer edge-case rerun passed 11/11 tests after tightening incidental season-word handling.

The only test-environment note was the existing stale `baseline-browser-mapping` warning. One sandboxed rerun could not bind MongoMemoryServer's local port; the same bounded renderer suite passed outside the sandbox. This was not a product failure.

## Holds

- No live Q1 was run.
- No Capture #4/#5 was created.
- No demo fixture was updated.
- No commit, push, or deploy was performed.

