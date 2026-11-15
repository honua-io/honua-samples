"""Build the public snapshot catalog and matching, labelled download formats."""
import csv
import hashlib
import io
import json
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from shapely.geometry import shape

from display_geometry import DISPLAY_DECIMALS, decode_geometry


def read(directory, name):
    for extension in (".cjson", ".geojson", ".json"):
        file = directory / (name + extension)
        if file.exists():
            return json.loads(file.read_text())
    raise FileNotFoundError(name)


def collection(data):
    if data.get("type") == "FeatureCollection":
        return data
    features = []
    decimals = data.get("s", DISPLAY_DECIMALS)
    for values, geometry in zip(data["p"], data["g"]):
        features.append({"type": "Feature", "properties": dict(zip(data["k"], values)),
                         "geometry": decode_geometry(geometry, data["t"] == "poly", decimals)})
    return {"type": "FeatureCollection", "features": features}


def demo_collection(directory, name):
    features = []
    for record in read(directory, "demo")[name]:
        public = ("id", "type", "status", "dept", "created", "district") if name == "requests" else ("id", "kind", "street", "cond", "installed", "insp")
        properties = {key: record.get(key) for key in public}
        properties.update(data_origin="synthetic_demo", is_demo=True, exercise_only=True,
                          disclaimer="DEMO DATA: fictional records; not for operational use")
        features.append({"type": "Feature", "properties": properties,
                         "geometry": {"type": "Point", "coordinates": record["c"]}})
    return {"type": "FeatureCollection", "features": features}


def csv_cell(value):
    text = json.dumps(value) if isinstance(value, (dict, list)) else str(value) if value is not None else ""
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def exports(directory, dataset, fc):
    features = fc["features"]
    for feature in features:
        feature["properties"].update(source_attribution=dataset["by"], source_license=dataset["license"],
                                     snapshot_date=dataset["updated"], snapshot_warning=dataset["warning"])
    fields = sorted({key for feature in features for key in feature["properties"]})
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(fields + ["geometry"])
    for feature in features:
        writer.writerow([csv_cell(feature["properties"].get(key)) for key in fields] +
                        [json.dumps(feature["geometry"], separators=(",", ":"))])
    prefix = directory / dataset["id"]
    prefix.with_suffix(".geojson").write_text(json.dumps(fc, separators=(",", ":")))
    prefix.with_suffix(".csv").write_text(output.getvalue())
    columns = {key: pa.array([feature["properties"].get(key) for feature in features]) for key in fields}
    columns["geometry"] = pa.array([shape(feature["geometry"]).wkb for feature in features], type=pa.binary())
    geo = {"version": "1.1.0", "primary_column": "geometry", "columns": {"geometry": {
        "encoding": "WKB", "geometry_types": sorted({feature["geometry"]["type"] for feature in features})}}}
    table = pa.table(columns).replace_schema_metadata({b"geo": json.dumps(geo).encode(),
        b"honua": json.dumps({"snapshot": dataset["updated"], "license": dataset["license"],
                              "attribution": dataset["by"], "warning": dataset["warning"]}).encode()})
    pq.write_table(table, prefix.with_suffix(".parquet"), compression="zstd")
    links = []
    for label, extension in (("GeoJSON", "geojson"), ("CSV", "csv"), ("GeoParquet", "parquet")):
        file = prefix.with_suffix("." + extension)
        links.append({"format": label, "url": "/state-local/data/catalog/" + file.name,
                      "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest()})
    return links


def build_catalog(source, output):
    manifest = read(source, "manifest")
    output.mkdir(parents=True, exist_ok=True)
    for extension in ("*.geojson", "*.csv", "*.parquet", "catalog.json"):
        for stale in output.glob(extension):
            stale.unlink()
    definitions = json.loads(Path(__file__).with_name("catalog-datasets.json").read_text())
    datasets = []
    for definition in definitions:
        name = definition["id"]
        receipt = manifest["sources"].get(name)
        demo = name in ("requests", "assets")
        if not receipt and not demo:
            continue
        if receipt and receipt.get("license") != "public-domain":
            continue
        fc = demo_collection(source, name) if demo else collection(read(source, name))
        dataset = {**definition, "real": not demo, "freq": "Pinned snapshot", "updated": manifest["snapshot"],
                   "dept": receipt["department"] if receipt else "Demonstration",
                   "src": receipt["sourceUrl"] if receipt else "/state-local/data/approved/manifest.json",
                   "by": receipt["attribution"] if receipt else "Honua fictional exercise records",
                   "license": "Public domain" if receipt else "Demo records for evaluation only",
                   "licenseUrl": receipt["licenseUrl"] if receipt else "/state-local/data/approved/manifest.json",
                   "warning": manifest["warning"], "vintage": receipt.get("dataVintage", "Not stated") if receipt else "Fictional",
                   "metadataUrl": receipt["metadataUrl"] if receipt else "/state-local/data/approved/manifest.json"}
        fc.update(attribution=dataset["by"], license=dataset["license"], snapshot=dataset["updated"], warning=dataset["warning"])
        dataset["downloads"] = exports(output, dataset, fc)
        dataset["count"] = len(fc["features"])
        dataset["formats"] = [link["format"] for link in dataset["downloads"]]
        datasets.append(dataset)
    catalog = {"snapshot": manifest["snapshot"], "warning": manifest["warning"], "datasets": datasets}
    (output / "catalog.json").write_text(json.dumps(catalog, indent=2))
    return catalog


if __name__ == "__main__":
    build_catalog(Path(sys.argv[1]), Path(sys.argv[2]))
