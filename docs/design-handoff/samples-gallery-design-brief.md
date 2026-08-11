# samples.honua.io — design brief

Status: handoff draft · 2026-08-10
Audience: the Claude design session producing the new gallery's look, page templates, and tokens.
Precedence: this brief wins on everything visitor-facing. `docs/competitive-sample-audit.md` still governs internal cataloging, evidence plumbing, and content sequencing — none of which appears on a public page.

## The job

Redesign samples.honua.io so a visitor's first thought, within ten seconds, is: **"Honua makes cool maps."**

Everything else — protocol breadth, conformance, migration tooling — is proven *incidentally*, by the maps being real and the code being short. It is never the headline.

## The one-sentence problem

The current gallery is a text-only compliance report: 11 cards, zero images, no code on the page, and internal vocabulary ("not-admitted", "coverage gaps") in public view. The machinery behind it is solid. The surface sells nothing.

## Readers, in order

1. **A GIS manager or server admin** who clicked "samples" from honua.io or a founder email. Decides in 60 seconds whether Honua is real. Will not read code.
2. **A developer evaluating** — wants the code next to the running map and to run it against their own server in five minutes, no signup.
3. **Mike in a sales call** — needs a handful of full-screen, reliably live demos that carry a story.

## The rule that overrides everything

Every demo is a cool map first. Code and a short explanation attach to the map. Process never does: no evidence receipts, no lifecycle states, no cross-SDK matrices, no job-page dossiers on the demo path. That apparatus lives in internal metadata and, later, reference docs — not here.

## What a demo page is

- The live map, full-bleed, interactive within a second of load.
- A title that names the outcome, 2–3 sentences under it. That is the entire explanation budget.
- The code: one complete, syntax-highlighted, standalone HTML file. Copy button. Download.
- One editable line at the top of every snippet: `const server = "https://demo.honua.io"` — point it at your own Honua and the same code runs. No key, no token, no signup. Say this on the page; it's a weapon neither Esri nor Mapbox has.
- "Open full screen" — the sales-call button.
- Three related demos at the bottom.
- Nothing else.

## The gallery

- A grid of real screenshot thumbnails, consistent crop, chosen for visual drama. The grid itself should read like a poster wall of maps.
- Title plus one line per card. One or two small chips ("3D", "realtime", "works in ArcGIS Pro"). No maturity or lifecycle words, ever.
- A curated row up top ("Start with these five"), the full grid below with plain search and a few topic filters. No taxonomy engineering.
- One quiet status dot: "demo.honua.io · live".

## Launch slate

Design with these — real content, no lorem. Picked for wow, not coverage:

1. 3D Maui terrain flyover (hillshade + Terrain-RGB)
2. Sea-level rise slider over Maui parcels
3. Flood-exposed parcels with a live count that updates as you pan
4. Temporal playback (time slider)
5. Live incident feed (realtime)
6. Satellite imagery browser (STAC → COG)
7. 50,000 buildings aggregated with deck.gl
8. Offline basemap from a single PMTiles file
9. One dataset, four styles (style swap)
10. "ArcGIS Pro connects to this server" (screen capture + live layer)

Titles get rewritten in founder voice. A demo that isn't reliably live doesn't ship — no placeholder cards.

## Voice

- Founder register: short, declarative, opinionated. The test for any public sentence: would Mike say it to a prospect's face?
- Titles are outcomes, not protocols. Protocol names are chips, not headlines.
- Banned from rendered HTML: *admitted, governed, qualification, assertion, evidence, semantic, canonical, receipt, fixture, maintained*. A build gate enforces this.
- Numbers only when they're the point: "1.2M parcels at 60fps", "loads in 300ms".
- Budgets: card title ≤ 7 words · card line ≤ 16 words · page intro ≤ 3 sentences.

## Look

No new design system. One shared `honua-tokens.css` extracted from the existing brand — Bedrock palette, Geist + Geist Mono (self-hosted), the mono-label rule, `//` eyebrows, 22px dot grid, the existing focus ring. The current unbranded `gallery.css` is replaced.

Two Stage-1 explorations, then Mike picks:

- **A — Bedrock dark (recommended).** Dark ocean ground; the maps are the light source. Continuity with honua.io; terrain, imagery, and deck.gl read cinematic. Risk to manage: heavy code blocks on dark — keep the code panel calm.
- **B — Learning Hub paper.** Warm paper + ink, night-band sections for full-bleed maps. Friendlier for long reading; maps pop less.

Whichever wins: commit to one look, explicit colors everywhere, so OS dark mode can never half-theme a page.

## Steal / refuse

- **Steal** — Esri: keyless runnable samples, real-screenshot thumbnails. Mapbox: complete standalone code documents; metadata-driven cards; a markdown twin of every page for LLMs. deck.gl/CARTO: dark map drama, live counters, stated scale as implicit perf proof, map + tiny insight panel.
- **Refuse** — Esri: 412-sample sprawl and title-only search. Mapbox: static screenshots in the buyer path; rotting demo subdomains. CARTO: live demos buried three properties away from buyers. All three: account walls anywhere.
- **Beat all three with:** a live map as the landing hero (none of them has one), and no token, key, or signup anywhere.

## Constraints

- Static output from the existing `build-gallery.mjs` (no framework). Browsing works without JS; search, filters, and code widgets enhance progressively.
- No external CDNs. Fonts self-hosted. Thumbnails AVIF, lazy-loaded. Landing must be fast on hotel wifi.
- Visible keyboard focus, alt text on every thumbnail, reduced-motion variants of any flyover.
- Mobile: the grid stacks; full-screen demos usable on an iPad — sales calls happen there.

## Deliverables

1. **Stage 1:** two self-contained HTML explorations of the landing page (A and B), built with the real launch slate.
2. **Stage 2, after the pick:** `honua-tokens.css`, the demo-page template, the gallery template, a card + states sheet (loading / demo-paused / not-live-yet, in human words), and a thumbnail art-direction spec with two worked examples.

## Open for Mike

- A vs B, after seeing Stage 1.
- Slate order, and whether the ArcGIS Pro demo is video, live, or both.
- Gallery analytics: Mapbox measures per-example usage; Honua's "no phone-home" promise is about the product — does it extend to the website?

## Engineering notes (not design — file as tickets)

- honua.io/samples.html has two 404 starter links today. Fix immediately, independent of the redesign.
- Thumbnail capture: reuse the existing Playwright smoke infrastructure at build time.
- Voice banlist gate in `build-gallery.mjs`.
- The audit's evidence and cataloging machinery stays as internal metadata; the public surface renders none of it.
