"""Public boundary and format round-trip tests for the pinned catalog exporter."""
import csv
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

import pyarrow.parquet as pq
from shapely import from_wkb

from catalog import build_catalog, csv_cell


class CatalogTests(unittest.TestCase):
    def test_public_boundary_and_downloads(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, output = root / "source", root / "output"
            source.mkdir()
            receipt = dict(license="public-domain", department="Publisher", sourceUrl="https://example.org/service",
                           attribution="Publisher attribution", licenseUrl="https://example.org/license",
                           metadataUrl="https://example.org/metadata")
            manifest = dict(snapshot="2026-11-10", warning="Generalized snapshot", sources={
                "schools": receipt, "fire": {**receipt, "license": "restricted"}})
            (source / "manifest.json").write_text(json.dumps(manifest))
            feature = dict(type="Feature", properties=dict(name="=1+1", count=3),
                           geometry=dict(type="Point", coordinates=[-156.47, 20.88]))
            (source / "schools.geojson").write_text(json.dumps(dict(type="FeatureCollection", features=[feature])))
            record = dict(id="DEMO-1", type="Drainage", cond=4, c=[-156.47, 20.88], reporter="private")
            (source / "demo.json").write_text(json.dumps(dict(requests=[record], assets=[record])))
            output.mkdir()
            (output / "restricted.geojson").write_text("stale restricted export")
            catalog = build_catalog(source, output)
            self.assertFalse((output / "restricted.geojson").exists())
            self.assertEqual({d["id"] for d in catalog["datasets"]}, {"schools", "requests", "assets"})
            for dataset in catalog["datasets"]:
                self.verify_downloads(output, dataset)
            self.assertEqual(csv_cell("  @SUM(A1)"), "'  @SUM(A1)")

    def verify_downloads(self, output, dataset):
        name = dataset["id"]
        for link in dataset["downloads"]:
            file = output / Path(link["url"]).name
            self.assertEqual(file.stat().st_size, link["bytes"])
            self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), link["sha256"])
        geojson = json.loads((output / (name + ".geojson")).read_text())
        properties = geojson["features"][0]["properties"]
        table = pq.read_table(output / (name + ".parquet"))
        self.assertEqual(table.num_rows, len(geojson["features"]))
        self.assertEqual(from_wkb(table["geometry"][0].as_py()).geom_type, "Point")
        self.assertEqual(json.loads(table.schema.metadata[b"geo"])["version"], "1.1.0")
        with (output / (name + ".csv")).open() as file:
            rows = list(csv.DictReader(file))
        if name == "schools":
            self.assertEqual(table["count"][0].as_py(), 3)
            self.assertEqual(rows[0]["name"], "'=1+1")
            self.assertEqual(geojson["attribution"], "Publisher attribution")
        else:
            self.assertNotIn("reporter", properties)
            for key in ("is_demo", "exercise_only"):
                self.assertIs(properties[key], True)
                self.assertIs(table[key][0].as_py(), True)
                self.assertEqual(rows[0][key], "True")
            self.assertEqual(properties["data_origin"], "synthetic_demo")
            self.assertIn("not for operational use", properties["disclaimer"])


if __name__ == "__main__":
    unittest.main()
