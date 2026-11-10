# Numeric sea-level scenario input

Prepare a small Lahaina crop from NOAA OCM's Maui +3 ft sea-level-rise
inundation depth raster. Run from the repository root:

```sh
python3 -m venv artifacts/depth-venv
artifacts/depth-venv/bin/pip install -r scripts/state-local/imagery-requirements.txt
artifacts/depth-venv/bin/python scripts/state-local/prepare-depth.py --output artifacts/depth-prepared
```

The script fetches a 123.6 MB source with a pinned SHA-256 checksum and snapshots
the source directory, dataset metadata and NOAA reuse policy. All fetched data,
derived COGs and receipts remain under ignored `artifacts/`. CI exercises only
synthetic rasters; it does not download the NOAA dataset.

Source: [NOAA Maui +3 ft depth GeoTIFF](https://coast.noaa.gov/slrdata/Depth_Rasters/HI/HI_Maui_slr_depth_3ft.tif).
The source has one Float32 band in EPSG:26904, with a negative sentinel for
NoData. Conversion explicitly reprojects to EPSG:3857, preserves Float32 depth
values in metres above ground, uses nearest-neighbour resampling for both the
base grid and overviews, and maps unknown cells to NoData -9999. It verifies
COG layout, overviews, valid values and 32 output cells against independent
coordinate-transformed source samples. The receipt includes both checksums,
the numeric oracle, units, bounds and valid/unknown cell counts. A failed run
removes any previous success receipt.

The scenario is +3 ft above Mean Higher High Water (MHHW), with modeled
ocean-connected inundation. It is separate from the State's combined 3.2 ft
sea-level-rise exposure-area polygon. The source file's model vintage is not
independently verified; HTTP modification dates and aggregate catalog dates
must not be presented as model dates.

Credit **NOAA Office for Coastal Management, Sea Level Rise Viewer**.
[Dataset metadata](https://www.fisheries.noaa.gov/inport/item/48106) reports no
access constraints and requests NOAA credit. The
[NOAA public-domain policy](https://oceanservice.noaa.gov/about/faq.html) applies
unless another copyright is credited; do not imply NOAA endorsement.
Retain the source terms snapshots and their receipt checksums with deployments.

This is planning and screening information, not a forecast, evacuation
instruction, navigation, permitting or legal-use product. NoData means no
modeled depth value; it does not mean zero depth or safety. These distinctions
must remain visible in maps, numeric hover, exports and agent answers. This
preparation script does not establish a complete browser demonstration or eval pass.
