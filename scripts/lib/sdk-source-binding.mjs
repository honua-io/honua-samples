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
  return Object.freeze({
    revision,
    repositoryRoot,
    sourceTreeUrl: `${repositoryRoot}/tree/${revision}/${sourcePath}`,
    docsUrl: docsPath ? `${repositoryRoot}/blob/${revision}/${docsPath}` : null,
    rawRoot: `https://raw.githubusercontent.com/${repository}/${revision}/${sourcePath}`,
  });
}

export function isFullGitSha(value) {
  return FULL_GIT_SHA.test(value ?? "");
}
