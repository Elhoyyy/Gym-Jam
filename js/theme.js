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

  function init() {
    const btn = document.getElementById("themeToggle");
    if (btn) btn.addEventListener("click", toggle);
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.Theme = { toggle, current, apply };
})(window);
