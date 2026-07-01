/* ============================================================
   Gym&Jam — Client auth & cloud sync
   Detects the backend. If present, requires login and syncs the
   local state with the server. If absent (opened as a file), the
   app runs in pure local mode with no account.
   ============================================================ */
(function (global) {
  "use strict";

  const TOKEN_KEY = "gymandjam.token";
  let mode = "local";           // "local" | "backend"
  let token = null;
  let email = null;
  let onReady = function () {};
  let syncTimer = null;
  let syncState = "idle";       // idle | saving | synced | offline

  /* ---------- tiny fetch wrapper ---------- */
  async function api(path, { method = "GET", body, auth = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "Error"), { status: res.status });
    return data;
  }

  function decodeToken(t) {
    try {
      let body = t.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      while (body.length % 4) body += "=";
      return JSON.parse(atob(body));
    } catch (_) { return null; }
  }

  /* ---------- sync ---------- */
  function registerSync() {
    DB.onSave(() => scheduleSync());
  }
  function scheduleSync() {
    setSync("saving");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushNow, 800);
  }
  async function pushNow() {
    if (mode !== "backend" || !token) return;
    try {
      const state = JSON.parse(DB.exportJSON());
      await api("/api/state", { method: "PUT", body: { state }, auth: true });
      setSync("synced");
    } catch (err) {
      if (err.status === 401) return forceLogout();
      setSync("offline");
    }
  }
  function setSync(s) {
    syncState = s;
    const map = {
      saving:  ["var(--amber, #c07a1e)", "Guardando…"],
      synced:  ["var(--pos)", "Sincronizado"],
      offline: ["var(--neg)", "Sin conexión"],
      idle:    ["var(--text-faint)", "Local"],
    };
    const [color, label] = map[s] || map.idle;
    document.querySelectorAll(".js-sync").forEach((el) => {
      el.innerHTML = `<span class="sync-dot" style="background:${color}"></span>${label}`;
    });
  }

  /* ---------- account box (sidebar) ---------- */
  const LOGOUT_SVG = '<svg viewBox="0 0 24 24"><path d="M15 12H3m0 0l4-4m-4 4l4 4M14 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function mountAccount() {
    const initial = (email || "?").charAt(0).toUpperCase();
    const box = document.getElementById("accountBox");
    if (box) {
      box.innerHTML = `
        <div class="account">
          <div class="account-info">
            <span class="account-avatar">${initial}</span>
            <div class="account-meta">
              <span class="account-email" title="${email || ""}">${email || ""}</span>
              <span class="sync-status js-sync"><span class="sync-dot"></span>Sincronizado</span>
            </div>
          </div>
          <button class="icon-btn" id="logoutBtn" title="Cerrar sesión">${LOGOUT_SVG}</button>
        </div>`;
      box.querySelector("#logoutBtn").addEventListener("click", logout);
    }
    mountMobileAccount(initial);
    setSync(syncState === "idle" ? "synced" : syncState);
  }

  // Mobile: reveal the top-bar account button and build its dropdown menu.
  function mountMobileAccount(initial) {
    const btn = document.getElementById("accountBtn");
    if (!btn) return;
    btn.hidden = false;
    const av = document.getElementById("accountBtnAvatar");
    if (av) av.textContent = initial;

    let menu = document.getElementById("accountMenu");
    if (!menu) { menu = document.createElement("div"); menu.className = "account-menu"; menu.id = "accountMenu"; document.body.appendChild(menu); }
    menu.innerHTML = `
      <div class="am-head">
        <span class="account-avatar">${initial}</span>
        <div style="min-width:0">
          <div class="am-email">${email || ""}</div>
          <div class="am-sync sync-status js-sync"><span class="sync-dot"></span>Sincronizado</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-block" id="logoutBtnM">${LOGOUT_SVG} Cerrar sesión</button>`;
    btn.onclick = (e) => { e.stopPropagation(); menu.classList.toggle("show"); };
    menu.querySelector("#logoutBtnM").addEventListener("click", logout);
    document.addEventListener("click", (e) => {
      if (menu.classList.contains("show") && !menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove("show");
    });
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }
  function forceLogout() {
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  /* ---------- auth screen ---------- */
  function showAuthScreen() {
    const el = document.createElement("div");
    el.className = "auth-overlay";
    el.id = "authOverlay";
    el.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="brand-logo"><svg viewBox="0 0 24 24" fill="none"><path d="M6.5 8.5v7M3.5 10v4M17.5 8.5v7M20.5 10v4M6.5 12h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg></div>
          <div>
            <div class="brand-name">Gym&amp;Jam</div>
            <div class="brand-tag">Training Journal</div>
          </div>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab is-active" data-tab="login">Iniciar sesión</button>
          <button class="auth-tab" data-tab="register">Crear cuenta</button>
        </div>
        <form class="auth-form" id="authForm" autocomplete="on">
          <div class="modal-field">
            <label>Email</label>
            <input class="input" type="email" id="authEmail" placeholder="tu@email.com" required autocomplete="email">
          </div>
          <div class="modal-field">
            <label>Contraseña</label>
            <input class="input" type="password" id="authPassword" placeholder="Mínimo 6 caracteres" required minlength="6" autocomplete="current-password">
          </div>
          <div class="modal-field" id="confirmField" hidden>
            <label>Confirmar contraseña</label>
            <input class="input" type="password" id="authConfirm" placeholder="Repite la contraseña" autocomplete="new-password">
          </div>
          <div class="auth-error" id="authError" hidden></div>
          <button class="btn btn-primary btn-block" type="submit" id="authSubmit">Entrar</button>
        </form>
        <p class="auth-foot">Tus datos se guardan <b>de forma segura en nuestro servidor</b>.</p>
      </div>`;
    document.body.appendChild(el);

    let tab = "login";
    const form = el.querySelector("#authForm");
    const emailInput = el.querySelector("#authEmail");
    const passInput = el.querySelector("#authPassword");
    const confirmField = el.querySelector("#confirmField");
    const confirmInput = el.querySelector("#authConfirm");
    const errorBox = el.querySelector("#authError");
    const submit = el.querySelector("#authSubmit");

    function setTab(t) {
      tab = t;
      el.querySelectorAll(".auth-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === t));
      submit.textContent = t === "login" ? "Entrar" : "Crear cuenta";
      passInput.setAttribute("autocomplete", t === "login" ? "current-password" : "new-password");
      confirmField.hidden = t !== "register";
      confirmInput.value = "";
      errorBox.hidden = true;
      emailInput.focus();
    }
    el.querySelectorAll(".auth-tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      const mail = emailInput.value.trim();
      const pw = passInput.value;
      if (!mail || pw.length < 6) { showError("Revisa el email y una contraseña de 6+ caracteres."); return; }
      if (tab === "register" && pw !== confirmInput.value) { showError("Las contraseñas no coinciden."); confirmInput.focus(); return; }
      submit.disabled = true;
      submit.textContent = tab === "login" ? "Entrando…" : "Creando…";
      try {
        const path = tab === "login" ? "/api/login" : "/api/register";
        const data = await api(path, { method: "POST", body: { email: mail, password: pw } });
        token = data.token;
        email = data.email;
        localStorage.setItem(TOKEN_KEY, token);
        await enterApp(tab === "register");
        el.remove();
      } catch (err) {
        showError(err.message || "No se pudo completar. Inténtalo de nuevo.");
        submit.disabled = false;
        submit.textContent = tab === "login" ? "Entrar" : "Crear cuenta";
      }
    });

    function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
    emailInput.focus();
  }

  /* ---------- pull server state and start ---------- */
  async function enterApp(isNew) {
    const payload = decodeToken(token) || {};
    if (payload.uid != null) DB.setCacheKey("gymandjam.v1.u" + payload.uid);
    email = email || payload.email;

    let serverState = {};
    try {
      const data = await api("/api/state", { method: "GET", auth: true });
      serverState = data.state || {};
    } catch (err) {
      if (err.status === 401) return forceLogout();
      // offline: fall back to whatever is cached for this user
      DB.load();
      registerSync();
      mountAccount();
      setSync("offline");
      onReady();
      return;
    }

    DB.replaceState(serverState);
    registerSync();
    mountAccount();
    setSync("synced");
    onReady();
    // Ensure a brand-new account persists its seeded library server-side.
    if (isNew || !serverState.exercises) pushNow();
  }

  /* ---------- boot ---------- */
  async function init(opts) {
    onReady = (opts && opts.onReady) || function () {};
    // Detect backend
    let health = null;
    try { health = await api("/api/health"); } catch (_) { health = null; }

    if (!health || !health.auth) {
      mode = "local";
      onReady();               // pure local mode (file:// or no server)
      return;
    }

    mode = "backend";
    token = localStorage.getItem(TOKEN_KEY);
    if (token && decodeToken(token)) {
      await enterApp(false);
    } else {
      showAuthScreen();
    }
  }

  global.Auth = { init, logout, api, get mode() { return mode; } };
})(window);
