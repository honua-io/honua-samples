import assert from "node:assert/strict";
import test from "node:test";
import { addressChoices, addressPrecision } from "../../samples/county-parcel-viewer/src/address-precision.ts";

test("highway centre lines are streets, including a copied house number", () => {
  assert.equal(addressPrecision({
    class: "highway", type: "primary", Addr_type: "Locality", AddNum: "200",
  }), "street");
  assert.equal(addressPrecision({ Addr_type: "StreetName" }), "street");
  assert.equal(addressPrecision({ Addr_type: "StreetAddress" }), "street");
});

test("buildings and house numbers are addresses", () => {
  assert.equal(addressPrecision({ class: "building", type: "yes" }), "address");
  assert.equal(addressPrecision({
    class: "place", type: "house", Addr_type: "PointAddress", AddNum: "2145",
  }), "address");
  assert.equal(addressPrecision({ class: "place", type: "town", Addr_type: "City" }), "area");
  assert.equal(addressPrecision({ class: "amenity", type: "school", Addr_type: "Locality" }), "place");
});

test("a street beside a town is the street, and a street beside a building keeps the building", () => {
  const street = { address: "South High Street, Wailuku", precision: "street", shortLabel: "South High Street" };
  const town = { address: "Wailuku", precision: "area", shortLabel: "Wailuku" };
  const building = { address: "Wailuku Elementary", precision: "address", shortLabel: "Wailuku Elementary" };
  assert.deepEqual(addressChoices([street, town]), { kind: "street", labels: ["South High Street"] });
  assert.deepEqual(addressChoices([street, building]), { kind: "addresses", matches: [building] });
  assert.deepEqual(addressChoices([]), { kind: "none" });
});

test("a point of interest is kept when a street is also returned", () => {
  const street = { address: "School Street", precision: "street", shortLabel: "School Street" };
  const school = { address: "Wailuku Elementary", precision: "place", shortLabel: "Wailuku Elementary" };
  assert.deepEqual(addressChoices([street, school]), { kind: "other", matches: [school] });
});

test("street labels fall back to the full address, drop duplicates and stop at three", () => {
  const street = (address, shortLabel) => ({ address, precision: "street", shortLabel });
  assert.deepEqual(addressChoices([
    street("South High Street, Wailuku", ""),
    street("South High Street, Wailuku", ""),
    street("Main Street", "Main Street"),
    street("Market Street", "Market Street"),
    street("Church Street", "Church Street"),
  ]), {
    kind: "street",
    labels: ["South High Street, Wailuku", "Main Street", "Market Street"],
  });
});
