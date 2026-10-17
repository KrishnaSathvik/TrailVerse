# Footer content audit — October 5, 2026

Scope: Features, FAQ, About, Privacy, Terms, ChatGPT app, and MCP for Claude. Changes are local; nothing was published or deployed. Existing site header, footer, title scale, and responsive layout are retained.

## Corrections and evidence

| Topic | Correction | Local source |
| --- | --- | --- |
| Website guest chat | Five completed turns in the 48-hour guest allowance, rather than five messages per arbitrary browser session | `server/src/config/anonymousChatLimits.js`, `next-frontend/src/lib/anonymousChatLimits.js`, `server/src/routes/ai.js` |
| Voice | Three guest sessions per 24 hours; separate ten-session hourly limit; audio processed by OpenAI Realtime | `server/src/routes/ai.js` voice routes |
| Connected-app planning | Five registered tools; planning uses the shared itinerary pipeline and may fetch relevant web evidence beyond the NPS catalog | `mcp-server/server/main.py`, `mcp-server/server/client.py:plan_trip_anonymous`, `server/src/routes/ai.js:prepareChatContext` and `/plan-itinerary` |
| Connected-app privacy | Removed “no PII,” universal 30-day retention, and two-hour all-data deletion promises. Distinguished temporary connector context from backend records and host-app history | `mcp-server/server/conversations.py`, `server/src/utils/aiLogger.js`, `server/src/models/AnonymousSession.js` |
| Account history | External conversations do not automatically become website account trips; connector requests skip user context | MCP client metadata and shared planner route |
| Event bookmarks | Browser-local, not account-synced | `next-frontend/src/hooks/useSavedEvents.js`, saved-events service |
| Offline | Installable app caches some resources, not complete account/trip access. Recommend downloaded itinerary PDFs | `next-frontend/src/app/sw.ts`, `next-frontend/src/hooks/useParks.js`, trip PDF handler |
| Security and analytics | Password hashing and signed tokens, not a promise of encryption for all data; analytics can contain IP, user agent, browser/session/account identifiers | User and Analytics models, authService, analytics utility, Providers |
| Deletion | Linked content and controlled uploads are removed; limited audit records and separate records have distinct lifecycles | `server/src/services/accountErasureService.js`, `server/src/models/AccountErasureJob.js`, user deletion route |
| Retention | Describes local expiry configuration without applying one duration to every log, backup, provider, and aggregate | `server/src/config/analyticsRetention.js`, AnonymousSession and AccountErasureJob models |
| Public content | Shared trip links expose trip and conversation; approved stories are public and can be submitted without an account | Shared-trip routes, Testimonial model/controller |
| About | Removed hardcoded review/view/photo/years counters that cannot be verified from the application; retained the personal founder story | About source and current feature implementations |
| Terms | Corrected AI processing and provider descriptions; allowed official provided connectors rather than categorically banning automated access; explained connected apps, sharing, and offline limits | Existing Terms plus implementation above |

## Presentation and maintenance

- FAQ uses one content file for all 23 visible questions and FAQPage structured data; accessible expandable answers remain keyboard operable.
- ChatGPT and Claude share one five-tool capability list and one access/data explanation component.
- Privacy has concise summary cards and readable sections with its existing table of contents.
- Features removes unsupported competitor comparisons and replaces them with practical usage guidance. Removed redundant inner horizontal padding.
- About removes the unverified metrics block. MCP screenshots are labeled as historical examples rather than current conditions.
- No secondary header or cross-page navigation was added.

## External setup references

Checked official host documentation for setup and access, rather than inferring host behavior from this repository:

- [Claude remote custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): Free and paid plan availability, Free one-connector limit, current setup flow, managed-workspace permissions.
- [ChatGPT apps](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): host access and app privacy guidance. Links are included on the relevant pages.

## Validation

- Targeted ESLint: zero errors; eight existing Next image-optimization warnings for MCP screenshot `<img>` elements.
- FAQ regression test: all 23 questions open/close accessibly and match their structured answers exactly.
- Production Next build: passed, with `API_URL=http://127.0.0.1:5001/api`. It logs caught `localStorage is not defined` messages from the existing saved-events service during prerendering; these did not fail the build and are outside the seven-page content changes.
- Browser checked all seven routes at 320, 390, 768, and 1440 px: no document horizontal overflow; one header per page.
- Keyboard Enter opens FAQ answers; focused browser check captured no page errors.
- Reviewed desktop Privacy and mobile Features/FAQ screenshots under `artifacts/content-audit/`.
- `git diff --check`: passed.

## Scope limits

This is an implementation/content alignment audit, not a legal-compliance certification. Production database TTL indexes, deployed configuration, infrastructure/provider retention, app-directory approval state, and the founder's external profile metrics were not independently verified. Local analytics expiry configuration explicitly notes that live TTL changes need a separate migration. Existing capability policy docs still describe older MCP routing in places; the current client and backend implementation were used for this audit. No provider call, account deletion, external submission, push, or deployment was performed.
