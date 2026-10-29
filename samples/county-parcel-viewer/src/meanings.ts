// FEMA's short definitions for the flood zone codes in maui-flood-hazard
// (fld_zone: A, AE, AH, AO, D, V, VE, X), paraphrased from the FEMA Flood Zones
// glossary. Zoning shows the county layer's own zone_dist text instead: the
// viewer invents no zoning definitions.

export interface FloodMeaning {
  /** Short name, e.g. "Coastal high hazard". */
  readonly title: string;
  /** One-line meaning shown beside the share of the parcel. */
  readonly detail: string;
  /** Special Flood Hazard Area: the 1% annual chance (100-year) floodplain. */
  readonly highRisk: boolean;
}

export const FLOOD_MEANINGS: Readonly<Record<string, FloodMeaning>> = Object.freeze({
  A: { title: "High-risk flood area", detail: "1% annual chance flood; no base flood elevation set", highRisk: true },
  AE: { title: "High-risk flood area", detail: "1% annual chance flood; base flood elevation set", highRisk: true },
  AH: { title: "High-risk shallow flooding", detail: "1% annual chance ponding, 1 to 3 feet deep", highRisk: true },
  AO: { title: "High-risk shallow flooding", detail: "1% annual chance sheet flow on sloping ground, 1 to 3 feet deep", highRisk: true },
  V: { title: "Coastal high hazard", detail: "1% annual chance flood with wave action; no base flood elevation set", highRisk: true },
  VE: { title: "Coastal high hazard", detail: "1% annual chance flood with wave action", highRisk: true },
  X: { title: "Moderate to minimal flood hazard", detail: "outside the 1% annual chance floodplain; flooding is still possible", highRisk: false },
  D: { title: "Possible but undetermined flood hazard", detail: "no flood hazard analysis has been done here", highRisk: false },
});

export function floodMeaning(code: string): FloodMeaning {
  return FLOOD_MEANINGS[code] ?? { title: `Flood zone ${code}`, detail: "no FEMA definition on this page for this code", highRisk: false };
}
