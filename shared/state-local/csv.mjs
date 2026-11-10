export function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^\s*[=+@-]/u.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
