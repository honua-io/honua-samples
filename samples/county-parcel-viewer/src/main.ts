// County parcel viewer: find a parcel by TMK or street address, or click it on
// the map, and see its zoning districts and FEMA flood zones with the share of
// the parcel each covers. Built on the published @honua/sdk-js; every request
// goes to the one Honua server (demo.honua.io by default).
//
// Verify signal (never user-facing text): data-* attributes on <body> and the
// Technical details disclosure. data-sample-status is "loading" while a
// lookup is in flight, "pass" when the lookup finished without a failed
// request, and "fail" when a request failed.

import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/source-serif-4/500.css";
import "@fontsource/source-serif-4/700.css";
import "./styles.css";

import { EXAMPLE_TMK, LAYER_PARAMS, type ViewerConfig, readConfig, DEFAULT_BASE_URL } from "./config.js";
import { type AddressMatch, GeocoderUnavailableError, type Parcel, candidatesFor, geocode, parcelAtPoint, parcelByTmk } from "./data.js";
import { createParcelMap, type ParcelMap } from "./map.js";
import { floodMeaning } from "./meanings.js";
import { type GeometryOps, type OverlapGroup, countedFlood, countedZoning, overlapByCode, shareLabel } from "./overlap.js";
import { formatRequest, onRequestLog } from "./request-log.js";
import { INVALID_TMK_MESSAGE, classifySearch, formatTmk, normalizeTmk } from "./tmk.js";

const FEMA_MSC_URL = "https://msc.fema.gov/portal/home";
const FLOOD_EMPTY_TEXT =
  "No flood zone found for this parcel in the county's copy of the FEMA flood map. This is not a flood determination; check the official FEMA Flood Map Service Center.";

const config: ViewerConfig = readConfig(new URLSearchParams(location.search));
const usingDemoParcels = !new URLSearchParams(location.search).get("parcelsUrl") && config.baseUrl === DEFAULT_BASE_URL;

// The overlap math lives in its own chunk; if it cannot load, both sections
// say "Overlap check unavailable" instead of guessing (design D9).
const geometryOps: Promise<GeometryOps> = import("@honua/sdk-js/geometry").then((geometry) => ({
  intersect: (a, b) => geometry.intersect(a, b),
  union: (...parts) => geometry.union(...parts),
  area: (input) => geometry.area(input),
}));
geometryOps.catch(() => {});

// ---- DOM ------------------------------------------------------------------

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id}`);
  return found as T;
}

const form = byId<HTMLFormElement>("search");
const input = byId<HTMLInputElement>("q");
const findButton = byId<HTMLButtonElement>("find");
const fieldError = byId<HTMLParagraphElement>("q-error");
const panel = byId<HTMLElement>("panel-inner");
const mapNote = byId<HTMLParagraphElement>("map-note");
const mapLoading = byId<HTMLParagraphElement>("map-loading");
const fullscreen = byId<HTMLAnchorElement>("fullscreen");
const diag = byId<HTMLParagraphElement>("diag");
const requests = byId<HTMLPreElement>("requests");

type Child = Node | string | null | undefined | false;

/** Builds an element; text always goes in as text, never as HTML. */
function h(tag: string, attrs: Record<string, string | boolean | undefined> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "class") node.className = String(value);
    else node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

/** replaceChildren that skips empty slots. */
function fill(target: HTMLElement, ...children: Child[]): void {
  target.replaceChildren(...children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false));
}

function svg(markup: string): Node {
  const template = document.createElement("template");
  template.innerHTML = markup; // static markup from this file only
  return template.content.firstChild as Node;
}

const ICON_INFO = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4M8 4.6v.1"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h7v7M13 3L4 12"/></svg>';
const ICON_LINK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6.5 9.5l3-3M5 8l-1.5 1.5a2.5 2.5 0 003.5 3.5L8.5 11.5M11 8l1.5-1.5a2.5 2.5 0 00-3.5-3.5L7.5 4.5"/></svg>';

function femaLink(text = "official FEMA Flood Map Service Center"): HTMLElement {
  return h("a", { href: FEMA_MSC_URL, target: "_blank", rel: "noopener noreferrer" }, text);
}

// ---- verify signal ----------------------------------------------------------

function signal(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete document.body.dataset[key];
    else document.body.dataset[key] = value;
  }
}

function setDiag(text: string): void {
  diag.textContent = text;
}

onRequestLog((entries) => {
  requests.textContent = entries.map(formatRequest).join("\n");
  document.body.dataset.requestCount = String(entries.length);
});

// ---- share URL (design R14, R21) ---------------------------------------------

/** The standalone app URL for a parcel, with any data parameters this page was opened with. */
function shareUrl(tmk: string | null): string {
  const current = new URLSearchParams(location.search);
  const params = new URLSearchParams();
  if (tmk) params.set("tmk", tmk);
  for (const name of LAYER_PARAMS) {
    const value = current.get(name);
    if (value) params.set(name, value);
  }
  const query = params.toString();
  return `${location.origin}${location.pathname}${query ? `?${query}` : ""}`;
}

const framed = (() => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
})();

function updateFullscreen(tmk: string | null): void {
  fullscreen.hidden = !framed;
  fullscreen.href = shareUrl(tmk);
}

// ---- lookups ------------------------------------------------------------------

interface HistoryState {
  readonly tmk: string;
  readonly example?: boolean;
}

type HistoryMode = "push" | "replace" | "none";

let generation = 0;
let inflight: AbortController | undefined;
let parcelMap: ParcelMap | undefined;
let startedAt = performance.now();

/** Starts a new lookup: aborts the last one and clears its result first (design D9 "New search"). */
function beginLookup(statusText: string): { id: number; signal: AbortSignal } {
  inflight?.abort();
  inflight = new AbortController();
  generation += 1;
  startedAt = performance.now();
  parcelMap?.clearSelection();
  panel.replaceChildren(h("p", { class: "panel-status", role: "status" }, statusText));
  findButton.disabled = true;
  signal({
    sampleStatus: "loading",
    searchState: "loading",
    ...Object.fromEntries(["tmk", "example", "pickCount", "zoningState", "zoningMain", "zoningCodes", "floodState", "floodMain", "floodCodes"].map((key) => [key, undefined])),
  });
  setDiag(statusText);
  return { id: generation, signal: inflight.signal };
}

const current = (id: number) => id === generation;

function finishLookup(id: number, outcome: "pass" | "fail", detail: string): void {
  if (!current(id)) return;
  findButton.disabled = false;
  const elapsedMs = String(Math.round(performance.now() - startedAt));
  // Navigation start to the first finished lookup (the live budget, design R7).
  document.body.dataset.firstResultMs ??= String(Math.round(performance.now()));
  setDiag(`${outcome === "pass" ? "PASS" : "FAIL"}: ${detail}`);
  if (outcome === "fail" || !parcelMap) {
    signal({ sampleStatus: outcome, sampleElapsedMs: elapsedMs });
    return;
  }
  // "pass" means the result is shown and the map has drawn it, so
  // data-rendered-features is current when a verifier reads the status.
  void parcelMap.whenDrawn(15_000).then(() => {
    if (current(id)) signal({ sampleStatus: "pass", sampleElapsedMs: elapsedMs });
  });
}

function showInvalid(): void {
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-describedby", "q-hint q-error");
  fieldError.textContent = INVALID_TMK_MESSAGE;
  fieldError.hidden = false;
  input.focus();
}

function clearInvalid(): void {
  input.removeAttribute("aria-invalid");
  input.setAttribute("aria-describedby", "q-hint");
  fieldError.hidden = true;
  fieldError.textContent = "";
}

function panelProblem(text: string, { alert = false } = {}): void {
  panel.replaceChildren(h("p", { class: "panel-status problem", ...(alert ? { role: "alert" } : {}) }, text));
}

function writeHistory(mode: HistoryMode, state: HistoryState): void {
  if (mode === "none") return;
  const url = state.example ? shareUrl(null) : shareUrl(state.tmk);
  if (mode === "push") history.pushState(state, "", url);
  else history.replaceState(state, "", url);
}

async function lookupTmk(digits: string, { mode, example = false, focus = true }: { mode: HistoryMode; example?: boolean; focus?: boolean }): Promise<void> {
  clearInvalid();
  const lookup = beginLookup(`Looking up ${digits}…`);
  try {
    const parcel = await parcelByTmk(config, digits, lookup.signal);
    if (!current(lookup.id)) return;
    if (!parcel) {
      panelProblem(`No parcel ${digits} in the county parcel layer`);
      signal({ searchState: "not-found" });
      finishLookup(lookup.id, "pass", `no parcel with tmk_txt='${digits}'`);
      input.focus();
      return;
    }
    writeHistory(mode, { tmk: parcel.tmk, ...(example ? { example: true } : {}) });
    await showParcel(lookup, parcel, { example, focus });
  } catch (error) {
    if (!current(lookup.id) || lookup.signal.aborted) return;
    panelProblem("The parcel lookup failed. The county parcel layer did not answer; try again in a moment.", { alert: true });
    signal({ searchState: "error" });
    finishLookup(lookup.id, "fail", message(error));
  }
}

async function lookupPoint(lngLat: [number, number], source: "map" | "address", label: string): Promise<void> {
  clearInvalid();
  const lookup = beginLookup(source === "map" ? "Looking up the parcel at that spot…" : `Looking up ${label}…`);
  try {
    const parcel = await parcelAtPoint(config, lngLat, lookup.signal);
    if (!current(lookup.id)) return;
    if (!parcel) {
      panelProblem(source === "map" ? "No parcel at that spot on the map" : "No parcel at that address");
      signal({ searchState: "not-found" });
      finishLookup(lookup.id, "pass", `no parcel intersects ${lngLat.join(",")}`);
      return;
    }
    if (source === "map") input.value = parcel.tmk;
    writeHistory("push", { tmk: parcel.tmk });
    await showParcel(lookup, parcel, { example: false, focus: source !== "map" });
  } catch (error) {
    if (!current(lookup.id) || lookup.signal.aborted) return;
    panelProblem("The parcel lookup failed. The county parcel layer did not answer; try again in a moment.", { alert: true });
    signal({ searchState: "error" });
    finishLookup(lookup.id, "fail", message(error));
  }
}

async function lookupAddress(text: string): Promise<void> {
  clearInvalid();
  const lookup = beginLookup(`Looking up ${text}…`);
  let matches: AddressMatch[];
  try {
    matches = await geocode(config, text);
  } catch (error) {
    if (!current(lookup.id)) return;
    panelProblem("Address search is unavailable right now. Search by TMK instead.", { alert: true });
    signal({ searchState: "geocoder-unavailable" });
    // A refused geocoder provider is a configured state, not a failed request.
    finishLookup(lookup.id, error instanceof GeocoderUnavailableError && /provider/u.test(error.message) ? "pass" : "fail", `address search unavailable: ${message(error)}`);
    return;
  }
  if (!current(lookup.id)) return;
  if (matches.length === 0) {
    panelProblem("No parcel at that address");
    signal({ searchState: "not-found" });
    finishLookup(lookup.id, "pass", `no geocoder candidate for "${text}"`);
    return;
  }
  if (matches.length === 1) {
    await lookupPoint([...matches[0].lngLat] as [number, number], "address", matches[0].address);
    return;
  }
  panel.replaceChildren(
    h("p", { class: "panel-status", id: "picks-label" }, `${matches.length} addresses match. Pick one:`),
    h(
      "ul",
      { class: "picks", "aria-labelledby": "picks-label" },
      ...matches.map((match) => {
        const button = h("button", { class: "btn quiet", type: "button" }, match.address);
        button.addEventListener("click", () => void lookupPoint([...match.lngLat] as [number, number], "address", match.address));
        return h("li", {}, button);
      }),
    ),
  );
  signal({ searchState: "picks", pickCount: String(matches.length) });
  finishLookup(lookup.id, "pass", `${matches.length} geocoder candidates`);
  (panel.querySelector(".picks button") as HTMLButtonElement | null)?.focus();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---- results panel ----------------------------------------------------------------

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const ACRES = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function acres(value: number | null): string {
  return value === null ? "not in county data" : ACRES.format(value);
}

function copyLinkControls(tmk: string): HTMLElement[] {
  const status = h("p", { class: "copy-status", role: "status" });
  const fallback = h("div", { class: "copy-fallback", hidden: true });
  const button = h("button", { class: "btn quiet", type: "button", id: "copy-link", "aria-label": "Copy link to this parcel" }, svg(ICON_LINK), "Copy link");
  let timer: number | undefined;
  button.addEventListener("click", async () => {
    const url = shareUrl(tmk);
    document.body.dataset.sharedUrl = url;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      fallback.hidden = true;
      status.textContent = "Link copied";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => (status.textContent = ""), 2000);
    } catch {
      // Clipboard blocked: show the link, selected, to copy by hand (design D9).
      const field = h("input", { id: "share-url", type: "text", readonly: true, value: url }) as HTMLInputElement;
      field.value = url;
      fallback.replaceChildren(h("label", { for: "share-url" }, "Copy this link:"), field);
      fallback.hidden = false;
      field.focus();
      field.select();
    }
  });
  return [button, status, fallback];
}

interface SectionHandles {
  zoning: HTMLElement;
  flood: HTMLElement;
}

function renderParcel(parcel: Parcel, example: boolean): SectionHandles {
  const assessor = safeHttpsUrl(parcel.qpubLink);
  const zoning = h("div", { class: "section-body", id: "zoning-body" });
  const flood = h("div", { class: "section-body", id: "flood-body" });
  const sub = [parcel.gisAcres === null ? null : `${ACRES.format(parcel.gisAcres)} acres (GIS)`, usingDemoParcels ? "Maui County" : null].filter(Boolean).join(" · ");
  fill(
    panel,
    example ? h("p", { class: "example", id: "example-note" }, svg(ICON_INFO), "Example parcel. Enter your parcel number above.") : null,
    h("h1", { class: "parcel-title", id: "parcel-title", tabindex: "-1" }, `TMK ${formatTmk(parcel.tmk)}`),
    sub ? h("p", { class: "parcel-sub" }, sub) : null,
    h(
      "div",
      { class: "actions" },
      assessor
        ? h("a", { class: "btn", id: "assessor-link", href: assessor, target: "_blank", rel: "noopener noreferrer" }, "Assessor record", svg(ICON_OUT))
        : h("span", { class: "unavailable", id: "assessor-link" }, "Assessor link unavailable"),
      ...copyLinkControls(parcel.tmk),
    ),
    h("section", { class: "group", "aria-labelledby": "zoning-heading" }, h("h2", { id: "zoning-heading" }, "Zoning"), zoning),
    h("section", { class: "group", "aria-labelledby": "flood-heading" }, h("h2", { id: "flood-heading" }, "Flood hazard"), flood),
    h(
      "section",
      { class: "group", "aria-labelledby": "record-heading" },
      h("h2", { id: "record-heading" }, "Parcel record"),
      h(
        "dl",
        { class: "limits" },
        h("dt", {}, "TMK digits"),
        h("dd", { class: "val" }, parcel.tmk),
        h("dt", {}, "Tax acres"),
        h("dd", { class: parcel.taxAcres === null ? "" : "val" }, acres(parcel.taxAcres)),
        h("dt", {}, "Land use"),
        h("dd", {}, "not in county data"),
        h("dt", {}, "Owner"),
        h("dd", {}, "not in county data"),
      ),
    ),
  );
  return { zoning, flood };
}

type SectionState = "loading" | "empty" | "error" | "success" | "unavailable";

function renderZoning(target: HTMLElement, state: SectionState, groups: OverlapGroup[] = [], retry?: () => void): void {
  target.dataset.state = state;
  if (state === "loading") target.replaceChildren(h("p", { class: "section-status" }, "Checking zoning…"));
  else if (state === "unavailable") target.replaceChildren(h("p", { class: "section-status" }, "Overlap check unavailable"));
  else if (state === "empty") target.replaceChildren(h("p", { class: "empty-text", id: "zoning-empty" }, "Not in the county zoning layer"));
  else if (state === "error") {
    const button = h("button", { class: "btn quiet", type: "button" }, "Retry zoning check");
    if (retry) button.addEventListener("click", retry);
    target.replaceChildren(h("div", { class: "error", role: "alert" }, h("p", {}, h("strong", {}, "Zoning check failed."), " We couldn't reach the county zoning layer, so this parcel's zoning is unknown."), button));
  } else {
    const [main, ...others] = groups;
    fill(
      target,
      h("p", { class: "primary", id: "zoning-main" }, main.label, h("small", {}, `${shareLabel(main.share)} of parcel · county zoning layer, code ${main.code}`)),
      others.length
        ? h("ul", { class: "others", id: "zoning-others" }, ...others.map((group) => h("li", {}, h("span", {}, group.label), h("b", {}, shareLabel(group.share)))))
        : null,
    );
  }
}

function renderFlood(target: HTMLElement, state: SectionState, groups: OverlapGroup[] = [], retry?: () => void): void {
  target.dataset.state = state;
  const note = h("p", { class: "note" }, "Not a flood determination. Check the ", femaLink(), ".");
  if (state === "loading") target.replaceChildren(h("p", { class: "section-status" }, "Checking flood zones…"));
  else if (state === "unavailable") target.replaceChildren(h("p", { class: "section-status" }, "Overlap check unavailable"), note);
  else if (state === "empty") {
    const [before] = FLOOD_EMPTY_TEXT.split("official FEMA Flood Map Service Center");
    target.replaceChildren(h("p", { class: "empty-text", id: "flood-empty" }, before, femaLink(), "."));
  } else if (state === "error") {
    const button = h("button", { class: "btn quiet", type: "button" }, "Retry flood check");
    if (retry) button.addEventListener("click", retry);
    target.replaceChildren(
      h(
        "div",
        { class: "error", role: "alert" },
        h("p", {}, h("strong", {}, "Flood check failed."), " We couldn't reach the county flood layer, so this parcel's flood zone is unknown. This is not the same as no flood zone."),
        button,
      ),
      note,
    );
  } else {
    const [main, ...others] = groups;
    const meaning = floodMeaning(main.code);
    const share = main.share < 0.01 ? `touches the parcel (${shareLabel(main.share)} of parcel)` : `${shareLabel(main.share)} of parcel`;
    fill(
      target,
      h(
        "p",
        { class: "primary", id: "flood-main" },
        h("span", { class: meaning.highRisk ? "badge high" : "badge" }, main.code),
        meaning.title,
        h("small", {}, `${share} · ${meaning.detail}`),
      ),
      others.length
        ? h(
            "ul",
            { class: "others", id: "flood-others" },
            ...others.map((group) =>
              h(
                "li",
                {},
                h("span", {}, group.share < 0.01 ? `${group.code}: touches the parcel edge` : `${group.code}: ${floodMeaning(group.code).title.toLowerCase()}`),
                h("b", {}, shareLabel(group.share)),
              ),
            ),
          )
        : null,
      note,
    );
  }
}

interface Lookup {
  readonly id: number;
  readonly signal: AbortSignal;
}

async function showParcel(lookup: Lookup, parcel: Parcel, { example, focus }: { example: boolean; focus: boolean }): Promise<void> {
  const sections = renderParcel(parcel, example);
  signal({ tmk: parcel.tmk, searchState: "found", example: example ? "true" : undefined });
  input.value = example ? parcel.tmk : input.value || parcel.tmk;
  updateFullscreen(parcel.tmk);
  parcelMap?.select(parcel.tmk, parcel.geometry);
  if (focus) (document.getElementById("parcel-title") as HTMLElement | null)?.focus({ preventScroll: false });

  let failures: string[] = [];
  const runZoning = async (): Promise<void> => {
    renderZoning(sections.zoning, "loading");
    signal({ zoningState: "loading", zoningMain: undefined });
    let ops: GeometryOps;
    try {
      ops = await geometryOps;
    } catch (error) {
      renderZoning(sections.zoning, "unavailable");
      signal({ zoningState: "unavailable" });
      throw new Error(`overlap check unavailable: ${message(error)}`);
    }
    try {
      const candidates = await candidatesFor(config.zoningUrl, parcel, { code: "zone_code", label: "zone_dist" }, lookup.signal);
      if (!current(lookup.id)) return;
      const counted = countedZoning(overlapByCode(parcel.geometry, candidates, ops).groups);
      renderZoning(sections.zoning, counted.length ? "success" : "empty", counted);
      signal({ zoningState: counted.length ? "success" : "empty", zoningMain: counted[0]?.code, zoningCodes: counted.map((g) => `${g.code}:${shareLabel(g.share)}`).join(" ") });
    } catch (error) {
      if (!current(lookup.id) || lookup.signal.aborted) return;
      renderZoning(sections.zoning, "error", [], () => void rerun(runZoning, "zoning"));
      signal({ zoningState: "error" });
      throw error;
    }
  };
  const runFlood = async (): Promise<void> => {
    renderFlood(sections.flood, "loading");
    signal({ floodState: "loading", floodMain: undefined });
    let ops: GeometryOps;
    try {
      ops = await geometryOps;
    } catch (error) {
      renderFlood(sections.flood, "unavailable");
      signal({ floodState: "unavailable" });
      throw new Error(`overlap check unavailable: ${message(error)}`);
    }
    try {
      const candidates = await candidatesFor(config.floodUrl, parcel, { code: "fld_zone" }, lookup.signal);
      if (!current(lookup.id)) return;
      const counted = countedFlood(overlapByCode(parcel.geometry, candidates, ops).groups);
      renderFlood(sections.flood, counted.length ? "success" : "empty", counted);
      parcelMap?.showFlood(candidates.filter((c) => floodMeaning(c.code).highRisk).map((c) => c.geometry));
      signal({ floodState: counted.length ? "success" : "empty", floodMain: counted[0]?.code, floodCodes: counted.map((g) => `${g.code}:${shareLabel(g.share)}`).join(" ") });
    } catch (error) {
      if (!current(lookup.id) || lookup.signal.aborted) return;
      renderFlood(sections.flood, "error", [], () => void rerun(runFlood, "flood"));
      signal({ floodState: "error" });
      throw error;
    }
  };
  // A retry re-runs one section; the page status follows the sections' states.
  const rerun = async (run: () => Promise<void>, name: string): Promise<void> => {
    signal({ sampleStatus: "loading" });
    failures = failures.filter((failure) => !failure.startsWith(`${name}:`));
    try {
      await run();
    } catch (error) {
      failures.push(`${name}: ${message(error)}`);
    }
    settle();
  };
  const settle = () => {
    if (!current(lookup.id)) return;
    const tmkText = `TMK ${parcel.tmk}`;
    if (failures.length) finishLookup(lookup.id, "fail", `${tmkText}; ${failures.join("; ")}`);
    else finishLookup(lookup.id, "pass", `${tmkText}; zoning ${document.body.dataset.zoningState}; flood ${document.body.dataset.floodState}`);
  };
  const results = await Promise.allSettled([runZoning(), runFlood()]);
  results.forEach((result, index) => {
    if (result.status === "rejected") failures.push(`${index === 0 ? "zoning" : "flood"}: ${message(result.reason)}`);
  });
  settle();
}

// ---- wiring -------------------------------------------------------------------------

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const parsed = classifySearch(input.value);
  if (parsed.kind === "invalid") {
    // No request is built from input that is not a TMK or an address (design R4).
    showInvalid();
    signal({ searchState: "invalid" });
    return;
  }
  if (parsed.kind === "tmk") void lookupTmk(parsed.digits, { mode: "push" });
  else void lookupAddress(parsed.text);
});

input.addEventListener("input", () => {
  if (input.getAttribute("aria-invalid") === "true") clearInvalid();
});

window.addEventListener("popstate", (event) => {
  const state = event.state as HistoryState | null;
  const digits = state?.tmk ?? normalizeTmk(new URLSearchParams(location.search).get("tmk") ?? "") ?? EXAMPLE_TMK;
  input.value = digits;
  void lookupTmk(digits, { mode: "none", example: state?.example ?? !new URLSearchParams(location.search).has("tmk"), focus: false });
});

function startMap(): void {
  try {
    parcelMap = createParcelMap(byId("map"), config, {
      onPick: (lngLat) => void lookupPoint(lngLat, "map", "that spot"),
      onNote: (text, kind = "info") => {
        mapNote.hidden = !text;
        mapNote.textContent = text ?? "";
        mapNote.className = `map-note${kind === "error" ? " error" : ""}`;
        if (text && kind === "info") window.setTimeout(() => mapNote.textContent === text && (mapNote.hidden = true), 4000);
      },
      onBasemap: (state) => {
        signal({ basemap: state.startsWith("Protomaps") ? "on" : "off" });
        if (!state.startsWith("Protomaps") && !state.startsWith("off")) {
          mapNote.hidden = false;
          mapNote.className = "map-note";
          mapNote.textContent = "Basemap not available; showing a plain background.";
        }
      },
    });
    parcelMap.map.once("idle", () => {
      mapLoading.hidden = true;
      signal({ mapState: "ready" });
    });
    void parcelMap.ready.then(() => signal({ parcelOutlines: config.parcelTilesUrl ? "on" : "off" }));
  } catch (error) {
    mapLoading.hidden = true;
    mapNote.hidden = false;
    mapNote.className = "map-note error";
    mapNote.textContent = `The map could not start (${message(error)}). Search still works.`;
    signal({ mapState: "error" });
  }
}

function start(): void {
  updateFullscreen(null);
  startMap();
  const raw = new URLSearchParams(location.search).get("tmk");
  if (raw !== null) {
    input.value = raw;
    const digits = normalizeTmk(raw);
    if (!digits) {
      // A shared link with a bad TMK: say so and send nothing (design R4).
      showInvalid();
      panelProblem("Enter your parcel number above.");
      signal({ sampleStatus: "pass", searchState: "invalid" });
      setDiag(`PASS: ?tmk= is not a 9-digit TMK; no request sent`);
      return;
    }
    void lookupTmk(digits, { mode: "replace", focus: false });
    return;
  }
  // First load: the example parcel, without changing the URL (design D20).
  input.value = EXAMPLE_TMK;
  void lookupTmk(EXAMPLE_TMK, { mode: "replace", example: true, focus: false });
}

start();
