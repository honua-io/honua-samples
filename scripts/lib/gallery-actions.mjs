import { escapeAttr, escapeHtml } from "./markdown-lite.mjs";

export function galleryActions({ openUrl, sourceUrl, unavailableReason }) {
  return [
    { kind: "open", label: "Open it", href: openUrl, reason: unavailableReason },
    { kind: "build", label: "Build it", reason: "App builder import is not available yet. Open the source to build locally." },
    { kind: "source", label: "View code", href: sourceUrl, reason: "Source for this published build is not available." },
  ];
}

export function renderGalleryActions(options) {
  return `<div class="card-actions">${galleryActions(options).map((action) => {
    const label = escapeHtml(action.label);
    const attribute = `data-gallery-action="${action.kind}"`;
    if (action.href) return `<a ${attribute} href="${escapeAttr(action.href)}">${label} &rarr;</a>`;
    return `<span ${attribute} aria-disabled="true">${label}<small>${escapeHtml(action.reason)}</small></span>`;
  }).join("")}</div>`;
}
