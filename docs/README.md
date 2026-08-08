# Honua developer samples program

This directory records the research, product decisions, and delivery plan for the Honua developer learning experience.

## Repository and domain ownership

- `honua-samples` owns focused Examples, task-oriented Walkthroughs, production-shaped Projects, the gallery registry, and the deployed learning experience at `samples.honua.io`.
- `honua-demo-infra` owns Terraform, seeding, demo manifests, runbooks, and demo operations.
- `demo.honua.io` exposes environment status, capability discovery, service endpoints, and dataset manifests. It is not a second samples gallery.
- `honua-sdk-js` owns the JavaScript SDK and SDK-maintained example source. Publishable examples are projected into `honua-samples` through the verified bundle handoff.

The infrastructure repository was renamed from `honua-demo` to `honua-demo-infra` on 2026-08-08. Existing deployed resource identifiers beginning with `honua-demo` remain unchanged unless an infrastructure migration explicitly replaces them.

## Research artifacts

- [Competitive sample audit](competitive-sample-audit.md) compares ArcGIS, Mapbox, CARTO, and AppStudio, identifies Honua SDK gaps, and defines the curriculum and delivery sequence.
- [Competitor example inventory](competitor-example-inventory.json) is the route-level source inventory used by the audit.

## Content contract

- **Example:** one concept, runnable result, inline code first, and a repository link as a secondary action.
- **Walkthrough:** one end-to-end task with ordered steps, expected output, troubleshooting, inline code, and a complete-project link.
- **Project:** a production-shaped application where architecture, deployment, and the complete GitHub repository are primary.

Published content must pass manifest validation, deterministic artifact generation, browser runtime checks, and sample-specific semantic assertions. A page load alone is not proof that a sample works.

## SDK backlog

Cloud-native SDK work is tracked by [honua-sdk-js epic #1113](https://github.com/honua-io/honua-sdk-js/issues/1113). Its child issues cover normalized source discovery, OGC API Coverages/WCS, dynamic STAC, raster operations, PMTiles lifecycle, GeoParquet/GeoArrow, and maturity-gated Zarr and NetCDF/HDF5 support.
