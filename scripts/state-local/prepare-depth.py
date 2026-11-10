"""Prepare a bounded, numeric NOAA Maui sea-level-rise scenario COG."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rasterio.shutil import copy as copy_raster
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform, transform_bounds

from raster_io import fetch, output_digest, write_json


SOURCE_URL = "https://coast.noaa.gov/slrdata/Depth_Rasters/HI/HI_Maui_slr_depth_3ft.tif"
SOURCE_SHA256 = "25b1e1a23013f4585909bb73a9be874ffbd311faf92f82ee0fbefbca8b8097b9"
SOURCE_BYTES = 123_608_890
SOURCE_NODATA = -3.4028230607370965e38
OUTPUT_NODATA = -9999.0
OUTPUT_SIZE = (768, 1024)
BOUNDS = (-156.69, 20.868, -156.668, 20.895)
ATTRIBUTION = "NOAA Office for Coastal Management, Sea Level Rise Viewer"
TERMS = {
    "depth-directory": "https://coast.noaa.gov/slrdata/Depth_Rasters/HI/index.html",
    "dataset-metadata": "https://www.fisheries.noaa.gov/inport/item/48106",
    "reuse-policy": "https://oceanservice.noaa.gov/about/faq.html",
}
WARNING = ("Planning and screening only; not a forecast, evacuation instruction, or safety classification. "
           "NoData means no modeled depth value, not zero depth or safety.")


def verify_source(original):
    if original.crs is None or original.crs.to_epsg() != 26904:
        raise ValueError("Unexpected NOAA source CRS")
    if original.count != 1 or original.dtypes != ("float32",):
        raise ValueError("Expected one numeric Float32 depth band")
    if original.nodata != SOURCE_NODATA:
        raise ValueError("Unexpected NOAA source NoData")


def reproject_depth(original, memory):
    bounds = transform_bounds("EPSG:4326", "EPSG:3857", *BOUNDS)
    width, height = OUTPUT_SIZE
    profile = {"driver": "GTiff", "width": width, "height": height,
               "count": 1, "dtype": "float32", "crs": "EPSG:3857",
               "transform": from_bounds(*bounds, width, height), "nodata": OUTPUT_NODATA}
    with memory.open(**profile) as cropped:
        reproject(source=rasterio.band(original, 1), destination=rasterio.band(cropped, 1),
                  src_nodata=SOURCE_NODATA, dst_nodata=OUTPUT_NODATA,
                  resampling=Resampling.nearest)
        cropped.update_tags(scenario="+3 ft above MHHW", units="metres above ground",
                            attribution=ATTRIBUTION, warning=WARNING)
        cropped.set_band_description(1, "Modeled ocean-connected inundation depth (metres)")


def source_cell_oracle(original, result, values):
    positions = np.argwhere(~np.ma.getmaskarray(values))
    selected = positions[np.linspace(0, len(positions) - 1, min(32, len(positions)), dtype=int)]
    rows, columns = selected.T
    x, y = rasterio.transform.xy(result.transform, rows, columns)
    source_x, source_y = transform(result.crs, original.crs, x, y)
    expected = np.ma.asarray(list(original.sample(zip(source_x, source_y), masked=True)))[:, 0]
    actual = values[rows, columns]
    if np.ma.getmaskarray(expected).any() or not np.array_equal(actual.data, expected.data):
        raise ValueError("Reprojected numeric cells do not match independently sampled source cells")
    return [{"column": int(column), "row": int(row), "metres": float(value)}
            for (row, column), value in zip(selected, expected)]


def inspect_output(source, target):
    with rasterio.open(source) as original, rasterio.open(target) as result:
        if (result.crs.to_epsg() != 3857 or result.dtypes != ("float32",)
                or result.nodata != OUTPUT_NODATA or not result.overviews(1)
                or result.tags(ns="IMAGE_STRUCTURE").get("LAYOUT") != "COG"):
            raise ValueError("Output lacks numeric COG structure, CRS, NoData or overviews")
        values = result.read(1, masked=True)
        valid = values.compressed()
        if not valid.size or not np.isfinite(valid).all() or (valid < 0).any():
            raise ValueError("Output has no valid nonnegative finite modeled depths")
        oracle = source_cell_oracle(original, result, values)
        return {"sourceCrs": "EPSG:26904", "outputCrs": "EPSG:3857",
                "bounds": list(BOUNDS), "width": result.width, "height": result.height,
                "resampling": "nearest", "dtype": "float32", "nodata": OUTPUT_NODATA,
                "units": "metres above ground", "validPixels": int(valid.size),
                "nodataPixels": int(values.size - valid.size),
                "minimumMetres": float(valid.min()), "maximumMetres": float(valid.max()),
                "overviews": result.overviews(1), "sourceCellOracle": oracle}


def crop_depth(source, target):
    with rasterio.open(source) as original, MemoryFile() as memory:
        verify_source(original)
        reproject_depth(original, memory)
        with memory.open() as cropped:
            copy_raster(cropped, target, driver="COG", BLOCKSIZE=256,
                        COMPRESS="DEFLATE", OVERVIEWS="AUTO", RESAMPLING="NEAREST")
    return inspect_output(source, target)


def prepare(directory):
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "receipt.json").unlink(missing_ok=True)
    source = directory / "HI_Maui_slr_depth_3ft-source.tif"
    source_receipt = fetch(SOURCE_URL, source, SOURCE_BYTES)
    if source_receipt["sha256"] != SOURCE_SHA256 or source_receipt["bytes"] != SOURCE_BYTES:
        raise ValueError("Source bytes changed; review provenance before updating the pinned source")
    terms = {name: fetch(url, directory / (name + ".html"), 2_000_000)
             for name, url in TERMS.items()}
    output = directory / "lahaina-noaa-slr-3ft-depth.tif"
    conversion = crop_depth(source, output)
    receipt = {"schemaVersion": 1, "retrievedAt": datetime.now(timezone.utc).isoformat(),
               "source": source_receipt, "scenario": "+3 ft sea level above MHHW",
               "modelVintage": "Not independently verified for this source file",
               "license": "NOAA public-domain information policy; dataset access constraints: none",
               "attribution": ATTRIBUTION, "terms": terms, "warning": WARNING,
               "conversion": conversion, "output": {"file": output.name, **output_digest(output)}}
    write_json(directory / "receipt.json", receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    directory = parser.parse_args().output.resolve()
    if "artifacts" not in directory.parts:
        raise ValueError("Write fetched data to an ignored artifacts directory")
    receipt = prepare(directory)
    print(json.dumps({"outputBytes": receipt["output"]["bytes"],
                      "validPixels": receipt["conversion"]["validPixels"]}))


if __name__ == "__main__":
    main()
