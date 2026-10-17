# Responsive layout and demo interaction pass

The demo page had a 1200px outer container, a 1088px response canvas, and playback CSS that limited every response section to 800px. That last rule constrained rich trip output as well as prose. Home independently centered its hero in a 768px column.

The shared layout contract now uses CSS variables in `next-frontend/src/app/globals.css`: shell 1280px, reading 800px, rich 1120px, with 16px / 24px / 32px gutters. Header, Footer, Home sections and Explore use the same shell. Demo questions and prose use reading width; comparisons, trip imagery, itinerary/map pairs and personalization use rich width. Narrative wrappers can accommodate tables while their text stays readable.

Home keeps its forest photograph, copy and action destinations. Hero content uses a 700px region aligned left at desktop widths and centered below 1024px. Demo has a smaller introduction and a 44px scenario navigation row; narrow screens scroll that row independently.

Demo preferences live in `DemoTripActions`, separate from live trip refinement. Season, party and style selections build a natural-language request with the sample destination, duration and day headings. The primary link is `/plan-ai?entry=new-trip&ask=...`; it supports starting with the sample as-is. The secondary button opens the existing frozen, read-only workspace. Each scenario offers one action panel on its latest trip. Earlier trip blocks and the general bottom CTA do not duplicate that action.

## Validation

Home and Demo were checked in Playwright at 375, 390, 768, 1024, 1440 and 1920px. At every width, document scroll width equals viewport width. Mobile Markdown comparisons scroll inside their own region and retain 14px text.

| Viewport | Reading width | Rich/table width | Header/footer shell | Home alignment |
| --- | --- | --- | --- | --- |
| 375 | 343 | 343 | 375 | Center |
| 390 | 358 | 358 | 390 | Center |
| 768 | 720 | 720 | 768 | Center |
| 1024 | 800 | 960 | 1024 | Left |
| 1440 | 800 | 1120 | 1280 | Left |
| 1920 | 800 | 1120 | 1280 | Left |

Browser interaction verified Fall + Couple + Scenic + relaxed in the prefilled URL, and verified opening and closing the sample workspace without navigating away. Live planning was not submitted during verification.

75 tests pass across demo playback, rich trip presentation, header behavior and frozen playback data. Tests cover local preferences without fixture mutation or provider calls, the latest-trip action panel, workspace opening, all fifteen recorded turns, and existing live personalization behavior. Focused ESLint reports no errors and four existing warnings in Header and playback navigation. `git diff --check` passes.

The playback fixture SHA-256 before and after this pass is identical:

`b8f6ab4bccfc03f2cc087c8936e4702d72310b8b8c61eafe863b8ca5a101f513`

No transcripts, frozen manifests, backend files or Trailie reasoning were changed by this pass. No demo regeneration, GPT calls, push or deployment was performed. The workspace contained substantial pre-existing changes; this pass preserves them.

Review screenshots are in `output/playwright/`: `home-375.png`, `home-1440.png`, `demo-rich-desktop.png`, `demo-actions-desktop.png`, and the remaining requested viewport captures. Test and lint logs are stored there as well.
