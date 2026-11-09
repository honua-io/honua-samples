import json
import os
import sys
from pathlib import Path
from urllib.parse import quote
from honua_sdk import HonuaClient, Pagination, Query, SourceDescriptor, SourceLocator

scenarios = json.loads(Path(__file__).with_name("scenarios.json").read_text())
if len(sys.argv) != 2 or sys.argv[1] not in scenarios:
    raise ValueError("Choose property, emergency, 311 or public-works")
scenario = scenarios[sys.argv[1]]
base = os.environ["HONUA_BASE_URL"].rstrip("/")
service = os.environ["HONUA_SERVICE_ID"]
layer = os.environ["HONUA_LAYER_ID"]
if not base or not service or not layer.isascii() or not layer.isdigit():
    raise ValueError("Set HONUA_BASE_URL, HONUA_SERVICE_ID and a non-negative numeric HONUA_LAYER_ID")
with HonuaClient(base) as client:
    source = client.source(SourceDescriptor(id=scenario["source"], protocol="geoservices-feature-service",
        locator=SourceLocator(service_id=service, layer_id=int(layer))))
    result = source.query(Query(where=scenario["where"], out_fields=["*"], out_sr=4326,
        pagination=Pagination(limit=20, page_size=20, max_pages=1)))
features = []
for feature in result.features:
    row = dict(feature.properties)
    if scenario["exercise"] and (row.get("data_origin") != "synthetic_demo"
        or row.get("is_demo") is not True or row.get("exercise_only") is not True
        or "DEMO DATA" not in str(row.get("display_label", ""))):
        raise ValueError("Exercise record is missing its DEMO DATA provenance")
    features.append({"attributes": row, "geometry": feature.geometry})
print(json.dumps({"source": f"{base}/rest/services/{quote(service, safe='')}/FeatureServer/{layer}",
    "scenario": sys.argv[1], "limit": 20, "completeDataset": False, "features": features}))
