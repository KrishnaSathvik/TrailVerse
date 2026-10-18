# Trailie contextual links — local review candidate

Base HEAD: `6392da99f61246c4043ba8f87fddbd299d40cc1c`  
Working branch: `ci/security-controls-2026-10-16`  
Status: prepared locally for review; not committed, pushed or deployed.

## Proposed PR description

Trailie could identify Recreation.gov facilities without delivering reservation links when RIDB URL fields were empty. Optional exact-resource research now prefers provider-returned URLs and otherwise verifies discovered resource pages through the existing search/extract provider. The same bounded path supports hotel, campground, permit, shuttle, rental car, restaurant, attraction and tour links. It preserves listing-versus-reservation distinctions and treats prices and availability as unknown.

Actionable itinerary links use existing canonical Things to Know guidance; direct resource-help replies filter unsupported URLs. No routine booking searches, additional mandatory model calls, guest-flow changes or streaming-default changes are introduced.

Validation: 154 focused backend tests, nine frontend rendering tests, One-Brain gate PASS, provider isolation counters zero, whitespace checks passed. Subsequent live provider acceptance is a **partial pass**: campground fallback and one exact hotel booking page succeeded, but broad Springdale hotel discovery returned no usable results. See [live findings](../audits/trailie-link-live-acceptance-2026-10-17.md). See [detailed evidence and limits](../audits/trailie-contextual-travel-links-2026-10-17.md).

## Release constraints

Read-only GitHub API inspection of `master` protection returned required `security` status checks with strict/up-to-date enforcement, one approving review, stale-review dismissal, approval of the most recent push, and administrator enforcement. Force pushes and branch deletion are disabled. Repository rulesets returned an empty list. These are observed rules, not an exemption from later changes; recheck when preparing the actual PR.

The working tree contains earlier itinerary, guest/login, UI, CI and release-document changes as well as generated test artifacts. This note does not mark every dirty file release-ready. The accompanying [SHA-256 manifest](trailie-contextual-links-candidate-2026-10-17.json) pins only this feature's current file snapshots, some of which also contain earlier fixes. No staging or commit was performed. An actual release candidate commit, remote CI/security result and required review remain pending the authorized release workflow. Follow the existing coordinated release plan for deployment dependencies.

## Targeted hotel follow-up

The local candidate now includes a [scoped hotel-discovery correction](../audits/trailie-hotel-discovery-coverage-2026-10-17.md): retain name/address-grounded candidates without inventing links, distinguish upstream emptiness from filtering with count-only diagnostics, and prioritize likely property pages within the existing two-page extraction bound. No new live run was authorized. Historical hotel acceptance remains a partial pass; this correction is covered by offline regressions. No release commit has been created.

Final hotel follow-up validation: **58 focused tests passed**, including 15 hotel-specific cases and the captured search-ranking replay; **One-Brain gate PASS**. Provider isolation counters remained zero. This completes the requested targeted local fix; no additional feature work is planned.
