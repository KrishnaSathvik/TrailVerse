# Where Next? — Beehiiv setup (Checkpoint C)

Beehiiv is **delivery infrastructure**. Mongo `Subscriber` remains the consent source of truth. Resend remains the double opt-in mailer.

## Public page structure (local update, October 15, 2026)

- `/where-next` combines the destination picker and a separate newsletter signup section.
- `/newsletter` permanently redirects to `/where-next#newsletter`, preserving query parameters for confirmation, unsubscribe, errors, and attribution.
- Picking a destination does not subscribe the visitor; email signup still requires confirmation.
- The page describes an upcoming newsletter. The illustrative issue preview has been removed; a future preview must reflect the redesigned email itself.
- Email-template redesign, issue production, and the Sunday schedule remain separate, unfinished work. This page merge does not activate sending, change DNS, or sync subscribers.

Do not deploy, change DNS, or sync the existing five confirmed subscribers from this document.

## Required environment (backend only)

Set on the Express service (`server/`). Never `NEXT_PUBLIC_*`. Never send to the frontend. Never log.

```text
BEEHIIV_API_KEY=
BEEHIIV_PUBLICATION_ID=pub_…
BEEHIIV_WEBHOOK_SECRET=whsec_…
```

Optional:

```text
BEEHIIV_API_BASE=https://api.beehiiv.com/v2
```

If `BEEHIIV_API_KEY` or `BEEHIIV_PUBLICATION_ID` is missing, confirmation and unsubscribe still succeed. Beehiiv sync is skipped.

## Publication (manual Beehiiv UI)

Create a publication named:

**Where Next? by TrailVerse**

Recommended publication settings (manual; not owned by this repo):

- Double opt-in: **off for API-created subscribers** (the API call sends `double_opt_override=off` so Beehiiv does not send a second confirmation). Still disable publication-level double opt-in for API/import if the Beehiiv UI offers it, so a missed override cannot email again.
- Welcome/automation: **do not activate** in Checkpoint C.
- Do not import Users or pending Subscriber rows.

API key: Beehiiv dashboard → Settings → API. Use a key with `subscriptions:write`. Publication ID is the `pub_…` value in the URL or API.

## API used by TrailVerse

Documented Beehiiv API v2 (`https://api.beehiiv.com/v2`):

| Action | Method | Path |
|---|---|---|
| Create / upsert | `POST` | `/publications/{publicationId}/subscriptions` |
| Lookup | `GET` | `/publications/{publicationId}/subscriptions/by_email/{email}` |
| Unsubscribe | `PUT` | `/publications/{publicationId}/subscriptions/by_email/{email}` `{ unsubscribe: true }` |

Auth: `Authorization: Bearer <BEEHIIV_API_KEY>`.

Create payload always includes:

- `double_opt_override: "off"` — subscriber is already confirmed via Resend
- `send_welcome_email: false` — no Beehiiv welcome in Checkpoint C
- `reactivate_existing: true` — only after TrailVerse confirmation (knowing resubscribe)

Rate limit: **180 requests / minute / organization**. 429 is recorded as a retryable sync failure.

## Webhooks (Beehiiv → TrailVerse)

Beehiiv delivers webhooks through **Svix**. Official docs: verify `svix-id`, `svix-timestamp`, and `svix-signature` with the endpoint signing secret (`whsec_…`).

TrailVerse endpoint (after deploy):

```text
POST https://<api-host>/api/webhooks/beehiiv
```

Configure in Beehiiv: Settings → Webhooks. Event:

- `subscription.deleted`

The developer event catalog has **no** `subscription.unsubscribed` event. Beehiiv’s help article “Using webhooks with your beehiiv account” currently describes **Subscription Deleted** as “Triggered when a subscriber unsubscribes.” TrailVerse therefore listens for `subscription.deleted` only.

**Limitation:** the same Beehiiv help center also distinguishes **Unsubscribe** (status `inactive`) from **Delete** (permanent removal). If a footer unsubscribe only marks the Beehiiv subscription `inactive` and does **not** emit `subscription.deleted`, TrailVerse will not learn about that click until a later reconcile. `newsletter_list_subscription.unsubscribed` is list-scoped, not publication consent, and is not treated as TrailVerse unsubscribe.

**Plan:** Beehiiv documents webhooks as available on **Scale and above**. Without that plan (or without `BEEHIIV_WEBHOOK_SECRET`), reverse sync is not live. Unsigned POSTs are rejected.

TrailVerse → Beehiiv unsubscribe does not roll back Mongo if Beehiiv is down. Incoming `subscription.deleted` only updates Mongo and does not call Beehiiv again (no loop).

## Sending domain / DNS

**Do not change DNS in Checkpoint C.** Copy records from the Beehiiv dashboard after the publication exists.

Recommended sending identity: a dedicated subdomain of the current domain, for example:

```text
news.nationalparksexplorerusa.com
```

not `hello@trailverse.com` and not a premature `trailverse.com` cutover.

Beehiiv’s custom-domain flow generates the live values. Official Beehiiv help currently describes:

- **SPF / DKIM:** Beehiiv-generated **CNAME** records (typically one SPF-related CNAME and two DKIM CNAMEs). Do not invent host/target values; paste what the dashboard shows.
- **DMARC:** required for custom sending domains. Publish a **TXT** at `_dmarc` using Beehiiv’s DMARC wizard. Beehiiv auto-manages SPF/DKIM/DMARC only for `*.beehiiv.com` sending subdomains.

Until those dashboard records exist, exact host/target strings are unknown. That is expected.

## Sync script (manual, dry-run default)

```bash
cd server
node scripts/sync-newsletter-subscribers-to-beehiiv.js
node scripts/sync-newsletter-subscribers-to-beehiiv.js --apply
```

Selects only `status=subscribed` and `beehiivSyncStatus != synced`. Never Users. Never pending. Do not `--apply` against production until publication, DNS, and a test address have been verified.

## Out of scope here

Issue #001, welcome sequence, seed-five migration, User blog-alert migration, homepage/Trailie CTAs, DNS changes, deployment.
