// OpenStreetMap often returns the street centre line when a house number is
// missing. That point sits on the road, so a parcel query there is the wrong
// answer to "is there a parcel at this address?".

export type AddressPrecision = "address" | "street" | "place" | "area";

export interface ClassifiedMatch {
  readonly address: string;
  readonly precision: AddressPrecision;
  readonly shortLabel?: string;
}

export type AddressChoice<T extends ClassifiedMatch> =
  | { readonly kind: "none" }
  | { readonly kind: "addresses"; readonly matches: readonly T[] }
  | { readonly kind: "street"; readonly labels: readonly string[] }
  | { readonly kind: "other"; readonly matches: readonly T[] };

// StreetAddress is the Nominatim adapter's label for an OSM "road" centre line.
// House and building matches are PointAddress. A highway can also carry a
// parsed house number; that point is still the centre line, so class=highway
// wins over AddNum.
const STREET_TYPES = new Set(["streetaddress", "streetname", "streetint", "streetmidblock"]);
const AREA_TYPES = new Set(["neighborhood", "subregion", "city", "county", "state", "country", "postalcode"]);
const AREA_OSM = new Set(["city", "town", "village", "hamlet", "county", "state", "country", "postcode", "suburb", "neighbourhood"]);

function text(value: string | null | undefined): string {
  return value == null ? "" : String(value).trim();
}

function field(attributes: Readonly<Record<string, string | null | undefined>>, key: string): string {
  return text(attributes[key]).toLowerCase();
}

const MAX_STREET_LABELS = 3;

function isStreet(cls: string, type: string, addrType: string): boolean {
  return cls === "highway" || type === "road" || STREET_TYPES.has(addrType);
}

function isAddress(cls: string, type: string, addrType: string): boolean {
  return addrType === "pointaddress" || type === "house" || type === "building" || cls === "building";
}

function isArea(type: string, addrType: string): boolean {
  return AREA_TYPES.has(addrType) || AREA_OSM.has(type);
}

/** House and building hits can be queried as a point. A highway match cannot. */
export function addressPrecision(attributes: Readonly<Record<string, string | null | undefined>>): AddressPrecision {
  const cls = field(attributes, "class");
  const type = field(attributes, "type");
  const addrType = field(attributes, "Addr_type") || field(attributes, "Type");
  if (isStreet(cls, type, addrType)) return "street";
  if (isAddress(cls, type, addrType) || text(attributes.AddNum).length > 0) return "address";
  if (isArea(type, addrType)) return "area";
  return "place";
}

function labelsFor(matches: readonly ClassifiedMatch[]): string[] {
  const labels: string[] = [];
  for (const match of matches) {
    const label = text(match.shortLabel) || match.address;
    if (!labels.includes(label)) labels.push(label);
    if (labels.length === MAX_STREET_LABELS) break;
  }
  return labels;
}

export function addressChoices<T extends ClassifiedMatch>(matches: readonly T[]): AddressChoice<T> {
  if (matches.length === 0) return { kind: "none" };
  const addresses = matches.filter((match) => match.precision === "address");
  if (addresses.length > 0) return { kind: "addresses", matches: addresses };
  const points = matches.filter((match) => match.precision === "place");
  if (points.length > 0) return { kind: "other", matches: points };
  const streets = matches.filter((match) => match.precision === "street");
  if (streets.length > 0) return { kind: "street", labels: labelsFor(streets) };
  return { kind: "other", matches };
}
