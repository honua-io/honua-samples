# State and local gallery

The landing, Switching and SDK Explorer pages use the county parcel sample's shared design tokens and theme preference. The gallery build copies these pages and checks their local links after emitting the sample pages.

The Explorer catalogue is derived from the approved `sdk_samples.py` generator. Regenerate after fetching `origin/trunk` in honua-sdk-js, honua-samples and honua-server:

```sh
python3 -I scripts/state-local/sdk_samples.py --root /path/to/workspace --output scripts/state-local/site/sdk-explorer/catalog.json
```

The snapshot records each repository revision and links source files to immutable commits. It contains source excerpts and rendered READMEs, not a claim that every sample runs in a browser.

Runnable previews are derived from the gallery build’s admitted app bundles. The gallery’s public runnable apps are admitted. First Map, sketch editing, spatial analytics and natural-language control remain source/readme entries because their portfolio apps are inactive or moved; this page does not reactivate them. `previews.json` comes from admitted gallery cards and records the app's actual data mode and build commit. Missing bundles remain explicitly unavailable; fixture and hybrid apps disclose demo data. The source snapshot and app build revisions can differ and are shown separately.

Coming-soon journeys stay labelled until their owners clear the deployment, data provenance and public verification gates.
