export function element(tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text !== null) node.textContent = text;
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function cells(values) {
  const row = element('tr', null);
  row.append(...values.map((value) => element('td', value)));
  return row;
}
