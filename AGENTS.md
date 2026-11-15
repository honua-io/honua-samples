# honua-samples: agent instructions

Native application examples lead with authenticated gRPC for live data/edits and
PMTiles, GeoParquet and COG for public/read-heavy CDN delivery; see `docs/native-applications.md`.
OGC/GeoServices compatibility examples do not establish native-path qualification.

## Commands and layout
- Each `samples/<id>/` contains `sample.json`, README and source; manifests follow
  `schemas/sample.v1.schema.json`.
- `node scripts/validate-manifests.mjs` validates manifests and canonical capability keys.
  CI supplies pinned `KEY_LIST_URL`; the fallback fixture and key loader are documented in README.
- `npm ci`, then the relevant `test:*` script in `package.json` runs browser checks;
  Playwright needs its matching browser installation. Read `.github/workflows/validate.yml`
  and the standalone workflow for the exact task rather than inventing root build commands.
- Active samples require published SDK packages and real execution evidence. Draft samples
  are excluded from gallery-runner coverage; their standalone CI does not qualify the active gallery.
- SDK source pins for draft extensions live in `config/server-sdk.v1.json`; artifacts are ignored.
  Do not vendor SDK implementations or pad coverage with empty/zero-sample success.
- Read README before changing generated coverage, gallery or release-certification evidence.

## Review guidelines

Reviews (people, Codex, Claude) judge the lines a PR adds or changes by Robert C. Martin's *Clean Code*
and cite smell codes ([rubric](https://github.com/honua-io/.github/blob/main/clean-code/RUBRIC.md)). The
`Clean code` PR check enforces what a tool can decide; `quality-exception: <reason>` in the PR body is logged.

BLOCKING:

- G5 duplication: search first; reuse or consolidate, never copy a handler, parser or validator.
- C1 history, ticket/PR refs or reviewer notes in code; C2-C4 obsolete, redundant or rambling comments;
  C5 commented-out code. Comment only what the code cannot say.
- XML doc comments (`///`) in application code; published SDKs keep at most a one-line `<summary>`
  on public members.
- N1 names that hide intent; F1 more than 3 parameters; F2 output arguments; F3 boolean flag arguments.
- Over budget with no reason in the PR: functions ~40 lines or 2 nesting levels; classes, files ~400 lines.

WARNING: the rubric's other smells (N2-N7, G6-G36, T1-T9), e.g. G25 magic numbers or G12
single-implementation interfaces.

<!-- fleet:begin v3 sha256=4faeba041ae102508d105847af58b407641cbfdf1ae506488819a2ccdbe73e29 -->
## Fleet rules (all Honua repos)

Generated from the org fleet-rules source; do not edit this block. Start with org skill `honua-system-map`.

1. Author commits as the repository owner's configured git identity. No AI attribution in commits or PR bodies.
2. Use a separate worktree per task, off the default branch, on durable disk. Include current trunk before opening a PR. No shared-checkout edits or git stash; preserve work with commits.
3. Run .NET builds and tests only through the approved remote build-host shims. Never fall back to a local build. See org skill `honua-build-host`.
4. Commit and push completed work; keep existing branches, commits and worktrees until their retention rules permit cleanup.
5. Claim work before starting, reread the issue and current lane rulings, and release the claim after completion. See org skill `honua-dev-loop`.
6. Use a PR slot and bundle at least three issues, a plan row, or a permitted single-work reason. Current caps and exceptions come from current lane rulings.
7. Target the default branch with the repository's PR template and conventional title. Never force-push or use an admin merge.
8. Run pre-PR checks, obtain one independent review of the final head, and resolve every review thread. Merge on green required checks; arm auto-merge where enforced checks support it. See org skill `honua-pr-flow`.
9. Read failed required-check logs and fix in one push. For red trunk, fix forward or revert within the repository's current ruling deadline; see org skills `honua-red-pr` and `honua-trunk-red`.
10. Never commit secrets, deployment identifiers, private repository names or infrastructure details. Security findings belong in the private tracker. Archived repos get no issues or PRs; public instructions name org skills only.
<!-- fleet:end -->
