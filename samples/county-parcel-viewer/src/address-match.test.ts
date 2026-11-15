import assert from "node:assert/strict";
import test from "node:test";

import { isStreetLevelCandidate, planAddressLookup, streetLevelNotice } from "./address-match.ts";

const street = {
  Provider: "nominatim",
  class: "highway",
  type: "primary",
  Addr_type: "Locality",
  Type: "Locality",
};

const house = {
  Provider: "nominatim",
  class: "place",
  type: "house",
  Addr_type: "PointAddress",
  Type: "PointAddress",
};

test("a highway centre line is a street, including when Addr_type says Locality", () => {
  assert.equal(isStreetLevelCandidate(street), true);
  assert.equal(isStreetLevelCandidate({ type: "residential" }), true);
});

test("a house is not a street, and a missing class stays a point lookup", () => {
  assert.equal(isStreetLevelCandidate(house), false);
  assert.equal(isStreetLevelCandidate({ score: 30 }), false);
  assert.equal(isStreetLevelCandidate(undefined), false);
});

test("only street matches skip the parcel query", () => {
  assert.deepEqual(planAddressLookup([]), { kind: "none" });
  assert.deepEqual(planAddressLookup([{ address: "South High Street", street: true }]), {
    kind: "street",
    addresses: ["South High Street"],
  });
  assert.equal(planAddressLookup([{ address: "2145 Wells Street", street: false }]).kind, "point");
  assert.equal(planAddressLookup([
    { address: "2145 Wells Street", street: false },
    { address: "South High Street", street: true },
  ]).kind, "picks");
});

test("the street notice names the street and does not say the parcel is missing", () => {
  const notice = streetLevelNotice(["South High Street, Wailuku", "High Street"]);
  assert.match(notice, /Found the street South High Street, Wailuku/);
  assert.match(notice, /not a house number/);
  assert.match(notice, /Other street matches: High Street/);
  assert.doesNotMatch(notice, /No parcel at that address/);
});
