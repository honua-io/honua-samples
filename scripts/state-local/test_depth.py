import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds


spec = importlib.util.spec_from_file_location("depth", Path(__file__).with_name("prepare-depth.py"))
depth = importlib.util.module_from_spec(spec)
spec.loader.exec_module(depth)


class NumericDepthTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / "artifacts"
        self.output.mkdir()
        self.source = self.output / "source.tif"
        self.target = self.output / "depth.tif"

    def write_source(self, crs="EPSG:26904", nodata=depth.SOURCE_NODATA):
        bounds = transform_bounds("EPSG:4326", crs, *depth.BOUNDS)
        values = np.full((128, 128), nodata, dtype=np.float32)
        values[:, 64:] = np.arange(64, dtype=np.float32)[None, :] / 8
        with rasterio.open(self.source, "w", driver="GTiff", width=128, height=128,
                           count=1, dtype="float32", crs=crs, nodata=nodata,
                           transform=from_bounds(*bounds, 128, 128)) as source:
            source.write(values, 1)

    def test_preserves_numeric_depths_and_unknown_cells(self):
        self.write_source()
        receipt = depth.crop_depth(self.source, self.target)
        self.assertGreater(receipt["validPixels"], 100_000)
        self.assertGreater(receipt["nodataPixels"], 100_000)
        self.assertEqual(receipt["minimumMetres"], 0)
        self.assertEqual(receipt["maximumMetres"], 7.875)
        self.assertEqual(len(receipt["sourceCellOracle"]), 32)
        with rasterio.open(self.target) as result:
            self.assertEqual(result.crs.to_epsg(), 3857)
            self.assertEqual(result.dtypes, ("float32",))
            self.assertEqual(result.nodata, -9999)
            self.assertEqual(result.tags(ns="IMAGE_STRUCTURE")["LAYOUT"], "COG")
            values = result.read(1, masked=True)
            self.assertTrue(values.mask[512, 100])
            self.assertFalse(values.mask[512, 650])
            self.assertIn(float(values[512, 650]), np.arange(64) / 8)

    def test_prepared_raster_closes_when_conversion_fails(self):
        self.write_source()
        with rasterio.open(self.source) as original:
            with self.assertRaisesRegex(RuntimeError, "conversion failed"):
                with depth.reproject_depth(original) as cropped:
                    self.assertFalse(cropped.closed)
                    self.assertEqual(cropped.crs.to_epsg(), 3857)
                    raise RuntimeError("conversion failed")
            self.assertTrue(cropped.closed)
            self.assertFalse(original.closed)

    def test_rejects_wrong_crs_and_nodata(self):
        for crs, nodata, message in [("EPSG:4326", depth.SOURCE_NODATA, "source CRS"),
                                      ("EPSG:26904", -9999, "source NoData")]:
            with self.subTest(message=message):
                self.write_source(crs, nodata)
                with self.assertRaisesRegex(ValueError, message):
                    depth.crop_depth(self.source, self.target)

    def test_rejects_absent_coverage(self):
        self.write_source()
        with patch.object(depth, "BOUNDS", (-155, 19, -154.9, 19.1)):
            with self.assertRaisesRegex(ValueError, "no valid"):
                depth.crop_depth(self.source, self.target)

    def test_detects_numeric_tampering_against_source(self):
        self.write_source()
        depth.crop_depth(self.source, self.target)
        with rasterio.open(self.source, "r+") as source:
            source.write(np.full((128, 128), 99, dtype=np.float32), 1)
        with self.assertRaisesRegex(ValueError, "independently sampled"):
            depth.inspect_output(self.source, self.target)

    def test_changed_source_removes_stale_success_receipt(self):
        receipt = self.output / "receipt.json"
        receipt.write_text('{"stale": true}')
        with patch.object(depth, "fetch", return_value={"sha256": "changed", "bytes": 3}):
            with self.assertRaisesRegex(ValueError, "Source bytes changed"):
                depth.prepare(self.output)
        self.assertFalse(receipt.exists())


if __name__ == "__main__":
    unittest.main()
