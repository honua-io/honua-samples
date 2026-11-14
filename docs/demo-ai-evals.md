# State and local demo answer checks

Run `npm ci`, `npx playwright install chromium`,
`node scripts/state-local/build-display-site.mjs`,
`node scripts/build-gallery.mjs --check`, then
`npm run test:demo-ai:browser`.

The **Demo AI answers** workflow runs this comparison for relevant pull requests,
on trunk, and nightly. It saves `artifacts/demo-ai-evals/results.json` and a
screenshot on failure. A count disagreement fails the job; an intentional 311
count mutation checks that this failure mechanism works.

Each run uses new signed-out browser contexts at 1440 and 390 CSS pixels, with
Hawaii time so the pinned exercise dates have the same interpretation as the
pages. These are pinned snapshot checks, not proof that a live AI service or
county system is connected. Demo answers and fictional operational records stay
labelled. The native-client direction is ADR-0087 in honua-server
(`docs/internal/contributor/adr/0087-native-client-protocols.md`): gRPC and
cloud-native files lead; compatibility protocols are identified as such.

| Page / answer | Evidence checked |
| --- | --- |
| Overview agent example | Illustrative answer and synthetic-record labels; no query count claimed. |
| Property, desktop | Three selected-parcel question buttons agree with the displayed assessment, area and mapped flood zone for featured and other parcels; answers reset on selection. Seven featured-parcel answer statements agree with the mapped-layer list; choosing another parcel hides the fixed answer. Pending sources remain pending. |
| Property, mobile | The same three snapshot questions agree with displayed parcel values at both widths, including keyboard activation and source links. Five featured-parcel statements agree with its rule list; choosing another parcel hides the answer and shows the unavailable message. |
| 311 daily brief | SLA count agrees with the linked queue and an independent filter over the request records, initially and after type and district changes. A deliberately corrupted answer is rejected. |
| 311 triage and reply | Reply is explicitly an unsent example and identifies the selected request; the triage asset matches the request detail. Crew availability and priority are examples; approval changes no records. |
| 311 linked browser loop | Signed-out resident report with a photo, staff assignment and public status share one report ID. The labelled triage category and duplicate ID agree with the chosen board record, and the duplicate link opens that record. CSV provenance, reload persistence and reset are checked. |
| Public works anomaly | Good inspection rating, nearby request count and example request IDs agree with an independent filter over the pinned records. |
| Public works weekly plan | Inspection count and crew-hours agree with the plan rows, summary and demo approval result. |
| Public works capital shortlist | Poor/failed and fair counts agree with the condition ratings in the shortlist table. Costs remain demo estimates. |
| Emergency situation report | Open shelter count, occupied/total capacity and percentage agree with shelter rows; closed-road count agrees with the road list. Resource and critical counts agree with map markers; facility names and exposure counts agree with the table; balancing percentages and free spaces agree with shelter rows. |
| Emergency public notice | Explicit exercise notice; no real alert is asserted. |
| Emergency mobile notice and nearest shelter | Practice notice and straight-line disclaimer; open shelter count agrees with the exercise records and nearest shelter agrees with the first distance-sorted row. |
| Workbench local natural-language parser | Acreage-query count agrees across chips, table, explanation and generated plan; removing a clause updates all four; unsupported requests show no fabricated result. |

Facility geometry and triage proximity/duplicate analysis are calculated from
the pinned records in the page; this suite compares the displayed facility and
triage evidence but does not independently repeat those spatial algorithms.
Property permitting summaries require Planning review. Neither this suite nor a green merge is a live pass of AI-NATIVE-GATE.md. SDK Explorer and
Switching describe AI capabilities but do not show generated record-count
answers. Changes that add an answer must extend this inventory and its browser
checks before claiming that answer is covered.

Property snapshot exports are checked by `scripts/smoke-parcel-exports.mjs`, included in the display browser gate. Both layouts download the currently selected parcel as CSV and GeoJSON with snapshot date, attribution, source licences and warnings; a missing source manifest makes downloads unavailable. These browser checks cover the scripted snapshot experience, not a live backend pass.

The parcel browser regression checks zoning filters and acreage totals against the snapshot, row selection linked to parcel exports, map filters, pagination, and zoning plus parcel state after reloading a shared link on both layouts. It also verifies the explicit outside-filter selection message.
