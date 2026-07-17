// Minimal, dependency-free Markdown -> HTML renderer for sample README.md
// files, used by scripts/build-gallery.mjs's per-sample detail pages.
//
// Not a general-purpose CommonMark implementation -- just the subset this
// repo's own READMEs use: headings, paragraphs, fenced code blocks, inline
// code/bold/links, unordered/ordered lists, and pipe tables. Anything else
// (nested blockquotes, HTML passthrough, footnotes, etc.) falls through to
// plain escaped paragraphs, which is a safe (if plain) degradation.

export function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(/^```\s*(\S*)\s*$/);
    if (fence) {
      const lang = fence[1];
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence (tolerates an unterminated fence at EOF)
      const cls = lang ? ` class="language-${escapeAttr(lang)}"` : "";
      out.push(`<pre><code${cls}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (isTableRow(line) && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      out.push(renderTable(header, rows));
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const [items, next] = collectListItems(lines, i, /^\s*[-*]\s+/);
      i = next;
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const [items, next] = collectListItems(lines, i, /^\s*\d+\.\s+/);
      i = next;
      out.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }

    // Paragraph: accumulate contiguous non-blank, non-block-starting lines.
    const para = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }

  return out.join("\n");
}

const OTHER_BLOCK_START = /^(```|#{1,6}\s+|\s*[-*]\s+|\s*\d+\.\s+)/;

/**
 * Collects a run of list items starting at lines[start], folding indented
 * continuation lines (a wrapped sentence, not a new marker) into the
 * previous item instead of spilling them into a separate paragraph.
 * @returns {[string[], number]} item texts and the index just past the list.
 */
function collectListItems(lines, start, markerPattern) {
  const items = [];
  let i = start;
  while (i < lines.length && markerPattern.test(lines[i])) {
    let text = lines[i].replace(markerPattern, "");
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      /^\s+\S/.test(lines[i]) &&
      !markerPattern.test(lines[i]) &&
      !OTHER_BLOCK_START.test(lines[i])
    ) {
      text += " " + lines[i].trim();
      i++;
    }
    items.push(text);
  }
  return [items, i];
}

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && /-/.test(line);
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((cell) => cell.trim());
}

function renderTable(header, rows) {
  const thead = `<thead><tr>${header.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const external = /^https?:\/\//i.test(url);
    const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeAttr(url)}"${attrs}>${label}</a>`;
  });
  return s;
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
