import { readFile } from "node:fs/promises";

const PORTFOLIO_FORMAT = "honua.gallery-public-portfolio.v1";
const DISPOSITIONS = new Set(["public", "rework-map-first", "internal-qualification"]);
const DEFAULT_PATH = new URL("../../config/gallery-public-portfolio.v1.json", import.meta.url);

function key(sourceRepo, id) {
  return `${sourceRepo}:${id}`;
}

export async function loadGalleryPublicPortfolio(path = DEFAULT_PATH) {
  const portfolio = JSON.parse(await readFile(path, "utf8"));
  if (portfolio?.format !== PORTFOLIO_FORMAT) throw new Error(`gallery public portfolio must use format ${PORTFOLIO_FORMAT}`);
  if (!Array.isArray(portfolio.entries) || portfolio.entries.length === 0) throw new Error("gallery public portfolio must contain entries");
  const byIdentity = new Map();
  for (const entry of portfolio.entries) {
    if (!entry || typeof entry.sourceRepo !== "string" || typeof entry.id !== "string" || !entry.sourceRepo || !entry.id) throw new Error("gallery public portfolio entry requires sourceRepo and id");
    const identity = key(entry.sourceRepo, entry.id);
    if (byIdentity.has(identity)) throw new Error(`duplicate gallery public portfolio identity: ${identity}`);
    if (!DISPOSITIONS.has(entry.disposition)) throw new Error(`invalid gallery public portfolio disposition for ${identity}: ${entry.disposition}`);
    if (typeof entry.reason !== "string" || !entry.reason.trim()) throw new Error(`gallery public portfolio entry requires a reason: ${identity}`);
    byIdentity.set(identity, entry);
  }
  return { ...portfolio, byIdentity };
}

export function applyGalleryPublicPortfolio(cards, portfolio) {
  const missing = cards.filter((card) => !portfolio.byIdentity.has(key(card.sourceRepo, card.id))).map((card) => key(card.sourceRepo, card.id));
  if (missing.length > 0) throw new Error(`technically qualified gallery card(s) lack a product disposition: ${missing.sort().join(", ")}`);
  const publicCards = [];
  const excluded = [];
  for (const card of cards) {
    const decision = portfolio.byIdentity.get(key(card.sourceRepo, card.id));
    if (decision.disposition === "public") publicCards.push(card);
    else excluded.push({ sourceRepo: card.sourceRepo, id: card.id, disposition: decision.disposition, reason: decision.reason });
  }
  return { publicCards, excluded };
}
