/* ============================================================
   Gym&Jam — Client auth & cloud sync
   Detects the backend. If present, requires login and syncs the
   local state with the server. If absent (opened as a file), the
   app runs in pure local mode with no account.
   ============================================================ */
(function (global) {
  "use strict";

  const TOKEN_KEY = "gymandjam.token";
  const LOGGEDOUT_KEY = "gymandjam.loggedOut";   // set on explicit logout; forces the login screen
  // Lowercase + strip diacritics ("ñ" → "n", "josé" → "jose"). Must mirror the
  // server's normUsername so login and register agree on the stored name.
  const normUsername = (v) => String(v || "").trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  let mode = "local";           // "local" | "backend"
  let token = null;
  let username = null;
  let userId = null;            // current account id (namespaces per-user local data)
  let createdAt = null;         // account creation timestamp (ms), for the profile
  let onReady = function () {};
  let syncTimer = null;
  let syncState = "idle";       // idle | saving | synced | offline

  /* ---------- tiny fetch wrapper ---------- */
  async function api(path, { method = "GET", body, auth = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (auth && token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(path, { method, headers, credentials: "same-origin", body: body ? JSON.stringify(body) : undefined });
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
  // A per-user "pending" flag marks local changes not yet confirmed by the
  // server. It survives reloads, so offline edits get pushed on the next
  // connection and are never silently overwritten by a server pull.
  // The pending value is a unique token, not just a flag: every local change
  // writes a fresh token, and a push only clears it if the token is unchanged
  // when the upload confirms. That way a change made *while a push is in flight*
  // (whose data wasn't in that push) is never marked as synced by mistake.
  function pendingKey() { return "gymandjam.pending.u" + (userId != null ? userId : "_"); }
  function readPending() { try { return localStorage.getItem(pendingKey()); } catch (_) { return null; } }
  function hasPending() { return readPending() != null; }
  function markPending() { try { localStorage.setItem(pendingKey(), Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); } catch (_) {} }
  function clearPending() { try { localStorage.removeItem(pendingKey()); } catch (_) {} }

  function registerSync() {
    DB.onSave(() => scheduleSync());
  }
  function scheduleSync() {
    markPending();                 // remember there's something to upload
    setSync("saving");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushNow, 800);
  }
  async function pushNow() {
    if (mode !== "backend") return;   // cookie authenticates even without a localStorage token
    const token = readPending();
    if (!token) { setSync("synced"); return; }
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setSync("offline"); return; }
    try {
      const state = JSON.parse(DB.exportJSON());
      await api("/api/state", { method: "PUT", body: { state }, auth: true });
      // Only mark synced if no newer change arrived during the upload.
      if (readPending() === token) { clearPending(); setSync("synced"); }
      else { setSync("saving"); }      // a newer change is already queued to push
    } catch (err) {
      if (err.status === 401) return forceLogout();
      setSync("offline");              // keep the token → retried when back online
    }
  }
  // Retry unsynced changes the moment the network comes back.
  function flushWhenOnline() { if (mode === "backend" && hasPending()) pushNow(); }
  window.addEventListener("online", flushWhenOnline);

  // Manual "sync now" — iOS PWAs don't always fire the `online` event, so give
  // the user a button. Pushes pending edits; if none, pulls the latest state.
  async function forceSync() {
    if (mode !== "backend") return;
    setSync("saving");
    try { await api("/api/me", { auth: true }); }
    catch (err) { if (err.status === 401) return forceLogout(); setSync("offline"); return; }
    if (hasPending()) { await pushNow(); return; }
    try {
      const data = await api("/api/state", { method: "GET", auth: true });
      DB.replaceState(data.state || {});
      setSync("synced");
      if (typeof global.__rerender === "function") global.__rerender();
    } catch (_) { setSync("offline"); }
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
    document.querySelectorAll(".js-sync-refresh").forEach((el) => el.classList.toggle("spin", s === "saving"));
  }

  /* ---------- account box (sidebar) ---------- */
  const LOGOUT_SVG = '<svg viewBox="0 0 24 24"><path d="M15 12H3m0 0l4-4m-4 4l4 4M14 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const REFRESH_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4M3 20v-4h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SYNC_LINE = `<span class="sync-line"><span class="sync-status js-sync"><span class="sync-dot"></span>Sincronizado</span><button class="sync-refresh js-sync-refresh" type="button" title="Sincronizar ahora" aria-label="Sincronizar ahora">${REFRESH_SVG}</button></span>`;

  function mountAccount() {
    const initial = (username || "?").charAt(0).toUpperCase();
    const box = document.getElementById("accountBox");
    if (box) {
      box.innerHTML = `
        <div class="account">
          <div class="account-info">
            <span class="account-avatar">${initial}</span>
            <div class="account-meta">
              <span class="account-email" title="${username || ""}">${username || ""}</span>
              ${SYNC_LINE}
            </div>
          </div>
          <button class="icon-btn" id="logoutBtn" title="Cerrar sesión">${LOGOUT_SVG}</button>
        </div>`;
      box.querySelector("#logoutBtn").addEventListener("click", logout);
      const rf = box.querySelector(".js-sync-refresh");
      if (rf) rf.addEventListener("click", (e) => { e.stopPropagation(); forceSync(); });
      const info = box.querySelector(".account-info");
      if (info) { info.classList.add("clickable"); info.addEventListener("click", () => { if (global.__openProfile) global.__openProfile(); }); }
    }
    mountMobileAccount(initial);
    setSync(syncState === "idle" ? "synced" : syncState);
  }

  // Mobile: the top-bar avatar opens the full profile sheet (which holds the
  // sync status, account actions and logout).
  function mountMobileAccount(initial) {
    const btn = document.getElementById("accountBtn");
    if (!btn) return;
    btn.hidden = false;
    const av = document.getElementById("accountBtnAvatar");
    if (av) av.textContent = initial;
    btn.onclick = (e) => { e.stopPropagation(); if (global.__openProfile) global.__openProfile(); };
  }

  async function logout() {
    // Mark the intent locally FIRST so the reload lands on the login screen even
    // if we're offline (the HttpOnly cookie can't be cleared without the server).
    try {
      localStorage.setItem(LOGGEDOUT_KEY, "1");
      localStorage.removeItem(TOKEN_KEY);
      clearPending();
    } catch (_) {}
    // Hide the app immediately so the click feels instant (no UI lingering
    // while the reload happens).
    try { document.documentElement.classList.add("auth-pending"); } catch (_) {}
    token = null;
    try { await api("/api/logout", { method: "POST" }); } catch (_) {}
    location.reload();
  }
  function forceLogout() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
    location.reload();
  }

  /* ---------- auth screen ---------- */
  function showAuthScreen() {
    const el = document.createElement("div");
    el.className = "auth-overlay";
    el.id = "authOverlay";
    el.innerHTML = `
      <div class="auth-card">
        <button class="auth-theme js-theme-toggle" type="button" id="authTheme" aria-label="Cambiar tema">
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19 5l-1.8 1.8M6.8 17.2 5 19M19 19l-1.8-1.8M6.8 6.8 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
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
            <label>Nombre de usuario</label>
            <input class="input" type="text" id="authUser" name="username" placeholder="p. ej. eloylifter" required minlength="3" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false">
          </div>
          <div class="modal-field">
            <label>Contraseña</label>
            <input class="input" type="password" id="authPassword" name="password" placeholder="Mínimo 6 caracteres" required minlength="6" autocomplete="current-password">
          </div>
          <div class="modal-field" id="confirmField" hidden>
            <label>Confirmar contraseña</label>
            <input class="input" type="password" id="authConfirm" name="confirm-password" placeholder="Repite la contraseña" autocomplete="new-password">
          </div>
          <div class="auth-error" id="authError" hidden></div>
          <button class="btn btn-primary btn-block" type="submit" id="authSubmit">Entrar</button>
        </form>
        <p class="auth-foot">Tus datos se guardan <b>de forma segura en nuestro servidor</b>.</p>
      </div>`;
    document.body.appendChild(el);

    const themeBtn = el.querySelector("#authTheme");
    if (themeBtn) themeBtn.addEventListener("click", () => { if (global.Theme) global.Theme.toggle(); });

    let tab = "login";
    const form = el.querySelector("#authForm");
    const userInput = el.querySelector("#authUser");
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
      userInput.focus();
    }
    el.querySelectorAll(".auth-tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      const uname = normUsername(userInput.value);
      const pw = passInput.value;
      if (tab === "register" && !/^[a-z0-9._-]{3,20}$/.test(uname)) { showError("Usuario: 3-20 caracteres (letras, números, . _ -)."); return; }
      if (!uname || pw.length < 6) { showError("Revisa el usuario y una contraseña de 6+ caracteres."); return; }
      if (tab === "register" && pw !== confirmInput.value) { showError("Las contraseñas no coinciden."); confirmInput.focus(); return; }
      submit.disabled = true;
      submit.textContent = tab === "login" ? "Entrando…" : "Creando…";
      try {
        const path = tab === "login" ? "/api/login" : "/api/register";
        const data = await api(path, { method: "POST", body: { username: uname, password: pw } });
        token = data.token;
        username = data.username;
        try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {}
        await enterApp(tab === "register", { uid: data.uid, username: data.username, createdAt: data.createdAt });
        el.remove();
      } catch (err) {
        showError(err.message || "No se pudo completar. Inténtalo de nuevo.");
        submit.disabled = false;
        submit.textContent = tab === "login" ? "Entrar" : "Crear cuenta";
      }
    });

    function showError(msg) { errorBox.textContent = msg; errorBox.hidden = false; }
    userInput.focus();
  }

  /* ---------- pull server state and start ---------- */
  async function enterApp(isNew, me) {
    try { localStorage.removeItem(LOGGEDOUT_KEY); } catch (_) {}   // a real session clears the logout flag
    me = me || {};
    const uid = me.uid != null ? me.uid : (decodeToken(token) || {}).uid;
    if (uid != null) { userId = uid; DB.setCacheKey("gymandjam.v1.u" + uid); }
    username = me.username || username || (decodeToken(token) || {}).username;
    if (me.createdAt != null) createdAt = me.createdAt;

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

    // Reconcile local vs server. If this device has changes that never reached
    // the server (made offline), keep them and upload — don't let the pull wipe
    // them. Otherwise the server is the source of truth.
    if (hasPending()) {
      DB.load();
      registerSync();
      mountAccount();
      onReady();
      pushNow();                 // upload the offline changes
    } else {
      DB.replaceState(serverState);
      registerSync();
      mountAccount();
      setSync("synced");
      onReady();
      // Ensure a brand-new account persists its seeded library server-side.
      if (isNew || !serverState.exercises) { markPending(); pushNow(); }
    }
  }

  // Offline start from cached per-user data (session cookie/token present but network down).
  function offlineStart() {
    const payload = decodeToken(token) || {};
    if (payload.uid != null) { userId = payload.uid; DB.setCacheKey("gymandjam.v1.u" + payload.uid); }
    username = payload.username || payload.email;
    DB.load();
    registerSync();
    mountAccount();
    setSync("offline");
    onReady();
  }

  /* ---------- boot ---------- */
  async function init(opts) {
    onReady = (opts && opts.onReady) || function () {};
    let intentionalLogout = false;
    try { intentionalLogout = localStorage.getItem(LOGGEDOUT_KEY) === "1"; } catch (_) {}
    try { token = intentionalLogout ? null : localStorage.getItem(TOKEN_KEY); } catch (_) { token = null; }

    // Explicit logout → go straight to the login screen, ignoring any cookie
    // session. Done BEFORE the health round-trip so it's instant (no flash of
    // the app shell). The flag is cleared once a real login/register succeeds.
    if (intentionalLogout) { mode = "backend"; showAuthScreen(); return; }

    // Detect backend
    let health = null;
    try { health = await api("/api/health"); } catch (_) { health = null; }

    // Backend exists but is unreachable right now (offline) and we hold a valid
    // session → start from the per-user local cache instead of dropping to an
    // account-less local mode. Pending edits flush when the network returns.
    if (health === null && token && decodeToken(token)) {
      mode = "backend";
      offlineStart();
      return;
    }

    if (!health || !health.auth) {
      mode = "local";
      onReady();               // pure local mode (file:// or no server)
      return;
    }

    mode = "backend";

    // Ask the server who we are — works via the session cookie even if
    // localStorage was wiped (iOS home-screen PWAs do this on relaunch).
    let me = null;
    try {
      me = await api("/api/me", { auth: true });
    } catch (err) {
      if (err.status !== 401 && token && decodeToken(token)) { offlineStart(); return; }
      me = null;
    }

    if (me && me.username) await enterApp(false, me);
    else showAuthScreen();
  }

  function changePassword(current, password) {
    return api("/api/password", { method: "POST", body: { current, password }, auth: true });
  }
  async function deleteAccount(password) {
    await api("/api/account/delete", { method: "POST", body: { password }, auth: true });
    // Account is gone → wipe the local session and this device's cached data.
    try {
      localStorage.setItem(LOGGEDOUT_KEY, "1");
      localStorage.removeItem(TOKEN_KEY);
      clearPending();
      if (userId != null) {
        localStorage.removeItem("gymandjam.v1.u" + userId);
        localStorage.removeItem("gymandjam.draft.u" + userId);
      }
    } catch (_) {}
    try { document.documentElement.classList.add("auth-pending"); } catch (_) {}
    token = null;
    location.reload();
  }

  global.Auth = {
    init, logout, api, changePassword, deleteAccount, forceSync,
    get mode() { return mode; },
    get uid() { return userId; },
    get username() { return username; },
    get createdAt() { return createdAt; },
  };
})(window);
