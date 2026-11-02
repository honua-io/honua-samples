// Mobile navigation toggle for the gallery collar. Progressive enhancement:
// without this script the header wraps its links inline (see gallery.css,
// html:not(.nav-enhanced)); with it the links fold behind the toggle below
// 900px, exactly as honua.io's assets/nav.js behaves.
(function () {
  "use strict";
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".site-header nav");
  if (!toggle || !nav) return;
  document.documentElement.classList.add("nav-enhanced");
  if (!nav.id) nav.id = "primary-navigation";
  toggle.setAttribute("aria-controls", nav.id);
  function closeNav(returnFocus) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open navigation");
    nav.classList.remove("nav-open");
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener("click", function () {
    if (toggle.getAttribute("aria-expanded") === "true") {
      closeNav(false);
      return;
    }
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Close navigation");
    nav.classList.add("nav-open");
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") closeNav(true);
  });
  document.addEventListener("click", function (event) {
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (nav.contains(event.target) || toggle.contains(event.target)) return;
    closeNav(false);
  });
})();
