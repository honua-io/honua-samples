import { SDK_PRODUCER_LOCK } from "./sdk-producer-lock.mjs";

const JOURNEY_SOURCE_PATHS = {
  property: "scripts/state-local/approved/pages/02-property.html",
  "311": "scripts/state-local/approved/pages/03-311.html",
  "public-works": "scripts/state-local/approved/pages/05-public-works.html",
  workbench: "scripts/state-local/approved/pages/12-workbench.html",
  emergency: "samples/maui-emergency",
  switching: "scripts/state-local/approved/09-switching.html",
};

export function journeySourceUrl(slug, commit) {
  const source = JOURNEY_SOURCE_PATHS[slug];
  if (!source) throw new Error(`Unknown gallery journey ${slug}`);
  return `https://github.com/honua-io/honua-samples/${source.endsWith(".html") ? "blob" : "tree"}/${commit}/${source}`;
}

export function expectedCardSource({ id, source, jobPage }, commit) {
  if (id.startsWith("journey-")) return journeySourceUrl(id.slice("journey-".length), commit);
  if (source === "honua-sdk-js") {
    return `https://github.com/${SDK_PRODUCER_LOCK.repository}/tree/${SDK_PRODUCER_LOCK.revision}/examples/${id}`;
  }
  const path = jobPage ? `blob/${commit}/jobs/${id}.json` : `tree/${commit}/samples/${id}`;
  return `https://github.com/honua-io/honua-samples/${path}`;
}

export function validateActionDestination({ kind, href, card, commit, baseUrl }) {
  const url = new URL(href, `${baseUrl}/`);
  if (kind === "source" && url.href !== expectedCardSource(card, commit)) {
    throw new Error(`${card.id}: source is not this card's published source`);
  }
  if (kind === "open" && url.href !== new URL(card.detailHref, `${baseUrl}/`).href) {
    throw new Error(`${card.id}: open does not match the card route`);
  }
}
