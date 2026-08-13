# JavaScript SDK v2 capability refresh

This phase consumes the 17-bundle rolling release built from exactly
`honua-sdk-js@2284c9b032b2c81227dc86ff1ff9a46dc61cde6c`. The producer's v2
handoff and v4 consumer fixture remain the authority for sample titles,
support tiers, lifecycle, qualification, fixture status, and live status.

## Source and bundle binding

Every runnable SDK detail page derives its inline-source URL, GitHub tree URL,
and documentation URL from that sample bundle's `builtFrom.commit`. The
gallery does not fetch displayed source from mutable producer `trunk`. The
browser bytes remain admitted separately through the release manifest's file
sizes and SHA-256 values.

The consumed release assets are:

- `sample-bundles.v2.json`: SHA-256 `d87e3c9ab740d1c3393ab549a92ec5b933159e089e059fb8d1287a942e305e96`
- `sample-bundles.tar.gz`: SHA-256 `8b801b803893e28bc055fa03d92253af1977f496cc8af1f0f8b594f281ba084d`

## Admitted cloud-native curriculum

| Route | Support | Fixture | Live | Boundary |
| --- | --- | --- | --- | --- |
| `/sdk/imagery-cog-quickstart/` | supported | executed | public-live, executed | Live proof covers classified COG inspection and a bounded decoded window; it does not claim browser-side UTM reprojection or a georeferenced live MapLibre mount. |
| `/sdk/columnar-query-quickstart/` | experimental | executed | unavailable, not applicable | Executes the exact 1,336-byte Honua GeoArrow fixture, SHA-256 `c5d9c789171970b19ca9c54d5eda97f045f28adf66324f949c14813e8f90d001`; no public live Arrow or GeoParquet endpoint is claimed. |
| `/sdk/coverages-wcs-basic/` | experimental | executed | public-live, planned | Renders the deterministic 320 x 220 fixture PNG, SHA-256 `8c7b5b3f8bd31bca2df07c4a70254d75e70d63838c2f77e033def3c1b8d2acff`; no live execution is claimed. |
| `/sdk/overture-geoparquet/` | experimental | producer-governed | producer-governed | Production-shaped GeoParquet walkthrough; GeoArrow remains discoverable through the bounded recipe above. |

The imagery fixture source at the same SDK commit pins its synthetic COG asset
to SHA-256 `59ba6110a96c0aba2ab5f5ee27b0eed6ec436956df27bb6312b94573f35190bd`.
The release manifest independently hashes every staged browser file.

## Multidimensional preview boundary

`/jobs/multidimensional-format-maturity/` is a non-runnable, non-GA
walkthrough. It carries the producer's three-layer states without converting
server source evidence into a client claim:

| Format | Client | Server | End to end |
| --- | --- | --- | --- |
| Zarr v2/v3 | unavailable | experimental | unavailable |
| NetCDF-4 | unavailable | metadata-only | unavailable |
| Geospatial HDF5 | unavailable | metadata-only | unavailable |

The walkthrough publishes no executable code, endpoint, Run action, live
receipt, Studio action, CLI command, or full-file browser fallback. The
fixture-backed Coverages/WCS quickstart is the current runnable alternative.

Final anonymous live discovery and deployment remain dependent on the
`demo.honua.io` service manifest and the samples release phase; this refresh
does not alter or deploy demo infrastructure.
