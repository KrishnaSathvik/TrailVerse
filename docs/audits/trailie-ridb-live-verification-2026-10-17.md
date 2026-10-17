# RIDB credential and listing verification — 2026-10-17

The key in `server/.env` successfully authenticated read-only requests through the existing `createRidbEvidenceProvider` default client. No key values or HTTP request headers were logged. No paid model calls, deployments, hosted changes or provider code changes were made.

Both campground and permit request paths returned Yosemite National Park with 24 facilities. Verified normalized records:

| Topic | Facility | RIDB ID | Availability |
|---|---|---|---|
| campgrounds | Upper Pines Campground | 232447 | null / unknown |
| permits_reservations | Half Dome Permits | 234652 | null / unknown |

The API returned empty `FacilityReservationURL` and `LINK` arrays for both records, and no `FacilityURL`. The existing adapter therefore correctly returned null listing/reservation URLs. This is a remaining link-delivery gap, not an authentication failure. No booking URLs were synthesized from facility IDs.

Official pages were separately located through web search:
- https://www.recreation.gov/camping/campgrounds/232447 — Upper Pines Campground
- https://www.recreation.gov/permits/234652 — Half Dome Permits

These independently verified links were not injected into runtime evidence. Listing existence does not prove availability for any travel date. This test loaded the environment in a fresh process; it does not prove an already-running backend process has reloaded its environment or that production is configured.
