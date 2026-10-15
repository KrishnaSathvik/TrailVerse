# Pass 3B — Playwright browser verification

The user explicitly requested standalone Playwright after the integrated Browser runtime was unavailable. Headless Chromium loaded the actual development-only `/dev/trailie-preview` Next page on localhost. Local process escalation allowed the server to start; the earlier EPERM was an environment restriction.

## Findings

At 1200×850 and 390×850, accepted, rejected, disconnected, stale, out-of-order and cancelled replay scenarios passed functional browser assertions (12 scenarios). Drafts remained separate from accepted content, carried unvalidated warnings and had no links or trip actions. Rejection/disconnect/cancellation removed them. Stale day events were ignored. Out-of-order events withdrew the preview; a subsequent valid final fixture could still display the accepted itinerary. Frame sampling observed no draft/accepted overlap or stale text.

Screenshot review caught a defect missed by the initial document-root overflow assertion: the accepted fixture expanded the mobile harness to approximately 477px despite a 390px root viewport. Adding `w-full min-w-0` to the harness main element constrained it to 390px. Both desktop and mobile were rechecked; only the intentionally horizontally scrollable itinerary tabs extend beyond their visible container. No shared renderer or planning behavior was changed.

Long-note stress testing replaced one displayed note with repeated text and an unbroken string directly in the browser DOM. Text wrapped without horizontal page overflow. While later days arrived, the mobile scroll position stayed at 150px; desktop stayed at the top. This was a synthetic layout test, not a generated-plan quality check. Development tooling and the global voice widget were visible in screenshots; the full chat workspace still requires its own overlay/scroll review.

## Timing and limits

The fixture emits an event every 650ms. Browser animation-frame sampling observed the first day at approximately 1.3 seconds and accepted replacement at approximately 4.6 seconds (approximately 5.2 seconds for the stale-event fixture with its extra event). These are DOM visibility observations near a frame boundary, not precise compositor paint measurements, and are **not Sol latency measurements**.

API and external browser requests were blocked. No model calls, research, saved-trip writes, deployment or production activation occurred. Synthetic disconnects exercise the real SSE consumer but do not establish behavior under a real network interruption, proxy buffering or server commit race. No independent live-stream reliability claim is made.

Private scripts, measurements and screenshots are under gitignored `artifacts/private/pass3b-browser/`. Earlier runs exposed page-initialization timing in the test harness; the completed checks wait for initialization before clicking.

The replay page has now received desktop/mobile browser verification. The global voice invitation visibly overlaps accepted day content on mobile; its dismissal/overlay behavior in the full chat workspace remains a presentation concern, so this is not unconditional visual release acceptance. Full chat integration, real connection interruptions, fresh live streams and actual model-to-browser timing remain open gates. All release holds remain.
