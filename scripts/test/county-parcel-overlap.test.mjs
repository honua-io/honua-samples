import assert from "node:assert/strict";
import test from "node:test";
import { overlapByCode } from "../../samples/county-parcel-viewer/src/overlap.ts";

const polygon = (area) => ({ type: "Polygon", coordinates: [], area });

test("PRM-17 citations include only positive-area contributors and merged coverage counts once", () => {
  const parcel = polygon(100);
  const inside = polygon(60);
  const touching = polygon(0);
  const overlapping = polygon(40);
  const intersections = [];
  const candidates = [inside, touching, overlapping].map((geometry, index) => ({
    code: "U", label: "Urban", geometry, sourceId: index + 1, sourceIdField: "id",
  }));
  const ops = {
    area: (geometry) => geometry.area,
    intersect: (left, right) => {
      assert.equal(left, parcel);
      intersections.push(right);
      return right;
    },
    union: (...parts) => {
      assert.deepEqual(parts, [inside, overlapping]);
      return polygon(75);
    },
  };
  const { groups } = overlapByCode(parcel, candidates, ops);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].share, 0.75);
  assert.deepEqual(groups[0].sources.map((source) => source.sourceId), [1, 3]);
  assert.deepEqual(intersections, [inside, touching, overlapping]);
});
