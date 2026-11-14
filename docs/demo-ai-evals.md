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
| Property, desktop | Seven featured-parcel answer statements agree with the mapped-layer list; choosing another parcel hides the fixed answer. Pending sources remain pending. |
| Property, mobile | Five featured-parcel statements agree with its rule list; choosing another parcel hides the answer and shows the unavailable message. |
| 311 daily brief | SLA count agrees with the linked queue and an independent filter over the request records, initially and after type and district changes. A deliberately corrupted answer is rejected. |
| 311 triage and reply | Reply is explicitly an unsent example and identifies the selected request. Crew availability and priority are examples; approval changes no records. |
| Public works weekly plan | Inspection count and crew-hours agree with the plan rows, summary and demo approval result. |
| Public works capital shortlist | Poor/failed and fair counts agree with the condition ratings in the shortlist table. Costs remain demo estimates. |
| Emergency situation report | Open shelter count, occupied/total capacity and percentage agree with shelter rows; closed-road count agrees with the road list. Resource counts are derived from the fictional request array. |
| Emergency public notice | Explicit exercise notice; no real alert is asserted. |
| Emergency mobile notice and nearest shelter | Practice notice and straight-line disclaimer; open shelter count agrees with the exercise records and nearest shelter agrees with the first distance-sorted row. |
| Workbench local natural-language parser | Acreage-query count agrees across chips, table, explanation and generated plan; removing a clause updates all four; unsupported requests show no fabricated result. |

Facility exposure, shelter balancing, triage proximity/duplicate analysis and
public-works anomaly analysis are calculated from the pinned records in the
page, but this first browser suite does not independently repeat their spatial
algorithms. Property permitting summaries require Planning review. Neither this
suite nor a green merge is a live pass of AI-NATIVE-GATE.md. SDK Explorer and
Switching describe AI capabilities but do not show generated record-count
answers. Changes that add an answer must extend this inventory and its browser
checks before claiming that answer is covered.
