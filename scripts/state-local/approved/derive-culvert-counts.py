"""Count verified snapshot parcels within 300 metres in WGS84 / UTM zone 4N."""
import json
import sys
from pathlib import Path
from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform

root = Path(sys.argv[1])
project = Transformer.from_crs('EPSG:4326', 'EPSG:32604', always_xy=True).transform
parcels = [transform(project, shape(f['geometry'])) for f in json.loads((root / 'parcels.geojson').read_text())['features']]
assets = json.loads((root / 'demo.json').read_text())['assets']
counts = {}
for asset in assets:
    if asset['kind'] == 'Culvert':
        location = transform(project, Point(asset['c']))
        counts[asset['id']] = sum(location.distance(parcel) <= 300 for parcel in parcels)
(root / '05-culvert-parcels.json').write_text(json.dumps({'counts': counts, 'crs': 'EPSG:32604', 'radiusMetres': 300, 'coverage': 'verified parcel snapshot only'}))
