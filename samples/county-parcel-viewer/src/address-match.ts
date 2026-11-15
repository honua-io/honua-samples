// Street-centre matches from OpenStreetMap are not a house. Nominatim reports
// them as class "highway" (and an OSM highway type) even when the Esri-style
// Addr_type field says "Locality". A house is class "place" / type "house".
// Score does not separate them: a house can score lower than the street.

const HIGHWAY_TYPES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
  "pedestrian",
  "track",
  "road",
  "busway",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isStreetLevelCandidate(attributes: Readonly<Record<string, unknown>> | null | undefined): boolean {
  const osmClass = text(attributes?.class);
  const osmType = text(attributes?.type);
  if (osmClass === "place" || osmClass === "building" || osmType === "house") return false;
  return osmClass === "highway" || HIGHWAY_TYPES.has(osmType);
}

export function streetLevelNotice(addresses: readonly string[]): string {
  const names = addresses.map((address) => address.trim()).filter((address) => address.length > 0);
  const first = names[0] ?? "that street";
  const extra = names.length > 1 ? ` Other street matches: ${names.slice(1).join("; ")}.` : "";
  return `Found the street ${first}. That is not a house number, so no parcel was selected. Search by TMK or click the parcel on the map.${extra}`;
}

export interface PlannedAddress {
  readonly address: string;
  readonly street: boolean;
}

export type AddressLookupPlan =
  | { readonly kind: "none" }
  | { readonly kind: "street"; readonly addresses: readonly string[] }
  | { readonly kind: "point" }
  | { readonly kind: "picks" };

export function planAddressLookup(matches: readonly PlannedAddress[]): AddressLookupPlan {
  if (matches.length === 0) return { kind: "none" };
  if (matches.every((match) => match.street)) {
    return { kind: "street", addresses: matches.map((match) => match.address) };
  }
  if (matches.length === 1) return { kind: "point" };
  return { kind: "picks" };
}
