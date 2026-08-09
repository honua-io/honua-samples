# Release certification audits

This directory is the conservative, capability-by-capability release audit for executable Honua samples. It does not replace `honua-release`; it supplies deterministic evidence dossiers and prioritized gaps to that release train.

## Vocabulary

Producer vocabularies are preserved rather than normalized into a false GA signal:

- Honua Server `CapabilityMaturity.Implemented` means fully implemented and shipped on the current live surface. Its matrix explicitly says this is evidence-count-derived, not a GA signoff.
- Honua Server GA requires interface-level proving tests, applicable passing matrix joins, truthful no-surface reasons, and deployed-route proof. This framework adds release artifact, SDK, operations, accessibility/platform, support, and rollback evidence.
- JavaScript `supported` is a support-manifest status. The package itself is `beta`; `supported` does not mean GA.
- Python `covered` is source coverage. The manifest says the selected rows are unreleased source preview, and the package classifier is Alpha.
- .NET `stable` appears as a compatible server release channel. It does not prove that a NuGet package or capability is GA.
- The public site uses `Source evaluation`, `Public prerelease`, `Source preview`, `Preview`, `Private beta`, and `Planned`. `Preview` is explicitly pre-GA.

Only `claim.gaClaim: true` plus `decision: pass` is a GA claim in these dossiers. Validation rejects that combination unless every required receipt is present, unexpired, semantically asserted, digest-pinned, and every signoff is approved.

## Layout

- `schemas/capability-audit.v1.schema.json` defines a complete capability/job dossier.
- `audits/capabilities/*.json` contains one dossier per audited capability/job.
- `audits/release-gaps.v1.json` supplies reviewed triage metadata for failures referenced by dossiers.
- `schemas/release-gap-register.v1.schema.json` defines the generated priority register.
- `generated/release-gap-register.v1.json` joins audit failures to reviewed gap definitions.
- `generated/release-certification-matrix.md` is the human-readable decision matrix.

## Deterministic commands

```bash
npm run release:audit:validate
npm run release:audit:generate
npm run release:audit:check
node --test scripts/test/release-certification.test.mjs
```

Use `-- --as-of 2026-08-08T00:00:00Z` to reproduce a freshness decision at an exact instant. Generation is byte-stable because outputs contain the source audit set's fixed `asOf`, not wall-clock time. CI uses current time for freshness enforcement and fails if generated outputs drift.

## Current release boundary

All seven GA candidates are blocked. Strong component evidence exists, including 417 FeatureServer proving tests, 100 STAC proving tests, 82/82 WCS CITE, retained First Map and COG live envelopes, and demo manifest routes for feature query, STAC, and PMTiles. Those facts do not close the release-level P0 gaps: no immutable candidate server image/digest is tied to the dossiers; fresh deployed canaries, deterministic reset, and rollback ownership are incomplete; semantic receipts are not admitted for every job; and public GA vocabulary remains broader than the actual release artifacts. Python staging is additionally blocked because its July 1 key and protected `test_service/68823` server/image binding are stale; anonymous Maui data is not a valid substitute for the typed-field contract.

OGC process lifecycle is a conditional preview with explicit .NET bounded-wait and CLI gaps. Python custom-code cloud batch remains planned because the server contract is not matched by Studio authoring/publish UX, SDK wrappers, resource/retry/idempotency controls, log streaming, cleanup receipts, or a live demo. Neither is represented as GA.

Zarr, NetCDF, and HDF5 are explicitly `preview` under `raster.multidim-coverage`. The validator prohibits that capability from targeting GA.

## Gap handling

P0 is reserved for false or unsupported GA claims, security/data-integrity risk, broken core jobs, and absent required live proof or rollback. P1 covers high-value cross-SDK, protocol, day-two, performance, and documentation gaps. P2 records intentional planned work. Existing GitHub issues are reused; `issueNeeded: true` means the inventory found no matching issue and does not authorize creating one.
