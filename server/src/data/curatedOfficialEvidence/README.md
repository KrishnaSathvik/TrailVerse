# Curated official-source evidence (Phase 9C.1D.5C)

Three deliberately separate inputs:

| File | Contains | Authority |
|---|---|---|
| `experiences.json` | Canonical experience records (`experiences[]`) | none on its own |
| `relationshipCandidates.json` | Typed relationship proposals (`candidates[]`): `same_as`, `access_point_for`, `part_of` | none on its own |
| `reviews.json` | Human review decisions (`reviews[]`), each bound to one record by `candidateHash` | none on its own |

A record becomes authoritative evidence only when the server joins it to an approved
`reviewMethod: "human"` review with a matching `candidateHash`, signed by a reviewer id listed in
the **server** setting `TRAILIE_TRUSTED_RELATIONSHIP_REVIEWERS`. Nothing in these files can mark
a reviewer trusted, and an `approved`/`verifiedBy` field on a record is ignored.

Source mechanics (`sourceCheck`: HTTP status, final URL, excerpt found) are produced by tooling at
collection time. Reviewers decide only whether the official source supports the claim.

Shipped empty. Contract: `server/src/utils/experienceRelationships.js`,
`server/src/utils/curatedExperienceRecords.js`,
`server/src/services/providers/curatedOfficialEvidenceProvider.js`.
