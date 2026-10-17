# Stage 14.8A.1 — Acceptance harness isolation and anonymous lifecycle contract

## Preserved failure

The original `stage14_8A-guest-message-1` attempt remains
`FAIL_UNEXPECTED_NETWORK`. Its Playwright request route ran in the CLI's Node-side
handler realm, where the snippet relied on an unbound `URL` global. Request #56
therefore failed before reaching the acceptance backend. No provider request or
guest record was created, and the optimistic browser message is not a completed
guest turn.

## Authoritative origins and network policy

The acceptance frontend is started with both `NEXT_PUBLIC_API_URL` and `API_URL`
set to `http://127.0.0.1:5101`. Request rewriting is not part of the qualified
runtime path. Port 5001 is a hard pre-send failure.

The browser policy allows only the loopback frontend and acceptance backend.
Google Maps is explicitly aborted and recorded as `expected_blocked_google_maps`.
Google Tag Manager/Vercel debug analytics and known remote image hosts are also
explicitly aborted and recorded as expected blocked families; they are never
silently allowed. Every other external origin is a hard `unknown_external` failure. The later live
test may additionally allow the reviewed Claude endpoint at the backend observer;
Stage 14.8A.1 does not.

## Anonymous Contract A — terminal-only

Current product code deliberately limits typed early revision events and
`TripPlan` revision persistence to authenticated chat. Contract A is therefore
the selected intended anonymous contract:

```js
{
  guestReceivesTypedEarlyEvents: false,
  guestUsesTripPlanRevisionPersistence: false,
  guestPersistenceOwner: "AnonymousSession",
  guestItineraryRevealPoint: "terminal successful response",
  guestQuotaIncrementPoint: "one completed logical assistant response"
}
```

The guest identity is `anonymousId`; messages belong to its `AnonymousSession`.
The browser mirrors session metadata and conversation UI locally. Sessions expire
after 48 hours. Refresh restores through the session-status endpoint. Login may
migrate the anonymous conversation into an authenticated trip. Failed or aborted
browser-only attempts do not create an `AnonymousSession`, consume quota, or
become migration input on the server.

Under this contract, guest acceptance must not require authenticated revision-1
or revision-2 persistence, typed early events, or early itinerary visibility.

### Qualification blocker: quota timing

The current anonymous streaming and non-streaming routes append the user message
to `AnonymousSession` before generation completes. Consequently a browser failure
before the route consumes no quota (proven here), but a provider/backend failure
after route admission can leave a counted user message without a completed
assistant response. That does not satisfy Contract A's completion-based quota
rule. `guestContractResolved` and the composite pre-send gate therefore remain
false until persistence/quota accounting is made completion-coupled and tested.
