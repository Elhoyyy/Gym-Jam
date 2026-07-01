/* ============================================================
   Gym&Jam — Discreet "install app" banner
   Android/Chrome: uses the native beforeinstallprompt.
   iOS/Safari: shows a short "Compartir → Añadir a inicio" hint.
   Hidden if already installed or previously dismissed.
   ============================================================ */
(function () {
  "use strict";
  const KEY = "gymandjam.installDismissed";
  let deferred = null;
  let banner = null;

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const dismissed = () => { try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; } };
  const persistDismiss = () => { try { localStorage.setItem(KEY, "1"); } catch (_) {} };

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

  function hide() {
    if (!banner) return;
    banner.classList.remove("show");
    const b = banner; banner = null;
    setTimeout(() => b.remove(), 350);
  }
  function dismiss() { persistDismiss(); hide(); }

  async function doInstall() {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch (_) {}
    deferred = null;
    dismiss();
  }

  function build(kind) {
    if (banner) return;
    banner = document.createElement("div");
    banner.className = "install-banner";
    const icon = '<img class="install-icon" src="/assets/icon-192.png" alt="" />';
    const close = '<button class="icon-btn" id="instClose" aria-label="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    if (kind === "android") {
      banner.innerHTML = icon +
        '<div class="install-text"><b>Instala Gym&amp;Jam</b><br>Acceso directo y uso sin conexión.</div>' +
        '<div class="install-actions"><button class="btn btn-primary btn-sm" id="instBtn">Instalar</button>' + close + "</div>";
    } else {
      banner.innerHTML = icon +
        '<div class="install-text"><b>Instala Gym&amp;Jam</b><br>Pulsa <svg class="ios-share" viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg> y «Añadir a inicio».</div>' +
        '<div class="install-actions">' + close + "</div>";
    }
    document.body.appendChild(banner);
    requestAnimationFrame(() => banner.classList.add("show"));
    const c = banner.querySelector("#instClose"); if (c) c.addEventListener("click", dismiss);
    const i = banner.querySelector("#instBtn"); if (i) i.addEventListener("click", doInstall);
  }

  if (standalone || dismissed()) return;

  // Android / desktop Chrome
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (!dismissed()) build("android");
  });
  window.addEventListener("appinstalled", dismiss);

  // iOS Safari has no prompt event → show a hint
  if (isIOS() && isSafari() && location.protocol.indexOf("http") === 0) {
    setTimeout(() => { if (!standalone && !dismissed()) build("ios"); }, 2500);
  }
})();
