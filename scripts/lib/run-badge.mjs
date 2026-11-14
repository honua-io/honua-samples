// Own-sample run badges: the last recorded server run, linked to the CI run that produced it.
import { escapeAttr, escapeHtml } from "./markdown-lite.mjs";

export function computeOwnRunBadge(manifest, result, { generatedAt, runUrl }) {
  if (manifest.status === "draft") {
    return { state: "draft", label: "Draft — outside the active gallery's verified sample set" };
  }
  if (!result) return null;
  const date = generatedAt ? generatedAt.slice(0, 10) : "an unknown date";
  if (result.outcome === "pass") {
    return {
      state: "pass",
      label: `Server run passed ${date} against server ${result.serverVersion ?? "unknown"}`,
      url: runUrl,
    };
  }
  return {
    state: "fail",
    label: `Server run failed on ${date} (server ${result.serverVersion ?? "unknown"})${result.error ? `: ${result.error}` : ""}`,
    url: runUrl,
  };
}

export function httpsUrlOrNull(value) {
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

export function runBadgeHtml(badge) {
  if (!badge) return "";
  const label = escapeHtml(badge.label);
  return badge.url
    ? `<a class="badge ${badge.state}" href="${escapeAttr(badge.url)}" target="_blank" rel="noopener noreferrer">${label} &nearr;</a>`
    : `<span class="badge ${badge.state}">${label}</span>`;
}
