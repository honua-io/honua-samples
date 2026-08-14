const FULL_GIT_SHA = /^[0-9a-f]{40}$/u;
const SAFE_REPOSITORY = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu;

function assertRepository(repository) {
  if (!SAFE_REPOSITORY.test(repository ?? "")) {
    throw new Error(`sdk source binding requires an owner/repository slug, received ${JSON.stringify(repository)}`);
  }
}

function assertRepositoryPath(label, value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`sdk source binding requires a safe ${label}, received ${JSON.stringify(value)}`);
  }
}

/**
 * Resolves the inspectable source for one published SDK bundle.
 *
 * The bundle manifest is the source-revision authority. A mutable producer
 * branch is never substituted: the inline preview, source tree, and README
 * links all use exactly the commit that built the runnable bytes.
 */
export function bindSdkSourceToBundle({ repository, sourcePath, docsPath = null, bundleSample }) {
  assertRepository(repository);
  assertRepositoryPath("source path", sourcePath);
  if (docsPath !== null) assertRepositoryPath("docs path", docsPath);

  if (!bundleSample?.id) throw new Error("sdk source binding requires a bundle sample identity");
  const revision = bundleSample.builtFrom?.commit;
  if (!FULL_GIT_SHA.test(revision ?? "")) {
    throw new Error(
      `sdk source binding for ${bundleSample.id} requires builtFrom.commit to be a full lowercase Git SHA, received ${JSON.stringify(revision)}`,
    );
  }

  const repositoryRoot = `https://github.com/${repository}`;
  const sourceTreeUrl = validateBoundSdkUrl(`${repositoryRoot}/tree/${revision}/${sourcePath}`, {
    repository,
    revision,
    kind: "tree",
  });
  const docsUrl = docsPath
    ? validateBoundSdkUrl(`${repositoryRoot}/blob/${revision}/${docsPath}`, {
        repository,
        revision,
        kind: "blob",
      })
    : null;
  return Object.freeze({
    revision,
    repositoryRoot,
    sourceTreeUrl,
    docsUrl,
    rawRoot: `https://raw.githubusercontent.com/${repository}/${revision}/${sourcePath}`,
  });
}

export function isFullGitSha(value) {
  return FULL_GIT_SHA.test(value ?? "");
}

export function validateBoundSdkUrl(value, { repository, revision, kind }) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f'"<>`]/u.test(value)) {
    throw new Error("SDK source URL contains characters that are unsafe in an HTML attribute");
  }
  if (!isFullGitSha(revision) || !["blob", "tree"].includes(kind)) {
    throw new Error("SDK source URL validation requires an immutable revision and a blob/tree kind");
  }
  const url = new URL(value);
  const expectedPrefix = `/${repository}/${kind}/${revision}/`;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(expectedPrefix)
  ) {
    throw new Error(`SDK source URL is not bound to ${repository}@${revision}`);
  }
  return url.toString();
}
