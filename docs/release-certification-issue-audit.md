# Release certification GitHub issue audit

Audit date: `2026-08-08`; `PY-001` exit evidence refreshed `2026-08-09`.

This audit binds each P0/P1 gap to the narrowest existing owner item whose scope covers the stated exit evidence. An issue being closed does not satisfy the evidence requirement and does not change any capability decision.

| Gap | Canonical owner item | State at audit | Coverage finding |
| --- | --- | --- | --- |
| `GA-001` | [honua-release#59](https://github.com/honua-io/honua-release/issues/59) | closed | Exact advertised-GA subset and capability-key evidence gate. |
| `GA-002` | [honua-release#60](https://github.com/honua-io/honua-release/issues/60) | closed | Exact candidate SHA lineage and evidence freshness freeze check. |
| `GA-003` | [honua-release#61](https://github.com/honua-io/honua-release/issues/61) | closed | Exact deployed capability-manifest check and scheduled demo canary. |
| `GA-004` | [honua-sdk-js#543](https://github.com/honua-io/honua-sdk-js/issues/543) | closed | Exact First Map fixture, public-live, browser, accessibility, timing, and evidence lane. |
| `SEC-001` | [honua-server#3102](https://github.com/honua-io/honua-server/issues/3102) | open | Exact bounded authenticated COG range path and immutable object-read contract. |
| `PY-001` | [honua-demo-infra#28](https://github.com/honua-io/honua-demo-infra/issues/28) | closed, completed 2026-08-09 | Exit proven by demo-infra merge `b5c1dc20e`, Python merge `e2be24ddf`, trunk runs `31294158324` and `31294424169`, and the matching descriptor/deployment digest chain. Removed from the active gap register without changing any GA decision. |
| `SDK-001` | [honua-release#31](https://github.com/honua-io/honua-release/issues/31) | open | Exact-version cross-repo candidate manifest, smoke, and evidence bundle. |
| `RAST-001` | [honua-server#3101](https://github.com/honua-io/honua-server/issues/3101) | open | Exact raster work budgets, durable-job promotion, stable errors, observability, and load evidence. |
| `PMT-001` | [honua-sdk-js#1118](https://github.com/honua-io/honua-sdk-js/issues/1118) | open | Exact PMTiles direct-versus-managed lifecycle, typed client, sample, and live-canary scope. |
| `FMT-001` | [honua-sdk-js#1119](https://github.com/honua-io/honua-sdk-js/issues/1119) | open | Exact GeoParquet/GeoArrow public workflow, bounded execution, examples, and performance evidence. No duplicate issue created. |
| `JOB-001` | [honua-samples#29](https://github.com/honua-io/honua-samples/pull/29) | open PR | Exact job-first source/evidence contract; gallery rendering remains explicitly unresolved. |

Umbrella items remain dependency context only: `honua-release#58`, `honua-samples#21`, and `honua-sdk-js#1113` are not used as canonical exit owners where a narrower item exists.

`PY-001` is retained in this historical issue audit but removed from `audits/release-gaps.v1.json` after its fresh exit receipts were admitted. The feature-query candidate remains blocked by unrelated evidence gaps; closed issue state alone did not cause resolution.
