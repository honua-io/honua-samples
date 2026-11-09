import { coverageBounds } from "./sources.mjs";

function numericCoordinate(value) {
  return (typeof value === "number" || typeof value === "string")
    && String(value).trim() !== "" && Number.isFinite(Number(value));
}

function geometryFor(row, geometry) {
  if (geometry.kind === "location") {
    const point = row[geometry.field];
    return { type: "Point", coordinates: [point?.longitude, point?.latitude] };
  }
  if (geometry.field) return row[geometry.field];
  return { type: "Point", coordinates: [row[geometry.longitude], row[geometry.latitude]] };
}

function validPosition(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(numericCoordinate)) return false;
  const [west, south, east, north] = coverageBounds;
  return Number(point[0]) >= west && Number(point[0]) <= east
    && Number(point[1]) >= south && Number(point[1]) <= north;
}

function validSequence(points, minimum) {
  return Array.isArray(points) && points.length >= minimum && points.every(validPosition);
}

function validRing(points) {
  return validSequence(points, 4)
    && points[0].every((coordinate, index) => Number(coordinate) === Number(points.at(-1)[index]));
}

const geometryValidators = {
  Point: validPosition,
  MultiPoint: (points) => validSequence(points, 1),
  LineString: (points) => validSequence(points, 2),
  MultiLineString: (lines) => Array.isArray(lines) && lines.length > 0 && lines.every((line) => validSequence(line, 2)),
  Polygon: (rings) => Array.isArray(rings) && rings.length > 0 && rings.every(validRing),
  MultiPolygon: (polygons) => Array.isArray(polygons) && polygons.length > 0
    && polygons.every((polygon) => geometryValidators.Polygon(polygon)),
};

function checkedGeometry(geometry) {
  if (!Object.hasOwn(geometryValidators, geometry?.type)) return null;
  if (!geometryValidators[geometry?.type]?.(geometry.coordinates)) return null;
  const convert = (coordinates) => Array.isArray(coordinates[0])
    ? coordinates.map(convert) : coordinates.map(Number);
  return { type: geometry.type, coordinates: convert(geometry.coordinates) };
}

export function cleanRows(rows, source) {
  const features = [];
  let rejected = 0;
  for (const row of rows) {
    const geometry = checkedGeometry(geometryFor(row, source.geometry));
    if (!geometry) { rejected += 1; continue; }
    const properties = Object.fromEntries(source.fields.filter((field) => row[field] !== undefined)
      .map((field) => [field, row[field]]));
    features.push({ type: "Feature", id: row[":id"], geometry, properties });
  }
  return { geojson: { type: "FeatureCollection", features }, rejected };
}
