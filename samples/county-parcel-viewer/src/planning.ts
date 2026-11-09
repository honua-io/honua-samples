import type { ViewerConfig } from "./config.js";
import { candidatesFor, type Parcel } from "./data.js";
import { h } from "./dom.js";
import { overlapByCode, shareLabel, type GeometryOps } from "./overlap.js";

interface PlanningLayer {
  readonly key: string;
  readonly title: string;
  readonly code: string;
  readonly label?: string;
  readonly authority: string;
  readonly meaning: string;
}

const LAYERS: readonly PlanningLayer[] = [
  { key: "stateLandUseUrl", title: "State land use district", code: "ludcode", authority: "Hawaiʻi Land Use Commission", meaning: "State district classification; county zoning is a separate layer." },
  { key: "smaUrl", title: "Special Management Area", code: "smarea", authority: "County of Maui · state coastal zone law", meaning: "An overlap may require SMA review. Ask County Planning about the proposed activity." },
  { key: "growthBoundariesUrl", title: "Maui Island Plan growth boundary", code: "type", label: "status", authority: "County of Maui · Maui Island Plan", meaning: "A planning boundary, not permission to develop." },
  { key: "growthAreasUrl", title: "Maui Island Plan growth area", code: "type", label: "name", authority: "County of Maui · Maui Island Plan", meaning: "Future growth policy; does not replace current zoning." },
  { key: "tsunamiUrl", title: "Tsunami evacuation zone", code: "zone_type", label: "zone_desc", authority: "Hawaiʻi emergency management · County of Maui", meaning: "Planning reference. Follow current official evacuation instructions during an emergency." },
  { key: "seaLevelRiseUrl", title: "Sea level rise exposure · 3.2 ft scenario", code: "id", authority: "Hawaiʻi climate adaptation planning", meaning: "A modeled exposure scenario, not a forecast date or regulatory flood determination." },
];

interface Context {
  readonly config: ViewerConfig;
  readonly geometryOps: Promise<GeometryOps>;
  readonly signal: AbortSignal;
}

const DISTRICTS: Readonly<Record<string, string>> = { U: "Urban", A: "Agricultural", C: "Conservation", R: "Rural" };

function evidenceLink(url: string, id: unknown, idField = ""): HTMLElement {
  const featureId = typeof id === "number" && Number.isSafeInteger(id) && id >= 0 ? id
    : typeof id === "string" && /^\d+$/u.test(id) ? id : null;
  if (featureId === null || !/^[a-zA-Z_][a-zA-Z0-9_]*$/u.test(idField)) return h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, "Layer reference · feature ID unavailable");
  const query = new URL(`${url}/query`);
  query.search = new URLSearchParams({ f: "pjson", where: `${idField}=${featureId}`, outFields: "*", returnGeometry: "false", resultRecordCount: "1" }).toString();
  return h("a", { href: query.href, target: "_blank", rel: "noopener noreferrer" }, `Source feature ${featureId}`);
}

function layerSection(layer: PlanningLayer, url: string | null): HTMLElement {
  return h("section", { class: "planning-layer", "data-planning-layer": layer.key },
    h("h3", {}, layer.title),
    h("p", { class: "authority" }, layer.authority),
    h("div", { class: "planning-result", role: "status", "data-state": url ? "loading" : "unconfigured" },
      url ? "Checking this parcel…" : "Not connected to this deployment. Applicability unknown."),
    h("p", { class: "note" }, layer.meaning));
}

async function checkLayer(target: HTMLElement, query: { layer: PlanningLayer; url: string; parcel: Parcel }, context: Context): Promise<void> {
  const { layer, url, parcel } = query;
  const result = target.querySelector<HTMLElement>(".planning-result")!;
  try {
    const [candidates, ops] = await Promise.all([
      candidatesFor(url, parcel, { code: layer.code, label: layer.label, signal: context.signal }), context.geometryOps,
    ]);
    if (context.signal.aborted) return;
    const { groups } = overlapByCode(parcel.geometry, candidates, ops);
    result.dataset.state = groups.length ? "success" : "empty";
    if (!groups.length) {
      result.replaceChildren(h("p", {}, "No positive-area overlap in this source snapshot. This is not a determination."), evidenceLink(url, null));
      return;
    }
    result.replaceChildren(...groups.map((group) => h("div", { class: "planning-match" },
      h("strong", {}, layer.key === "stateLandUseUrl" ? DISTRICTS[group.code] ?? group.label : group.label),
      h("span", { class: "coverage" }, `${shareLabel(group.share)} of parcel · code ${group.code}`),
      ...candidates.filter((candidate) => candidate.code === group.code && ops.intersect(parcel.geometry, candidate.geometry)).map((candidate) => evidenceLink(url, candidate.sourceId, candidate.sourceIdField)),
    )));
  } catch {
    if (context.signal.aborted) return;
    result.dataset.state = "error";
    const retry = h("button", { class: "btn quiet", type: "button" }, "Retry layer check");
    retry.addEventListener("click", () => {
      result.dataset.state = "loading";
      result.replaceChildren("Checking this parcel…");
      void checkLayer(target, query, context);
    });
    result.replaceChildren(h("p", {}, "Layer check failed. Applicability unknown; this is not a no-overlap result."), retry);
  }
}

function permitHandoff(parcel: Parcel): HTMLElement {
  const value = h("input", { id: "permit-tmk", readonly: true, value: parcel.tmk, "aria-label": "Original parcel TMK for County permit lookup" }) as HTMLInputElement;
  const status = h("span", { role: "status", class: "permit-copy-status" });
  const copy = h("button", { type: "button", class: "btn quiet" }, "Copy TMK");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(parcel.tmk);
      status.textContent = "TMK copied";
    } catch {
      value.focus();
      value.select();
      status.textContent = "Select and copy the TMK above.";
    }
  });
  return h("section", { class: "group permit-handoff", "aria-labelledby": "permit-heading" },
    h("h2", { id: "permit-heading" }, "Permits · County system"),
    h("p", {}, "Copy the original source TMK, then open the County’s public permit search. Follow the form’s TMK and CPR instructions; a matching record is not guaranteed."),
    value, h("div", { class: "actions" }, copy, status),
    h("a", { class: "btn", id: "county-permit-link", href: "https://publicweb1.co.maui.hi.us/PublicSearch/MAPPSSearch.aspx", target: "_blank", rel: "noopener noreferrer" }, "Open County permit search ↗"),
    h("p", { class: "note" }, "County of Maui system of record. No permit records are copied here. Automatic TMK prefill is not verified."));
}

export function planningPanel(parcel: Parcel, context: Context): HTMLElement {
  const stack = h("section", { class: "group", "aria-labelledby": "planning-heading" },
    h("h2", { id: "planning-heading" }, "Land use & coastal planning"),
    h("p", { class: "note" }, "State districts, county zoning and future land use have different authorities. An overlap is a screening result, not an entitlement or legal advice."));
  for (const layer of LAYERS) {
    const url = context.config.planning[layer.key] ?? null;
    const section = layerSection(layer, url);
    stack.append(section);
    if (url) void checkLayer(section, { layer, url, parcel }, context);
  }
  stack.append(h("p", { class: "source-gap" }, "Source pending: community-plan land-use designations, shoreline setbacks and complete historic/project district inventories. Community-plan area boundaries do not establish land-use designations. No conflict or buildability conclusion is available without those sources."));
  return h("div", { class: "planning-stack" }, stack, permitHandoff(parcel));
}
