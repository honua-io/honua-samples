import { readFile } from "node:fs/promises";

// The gallery's publish floor (config/required-published-apps.v1.json): a
// named list of apps that must be live in the built artifact. A count floor
// only proved "some apps"; a list proves the ones that matter are there.

const FORMAT = "honua.samples.required-published-apps.v1";
const SOURCE_REPOS = new Set(["honua-samples", "honua-sdk-js"]);
const DEFAULT_PATH = new URL("../../config/required-published-apps.v1.json", import.meta.url);

export async function loadRequiredPublishedApps(path = DEFAULT_PATH) {
  return parseRequiredPublishedApps(JSON.parse(await readFile(path, "utf8")));
}

export function parseRequiredPublishedApps(document) {
  if (document?.format !== FORMAT) throw new Error(`required published apps must use format ${FORMAT}`);
  if (!Array.isArray(document.apps) || document.apps.length === 0) {
    throw new Error("required published apps must list at least one app");
  }
  const seen = new Set();
  for (const app of document.apps) {
    if (!SOURCE_REPOS.has(app?.sourceRepo) || typeof app.id !== "string" || !app.id) {
      throw new Error(`required published app needs sourceRepo (${[...SOURCE_REPOS].join(" or ")}) and id: ${JSON.stringify(app)}`);
    }
    const identity = `${app.sourceRepo}:${app.id}`;
    if (seen.has(identity)) throw new Error(`duplicate required published app: ${identity}`);
    seen.add(identity);
  }
  return document.apps.map(({ sourceRepo, id }) => ({ sourceRepo, id }));
}

/** Required apps absent from the published set, as "sourceRepo:id" strings. */
export function missingRequiredApps(required, published) {
  const live = new Set(published.map(({ sourceRepo, id }) => `${sourceRepo}:${id}`));
  return required.map(({ sourceRepo, id }) => `${sourceRepo}:${id}`).filter((identity) => !live.has(identity));
}
