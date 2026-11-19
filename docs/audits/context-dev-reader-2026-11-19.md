# Context.dev official-page reader audit — 2026-11-19

Pages: 30. Current reader emulated: same regex strip + 8000-char cut, applied to Context.dev-rendered HTML (nps.gov not reachable from the audit host).
Context.dev reader: main-content Markdown (PDFs parsed), 40,000-char cap. Credits used by this audit: 113.

- Pages where Context.dev lets the extractors find MORE facts: **6**
- Pages where it finds FEWER: **0**
- Context.dev failures: **0** (plus 0 page(s) that no longer exist on nps.gov — not a reader failure)
- Context.dev latency: median 312 ms, p90 1922 ms

| Park | Kind | Page | Current reader (vehicle / park rules) | Context.dev (vehicle / park rules) | Chars kept → read | ms (CD) | JSON cross-check |
|---|---|---|---|---|---|---|---|
| glac | vehicle | /glac/planyourvisit/directions.htm | — / rules 0 | Going-to-the-Sun Road: ≤21 ft / rules 0 | 8000/17954 → 9361 | 306 | 21 (Going-to-the-Sun Road) |
| glac | vehicle | /glac/planyourvisit/gtsrinfo.htm | — / rules 0 | Going-to-the-Sun Road: ≤21 ft / rules 0 | 8000/15331 → 5399 | 327 | 21 (Going-to-the-Sun Road) |
| zion | vehicle | /zion/planyourvisit/directions.htm | — / rules 0 | — / rules 0 | 8000/10613 → 11576 | 846 | none (Zion-Mt. Carmel Highway) |
| zion | rules | /zion/planyourvisit/zion-canyon-shuttle-system.htm | — / rules 0 | — / rules 3 | 8000/40865 → 14544 | 277 |  |
| zion | rules | /zion/planyourvisit/hours.htm | — / rules 0 | — / rules 0 | 8000/13568 → 4085 | 261 |  |
| arch | rules | /arch/planyourvisit/index.htm | — / rules 0 | — / rules 0 | 8000/12240 → 6902 | 272 |  |
| arch | vehicle | /arch/planyourvisit/directions.htm | — / rules 0 | — / rules 0 | 8000/10238 → 4316 | 289 | none  |
| romo | rules | /romo/planyourvisit/timed-entry-permit-system.htm | — / rules 0 | — / rules 5 | 8000/50066 → 36763 | 312 |  |
| romo | vehicle | /romo/planyourvisit/trail_ridge_road.htm | — / rules 0 | — / rules 0 | 8000/16810 → 4805 | 1922 | none (Trail Ridge Road) |
| yose | rules | /yose/planyourvisit/conditions.htm | — / rules 0 | — / rules 0 | 8000/26205 → 12453 | 313 |  |
| yose | rules | /yose/planyourvisit/tioga.htm | — / rules 0 | — / rules 0 | 8000/24951 → 9462 | 323 |  |
| yose | pdf | /yose/planyourvisit/upload/Yosemite-Guide-51-8-508V1.pdf | error: n/a (axios reader cannot parse PDF) | Evergreen Road: ≤25 ft / rules 0 | — → 56652 | 287 |  |
| grca | rules | /grca/planyourvisit/conditions.htm | — / rules 0 | — / rules 0 | 2669/2669 → 2218 | 268 |  |
| grca | vehicle | /grca/planyourvisit/hermit-road.htm | — / rules 1 | — / rules 1 | 8000/9308 → 8771 | 398 | 22 (Hermit Road) |
| yell | rules | /yell/planyourvisit/parkroads.htm | — / rules 0 | — / rules 0 | 8000/22207 → 8078 | 380 |  |
| grsm | vehicle | /grsm/planyourvisit/cadescove.htm | — / rules 0 | — / rules 0 | 8000/20957 → 15753 | 2004 | none (Cades Cove Loop Road) |
| grsm | rules | /grsm/planyourvisit/fees.htm | — / rules 0 | — / rules 0 | 8000/24243 → 18751 | 2855 |  |
| mora | rules | /mora/planyourvisit/road-status.htm | — / rules 0 | — / rules 0 | 8000/17130 → 8064 | 254 |  |
| acad | rules | /acad/planyourvisit/vehicle_reservations.htm | — / rules 0 | Cadillac Summit Road Vehicle Reservations: ≤21 ft / rules 3 | 8000/20923 → 7841 | 1908 |  |
| acad | vehicle | /acad/planyourvisit/directions.htm | — / rules 0 | — / rules 0 | 8000/18514 → 6659 | 308 | none  |
| grte | rules | /grte/planyourvisit/conditions.htm | — / rules 0 | — / rules 0 | 8000/15593 → 7443 | 283 |  |
| jotr | rules | /jotr/planyourvisit/conditions.htm | — / rules 0 | — / rules 0 | 8000/12882 → 3208 | 270 |  |
| brca | rules | /brca/planyourvisit/shuttle.htm | — / rules 0 | — / rules 0 | 8000/20572 → 15216 | 340 |  |
| brca | vehicle | /brca/planyourvisit/directions.htm | — / rules 0 | — / rules 0 | 8000/10488 → 3910 | 261 | none  |
| shen | vehicle | /shen/planyourvisit/directions.htm | — / rules 0 | — / rules 0 | 8000/11528 → 4149 | 287 | none  |
| dena | rules | /dena/planyourvisit/road-lottery.htm | — / rules 0 | — / rules 0 | 8000/13844 → 1498 | 262 |  |
| dena | rules | /dena/planyourvisit/shuttles.htm | — / rules 0 | — / rules 0 | 8000/22594 → 10990 | 1754 |  |
| hale | rules | /hale/planyourvisit/sunrise.htm | — / rules 0 | — / rules 0 | 8000/11789 → 5142 | 1887 |  |
| glba | pdf | /glba/learn/news/upload/2026-Fairweather-Newspaper-508c-web-1.pdf | error: n/a (axios reader cannot parse PDF) | — / rules 0 | — → 37037 | 336 |  |
| crla | vehicle | /crla/planyourvisit/directions.htm | — / rules 0 | — / rules 0 | 8000/9656 → 3575 | 298 | none  |
