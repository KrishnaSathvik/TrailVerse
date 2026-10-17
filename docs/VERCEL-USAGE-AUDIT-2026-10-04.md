# Vercel usage audit — October 4, 2026 (America/Chicago)

Read-only production audit; no billing, firewall, deployment, or application settings changed. Data collected around October 5 03:20–03:35 UTC.

## Finding

The dominant current traffic source is Vercel-verified `meta-externalagent`. Firewall inspection reports approximately 1.2 million allowed requests from this bot in the last-day window (hour buckets October 4 03:00–October 5 04:00 UTC). Facebook AS32934 dominates traffic. This is directly observed, not inferred from a user-agent string alone.

Caching reduces rendering cost but does not prevent repeated CDN requests or response bandwidth. Public-route middleware still runs at substantial volume. Current traffic evidence establishes Meta as the dominant ongoing source; it does not allocate every historical dollar to that bot.

## Billing

The current cycle is September 15–October 15, not October 1–31. CLI usage reports costs before credits and discounts.

Initial snapshot: team total $110.03 including the $20 Pro subscription, leaving $90.03 metered usage before the $20 usage credit. TrailVerse accounts for $88.53 of the usage (about 98%). A slightly later Spend Management snapshot reports $70.26 on-demand spend after credit. Snapshot timing explains small differences.

| TrailVerse service | Cycle usage, approximately | Cost before credit |
|---|---:|---:|
| Fast Data Transfer | 1,241.87 GB | $36.98 |
| Fluid Active CPU | 148.28 hours | $19.25 |
| CDN Requests | 16.87 million | $15.11 |
| Function Invocations | 7.17 million | $4.30 |
| Fast Origin Transfer | 57.78 GB | $3.60 |
| Image Optimization Cache Writes | 836,062 | $3.34 |
| Fluid Provisioned Memory | 219.07 GB-hours | $2.38 |
| CDN additional CPU | 7.19 hours | $2.34 |
| Image transformations | 14,152 | $0.77 |
| ISR writes, image reads, ISR reads | — | $0.45 |

Per-project quantities in CLI output are fractional allocations; rounded values above are not exact integer request counts.

### Daily trend (team totals)

| Date | Outgoing transfer usage | Transfer cost | CDN request cost | Active CPU cost |
|---|---:|---:|---:|---:|
| September 30 | 115.42 GB | $0.00 | $3.05 | $1.55 |
| October 1 | 146.03 GB | $6.35 | $3.51 | $1.65 |
| October 2 | 98.29 GB | $14.82 | $2.22 | $0.86 |
| October 3 | 79.35 GB | $11.96 | $2.46 | $0.17 |
| October 4, incomplete | 27.34 GB | $4.12 | $2.31 | $0.19 |

CDN request charges first appear September 29 in the daily output; transfer charges first appear October 1. This pattern is consistent with exhausting included allowances. The CPU reduction is real, although the daily aggregate alone does not establish which individual deployment caused it. October 4 is incomplete and must not be projected as a full-day total.

## Current traffic and configuration

`vercel firewall traffic inspect bot meta-externalagent --since 24h` reports:

| Path | Meta requests, approximately |
|---|---:|
| `/plan-ai` | 96,900 |
| `/blog` | 95,500 |
| `/map` | 92,800 |
| `/explore` | 90,000 |
| `/parks/state/hawaii` | 75,000 |
| `/guides` | 70,500 |
| `/` | 67,700 |

Firewall overview: no custom firewall configuration, Bot Protection off, AI Bots allow, automatic mitigations active, Attack Mode off. Only hundreds of requests were denied versus approximately 1.2 million allowed. Verified crawlers are not necessarily treated as DDoS attacks.

Spend Management: $10 active budget, **pause disabled**, no webhook. It reports 703% used. The budget is an alert threshold, not a spending cap in this configuration.

Production samples of `/plan-ai` return 200 / cache HIT on deployment `dpl_3ouXjTpqu3Qf5kvVwBrTmvRkd7pk`. The 24-hour log source aggregation reports approximately 1,042,270 cache entries, 412,791 middleware entries, and 3,856 function entries. These categories can overlap for a request; do not add them as unique visitors or equate them directly to invoice invocations.

Local source confirms:

- `next-frontend/src/app/layout.js` no longer forces the whole app dynamic or reads request cookies.
- `next-frontend/src/proxy.js` still matches public park/blog/explore/intent routes. Some public routes only set query-variant robots headers; others also check maintenance settings or blog redirects.
- `next-frontend/src/app/robots.ts` permits general public crawling and has no dedicated Meta crawler exclusion.
- The July 10 root-cache fixes exist in git history. The latest deployment has no git metadata, so source equivalence was not assumed from the working tree; production cache behavior was checked separately.

## Recommended mitigation, in priority order

1. Add a targeted Vercel Firewall deny rule for the observed `meta-externalagent` crawler. Match the identified crawler specifically; do not blanket-block Facebook's ASN or all bots. Preserve Google/Bing indexing and ordinary social link previews. Vercel documents that firewall-blocked traffic is not charged. Generic Bot Protection alone should not be assumed to stop an allowed verified AI crawler.
2. Add a matching `robots.txt` exclusion as supplementary crawl policy. It is not a substitute for enforcement at the firewall.
3. Verify allowed Meta requests, bandwidth, and middleware volume drop after enforcement. Compare complete hourly windows and subsequent complete billing days. Do not promise a precise saving without bot-specific byte measurements.
4. Review public-route middleware and replace work that can safely become static routing/header configuration. Preserve authentication, maintenance behavior, redirects, and SEO query handling. This is secondary to eliminating the repeated crawl traffic.
5. Choose a deliberate spend policy. Enabling pause at the existing $10 threshold could pause all team projects immediately because spend already exceeds it; do not silently enable that setting.

## Evidence and limitations

Successful read-only CLI sources: `vercel usage --group-by project --json`, `vercel usage --breakdown daily`, `vercel usage --from 2026-10-01 --to 2026-10-04 --breakdown daily`, `vercel firewall overview`, `vercel firewall traffic list`, `vercel firewall traffic inspect bot meta-externalagent`, `vercel firewall bot-management`, and `vercel budgets inspect`, scoped to `shadowdevils-projects-ae938de8`. Runtime samples and grouped logs also came from the Vercel connector.

Connector billing/firewall calls returned misleading-looking not-found responses; CLI access succeeded. Metrics queries for bytes by path and request counts by user agent require Observability Plus and were not available. No paid add-on was purchased. Browser access was unavailable. Therefore the exact historical CPU routes, bytes by bot/path, and bot share of the full billing cycle remain unquantified.

Official references:

- https://vercel.com/docs/bot-management
- https://vercel.com/docs/vercel-firewall/ddos-mitigation
- https://vercel.com/docs/cli/usage

Dashboard: https://vercel.com/shadowdevils-projects-ae938de8/trail-verse/firewall

## Authorized mitigation applied after audit

Following user authorization, published one project-level firewall rule named **Block Meta external agent crawler**: user agent contains `meta-externalagent` → deny. There were no pre-existing draft changes; the publish contained only this rule. Firewall status now confirms enabled with one active rule. Budget, managed AI Bots policy, generic Bot Protection, and other projects were not changed.

Production checks: Meta crawler user agent → HTTP 403; ordinary request → HTTP 200; `facebookexternalhit/1.1` social-preview user agent → HTTP 200. The first available post-publish firewall window already shows **16 denied verified `meta-externalagent` requests attributed to the new rule**. This confirms enforcement against actual bot traffic, beyond the synthetic check. Longer-window savings remain to be measured.

Added the supplementary crawler exclusion to `next-frontend/src/app/robots.ts`. Verified the installed Next.js serializer emits `User-Agent: meta-externalagent` / `Disallow: /`, with the existing wildcard policy and sitemap identical to HEAD. This source change awaits an application deployment; the independently published firewall rule is live now. The shared working tree contains substantial unrelated changes, so it was not bulk-deployed to ship this supplementary policy.

Follow-up: inspect this rule's allowed/denied traffic after a complete hour, then compare complete post-block daily CDN-request and transfer quantities. No background monitoring or future automated check was scheduled by this session.
