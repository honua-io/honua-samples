// Shared theme contract: light by default, safe when browser storage is blocked.
const root = document.documentElement;
function renderToggle() {
  const dark = root.dataset.theme === "dark";
  for (const toggle of document.querySelectorAll(".theme-toggle")) {
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.textContent = "Dark mode";
    toggle.setAttribute("aria-label", "Dark mode");
  }
}
for (const toggle of document.querySelectorAll(".theme-toggle")) {
  toggle.addEventListener("click", () => {
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem("honua-theme", theme); } catch { /* Storage is optional. */ }
    renderToggle();
    document.dispatchEvent(new CustomEvent("honua:theme", { detail: { theme } }));
  });
}
renderToggle();
