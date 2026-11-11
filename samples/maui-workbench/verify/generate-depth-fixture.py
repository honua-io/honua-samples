"""Small synthetic depth grid for browser tests; not NOAA measurements."""
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds

output = Path('artifacts/workbench-depth-fixture.tif')
output.parent.mkdir(exist_ok=True)
values = np.full((1024, 768), -9999, dtype='float32')
values[:, 384:] = np.arange(384, dtype='float32') / 128
with rasterio.open(output, 'w', driver='COG', width=768, height=1024, count=1,
                   dtype='float32', crs='EPSG:3857', nodata=-9999, blocksize=256,
                   compress='DEFLATE', overview_resampling='nearest',
                   transform=from_bounds(*transform_bounds('EPSG:4326', 'EPSG:3857',
                                         -156.69, 20.868, -156.668, 20.895), 768, 1024)) as dataset:
    dataset.write(values, 1)
