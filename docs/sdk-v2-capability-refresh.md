# SDK v2 capability refresh

Status: **HOLD - validation and review only. Do not deploy.**

> [!IMPORTANT]
> **The producer pin has moved on; this document is the record of the refresh performed against
> d68f221a3e, not a description of what is vendored today.**
>
> The visual-evidence windows on the previous pin `8f9d6a4fcde9aa78582fb12395ea5b9ef6d9f964` lapsed
> on 2026-09-07, which turned gallery builds red (honua-io/honua-samples#57). The live pin in
> `scripts/lib/sdk-producer-lock.mjs` is now `ac22cb56fc927a65666c7cfebbb6b778d7afc7a1`, and the
> vendored bundle manifest (67,115 bytes, SHA-256
> `58af9d4d099349f07f96df3b37d2426967beab2946e33eed861dabd1cfea5b88`) and archive (137,727,264 bytes,
> SHA-256 `5bf61dc6bc93bb95ce4e5d17e9760782fc887d3dc485e3724930d4c596e87e42`) are packed from that
> checkout with `sourceDateEpoch` 1792575330. The archive is stored as parts under 50 MiB because
> GitHub rejects a single blob over 100 MiB; readers concatenate those parts before the digest check.
>
> The exact inputs, digests, and capability scope recorded below are **left unmodified on purpose**.
> They are the evidence of an audit that was carried out against a specific commit; restating them
> against a commit nobody re-audited would falsify the record. A fresh capability refresh against the
> current pin is separate work with an owner, not a side effect of unblocking CI.

This refresh consumes the exact merged honua-sdk-js source at d68f221a3ee49b86f06f0d587faf2c627263283d (tree 01b6358736d43b00b2fcf24d5bc6b4332b3cfc2b). It does not consume or claim an SDK release. The bundle was built and packed deterministically from that checkout, then vendored with its pack receipt.

## Exact producer inputs

- Handoff: https://github.com/honua-io/honua-sdk-js/blob/d68f221a3ee49b86f06f0d587faf2c627263283d/samples/dist/honua-site-consumer-handoff.v2.json
- Consumer fixture contract: https://github.com/honua-io/honua-sdk-js/blob/d68f221a3ee49b86f06f0d587faf2c627263283d/samples/contract/v2/consumer-fixtures/honua-site-consumer.v4.json
- Catalog: https://github.com/honua-io/honua-sdk-js/blob/d68f221a3ee49b86f06f0d587faf2c627263283d/samples/catalog.v2.json
- Bundle manifest: 85,856 bytes, SHA-256 aa05bb75d112f3a079a06693ccae76e3b2b3c566e75e9d5b062adf06ff187198
- Bundle archive: 73,615,366 bytes, SHA-256 f46278273e98d98599922a5db0d12c30128d737dfb7bbd2838bd5f21a0e9b1c6
- Pack receipt: vendor/sdk-producer/d68f221a3ee49b86f06f0d587faf2c627263283d/pack-metadata.json, source date epoch 1786693934

## Capability scope

| Task | Published shape | Evidence boundary |
| --- | --- | --- |
| COG and STAC imagery | Focused fixture walkthroughs with inline runnable code and exact SDK project links | Deterministic fixture/task evidence only. No samples-owned deployed STAC/COG canary is claimed. |
| GeoArrow query | Focused bounded-query example | Exact 4,160-byte GeoArrow 0.2 server artifact, SHA-256 da4ccf9aa159e6e34b448c87712e074438a64f7eb57f38c39bad24a821170f52; live Arrow/GeoArrow service unavailable. |
| GeoParquet | Production-shaped Overture walkthrough/project source | Complete client project, not proof of a deployed Honua columnar service. |
| OGC API Coverages and WCS | Task-oriented fixture walkthrough | Deterministic 320 x 220 PNG proof; anonymous live canary remains planned. |
| Zarr, NetCDF, HDF5 | Architecture preview only | Non-runnable and not publicly admitted; no SDK export, deployment, migration, or release claim. |

The GeoArrow bytes originate from honua-server authored commit 66a9d34496c6f6a03dd571957062f773bfef7f0a, merged as 4ef53ce7f49b78aad3572db1dfc3be88a6654a43, artifact run 31767388217. The exact artifact is 4,160 bytes with SHA-256 da4ccf9aa159e6e34b448c87712e074438a64f7eb57f38c39bad24a821170f52.

## Integrity and publication rules

- SDK handoff, fixture contract, catalog, bundle manifest, bundle archive, and inline source links are bound to the exact SDK commit.
- Samples-owned project and job links are bound to the exact checked-out samples commit.
- Published gallery output rejects mutable /trunk/ links.
- COG chunks, GeoArrow bytes and sidecars, and the Coverages/WCS fixture source are independently byte-, SHA-256-, and Git-blob-checked.
- The fixture receipt is mutation-tested.
- Public portfolio text states fixture-only, planned, or unavailable live states explicitly.
- Deployment remains on hold.
