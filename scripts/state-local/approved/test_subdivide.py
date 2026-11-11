import unittest

from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.ops import unary_union

from subdivide import partition_features, subdivide, within_import_limits


class SubdivisionTests(unittest.TestCase):
    def test_many_islands_keep_coverage_and_source_identity(self):
        geometry = MultiPolygon([box(i * 2, 0, i * 2 + 1, 1) for i in range(105)])
        source = {"type": "FeatureCollection", "features": [{"type": "Feature", "id": "17",
                  "properties": {"objectid": 17, "name": "islands"}, "geometry": mapping(geometry)}]}
        output, changes = partition_features(source)
        self.assertEqual(len(output["features"]), 105)
        self.assertEqual(changes["subdivisions"][0]["sourceId"], "17")
        self.assertTrue(all(f["properties"]["source_objectid"] == 17 for f in output["features"]))
        self.assertTrue(unary_union([shape(f["geometry"]) for f in output["features"]]).equals(geometry))

    def test_holes_are_preserved_across_subdivision(self):
        holes = [list(box(i * 2 + 1, 1, i * 2 + 2, 2).exterior.coords) for i in range(105)]
        geometry = Polygon([(0, 0), (212, 0), (212, 3), (0, 3)], holes)
        parts = subdivide(geometry)
        self.assertGreater(len(parts), 1)
        self.assertTrue(all(within_import_limits(part) for part in parts))
        self.assertTrue(unary_union(parts).equals(geometry))

    def test_invalid_source_repair_is_recorded_without_losing_collapsed_lines(self):
        geometry = Polygon([(0, 0), (1, 0), (1, 1), (2, 1), (1, 1), (0, 1)])
        source = {"features": [{"id": "7", "properties": {"objectid": 7}, "geometry": mapping(geometry)}]}
        output, changes = partition_features(source)
        self.assertEqual(len(changes["repairs"]), 1)
        self.assertEqual({f["geometry"]["type"] for f in output["features"]}, {"Polygon", "LineString"})


if __name__ == "__main__":
    unittest.main()
