type Child = Node | string | null | undefined | false;

/** Builds an element; text always goes in as text, never as HTML. */
export function h(tag: string, attrs: Record<string, string | boolean | undefined> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === "class") node.className = String(value);
    else node.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

/** replaceChildren that skips empty slots. */
export function fill(target: HTMLElement, ...children: Child[]): void {
  target.replaceChildren(...children.filter((child): child is Node | string => child !== null && child !== undefined && child !== false));
}

