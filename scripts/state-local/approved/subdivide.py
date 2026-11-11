import json
import math
import sys
from pathlib import Path

import shapely
from shapely import get_num_coordinates, make_valid
from shapely.geometry import LineString, mapping, shape
from shapely.ops import split, unary_union
from shapely.validation import explain_validity


def within_import_limits(geometry):
    polygons = list(geometry.geoms) if geometry.geom_type == "MultiPolygon" else [geometry]
    rings = sum(1 + len(p.interiors) for p in polygons if p.geom_type == "Polygon")
    return get_num_coordinates(geometry) <= 10_000 and rings <= 100


def subdivide(geometry, depth=0):
    if geometry.geom_type == "GeometryCollection":
        return [part for child in geometry.geoms for part in subdivide(child, depth + 1)]
    if within_import_limits(geometry):
        return [geometry]
    if depth >= 30:
        raise ValueError("Subdivision could not meet default import limits")
    if geometry.geom_type == "MultiPolygon":
        return [part for polygon in geometry.geoms for part in subdivide(polygon, depth + 1)]
    if geometry.geom_type != "Polygon":
        raise ValueError("Oversized non-polygon geometry requires a separate source policy")
    west, south, east, north = geometry.bounds
    if east - west >= north - south:
        middle = (west + east) / 2
        blade = LineString([(middle, south - 1), (middle, north + 1)])
    else:
        middle = (south + north) / 2
        blade = LineString([(west - 1, middle), (east + 1, middle)])
    pieces = list(split(geometry, blade).geoms)
    if len(pieces) < 2:
        raise ValueError("Subdivision did not divide the source geometry")
    return [part for piece in pieces for part in subdivide(piece, depth + 1)]


def partition_features(collection):
    output = []
    subdivided = []
    repairs = []
    for feature in collection["features"]:
        geometry = shape(feature["geometry"])
        if not geometry.is_valid:
            repaired = make_valid(geometry)
            repairs.append({"sourceId": feature["id"], "reason": explain_validity(geometry),
                            "sourceAreaDegrees2": geometry.area, "repairedAreaDegrees2": repaired.area,
                            "resultType": repaired.geom_type})
            geometry = repaired
        if geometry.is_empty:
            raise ValueError(f"Source feature {feature['id']} has empty geometry")
        parts = subdivide(geometry)
        if len(parts) > 1:
            difference = unary_union(parts).symmetric_difference(geometry).area
            if not math.isclose(difference, 0, abs_tol=max(1e-16, geometry.area * 1e-10)):
                raise ValueError(f"Subdivision changed source feature {feature['id']} coverage")
            subdivided.append({"sourceId": feature["id"], "parts": len(parts), "differenceAreaDegrees2": difference})
        for index, part in enumerate(parts):
            output.append({"type": "Feature", "id": str(len(output) + 1),
                           "properties": {**feature["properties"], "source_objectid": feature["properties"]["objectid"],
                                          "objectid": len(output) + 1, "source_part": index + 1, "data_origin": "real"},
                           "geometry": mapping(part)})
    return {"type": "FeatureCollection", "features": output}, {"subdivisions": subdivided, "repairs": repairs}


def main():
    collection = json.loads(Path(sys.argv[1]).read_text())
    output, changes = partition_features(collection)
    with Path(sys.argv[2]).open("x") as target:
        json.dump(output, target, separators=(",", ":"))
    print(json.dumps({"sourceFeatures": len(collection["features"]),
                      "outputFeatures": len(output["features"]),
                      "engine": {"shapely": shapely.__version__, "geos": shapely.geos_version_string}, **changes}))


if __name__ == "__main__":
    main()
