# Local exception activation — October 16, 2026

Activated locally at **2026-10-16T19:39:53Z**, by this agent on the explicit instruction of repository owner **KrishnaSathvik**. No push, deployment, hosted configuration change or paid request is authorized or performed.

## Owner decision

Source: the owner message in this Codex conversation immediately preceding this activation, headed “Owner approval confirmed” and instructing “Trailie — activate the approved development-dependency exception locally.” No message ID or external approval URL was supplied; none is invented. The following excerpts are from that message:

> The repository owner, KrishnaSathvik, explicitly accepts the documented residual development-tool denial-of-service and archive/supply-chain risks associated with scope SHA-256:
>
> 86ac582ea55d17d50fc9d6b092650152747c671f5fd32d9a2c0211177a30a54e

> Approval expires October 30, 2026, at 00:00 UTC.
>
> Authorization is for LOCAL ACTIVATION ONLY.

> Do not treat this owner approval as authorization to bypass existing GitHub branch protection or independent PR-review requirements.

The recorded approvedAt is the actual UTC local activation time, as requested, not an invented timestamp for the earlier user message. The policy decisionReference points to this transcription of the explicit conversation decision.

## Scope and activation evidence

- Before mutation: status proposed, approval null, evaluator inactive.
- Recomputed scope hash exactly matches **86ac582ea55d17d50fc9d6b092650152747c671f5fd32d9a2c0211177a30a54e** before and after activation. All seven bound manifest/lockfile/graph file hashes match.
- Four distinct advisories across the existing five workspace/advisory/path entries are unchanged (braces occurs in both frontend and backend). No scope or expiry expansion.
- Policy now approved with approvedBy KrishnaSathvik, approvedAt 2026-10-16T19:39:53Z, this decision reference and the identical approved scope hash.
- Six retained CI reports replayed locally through the collector with the actual approval: accepted. The raw 45 development findings and nonzero raw exits remain present; production reports remain zero. This was offline replay, not a fresh registry audit.
- Actual-record evaluation rejects a time before activation and at/after expiry; accepts one millisecond before expiry. Proposed-state evaluation was inactive before the file was changed.
- Offline replay artifacts: /var/folders/sd/6jxxrdkn6tn4tcqlh5g85yvh0000gn/T/trailverse-approved-replay-gVQr3C.

## Validation and remaining steps

Command: `node --test scripts/ci/collect-security-audits.test.mjs scripts/ci/development-exception.test.mjs`.

Result: **34 tests passed, 0 failed, 0 cancelled, 0 skipped**. Coverage includes production findings, new/mixed findings, file/graph drift, malformed scans, scan errors, missing/revoked approval, exact expiry boundary, preservation of raw reports, and integrated collection of all six scopes. Additional offline replay using the real local approval passed as described above. No enforcement or test source needed modification for activation.

Publishing and full required CI, complete candidate pinning, hosted planning/streaming/cancellation acceptance, and coordinated deployment each remain subject to the existing separate authorizations. GitHub branch protection and independent PR review remain mandatory. Production release remains on hold.
