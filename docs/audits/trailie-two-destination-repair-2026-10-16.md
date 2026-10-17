# Two-destination acceptance repair — 2026-10-16

Scope: duration evidence delivery, destination identity reuse, bounded required-place recovery, and existing Recreation.gov configuration verification. Guest behavior is unchanged: one conversation, five user messages, existing login handoff. No UI, quota, provider credentials, or hosted configuration changes in this task. The working tree already contained other changes; this task builds on those without reverting them.

## Diagnosis and corrections

The supplied live diagnostic sequence was `duration_exceeds_source`, then `traveler_required_place_unresolved`. The original rejected proposals and evidence packet were not found in local captures. Consequently, the exact original stop/duration and Bryce lookup response cannot be established from those two codes alone. The following defects are established from code and reproduced offline; they are not a claim that the original live request has been replayed successfully.

1. **Duration feedback was insufficiently actionable.** `duration_exceeds_source` compares a stop's minutes with `supportedDurationMaximum`; it is not the route-duration check. The model received raw duration text, but no normalized minute maximum, and correction feedback only named the error. Synthesis now receives `supportedDurationMaximumMinutes` calculated by the same utility as the guard. Rejection feedback now includes day, stop, evidence reference, proposed minutes, maximum minutes and source text. The conversion and rejection thresholds themselves are unchanged. No duration is silently shortened, and no source limit is removed.
2. **Multi-park identity evidence was incomplete.** Composite destinations contained trusted catalog anchors used for provider fan-out, but only a single primary destination could produce catalog `destination_identity` evidence. Each valid NPS anchor now produces its own reusable catalog identity. Exact catalog short names/codes can reuse that identity without a new named-place request. Missing coordinates remain unresolved. This does not add heuristic park aliases or special-case Zion/Bryce.
3. **Required-place recovery compared surface strings after canonicalization.** A historical failed lookup remained protected by its original requested name, while an accepted stop could have a different provider-confirmed canonical name. Recovery now uses fresh, authoritative identity evidence and provider-confirmed aliases. It recognizes an official activity's explicit parent-destination identity as representation of that destination. A uniquely resolved hotel/locality may also remain represented by its overnight base after lodging-stop folding. Ambiguous identities, stale evidence, alternatives, and unrelated overview prose do not satisfy the requirement. Current finalization evidence is passed to both recovery checks.

No new research phase, model validation round, or correction allowance was added. Safe commit, day count, overnight transfer accounting, hotel-change limits, source duration limits and spatial identity checks remain in force.

## Offline verification

- **146 tests passed across 10 suites**: runtime, required-place recovery, activity duration, multi-park evidence, destination context, locality grounding, named-place bridge, RIDB provider, guest migration and itinerary reliability.
- Parameterized two-base cases: Zion/Bryce Canyon (Springdale/Bryce Canyon City), Boston/Portland (two hotels), Olympic/Mount Rainier (Port Angeles/Ashford). Assertions preserve four days, both destinations, overnight bases, one hotel change and one successful commit after bounded repair. Incorrect day counts and hotel-change limits remain rejected.
- Combined regression: source-duration rejection followed by a valid correction using a provider-confirmed Bryce alias succeeds without a false required-place rejection.
- Negative alias tests reject stale, ambiguous, alternative and unsupported alias evidence, omitted destinations and attraction-as-overnight substitutions.
- **Trailie One-Brain — PASS**: runtime isolation, canonical commit, truth boundary, MCP parity, public export, schema, samples and demo checks.
- Provider isolation counters: **zero** live OpenAI/Anthropic constructors, live provider dispatches and external provider HTTP requests.
- `git diff --check` passed.
- Local logs: `/tmp/trailie-two-base-tests.log`, `/tmp/trailie-two-base-one-brain.log`.

## Recreation.gov and remaining acceptance work

Presence-only checks found no `RIDB_API_KEY` in the process environment, root `.env.local`, `server/.env`, or `next-frontend/.env.local`. No values were printed. No hosted credentials/settings were read or changed. The existing provider reads `RIDB_API_KEY`; missing configuration is not classified as an implementation defect. Its offline regression suite passes; no provider code was changed by this task.

A real campground and permit listing were **not live-verified** because no authorized local credential was available. Official listing links and live inventory cannot be claimed verified from fixtures. Once credentials are available, perform the two read-only checks and preserve unknown availability. A separately approved live model replay of the original two-destination trip is also still needed to close live acceptance; offline scripted proposals do not prove future model generation or latency. No paid model calls, commits, pushes, deployments or hosted setting changes were made.
