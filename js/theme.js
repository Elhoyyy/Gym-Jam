/* ============================================================
   Gym&Jam — Theme (light / dark) with persistence
   Works everywhere, including the login screen (independent of
   the app boot). The initial theme is applied by an inline
   <head> script to avoid a flash of the wrong theme.
   ============================================================ */
(function (global) {
  "use strict";
  const KEY = "gymandjam.theme";

  function current() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }
  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch (_) {}
    if (typeof global.__onThemeChange === "function") global.__onThemeChange(theme);
  }
  function toggle() { apply(current() === "dark" ? "light" : "dark"); }

  // One delegated listener handles every .js-theme-toggle — including buttons
  // added later (e.g. the login screen), and with no risk of double-binding.
  function init() {
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest(".js-theme-toggle")) toggle();
    });
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.Theme = { toggle, current, apply };
})(window);
