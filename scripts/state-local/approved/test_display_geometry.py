import json
import unittest

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape

from display_geometry import serialize_geometry


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

    def test_small_polygon_collapse_is_rejected(self):
        geometry = box(0, 0, 0.000001, 0.000001)
        self.assertTrue(geometry.is_valid)
        with self.assertRaisesRegex(ValueError, "after 5-decimal rounding"):
            serialize_geometry(geometry)

    def test_hole_touching_shell_after_rounding_is_rejected(self):
        geometry = Polygon(box(0, 0, 1, 1).exterior.coords,
                           [box(0.000001, 0.2, 0.8, 0.8).exterior.coords])
        self.assertTrue(geometry.is_valid)
        with self.assertRaisesRegex(ValueError, "after 5-decimal rounding"):
            serialize_geometry(geometry)

    def test_collapsed_multipolygon_member_is_rejected(self):
        geometry = MultiPolygon([box(0, 0, 1, 1), box(2, 2, 2.000001, 2.000001)])
        self.assertTrue(geometry.is_valid)
        with self.assertRaises(ValueError):
            serialize_geometry(geometry)

    def test_collapsed_line_is_rejected(self):
        with self.assertRaises(ValueError):
            serialize_geometry(LineString([(0, 0), (0.000001, 0.000001)]))

    def test_point_uses_existing_coordinate_precision(self):
        self.assertEqual(serialize_geometry(Point(-156.123456, 20.987654)),
                         {"type": "Point", "coordinates": [-156.12346, 20.98765]})


if __name__ == "__main__":
    unittest.main()
