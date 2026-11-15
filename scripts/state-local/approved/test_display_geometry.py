import json
import unittest

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape

from catalog import collection
from display_geometry import compact_scale, enc_geom, serialize_geometry


class DisplayGeometryTests(unittest.TestCase):
    def test_valid_polygon_keeps_holes_after_json_round_trip(self):
        geometry = Polygon(box(0, 0, 1, 1).exterior.coords,
                           [box(0.2, 0.2, 0.8, 0.8).exterior.coords])
        decoded = shape(json.loads(json.dumps(serialize_geometry(geometry))))
        self.assertTrue(decoded.equals(geometry))
        self.assertEqual(len(decoded.interiors), 1)

    def test_multipolygon_keeps_every_component(self):
        geometry = MultiPolygon([box(0, 0, 1, 1), box(2, 2, 3, 3)])
        decoded = shape(serialize_geometry(geometry))
        self.assertTrue(decoded.equals(geometry))
        self.assertEqual(len(decoded.geoms), 2)

    def test_small_polygon_keeps_precision_instead_of_collapsing(self):
        geometry = box(0, 0, 0.000001, 0.000001)
        decoded = shape(serialize_geometry(geometry))
        self.assertTrue(decoded.is_valid and not decoded.is_empty)
        self.assertTrue(decoded.equals(geometry))

    def test_hole_touching_shell_after_rounding_keeps_precision(self):
        geometry = Polygon(box(0, 0, 1, 1).exterior.coords,
                           [box(0.000001, 0.2, 0.8, 0.8).exterior.coords])
        decoded = shape(serialize_geometry(geometry))
        self.assertTrue(decoded.is_valid)
        self.assertTrue(decoded.equals(geometry))
        self.assertEqual(len(decoded.interiors), 1)

    def test_self_intersection_after_rounding_keeps_precision(self):
        # Two vertices 4e-6 apart round onto the same 5-decimal grid point and pinch the ring.
        geometry = Polygon([(0, 0), (1, 0), (0.500002, 0.5), (1, 1), (0, 1), (0.499998, 0.5)])
        self.assertTrue(geometry.is_valid)
        output = serialize_geometry(geometry)
        decoded = shape(output)
        self.assertTrue(decoded.is_valid)
        self.assertTrue(decoded.equals(geometry))

    def test_collapsed_multipolygon_member_is_kept(self):
        geometry = MultiPolygon([box(0, 0, 1, 1), box(2, 2, 2.000001, 2.000001)])
        decoded = shape(serialize_geometry(geometry))
        self.assertTrue(decoded.is_valid)
        self.assertEqual(len(decoded.geoms), 2)

    def test_collapsed_line_is_kept(self):
        decoded = shape(serialize_geometry(LineString([(0, 0), (0.000001, 0.000001)])))
        self.assertGreater(decoded.length, 0)

    def test_invalid_source_is_rejected(self):
        bowtie = Polygon([(0, 0), (1, 1), (1, 0), (0, 1)])
        with self.assertRaisesRegex(ValueError, "before rounding"):
            serialize_geometry(bowtie)

    def test_ordinary_polygon_still_rounds_to_display_precision(self):
        output = serialize_geometry(box(-156.1234567, 20.1234567, -156.0, 20.5))
        for x, y in output["coordinates"][0]:
            self.assertEqual((x, y), (round(x, 5), round(y, 5)))

    def test_point_uses_existing_coordinate_precision(self):
        self.assertEqual(serialize_geometry(Point(-156.123456, 20.987654)),
                         {"type": "Point", "coordinates": [-156.12346, 20.98765]})

    def compact_round_trip(self, geometries):
        features = [{"type": "Feature", "properties": {}, "geometry": serialize_geometry(g)} for g in geometries]
        decimals = compact_scale(features)
        data = {"k": [], "t": "poly", "p": [[] for _ in features], "g": [enc_geom(f["geometry"], decimals) for f in features]}
        if decimals != 5: data["s"] = decimals
        return decimals, [shape(f["geometry"]) for f in collection(data)["features"]]

    def test_compact_keeps_a_precision_fallback_valid(self):
        pinched = Polygon([(0, 0), (1, 0), (0.500002, 0.5), (1, 1), (0, 1), (0.499998, 0.5)])
        decimals, decoded = self.compact_round_trip([box(2, 2, 3, 3), pinched])
        self.assertGreater(decimals, 5)
        self.assertTrue(all(g.is_valid and not g.is_empty for g in decoded))
        self.assertTrue(decoded[1].equals(pinched))

    def test_compact_stays_at_five_decimals_when_rounding_is_safe(self):
        decimals, decoded = self.compact_round_trip([box(-156.12345, 20.1, -156.0, 20.5)])
        self.assertEqual(decimals, 5)
        self.assertTrue(decoded[0].is_valid)


if __name__ == "__main__":
    unittest.main()
