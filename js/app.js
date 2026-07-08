/* ============================================================
   Gym&Jam — App controller (views, logic, interactions)
   ============================================================ */
(function (global) {
  "use strict";

  const G = DB.GROUPS;
  const main = document.getElementById("main");

  /* --- Draft session (work in progress) --------------------- */
  let draft = null; // {id?, date, groups:[], notes, entries:[{exerciseId, sets:[]}]}
  let currentView = "today";
  let swapEi = null;        // entry index being swapped via the picker (null = add mode)
  let workspace = "train";  // "train" | "food"
  let foodDate = null;      // selected day in the food diary (YYYY-MM-DD)
  let foodWeekStart = null; // Monday of the week shown in the weekly view
  let statsExercise = null; // selected exercise id for strength progression chart
  let statsTab = "fuerza";  // "fuerza" | "cardio"
  let heatWeeks = 26;       // consistency heatmap window (26 = 6 months, 53 = 1 year)
  let bwRange = 90;         // body-weight chart window in days (0 = all)
  let cardioExercise = null; // selected exercise id for cardio pace chart
  let libFilter = "all";
  let libSearch = "";
  const normText = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

  /* --- Utils ------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function fmtDate(iso, opts) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-ES", opts || { weekday: "long", day: "numeric", month: "long" });
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    return n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  }

  function daysBetween(a, b) {
    return Math.round((new Date(a + "T00:00:00") - new Date(b + "T00:00:00")) / 86400000);
  }

  function newDraft() {
    return { date: todayISO(), groups: [], notes: "", entries: [] };
  }
  // Per-user so an unsaved draft (with private notes) never leaks to the next
  // account that logs in on the same browser. Falls back to a shared key in
  // pure local mode (no account).
  function draftKey() {
    const uid = global.Auth && global.Auth.uid;
    return uid != null ? "gymandjam.draft.u" + uid : "gymandjam.draft";
  }
  function saveDraft() {
    try {
      if (draft && (draft.entries.length || draft.groups.length || draft.notes)) localStorage.setItem(draftKey(), JSON.stringify(draft));
      else localStorage.removeItem(draftKey());
    } catch (_) {}
  }
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(draftKey()) || "null");
      if (d && Array.isArray(d.entries) && (d.entries.length || (d.groups && d.groups.length))) return d;
    } catch (_) {}
    return null;
  }

  /* --- Toast ------------------------------------------------ */
  function toast(msg, type = "success") {
    const host = document.getElementById("toastHost");
    const el = document.createElement("div");
    el.className = "toast " + type;
    const icon = type === "success" ? "✓" : type === "error" ? "✕" : "i";
    el.innerHTML = `<span class="t-icon">${icon}</span><span>${escapeHtml(msg)}</span>`;
    host.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  // Toast with an "Undo" action (5 s window).
  function toastUndo(msg, undoFn) {
    const host = document.getElementById("toastHost");
    const el = document.createElement("div");
    el.className = "toast info";
    el.innerHTML = `<span class="t-icon">↺</span><span>${escapeHtml(msg)}</span><button class="toast-undo">Deshacer</button>`;
    host.appendChild(el);
    let done = false;
    const remove = () => { el.style.transition = "opacity .3s, transform .3s"; el.style.opacity = "0"; el.style.transform = "translateY(10px)"; setTimeout(() => el.remove(), 300); };
    const timer = setTimeout(remove, 5000);
    el.querySelector(".toast-undo").addEventListener("click", () => {
      if (done) return; done = true; clearTimeout(timer);
      try { undoFn(); } catch (_) {}
      remove();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  /* --- Modal ------------------------------------------------ */
  const backdrop = document.getElementById("modalBackdrop");
  const modal = document.getElementById("modal");
  let onModalClose = null;   // cleanup for the current modal (e.g. stop camera)

  function runModalCleanup() {
    if (typeof onModalClose === "function") { try { onModalClose(); } catch (_) {} }
    onModalClose = null;
  }
  function openModal(html) {
    runModalCleanup();
    modal.innerHTML = html;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    runModalCleanup();
    backdrop.hidden = true;
    modal.innerHTML = "";
    document.body.style.overflow = "";
  }
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !backdrop.hidden) closeModal(); });

  /* ============================================================
     ROUTER
     ============================================================ */
  function setView(view) {
    currentView = view;
    $$(".nav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    $$(".mnav-item").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
    window.scrollTo({ top: 0, behavior: "smooth" });
    render();
  }

  function render() {
    invalidatePRCache();   // history may have changed since the last view render
    if (currentView === "today") renderToday();
    else if (currentView === "templates") renderTemplates();
    else if (currentView === "history") renderHistory();
    else if (currentView === "stats") renderStats();
    else if (currentView === "exercises") renderExercises();
    else if (currentView === "food-diary") renderFoodDiary();
    else if (currentView === "food-week") renderFoodWeek();
    else if (currentView === "food-goals") renderFoodGoals();
    else if (currentView === "food-foods") renderFoodFoods();
    else if (currentView === "food-weight") renderBodyweight();
    updateStreak();
  }

  const TRAIN_VIEWS = ["today", "templates", "history", "stats", "exercises"];
  function setWorkspace(ws) {
    workspace = ws;
    try { localStorage.setItem("gymandjam.workspace", ws); } catch (_) {}
    document.getElementById("nav").hidden = ws !== "train";
    document.getElementById("navFood").hidden = ws !== "food";
    document.getElementById("mobileNav").hidden = ws !== "train";
    document.getElementById("mobileNavFood").hidden = ws !== "food";
    $$(".ws-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.ws === ws));
    // switch to that workspace's default view if the current one doesn't belong
    const inTrain = TRAIN_VIEWS.includes(currentView);
    if (ws === "train" && !inTrain) setView("today");
    else if (ws === "food" && inTrain) setView("food-diary");
  }

  // One delegated handler for nav items and the workspace switch.
  document.addEventListener("click", (e) => {
    const ws = e.target.closest("[data-ws]");
    if (ws) { setWorkspace(ws.dataset.ws); return; }
    const nav = e.target.closest(".nav-item[data-view], .mnav-item[data-view]");
    if (nav) setView(nav.dataset.view);
  });

  /* ============================================================
     STREAK
     ============================================================ */
  function computeStreak() {
    // Distinct training days. Add today only if there's an in-progress draft,
    // using a Set so it never duplicates an already-saved workout for today
    // (a duplicate would read as a 0-day gap and truncate the streak to 1).
    const days = new Set(DB.get().workouts.map((w) => w.date).filter(Boolean));
    if (draft && draft.date === todayISO() && Array.isArray(draft.entries) && draft.entries.length) days.add(todayISO());
    const dates = [...days].sort().reverse();
    if (!dates.length) return 0;
    const today = todayISO();
    const gap0 = daysBetween(today, dates[0]);
    if (gap0 > 1) return 0; // last training day is 2+ days ago → streak broken
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      if (daysBetween(dates[i - 1], dates[i]) === 1) streak++;
      else break;
    }
    return streak;
  }

  // Distinct training days grouped by calendar year, most recent year first.
  // Each new year starts its own count while past years stay recorded.
  function trainedDaysByYear() {
    const byYear = {};
    DB.get().workouts.forEach((w) => {
      if (!w.date) return;
      const y = w.date.slice(0, 4);
      (byYear[y] = byYear[y] || new Set()).add(w.date);
    });
    return Object.entries(byYear)
      .map(([year, set]) => ({ year, days: set.size }))
      .sort((a, b) => b.year.localeCompare(a.year));
  }
  function updateStreak() {
    const el = document.getElementById("streakNum");
    const badge = document.getElementById("streakBadge");
    const n = computeStreak();
    if (el) el.textContent = n;
    if (badge) badge.classList.toggle("is-hot", n > 0);
  }

  /* ============================================================
     ACHIEVEMENTS (logros)
     Derived on-the-fly from the current state — nothing extra is stored in
     the synced DB. Only the set of already-announced ids is persisted locally
     (per user, per device) so the unlock toast fires once and never re-fires
     on reload or on another device.
     ============================================================ */
  // The four "compound" lifts a Club-X-kg badge accepts (matched loosely by name
  // so custom variants like "Sentadilla con barra" still count).
  const BIG_LIFT_RE = /(press de banca|press banca|sentadilla|peso muerto|press militar)/i;
  const K = 1000;

  // Each achievement: id, tier (colours the medal), icon (emoji), name, hint,
  // and progress(agg) → { cur, target }. Unlocked when cur >= target. `target`
  // of 1 means a simple boolean milestone.
  const ACHIEVEMENTS = [
    // ---- Constancia ----
    { id: "first",     tier: "bronze", icon: "🌱", name: "El primer paso",   hint: "Guarda tu primer entreno",        p: (a) => ({ cur: a.count, target: 1 }) },
    { id: "sessions10",tier: "bronze", icon: "🔟", name: "Cogiendo el ritmo", hint: "10 entrenos registrados",         p: (a) => ({ cur: a.count, target: 10 }) },
    { id: "sessions50",tier: "silver", icon: "🏋️", name: "Habitual",          hint: "50 entrenos registrados",         p: (a) => ({ cur: a.count, target: 50 }) },
    { id: "sessions100",tier:"gold",   icon: "💯", name: "Centurión",         hint: "100 entrenos registrados",        p: (a) => ({ cur: a.count, target: 100 }) },
    { id: "sessions250",tier:"legend", icon: "👑", name: "Leyenda del hierro", hint: "250 entrenos registrados",       p: (a) => ({ cur: a.count, target: 250 }) },
    { id: "streak7",   tier: "bronze", icon: "🔥", name: "Semana perfecta",   hint: "7 días seguidos entrenando",      p: (a) => ({ cur: a.bestStreak, target: 7 }) },
    { id: "streak30",  tier: "gold",   icon: "☄️", name: "Imparable",         hint: "30 días de racha",                p: (a) => ({ cur: a.bestStreak, target: 30 }) },
    // ---- Fuerza ----
    { id: "firstPR",   tier: "bronze", icon: "⭐", name: "Marca personal",    hint: "Consigue tu primer récord",       p: (a) => ({ cur: a.hasStrength ? 1 : 0, target: 1 }) },
    { id: "club100",   tier: "silver", icon: "💪", name: "Club de los 100",   hint: "100 kg en un básico (1RM est.)",  p: (a) => ({ cur: Math.round(a.bigLiftMax), target: 100 }) },
    { id: "club140",   tier: "gold",   icon: "🦍", name: "Fuerza bruta",      hint: "140 kg en un básico",             p: (a) => ({ cur: Math.round(a.bigLiftMax), target: 140 }) },
    { id: "club180",   tier: "legend", icon: "🐉", name: "Bestia",            hint: "180 kg en un básico",             p: (a) => ({ cur: Math.round(a.bigLiftMax), target: 180 }) },
    { id: "club220",   tier: "legend", icon: "🏆", name: "Sobrehumano",       hint: "220 kg en un básico",             p: (a) => ({ cur: Math.round(a.bigLiftMax), target: 220 }) },
    { id: "twiceBw",   tier: "gold",   icon: "⚖️", name: "El doble",          hint: "Sentadilla o peso muerto a 2× tu peso corporal", p: (a) => ({ cur: a.bwMult >= 2 ? 1 : 0, target: 1 }) },
    { id: "prs10",     tier: "silver", icon: "🎖️", name: "Coleccionista",     hint: "Récord en 10 ejercicios distintos", p: (a) => ({ cur: a.prExercises, target: 10 }) },
    // ---- Volumen ----
    { id: "vol100k",   tier: "silver", icon: "🪨", name: "Montañas movidas",  hint: "100.000 kg de volumen total",     p: (a) => ({ cur: Math.round(a.totalVolume), target: 100 * K }) },
    { id: "vol500k",   tier: "gold",   icon: "🌋", name: "Medio millón",      hint: "500.000 kg de volumen total",     p: (a) => ({ cur: Math.round(a.totalVolume), target: 500 * K }) },
    { id: "vol1m",     tier: "legend", icon: "🌌", name: "El millón",         hint: "1.000.000 kg de volumen total",   p: (a) => ({ cur: Math.round(a.totalVolume), target: K * K }) },
    { id: "vol5m",     tier: "legend", icon: "🌠", name: "Cinco millones",    hint: "5.000.000 kg de volumen total",   p: (a) => ({ cur: Math.round(a.totalVolume), target: 5 * K * K }) },
    // ---- Variedad / rutinas ----
    { id: "allGroups", tier: "silver", icon: "🎯", name: "Cuerpo completo",   hint: "Entrena los 8 grupos musculares", p: (a) => ({ cur: a.strengthGroups, target: 8 }) },
    { id: "explorer",  tier: "silver", icon: "🧭", name: "Explorador",        hint: "Usa 30 ejercicios distintos",     p: (a) => ({ cur: a.distinctExercises, target: 30 }) },
    { id: "architect", tier: "silver", icon: "📐", name: "Arquitecto",        hint: "Crea 5 rutinas propias",          p: (a) => ({ cur: a.templateCount, target: 5 }) },
    { id: "shared",    tier: "bronze", icon: "🔗", name: "Compartir es vivir", hint: "Comparte una rutina",            p: (a) => ({ cur: a.hasShared ? 1 : 0, target: 1 }) },
    // ---- Cardio ----
    { id: "firstCardio",tier:"bronze", icon: "🏃", name: "A moverse",         hint: "Registra tu primer cardio",       p: (a) => ({ cur: a.hasCardio ? 1 : 0, target: 1 }) },
    { id: "cardio42",  tier: "gold",   icon: "🥇", name: "Maratón acumulado", hint: "42 km de cardio en total",        p: (a) => ({ cur: Math.round(a.totalKm), target: 42 }) },
    { id: "cardio100", tier: "gold",   icon: "🏅", name: "Fondista",          hint: "100 km de cardio en total",       p: (a) => ({ cur: Math.round(a.totalKm), target: 100 }) },
    { id: "cardio250", tier: "legend", icon: "🏔️", name: "Ultra",             hint: "250 km de cardio en total",       p: (a) => ({ cur: Math.round(a.totalKm), target: 250 }) },
    { id: "longRun",   tier: "silver", icon: "🛣️", name: "Salida larga",      hint: "10 km en una sola sesión",        p: (a) => ({ cur: Math.round(a.maxSessionKm), target: 10 }) },
    { id: "cardio1000",tier: "gold",   icon: "⏱️", name: "Aguante",           hint: "1000 min de cardio en total",     p: (a) => ({ cur: Math.round(a.totalCardioMin), target: 1000 }) },
  ];
  // The 8 strength muscle groups that count toward "Cuerpo completo".
  const STRENGTH_GROUPS = ["pecho", "espalda", "hombro", "biceps", "triceps", "pierna", "gluteo", "abdomen"];

  // Lifts whose top load counts toward the "2× bodyweight" badge.
  const BW_LIFT_RE = /(sentadilla|peso muerto)/i;

  // Aggregate every stat the achievements need in a single pass over the data.
  function achievementAggregates() {
    const ws = DB.get().workouts || [];
    let totalVolume = 0, totalKm = 0, totalCardioMin = 0, maxSessionKm = 0;
    let hasStrength = false, hasCardio = false, bigLiftMax = 0, bwLiftMax = 0;
    const groups = new Set();
    const distinctEx = new Set();   // exercise ids ever performed
    const prEx = new Set();         // ids with at least one completed strength set
    ws.forEach((w) => {
      let sessionKm = 0;
      (w.entries || []).forEach((en) => {
        const ex = DB.exerciseById(en.exerciseId);
        if (!ex) return;
        distinctEx.add(en.exerciseId);
        if (ex.group === "cardio") {
          hasCardio = true;
          (en.sets || []).forEach((s) => { totalKm += Number(s.km) || 0; sessionKm += Number(s.km) || 0; totalCardioMin += Number(s.min) || 0; });
        } else {
          groups.add(ex.group);
          const big = BIG_LIFT_RE.test(ex.name), bw = BW_LIFT_RE.test(ex.name);
          (en.sets || []).forEach((s) => {
            const wgt = Number(s.weight) || 0, reps = Number(s.reps) || 0;
            if (wgt > 0 && reps > 0) { hasStrength = true; prEx.add(en.exerciseId); }
            // Club-X uses estimated 1RM so a heavy triple counts, not just a true single.
            if (big && wgt > 0 && reps > 0) bigLiftMax = Math.max(bigLiftMax, DB.estimate1RM(wgt, reps));
            if (bw && wgt > 0 && reps > 0) bwLiftMax = Math.max(bwLiftMax, wgt);   // real load, not 1RM
          });
        }
      });
      if (sessionKm > maxSessionKm) maxSessionKm = sessionKm;
      totalVolume += DB.workoutVolume(w);
    });
    // 2× bodyweight uses the heaviest logged weight, or the current one if any.
    const bw = (DB.latestBodyweight() || {}).kg || 0;
    return {
      count: ws.length, totalVolume, totalKm, totalCardioMin, maxSessionKm,
      hasStrength, hasCardio, bigLiftMax,
      bwMult: bw > 0 ? bwLiftMax / bw : 0,
      prExercises: prEx.size,
      distinctExercises: distinctEx.size,
      templateCount: (DB.get().templates || []).length,
      hasShared: hasSharedRoutine(),
      strengthGroups: [...groups].filter((g) => STRENGTH_GROUPS.includes(g)).length,
      bestStreak: bestEverStreak(),
    };
  }
  // "Compartir": no server round-trip to count, so we set a local flag the first
  // time the user creates a share link (see the share flow). Persisted per user.
  function sharedKey() {
    const uid = global.Auth && global.Auth.uid;
    return uid != null ? "gymandjam.hasShared.u" + uid : "gymandjam.hasShared";
  }
  function hasSharedRoutine() { try { return localStorage.getItem(sharedKey()) === "1"; } catch (_) { return false; } }
  function markSharedRoutine() { try { localStorage.setItem(sharedKey(), "1"); } catch (_) {} checkAchievements(); }

  // Longest run of consecutive training days ever (not just the current one),
  // so a past hot streak still unlocks its badge.
  function bestEverStreak() {
    const dates = [...new Set((DB.get().workouts || []).map((w) => w.date).filter(Boolean))].sort();
    let best = 0, run = 0, prev = null;
    dates.forEach((d) => {
      run = (prev && daysBetween(d, prev) === 1) ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    });
    return best;
  }

  function computeAchievements() {
    const agg = achievementAggregates();
    return ACHIEVEMENTS.map((a) => {
      const { cur, target } = a.p(agg);
      return { ...a, cur: Math.min(cur, target), target, done: cur >= target };
    });
  }

  // Locally-persisted set of ids whose unlock toast has already been shown.
  function achKey() {
    const uid = global.Auth && global.Auth.uid;
    return uid != null ? "gymandjam.achievements.u" + uid : "gymandjam.achievements";
  }
  function readAnnounced() {
    try { return new Set(JSON.parse(localStorage.getItem(achKey()) || "[]")); }
    catch (_) { return new Set(); }
  }
  function writeAnnounced(set) {
    try { localStorage.setItem(achKey(), JSON.stringify([...set])); } catch (_) {}
  }
  // Call once at boot: mark everything already-earned as announced WITHOUT any
  // toast, so a veteran importing months of data isn't spammed with unlocks.
  function primeAchievements() {
    try {
      if (localStorage.getItem(achKey()) != null) return;   // already primed
    } catch (_) {}
    const done = computeAchievements().filter((a) => a.done).map((a) => a.id);
    writeAnnounced(new Set(done));
  }
  // Call after saving a workout: fire a toast for each newly-earned achievement.
  function checkAchievements() {
    const announced = readAnnounced();
    const fresh = computeAchievements().filter((a) => a.done && !announced.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a, i) => {
      announced.add(a.id);
      setTimeout(() => achievementToast(a), 400 + i * 1400);   // stagger so several don't overlap
    });
    writeAnnounced(announced);
  }

  function achievementToast(a) {
    const host = document.getElementById("toastHost");
    if (!host) return;
    const el = document.createElement("div");
    el.className = "toast achievement tier-" + a.tier;
    el.innerHTML = `<span class="ach-toast-medal">${a.icon}</span>
      <span class="ach-toast-text"><b>¡Logro desbloqueado!</b><span>${escapeHtml(a.name)}</span></span>`;
    host.appendChild(el);
    if (navigator.vibrate) { try { navigator.vibrate([40, 60, 40]); } catch (_) {} }
    setTimeout(() => {
      el.style.transition = "opacity .35s, transform .35s";
      el.style.opacity = "0"; el.style.transform = "translateY(10px)";
      setTimeout(() => el.remove(), 350);
    }, 3600);
  }

  // Stats card: medal grid with unlocked at full colour and locked greyed out
  // with a progress bar. Sorted so freshly-unlocked/nearly-there float up.
  function achievementsCard() {
    const list = computeAchievements();
    const doneN = list.filter((a) => a.done).length;
    const sorted = [...list].sort((a, b) => {
      if (a.done !== b.done) return a.done ? -1 : 1;               // earned first
      if (a.done) return 0;
      return (b.cur / b.target) - (a.cur / a.target);              // then closest to unlocking
    });
    const medals = sorted.map((a) => {
      const pct = Math.round((a.cur / a.target) * 100);
      const prog = a.done
        ? `<div class="ach-earned">Conseguido</div>`
        : `<div class="ach-prog"><div class="ach-bar"><i style="width:${pct}%"></i></div><span>${fmtNum(a.cur)}/${fmtNum(a.target)}</span></div>`;
      return `<div class="ach-medal ${a.done ? "is-done tier-" + a.tier : "is-locked"}" title="${escapeHtml(a.hint)}">
        <div class="ach-icon">${a.icon}</div>
        <div class="ach-body"><div class="ach-name">${escapeHtml(a.name)}</div><div class="ach-hint">${escapeHtml(a.hint)}</div>${prog}</div>
      </div>`;
    }).join("");
    const collapsed = achCollapsed();
    return `<div class="card ach-card${collapsed ? " is-collapsed" : ""}" id="achCard">
      <button type="button" class="ach-toggle" id="achToggle" aria-expanded="${!collapsed}">
        <svg class="ach-chev" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3>Logros</h3><span class="hint">${doneN}/${list.length} desbloqueados</span>
      </button>
      <div class="ach-grid">${medals}</div>
    </div>`;
  }
  // Collapse preference, persisted locally (per device — it's a UI choice).
  // Collapsed by default: only an explicit "0" (user expanded it) keeps it open.
  function achCollapsed() { try { return localStorage.getItem("gymandjam.achCollapsed") !== "0"; } catch (_) { return true; } }
  function bindAchievements() {
    const btn = document.getElementById("achToggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const card = document.getElementById("achCard");
      const nowCollapsed = !card.classList.contains("is-collapsed");
      card.classList.toggle("is-collapsed", nowCollapsed);
      btn.setAttribute("aria-expanded", String(!nowCollapsed));
      try { localStorage.setItem("gymandjam.achCollapsed", nowCollapsed ? "1" : "0"); } catch (_) {}
    });
  }

  /* ============================================================
     VIEW: TODAY (session builder)
     ============================================================ */
  // Summary cells: strength → volume/series/exercises; cardio-only → time/distance/pace.
  function sessionSummaryCells(w, totalVol, totalSets) {
    const entries = w.entries || [];
    const cardioOnly = entries.length > 0 && entries.every((en) => {
      const ex = DB.exerciseById(en.exerciseId); return ex && ex.group === "cardio";
    });
    if (!cardioOnly) {
      return `<div class="summary-cell accent"><div class="s-label">Volumen total</div><div class="s-value">${fmtNum(totalVol)} <small>kg</small></div></div>
        <div class="summary-cell"><div class="s-label">Series</div><div class="s-value">${totalSets}</div></div>
        <div class="summary-cell"><div class="s-label">Ejercicios</div><div class="s-value">${entries.length}</div></div>`;
    }
    const { km, min } = workoutCardio(w);
    let paceKm = 0, paceMin = 0;
    entries.forEach((en) => en.sets.forEach((s) => { if ((Number(s.km) || 0) > 0) { paceKm += Number(s.km); paceMin += Number(s.min) || 0; } }));
    const pace = paceKm > 0 ? paceMin / paceKm : 0;
    const tiempo = `<div class="summary-cell accent"><div class="s-label">Tiempo</div><div class="s-value">${fmtDuration(min)}</div></div>`;
    if (km > 0) {
      return tiempo +
        `<div class="summary-cell"><div class="s-label">Distancia</div><div class="s-value">${fmtNum(Math.round(km * 10) / 10)} <small>km</small></div></div>` +
        `<div class="summary-cell"><div class="s-label">Ritmo medio</div><div class="s-value">${fmtPace(pace)} <small>/km</small></div></div>`;
    }
    return tiempo +
      `<div class="summary-cell"><div class="s-label">Series</div><div class="s-value">${totalSets}</div></div>` +
      `<div class="summary-cell"><div class="s-label">Ejercicios</div><div class="s-value">${entries.length}</div></div>`;
  }

  function renderToday() {
    if (!draft) draft = newDraft();
    const hasDraftData = !!(draft && (draft.entries.length || draft.groups.length || draft.notes));
    const draftBadge = !draft.id && hasDraftData ? `<span class="draft-badge">Borrador</span>` : "";

    const groupChips = Object.entries(G).map(([key, g]) => {
      const sel = draft.groups.includes(key);
      return `<button class="group-chip ${sel ? "is-selected" : ""}" style="--c:${g.color}" data-group="${key}">
        <span class="g-mark">${g.abbr}</span>
        <span class="g-info">
          <span class="g-name">${g.name}</span>
          <span class="g-sub">${exercisesInGroup(key)} ejercicios</span>
        </span>
      </button>`;
    }).join("");

    const totalVol = DB.workoutVolume(draft);
    const totalSets = DB.workoutSetCount(draft);
    const summaryHtml = sessionSummaryCells(draft, totalVol, totalSets);

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div class="view-head-row">
            <div>
              <span class="eyebrow">${fmtDate(draft.date, { weekday: "long" })}</span> ${draftBadge}
              <h1>${draft.id ? "Editar entreno" : "Entreno de hoy"}</h1>
              <p class="subtitle">Selecciona los grupos musculares, añade ejercicios y registra tus series.</p>
              ${(function () { const st = computeStreak(); return st > 0 ? `<div class="today-streak"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2c.5 3.5-1.5 5-3 6.5S7 12 7 14.5A5 5 0 0017 15c0-2.5-1.5-4-2.5-5.5C15.5 11 17 12 17 14a5 5 0 01-.2 1.4C18.7 14.4 20 12.4 20 10c0-4-3-6-4.5-8 .3 2-1 3-2.5 4C11.7 4.8 12.7 3.4 13 2z"/></svg><b>${st}</b> ${st === 1 ? "día" : "días"} de racha</div>` : ""; })()}
            </div>
            <div class="row wrap" style="gap:10px">
              ${DB.sortedTemplates().length ? `<button class="btn btn-ghost" id="useTemplateBtn">
                <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                Usar rutina
              </button>` : ""}
              ${DB.get().workouts.length ? `<button class="btn btn-ghost" id="reuseBtn">
                <svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Repetir
              </button>` : ""}
              <button class="btn btn-primary" id="saveSessionBtn">
                <svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Guardar entreno
              </button>
            </div>
          </div>
        </div>

        <div class="today-grid">
          <div class="card card-glow">
            <div class="row-between mb-16 wrap">
              <div class="section-title"><span class="step">1</span> Tipo de entreno</div>
              <div class="date-field">
                <label>Fecha</label>
                <input type="date" class="input" id="sessionDate" value="${draft.date}" max="${todayISO()}">
              </div>
            </div>
            <div class="group-grid">${groupChips}</div>
          </div>

          <div class="card">
            <div class="row-between mb-16 wrap">
              <div class="section-title"><span class="step">2</span> Ejercicios <span class="count-pill">${draft.entries.length}</span></div>
              <button class="btn btn-ghost btn-sm" id="addExerciseBtn">
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
                Añadir ejercicio
              </button>
            </div>
            <div id="entriesWrap">${renderEntries()}</div>
          </div>

          <div class="card">
            <div class="row-between mb-16 wrap">
              <div class="section-title"><span class="step">3</span> Notas y resumen</div>
              <button class="btn btn-ghost btn-sm" id="saveTemplateBtn" title="Guardar la estructura de este entreno como rutina reutilizable">
                <svg viewBox="0 0 24 24"><path d="M5 5h11l3 3v11H5V5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M9 5v5h5M8 19v-5h8v5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>
                Guardar como rutina
              </button>
            </div>
            <textarea class="input" id="sessionNotes" placeholder="¿Cómo te has sentido? Sensaciones, energía, molestias...">${escapeHtml(draft.notes || "")}</textarea>
            <div class="summary-row">${summaryHtml}</div>
          </div>
        </div>
      </div>`;

    bindToday();
    saveDraft();
  }

  function exercisesInGroup(key) {
    return DB.get().exercises.filter((e) => e.group === key).length;
  }

  /* --- Cardio-aware set helpers ----------------------------- */
  function isCardio(group) { return group === "cardio"; }
  function newSetFor(group) { return isCardio(group) ? { min: "", km: "" } : { weight: "", reps: "" }; }
  // Deep-copy sets so the nested `drops` array is never shared by reference
  // between a workout and a routine/copy made from it.
  function cloneSets(sets) {
    return (sets || []).map((s) => {
      const c = { ...s };
      if (Array.isArray(s.drops)) c.drops = s.drops.map((d) => ({ ...d }));
      return c;
    });
  }
  function hasDrops(s) { return Array.isArray(s.drops) && s.drops.length > 0; }
  // Unilateral (per-side) exercises: an explicit flag, or an obvious name match.
  const UNILAT_RE = /unilat|a una mano|a un brazo|a una pierna|b[úu]lgar|split squat|pistol/i;
  function nameLooksUnilateral(name) { return UNILAT_RE.test(name || ""); }
  function isUnilateral(ex) { return !!ex && ex.group !== "cardio" && (ex.unilateral === true || nameLooksUnilateral(ex.name)); }

  // Registration mode for an exercise:
  //  "cardio"   → min / km
  //  "bw"       → reps only (bodyweight, no external load)
  //  "loadable" → added weight ("lastre") + reps
  //  "weight"   → weight + reps (the default)
  // Accepts either an exercise object or a bare group string (legacy callers).
  function exMode(exOrGroup) {
    if (typeof exOrGroup === "string") return isCardio(exOrGroup) ? "cardio" : "weight";
    const ex = exOrGroup || {};
    if (ex.group === "cardio") return "cardio";
    if (ex.bw) return ex.loadable ? "loadable" : "bw";
    return "weight";
  }
  // Fields shown per exercise type: [{key, placeholder, step}]
  function setFields(exOrGroup) {
    switch (exMode(exOrGroup)) {
      case "cardio":   return [{ key: "min", ph: "min", step: "1" }, { key: "km", ph: "opcional", step: "0.1" }];
      case "bw":       return [{ key: "reps", ph: "reps", step: "1" }];
      case "loadable": return [{ key: "weight", ph: "+kg", step: "0.5" }, { key: "reps", ph: "reps", step: "1" }];
      default:         return [{ key: "weight", ph: "kg", step: "0.5" }, { key: "reps", ph: "reps", step: "1" }];
    }
  }
  function setHeadLabels(exOrGroup) {
    switch (exMode(exOrGroup)) {
      case "cardio":   return ["Tiempo (min)", 'Distancia (km) <span class="opt">opcional</span>'];
      case "bw":       return ["Reps"];
      case "loadable": return ["Lastre (+kg)", "Reps"];
      default:         return ["Peso (kg)", "Reps"];
    }
  }
  function setHasData(exOrGroup, s) {
    return exMode(exOrGroup) === "cardio"
      ? (Number(s.min) > 0 || Number(s.km) > 0)
      : Number(s.reps) > 0;
  }
  function isBwMode(exOrGroup) { const m = exMode(exOrGroup); return m === "bw" || m === "loadable"; }
  // Short, compact rendering of a set for "last time" / history.
  function fmtSetShort(exOrGroup, s) {
    const mode = exMode(exOrGroup);
    if (mode === "cardio") {
      const a = [];
      if (s.min) a.push(fmtNum(s.min) + " min");
      if (s.km) a.push(fmtNum(s.km) + " km");
      return a.join(" · ") || "—";
    }
    if (mode === "bw") return (s.side ? s.side + " " : "") + fmtNum(s.reps) + " reps";
    // loadable: "+20×8"; plain weight: "60×8"
    const w = mode === "loadable" ? "+" + fmtNum(s.weight) : fmtNum(s.weight);
    let out = (s.side ? s.side + " " : "") + w + "×" + s.reps;
    if (hasDrops(s)) out += s.drops.map((d) => " → " + fmtNum(d.weight) + "×" + d.reps).join("");
    return out;
  }
  // Per-set summary cell (right of the inputs).
  function setSummary(exOrGroup, s) {
    const mode = exMode(exOrGroup);
    if (mode === "cardio") {
      const a = [];
      if (s.km) a.push(fmtNum(s.km) + " km");
      else if (s.min) a.push(fmtNum(s.min) + " min");
      return a.join("");
    }
    if (mode === "bw") return s.reps ? fmtNum(s.reps) + " reps" : "";
    return s.weight && s.reps ? fmtNum(DB.setVolume(s)) + " kg" : "";
  }
  // Exercise header total: volume for strength, reps for bodyweight, time·distance for cardio.
  function entryTotal(exOrGroup, entry) {
    const mode = exMode(exOrGroup);
    if (mode === "cardio") {
      let min = 0, km = 0;
      entry.sets.forEach((s) => { min += Number(s.min) || 0; km += Number(s.km) || 0; });
      const a = [];
      if (min) a.push(fmtNum(min) + " min");
      if (km) a.push(fmtNum(km) + " km");
      return a.join(" · ") || "—";
    }
    if (mode === "bw") {
      const reps = entry.sets.reduce((a, s) => a + (Number(s.reps) || 0), 0);
      return fmtNum(reps) + " reps";
    }
    return fmtNum(entry.sets.reduce((a, s) => a + DB.setVolume(s), 0)) + " kg";
  }

  function renderEntries() {
    if (!draft.entries.length) {
      return `<div class="empty-hint">
        <span class="emoji">🏋️</span>
        Aún no has añadido ejercicios.<br>Pulsa <b>Añadir ejercicio</b> para empezar a registrar tus series.
      </div>`;
    }
    return draft.entries.map((en, ei) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex) return "";
      const g = G[ex.group] || { name: ex.group || "—", color: "#888", abbr: "?" };
      const cardio = isCardio(ex.group);
      const bwOnly = exMode(ex) === "bw";   // reps-only: single field, no dropset
      const uni = isUnilateral(ex);
      const fields = setFields(ex);
      // Render one <input> per field so 1-field (reps-only) and 2-field modes
      // both work off the same source of truth.
      const inputsFor = (obj, dropAttr) => fields.map((f) =>
        `<input class="set-input" type="number" inputmode="decimal" min="0" step="${f.step}" placeholder="${f.ph}" value="${obj[f.key] ?? ""}" data-field="${f.key}"${dropAttr ? " data-drop" : ""}>`
      ).join("");
      const rowCls = bwOnly ? " bw" : "";
      const last = lastPerformance(en.exerciseId, draft.id);
      const lastHtml = last ? `<div class="last-time">
        <div class="last-time-when">
          <span>Última vez</span>
          <em>${new Date(last.date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "")}</em>
        </div>
        <div class="last-time-sets">${last.sets.map((s) => `<span class="lts-set">${fmtSetShort(ex, s)}</span>`).join("")}</div>
      </div>${last.note ? `<div class="last-note"><span>📝</span>${escapeHtml(last.note)}</div>` : ""}` : "";
      // Per-exercise note for THIS session. The row is shown when a note exists
      // (or the user opened it); the header 📝 toggles it. Kept out of the way.
      const noteHtml = `<div class="ex-note-row${en.note ? "" : " hidden"}" data-ei="${ei}">
        <input class="input ex-note-input" data-ei="${ei}" maxlength="140" placeholder="Nota para hoy · p. ej. «usé goma», «bajar el peso»" value="${escapeHtml(en.note || "")}">
      </div>`;
      const setsHtml = en.sets.map((s, si) => {
        const isPR = !cardio && s.weight && s.reps && isPersonalRecord(en.exerciseId, s.weight, s.reps);
        // Dropsets stay available for loaded exercises (incl. lastre) but not for
        // reps-only bodyweight, where a "lighter descuelgue" has no meaning.
        const dropsHtml = (!cardio && !bwOnly && Array.isArray(s.drops) ? s.drops : []).map((d, dk) => `
          <div class="drop-row${rowCls}" data-ei="${ei}" data-si="${si}" data-dk="${dk}">
            <span class="drop-mark" title="Descuelgue">↓</span>
            ${uni ? "<span></span>" : ""}
            ${inputsFor(d, true)}
            <div class="set-vol">${setSummary(ex, d)}</div>
            <button class="icon-btn danger" data-action="del-drop" title="Quitar descuelgue"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>`).join("");
        return `<div class="set-group" data-ei="${ei}" data-si="${si}">
          <div class="set-row${rowCls}" data-ei="${ei}" data-si="${si}">
            <div class="set-idx">${si + 1}</div>
            ${uni ? `<button class="side-toggle${s.side ? " is-set" : ""}" data-action="side" title="Lado (Izq/Dcha)">${s.side || "·"}</button>` : ""}
            ${inputsFor(s, false)}
            <div class="set-vol">${setSummary(ex, s)} ${isPR ? '<span class="pr-tag">PR</span>' : ""}</div>
            <div class="set-actions">
              ${cardio || bwOnly ? "" : `<button class="icon-btn" data-action="add-drop" title="Dropset · añadir descuelgue"><svg viewBox="0 0 24 24"><path d="M12 5v11m0 0l-5-5m5 5l5-5M5 20h14" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`}
              <button class="icon-btn danger" data-action="del-set" title="Eliminar serie"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
            </div>
          </div>
          ${dropsHtml}
        </div>`;
      }).join("");

      return `<div class="ex-block${uni ? " uni" : ""}" data-ei="${ei}">
        <div class="ex-head">
          <div class="ex-head-main">
            <span class="ex-dot" style="background:${g.color}"></span>
            <div class="ex-name-wrap">
              <div class="ex-name">${escapeHtml(ex.name)}</div>
              <div class="ex-group">${g.name}</div>
            </div>
          </div>
          <div class="ex-head-bar">
            <div class="ex-vol">${cardio ? "Total" : "Vol"} <b>${entryTotal(ex, en)}</b></div>
            <button class="ex-note-btn${en.note ? " has-note" : ""}" data-action="toggle-note" title="Nota del ejercicio"><svg viewBox="0 0 24 24"><path d="M4 5h13l3 3v11H4zM17 5v3h3M8 13h8M8 16h5" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Notas</span></button>
            <div class="ex-menu-wrap">
              <button class="icon-btn" data-action="ex-menu" title="Más opciones" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="19" r="1.7" fill="currentColor"/></svg></button>
              <div class="ex-menu" role="menu">
                <button class="ex-menu-item" data-action="move-up" ${ei === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Subir</button>
                <button class="ex-menu-item" data-action="move-down" ${ei === draft.entries.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Bajar</button>
                <button class="ex-menu-item" data-action="swap-entry"><svg viewBox="0 0 24 24"><path d="M4 7h13l-3-3M20 17H7l3 3" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Cambiar ejercicio</button>
                <button class="ex-menu-item danger" data-action="del-entry"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v13a1 1 0 001 1h8a1 1 0 001-1V7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>Quitar ejercicio</button>
              </div>
            </div>
          </div>
        </div>
        ${lastHtml}
        ${noteHtml}
        <div class="sets-table">
          <div class="set-row set-head${rowCls}"><span></span>${uni ? "<span>Lado</span>" : ""}${setHeadLabels(ex).map((l) => `<span>${l}</span>`).join("")}<span></span><span></span></div>
          ${setsHtml}
          <button class="add-set-btn" data-action="add-set">+ Añadir serie</button>
          ${cardio ? '<div class="set-hint">La distancia es opcional — registra el tiempo y, si quieres, completa los km al terminar.</div>' : ""}
        </div>
      </div>`;
    }).join("");
  }

  // Max weight ever, per exercise. Built once and reused across every set in a
  // render and across keystrokes (history doesn't change mid-edit), instead of
  // rescanning the whole workout history on each isPersonalRecord() call.
  let prMaxCache = null;
  function invalidatePRCache() { prMaxCache = null; }
  function exerciseMaxWeight(exerciseId) {
    if (!prMaxCache) {
      prMaxCache = new Map();
      DB.get().workouts.forEach((w) => (w.entries || []).forEach((en) => {
        let m = prMaxCache.get(en.exerciseId) || 0;
        (en.sets || []).forEach((s) => { const v = Number(s.weight) || 0; if (v > m) m = v; });
        prMaxCache.set(en.exerciseId, m);
      }));
    }
    return prMaxCache.get(exerciseId) || 0;
  }
  function isPersonalRecord(exerciseId, weight, reps) {
    weight = Number(weight); reps = Number(reps);
    if (!weight || !reps) return false;
    const maxW = exerciseMaxWeight(exerciseId);
    return weight > maxW && maxW > 0;
  }

  function bindToday() {
    $("#sessionDate").addEventListener("change", (e) => { draft.date = e.target.value; });
    $("#sessionNotes").addEventListener("input", (e) => { draft.notes = e.target.value; });

    $$(".group-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const key = chip.dataset.group;
        const i = draft.groups.indexOf(key);
        if (i >= 0) draft.groups.splice(i, 1);
        else draft.groups.push(key);
        chip.classList.toggle("is-selected");
      });
    });

    $("#addExerciseBtn").addEventListener("click", openExercisePicker);
    $("#saveSessionBtn").addEventListener("click", saveSession);
    const reuseBtn = $("#reuseBtn");
    if (reuseBtn) reuseBtn.addEventListener("click", openReusePicker);
    const useTplBtn = $("#useTemplateBtn");
    if (useTplBtn) useTplBtn.addEventListener("click", openTemplatePicker);
    $("#saveTemplateBtn").addEventListener("click", promptSaveTemplate);

    bindEntries();
  }

  function bindEntries() {
    const wrap = $("#entriesWrap");
    if (!wrap) return;

    wrap.addEventListener("input", onEntryInput);
    wrap.addEventListener("click", onEntryClick);
  }
  // Close any open per-exercise "⋯" menu.
  function closeExMenus() {
    $$(".ex-menu-wrap.open").forEach((w) => {
      w.classList.remove("open");
      const b = w.querySelector('[data-action="ex-menu"]');
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }
  // A click anywhere outside an open menu closes it. Registered once.
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ex-menu-wrap")) closeExMenus();
  });

  function onEntryInput(e) {
    // Per-exercise note (this session). Stored on the entry; empty → removed so
    // it doesn't clutter the saved workout.
    const noteInput = e.target.closest(".ex-note-input");
    if (noteInput) {
      const ei = +noteInput.dataset.ei;
      const val = noteInput.value.trim();
      if (val) draft.entries[ei].note = val; else delete draft.entries[ei].note;
      const nb = noteInput.closest(".ex-block").querySelector(".ex-note-btn");
      if (nb) nb.classList.toggle("has-note", !!val);
      saveDraft();
      return;
    }
    const input = e.target.closest(".set-input");
    if (!input) return;
    const isDrop = input.hasAttribute("data-drop");
    const row = input.closest(isDrop ? ".drop-row" : ".set-row");
    const ei = +row.dataset.ei, si = +row.dataset.si;
    const field = input.dataset.field;
    const ex = DB.exerciseById(draft.entries[ei].exerciseId);
    const group = ex ? ex.group : "";
    const s = draft.entries[ei].sets[si];
    const target = isDrop ? s.drops[+row.dataset.dk] : s;
    target[field] = input.value === "" ? "" : Number(input.value);
    // Live-update this row's own volume cell…
    const rowVol = row.querySelector(".set-vol");
    if (rowVol) {
      const pr = !isDrop && !isCardio(group) && s.weight && s.reps && isPersonalRecord(draft.entries[ei].exerciseId, s.weight, s.reps);
      rowVol.innerHTML = setSummary(ex, target) + (pr ? ' <span class="pr-tag">PR</span>' : "");
    }
    // …and, when a drop changed, the parent set's total too (it sums drops).
    if (isDrop) {
      const mainVol = row.closest(".set-group").querySelector(".set-row .set-vol");
      if (mainVol) {
        const pr = !isCardio(group) && s.weight && s.reps && isPersonalRecord(draft.entries[ei].exerciseId, s.weight, s.reps);
        mainVol.innerHTML = setSummary(ex, s) + (pr ? ' <span class="pr-tag">PR</span>' : "");
      }
    }
    // Update exercise header total
    const block = row.closest(".ex-block");
    if (block) block.querySelector(".ex-vol b").textContent = entryTotal(ex, draft.entries[ei]);
    saveDraft();
  }

  function onEntryClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    // Toggle the per-exercise "⋯" menu. Close any other open menu first.
    if (action === "ex-menu") {
      const wrap = btn.closest(".ex-menu-wrap");
      const isOpen = wrap.classList.contains("open");
      closeExMenus();
      if (!isOpen) { wrap.classList.add("open"); btn.setAttribute("aria-expanded", "true"); }
      return;
    }
    // Any other action closes an open menu (the item lives inside it).
    closeExMenus();

    if (action === "add-set") {
      const ei = +btn.closest(".ex-block").dataset.ei;
      const ex = DB.exerciseById(draft.entries[ei].exerciseId);
      const group = ex ? ex.group : "";
      const sets = draft.entries[ei].sets;
      const last = sets[sets.length - 1];
      // Copy the previous set's numbers as a starting point, but never carry
      // over its drops — a fresh set isn't a dropset until you make it one.
      let next;
      if (last) { next = { ...last }; delete next.drops; } else next = newSetFor(group);
      sets.push(next);
      refreshEntries();
    } else if (action === "add-drop") {
      const row = btn.closest(".set-row");
      const ei = +row.dataset.ei, si = +row.dataset.si;
      const set = draft.entries[ei].sets[si];
      if (!Array.isArray(set.drops)) set.drops = [];
      set.drops.push({ weight: "", reps: "" });
      refreshEntries();
    } else if (action === "del-drop") {
      const row = btn.closest(".drop-row");
      const ei = +row.dataset.ei, si = +row.dataset.si, dk = +row.dataset.dk;
      const set = draft.entries[ei].sets[si];
      if (Array.isArray(set.drops)) { set.drops.splice(dk, 1); if (!set.drops.length) delete set.drops; }
      refreshEntries();
    } else if (action === "side") {
      const row = btn.closest(".set-row");
      const ei = +row.dataset.ei, si = +row.dataset.si;
      const cur = draft.entries[ei].sets[si].side || "";
      const next = cur === "" ? "I" : cur === "I" ? "D" : "";
      if (next) draft.entries[ei].sets[si].side = next; else delete draft.entries[ei].sets[si].side;
      btn.textContent = next || "·";
      btn.classList.toggle("is-set", !!next);
      saveDraft();
    } else if (action === "del-set") {
      const row = btn.closest(".set-row");
      const ei = +row.dataset.ei, si = +row.dataset.si;
      const ex = DB.exerciseById(draft.entries[ei].exerciseId);
      draft.entries[ei].sets.splice(si, 1);
      if (!draft.entries[ei].sets.length) draft.entries[ei].sets.push(newSetFor(ex ? ex.group : ""));
      refreshEntries();
    } else if (action === "toggle-note") {
      const block = btn.closest(".ex-block");
      const row = block.querySelector(".ex-note-row");
      if (row) {
        const nowHidden = !row.classList.contains("hidden");
        row.classList.toggle("hidden", nowHidden);
        if (!nowHidden) { const inp = row.querySelector(".ex-note-input"); if (inp) inp.focus(); }
      }
    } else if (action === "swap-entry") {
      openSwapPicker(+btn.closest(".ex-block").dataset.ei);
    } else if (action === "del-entry") {
      const ei = +btn.closest(".ex-block").dataset.ei;
      draft.entries.splice(ei, 1);
      refreshEntries();
    } else if (action === "move-up" || action === "move-down") {
      const ei = +btn.closest(".ex-block").dataset.ei;
      const to = action === "move-up" ? ei - 1 : ei + 1;
      if (to < 0 || to >= draft.entries.length) return;
      const arr = draft.entries;
      const tmp = arr[ei]; arr[ei] = arr[to]; arr[to] = tmp;
      refreshEntries();
    }
  }

  function refreshEntries() {
    const wrap = $("#entriesWrap");
    wrap.innerHTML = renderEntries();
    // update counters
    $(".count-pill").textContent = draft.entries.length;
    saveDraft();
  }

  function openExercisePicker() {
    if (!draft.groups.length) {
      toast("Selecciona primero un tipo de entreno", "info");
      return;
    }
    swapEi = null;           // add mode
    renderPicker("");
  }

  // Open the picker to REPLACE the exercise of an existing block, keeping its
  // sets (e.g. you planned it on cable but did it with a barbell).
  function openSwapPicker(ei) {
    if (!draft.entries[ei]) return;
    swapEi = ei;
    renderPicker("");
  }

  function renderPicker(query) {
    const all = DB.get().exercises;
    const q = query.trim().toLowerCase();
    // Prioritize selected groups, then everything
    const groupsOrder = [...draft.groups, ...Object.keys(G).filter((k) => !draft.groups.includes(k))];

    let listHtml = "";
    groupsOrder.forEach((gk) => {
      let items = all.filter((e) => e.group === gk);
      if (q) items = items.filter((e) => e.name.toLowerCase().includes(q));
      if (!items.length) return;
      const g = G[gk];
      listHtml += `<div class="picker-group-label" style="color:${g.color}">${g.name}</div>`;
      items.forEach((e) => {
        listHtml += `<button class="picker-item" data-ex="${e.id}">
          <span class="pi-dot" style="background:${g.color}"></span>
          <span class="pi-name">${escapeHtml(e.name)}</span>
        </button>`;
      });
    });

    if (!listHtml) {
      listHtml = `<div class="empty-hint" style="padding:24px">No se encontró "<b>${escapeHtml(query)}</b>".<br>Puedes crearlo desde la pestaña Ejercicios.</div>`;
    }

    const swapping = swapEi != null;
    const swapEx = swapping ? DB.exerciseById(draft.entries[swapEi].exerciseId) : null;
    const head = swapping
      ? `<h2>Cambiar ejercicio</h2><p>Elige el que hiciste en su lugar${swapEx ? ` (sustituye a «${escapeHtml(swapEx.name)}»)` : ""}. Se conservan las series.</p>`
      : `<h2>Elegir ejercicio</h2><p>Toca un ejercicio para añadirlo a tu entreno.</p>`;

    openModal(`
      <div class="modal-head">
        <div>${head}</div>
        <button class="icon-btn" id="closePicker"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="picker-search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input class="input" id="pickerSearch" placeholder="Buscar ejercicio..." value="${escapeHtml(query)}" autocomplete="off">
      </div>
      <div class="picker-list" id="pickerList">${listHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-ghost btn-block" id="createExFromPicker">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
          Crear ejercicio nuevo
        </button>
      </div>
    `);

    // Add mode adds a block; swap mode replaces the exercise of the target block.
    const pick = (id) => (swapEi != null ? swapEntry(swapEi, id) : addEntry(id));
    const search = $("#pickerSearch");
    search.focus();
    search.addEventListener("input", () => renderPicker(search.value));
    $("#closePicker").addEventListener("click", closeModal);
    $("#createExFromPicker").addEventListener("click", () => openCreateExercise(swapEx ? swapEx.group : draft.groups[0], query));
    $$("#pickerList .picker-item").forEach((it) => {
      it.addEventListener("click", () => pick(it.dataset.ex));
    });
  }

  function addEntry(exerciseId) {
    // Avoid duplicate: if already present, just add a set focus
    const ex = DB.exerciseById(exerciseId);
    const group = ex ? ex.group : "";
    let entry = draft.entries.find((en) => en.exerciseId === exerciseId);
    if (!entry) {
      entry = { exerciseId, sets: [newSetFor(group)] };
      draft.entries.push(entry);
      // auto-select its group
      if (ex && !draft.groups.includes(ex.group)) draft.groups.push(ex.group);
    } else {
      entry.sets.push(newSetFor(group));
    }
    closeModal();
    renderToday();
    toast(DB.exerciseById(exerciseId).name + " añadido", "success");
  }

  // Replace the exercise of an existing entry, keeping its logged sets. If the
  // set type changes (strength ⇄ cardio) the fields are incompatible, so we
  // reset to a single fresh set of the new type instead of leaving garbage.
  function swapEntry(ei, exerciseId) {
    const entry = draft.entries[ei];
    const newEx = DB.exerciseById(exerciseId);
    if (!entry || !newEx) { swapEi = null; closeModal(); return; }
    const oldEx = DB.exerciseById(entry.exerciseId);
    const crossType = isCardio(oldEx ? oldEx.group : "") !== isCardio(newEx.group);
    entry.exerciseId = exerciseId;
    if (crossType) entry.sets = [newSetFor(newEx.group)];
    if (!draft.groups.includes(newEx.group)) draft.groups.push(newEx.group);
    swapEi = null;
    closeModal();
    renderToday();
    toast(`Cambiado a ${newEx.name}`, "success");
  }

  function saveSession() {
    const hasData = draft.entries.some((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      return en.sets.some((s) => setHasData(ex ? ex.group : "", s));
    });
    if (!draft.groups.length) { toast("Selecciona un tipo de entreno", "error"); return; }
    if (!hasData) { toast("Añade al menos una serie con datos", "error"); return; }

    DB.saveWorkout(draft);
    toast(draft.id ? "Entreno actualizado" : "¡Entreno guardado! 💪", "success");
    checkAchievements();          // fire unlock toasts for any newly-earned logros
    draft = newDraft();
    saveDraft();
    setView("history");
  }

  /* --- Reuse a previous workout as template ------------------ */
  function openReusePicker() {
    const workouts = DB.sortedWorkouts();
    if (!workouts.length) { toast("Aún no tienes entrenos anteriores", "info"); return; }

    const rows = workouts.map((w) => {
      const d = new Date(w.date + "T00:00:00");
      const day = d.getDate();
      const mon = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
      const tags = (w.groups || []).map((k) => {
        const g = G[k]; return g ? `<span class="g-tag" style="background:${g.color}">${g.name}</span>` : "";
      }).join("");
      const exNames = (w.entries || []).map((en) => (DB.exerciseById(en.exerciseId) || {}).name).filter(Boolean);
      return `<button class="reuse-item" data-reuse="${w.id}">
        <span class="reuse-date"><b>${day}</b><span>${mon}</span></span>
        <span class="reuse-info">
          <span class="reuse-tags">${tags}</span>
          <span class="reuse-sub">${(w.entries || []).length} ejercicios · ${DB.workoutSetCount(w)} series · ${fmtNum(DB.workoutVolume(w))} kg</span>
        </span>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    }).join("");

    const warn = draft.entries.length
      ? `<p style="color:var(--neg)">Se reemplazará el entreno que tienes ahora sin guardar.</p>`
      : `<p>Se cargará con sus pesos y reps para que solo ajustes los números.</p>`;

    openModal(`
      <div class="modal-head">
        <div><h2>Repetir entreno anterior</h2>${warn}</div>
        <button class="icon-btn" id="closeReuse"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="picker-list">${rows}</div>
    `);

    $("#closeReuse").addEventListener("click", closeModal);
    $$(".reuse-item").forEach((it) => it.addEventListener("click", () => reuseWorkout(it.dataset.reuse)));
  }

  function reuseWorkout(id) {
    const w = DB.workoutById(id);
    if (!w) return;
    const entries = (w.entries || [])
      .filter((en) => DB.exerciseById(en.exerciseId))
      .map((en) => ({
        exerciseId: en.exerciseId,
        sets: cloneSets(en.sets),
      }));
    draft = { date: todayISO(), groups: [...(w.groups || [])], notes: "", entries };
    closeModal();
    renderToday();
    toast("Entreno cargado · ajusta pesos y reps", "success");
  }

  // Most recent performance of an exercise (excluding the workout being edited).
  function lastPerformance(exerciseId, excludeId) {
    const ws = DB.sortedWorkouts(); // date desc
    for (const w of ws) {
      if (excludeId && w.id === excludeId) continue;
      const en = (w.entries || []).find((e) => e.exerciseId === exerciseId);
      if (en && en.sets.length) return { date: w.date, sets: en.sets, note: en.note || "" };
    }
    return null;
  }

  /* ============================================================
     TEMPLATES (routines)
     ============================================================ */
  // Existing folder names, for the datalist suggestions.
  function folderNames() {
    return [...new Set(DB.sortedTemplates().map((t) => t.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  }
  function folderOpenKey(name) {
    return `gymandjam.templates.folder.${name}`;
  }
  function isFolderOpen(name) {
    try {
      const stored = localStorage.getItem(folderOpenKey(name));
      return stored === null ? true : stored === "1";
    } catch (_) {
      return true;
    }
  }
  function setFolderOpen(name, open) {
    try { localStorage.setItem(folderOpenKey(name), open ? "1" : "0"); } catch (_) {}
  }
  function folderField(id, value) {
    const opts = folderNames().map((f) => `<option value="${escapeHtml(f)}">`).join("");
    return `<div class="modal-field"><label>Carpeta (opcional)</label>
      <input class="input" id="${id}" list="${id}List" placeholder="Ej: Push/Pull/Legs, Volumen…" value="${escapeHtml(value || "")}" autocomplete="off">
      <datalist id="${id}List">${opts}</datalist></div>`;
  }

  function promptSaveTemplate() {
    if (!draft.entries.length) { toast("Añade ejercicios antes de guardar la rutina", "error"); return; }
    const suggested = draft.groups.map((k) => (G[k] || {}).name).filter(Boolean).join(" · ") || "Mi rutina";
    openModal(`
      <div class="modal-head">
        <div><h2>Guardar como rutina</h2><p>Guarda estos ejercicios y series como plantilla reutilizable.</p></div>
        <button class="icon-btn" id="closeTpl"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre de la rutina</label><input class="input" id="tplName" placeholder="Ej: Push A · Pecho, hombro y tríceps" value="${escapeHtml(suggested)}" autocomplete="off"></div>
      ${folderField("tplFolder", "")}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelTpl">Cancelar</button>
        <button class="btn btn-primary" id="saveTpl">Guardar rutina</button>
      </div>
    `);
    const nameInput = $("#tplName");
    nameInput.focus(); nameInput.select();
    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) { toast("Ponle un nombre a la rutina", "error"); return; }
      const folder = $("#tplFolder").value.trim();
      DB.saveTemplate({
        name,
        folder: folder || undefined,
        groups: [...draft.groups],
        entries: draft.entries.map((en) => ({
          exerciseId: en.exerciseId,
          sets: cloneSets(en.sets),
        })),
      });
      closeModal();
      toast("Rutina guardada", "success");
    };
    $("#closeTpl").addEventListener("click", closeModal);
    $("#cancelTpl").addEventListener("click", closeModal);
    $("#saveTpl").addEventListener("click", submit);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function openTemplatePicker() {
    const tpls = DB.sortedTemplates();
    if (!tpls.length) { toast("Aún no tienes rutinas guardadas", "info"); return; }

    const reuseItem = (t) => {
      const tags = (t.groups || []).map((k) => {
        const g = G[k]; return g ? `<span class="g-tag" style="background:${g.color}">${g.name}</span>` : "";
      }).join("");
      const sets = (t.entries || []).reduce((a, en) => a + en.sets.length, 0);
      return `<button class="reuse-item" data-tpl="${t.id}">
        <span class="reuse-info">
          <span class="reuse-name">${escapeHtml(t.name)}</span>
          <span class="reuse-tags">${tags}</span>
          <span class="reuse-sub">${(t.entries || []).length} ejercicios · ${sets} series planificadas</span>
        </span>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    };

    // Group by folder: loose routines first, then a collapsible section per
    // folder (remembers open/closed like the Routines view).
    const byFolder = {}; const loose = [];
    tpls.forEach((t) => { if (t.folder) (byFolder[t.folder] = byFolder[t.folder] || []).push(t); else loose.push(t); });
    const folders = Object.keys(byFolder).sort((a, b) => a.localeCompare(b, "es"));
    const chevron = '<svg class="folder-chevron" viewBox="0 0 24 24" width="16" height="16"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const folderIcon = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    let listHtml = "";
    if (loose.length) listHtml += `<div class="picker-list">${loose.map(reuseItem).join("")}</div>`;
    folders.forEach((f) => {
      listHtml += `<details class="folder picker-folder" data-folder="${escapeHtml(f)}" ${isFolderOpen(f) ? "open" : ""}>
        <summary class="folder-head">${chevron}${folderIcon}<span class="folder-name">${escapeHtml(f)}</span><span class="count-pill">${byFolder[f].length}</span></summary>
        <div class="picker-list" style="margin-top:8px">${byFolder[f].map(reuseItem).join("")}</div>
      </details>`;
    });

    const warn = draft.entries.length
      ? `<p style="color:var(--neg)">Se reemplazará el entreno que tienes ahora sin guardar.</p>`
      : `<p>Se cargará con sus pesos y reps de referencia para que solo ajustes los números.</p>`;
    openModal(`
      <div class="modal-head">
        <div><h2>Usar una rutina</h2>${warn}</div>
        <button class="icon-btn" id="closeUseTpl"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      ${listHtml}
    `);
    $("#closeUseTpl").addEventListener("click", closeModal);
    $$(".reuse-item").forEach((it) => it.addEventListener("click", () => useTemplate(it.dataset.tpl)));
    // Persist folder open/closed state, shared with the Routines view.
    $$("details.picker-folder").forEach((d) => d.addEventListener("toggle", () => setFolderOpen(d.dataset.folder, d.open)));
  }

  function templateFromWorkout(id) {
    const w = DB.workoutById(id);
    if (!w) return;
    const suggested = (w.groups || []).map((k) => (G[k] || {}).name).filter(Boolean).join(" · ") || "Mi rutina";
    openModal(`
      <div class="modal-head">
        <div><h2>Guardar como rutina</h2><p>Crea una plantilla reutilizable a partir de este entreno.</p></div>
        <button class="icon-btn" id="closeTplW"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre de la rutina</label><input class="input" id="tplNameW" value="${escapeHtml(suggested)}" autocomplete="off"></div>
      ${folderField("tplFolderW", "")}
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelTplW">Cancelar</button><button class="btn btn-primary" id="saveTplW">Guardar rutina</button></div>
    `);
    const input = $("#tplNameW"); input.focus(); input.select();
    const submit = () => {
      const name = input.value.trim();
      if (!name) { toast("Ponle un nombre a la rutina", "error"); return; }
      const folder = $("#tplFolderW").value.trim();
      DB.saveTemplate({
        name, folder: folder || undefined, groups: [...(w.groups || [])],
        entries: (w.entries || []).map((en) => ({
          exerciseId: en.exerciseId,
          sets: cloneSets(en.sets),
        })),
      });
      closeModal();
      toast("Rutina guardada", "success");
    };
    $("#closeTplW").addEventListener("click", closeModal);
    $("#cancelTplW").addEventListener("click", closeModal);
    $("#saveTplW").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function useTemplate(id) {
    const t = DB.templateById(id);
    if (!t) return;
    const entries = (t.entries || [])
      .filter((en) => DB.exerciseById(en.exerciseId))
      .map((en) => ({
        exerciseId: en.exerciseId,
        sets: cloneSets(en.sets),
      }));
    draft = { date: todayISO(), groups: [...(t.groups || [])], notes: "", entries };
    closeModal();
    setView("today");
    toast(`Rutina "${t.name}" cargada`, "success");
  }

  /* ============================================================
     VIEW: TEMPLATES (management)
     ============================================================ */
  function renderTemplates() {
    const tpls = DB.sortedTemplates();

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div class="view-head-row">
            <div>
              <span class="eyebrow">Plantillas</span>
              <h1>Rutinas</h1>
              <p class="subtitle">${tpls.length ? tpls.length + " rutinas guardadas. Pulsa Empezar para cargar una en el entreno de hoy." : "Guarda tus rutinas habituales y reutilízalas en un toque."}</p>
            </div>
            <div class="row wrap" style="gap:10px">
              ${isBackend() ? `<button class="btn btn-ghost" id="importRoutineBtn">
                <svg viewBox="0 0 24 24"><path d="M12 15V3M8 11l4 4 4-4M4 19h16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Importar rutina
              </button>` : ""}
              <button class="btn btn-primary" id="newTemplateBtn">
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
                Crear rutina
              </button>
            </div>
          </div>
        </div>
        ${tpls.length ? renderTemplateGroups(tpls)
          : `<div class="empty-hint"><span class="emoji">📋</span>Todavía no tienes rutinas.<br>Crea una desde cero, o en <b>Entreno de hoy</b> pulsa <b>Guardar como rutina</b>.</div>`}
      </div>`;

    $("#newTemplateBtn").addEventListener("click", () => { draft = newDraft(); setView("today"); toast("Monta tu rutina y pulsa «Guardar como rutina»", "info"); });
    const impBtn = $("#importRoutineBtn");
    if (impBtn) impBtn.addEventListener("click", () => openImportRoutine(""));
    $$("[data-use-tpl]").forEach((b) => b.addEventListener("click", () => useTemplate(b.dataset.useTpl)));
    $$("[data-share-tpl]").forEach((b) => b.addEventListener("click", () => shareTemplate(b.dataset.shareTpl)));
    $$("[data-share-folder]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); shareFolder(b.dataset.shareFolder); }));
    $$("[data-rename-tpl]").forEach((b) => b.addEventListener("click", () => promptRenameTemplate(b.dataset.renameTpl)));
    $$("[data-del-tpl]").forEach((b) => b.addEventListener("click", () => confirmDeleteTemplate(b.dataset.delTpl)));
    $$("details.folder[data-folder]").forEach((details) => {
      details.addEventListener("toggle", () => setFolderOpen(details.dataset.folder, details.open));
    });
  }

  // Group routines by folder into collapsible sections (ungrouped first).
  function renderTemplateGroups(tpls) {
    const byFolder = {}; const loose = [];
    tpls.forEach((t) => { if (t.folder) (byFolder[t.folder] = byFolder[t.folder] || []).push(t); else loose.push(t); });
    const folders = Object.keys(byFolder).sort((a, b) => a.localeCompare(b, "es"));
    const chevron = '<svg class="folder-chevron" viewBox="0 0 24 24" width="16" height="16"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    let html = "";
    if (loose.length) html += `<div class="tpl-grid">${loose.map(templateCard).join("")}</div>`;
    folders.forEach((f) => {
      html += `<details class="folder" data-folder="${escapeHtml(f)}" ${isFolderOpen(f) ? "open" : ""}>
        <summary class="folder-head">${chevron}<span class="folder-name">${escapeHtml(f)}</span><span class="count-pill">${byFolder[f].length}</span>${isBackend() ? `<button class="icon-btn" data-share-folder="${escapeHtml(f)}" title="Compartir carpeta" style="margin-left:auto"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}</summary>
        <div class="tpl-grid" style="margin-top:12px">${byFolder[f].map(templateCard).join("")}</div>
      </details>`;
    });
    return html;
  }

  /* ---------- Sharing routines ---------------------------- */
  function isBackend() { return !!(global.Auth && global.Auth.mode === "backend"); }

  // Portable payload: exercises by name+group (ids are per-user).
  function templateSharePayload(t) {
    return {
      name: t.name,
      groups: [...(t.groups || [])],
      entries: (t.entries || []).map((en) => {
        const ex = DB.exerciseById(en.exerciseId);
        return ex ? { name: ex.name, group: ex.group, sets: cloneSets(en.sets) } : null;
      }).filter(Boolean),
    };
  }

  async function shareTemplate(id) {
    const t = DB.templateById(id);
    if (!t) return;
    if (!isBackend()) { toast("Necesitas una cuenta para compartir", "info"); return; }
    try {
      const data = await global.Auth.api("/api/share", { method: "POST", body: { template: templateSharePayload(t) }, auth: true });
      shareLinkModal(t.name, data.code);
    } catch (err) {
      toast(err.message || "No se pudo compartir", "error");
    }
  }

  async function shareFolder(folder) {
    if (!isBackend()) { toast("Necesitas una cuenta para compartir", "info"); return; }
    const templates = DB.sortedTemplates().filter((t) => t.folder === folder);
    if (!templates.length) return;
    try {
      const data = await global.Auth.api("/api/share", { method: "POST", body: { folder, templates: templates.map(templateSharePayload) }, auth: true });
      shareLinkModal(folder, data.code, templates.length);
    } catch (err) { toast(err.message || "No se pudo compartir", "error"); }
  }

  function shareLinkModal(name, code, folderCount) {
    markSharedRoutine();   // unlock the "Compartir es vivir" achievement
    const isFolder = folderCount > 0;
    const link = location.origin + "/?rutina=" + code;
    openModal(`
      <div class="modal-head">
        <div><h2>${isFolder ? "Compartir carpeta" : "Compartir rutina"}</h2><p>Cualquiera con este enlace podrá guardar ${isFolder ? `la carpeta «${escapeHtml(name)}» (${folderCount} rutinas)` : `«${escapeHtml(name)}»`} en su perfil.</p></div>
        <button class="icon-btn" id="closeShare"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="share-box">
        <input class="input" id="shareLink" readonly value="${escapeHtml(link)}">
        <button class="btn btn-primary" id="copyShare">Copiar</button>
      </div>
      <p class="text-dim" style="font-size:12.5px;margin-top:10px">Código: <b style="color:var(--ink);font-family:'Space Grotesk'">${code}</b></p>
    `);
    $("#closeShare").addEventListener("click", closeModal);
    const input = $("#shareLink");
    $("#copyShare").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(link); }
      catch (_) { input.select(); document.execCommand && document.execCommand("copy"); }
      toast("Enlace copiado", "success");
    });
    input.addEventListener("focus", () => input.select());
  }

  function parseShareCode(text) {
    text = (text || "").trim();
    const m = text.match(/rutina=([a-z0-9]+)/i);
    if (m) return m[1];
    return text.replace(/[^a-z0-9]/gi, "");
  }

  function openImportRoutine(prefill) {
    openModal(`
      <div class="modal-head">
        <div><h2>Importar rutina</h2><p>Pega el enlace o el código que te han compartido.</p></div>
        <button class="icon-btn" id="closeImp"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Enlace o código</label><input class="input" id="impCode" placeholder="gymjam.…/?rutina=abcd… o abcd…" value="${escapeHtml(prefill || "")}" autocomplete="off"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelImp">Cancelar</button>
        <button class="btn btn-primary" id="fetchImp">Buscar rutina</button>
      </div>
    `);
    const input = $("#impCode"); input.focus();
    $("#closeImp").addEventListener("click", closeModal);
    $("#cancelImp").addEventListener("click", closeModal);
    const go = () => {
      const code = parseShareCode(input.value);
      if (!code) { toast("Introduce un enlace o código", "error"); return; }
      fetchShared(code);
    };
    $("#fetchImp").addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }

  async function fetchShared(code) {
    try {
      const data = await global.Auth.api("/api/share/" + encodeURIComponent(code));
      const share = data.share || (data.template ? { type: "routine", template: data.template } : null);
      if (!share) { toast("Rutina no válida", "error"); return; }
      if (share.type === "folder") confirmImportFolder(share);
      else confirmImportShared(share.template);
    } catch (err) {
      toast(err.message || "No se encontró la rutina", "error");
    }
  }

  function confirmImportFolder(share) {
    const templates = (share.templates || []).filter((t) => t && Array.isArray(t.entries) && t.entries.length);
    if (!templates.length) { toast("Carpeta vacía", "error"); return; }
    const folder = share.folder || "Compartida";
    const list = templates.map((t) => `<li><span class="ex-dot" style="background:var(--accent)"></span>${escapeHtml(t.name)} <em>${t.entries.length} ej.</em></li>`).join("");
    openModal(`
      <div class="modal-head">
        <div><h2>Carpeta «${escapeHtml(folder)}»</h2><p>Se añadirán ${templates.length} rutinas a tu carpeta.</p></div>
        <button class="icon-btn" id="closeCF"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <ul class="tpl-ex" style="border-top:none;padding-top:0;max-height:46vh;overflow:auto">${list}</ul>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelCF">Cancelar</button><button class="btn btn-primary" id="doImportF">Añadir ${templates.length} rutinas</button></div>
    `);
    $("#closeCF").addEventListener("click", closeModal);
    $("#cancelCF").addEventListener("click", closeModal);
    $("#doImportF").addEventListener("click", () => {
      templates.forEach((t) => importSharedTemplate(t, folder));
      closeModal();
      toast(`${templates.length} rutinas añadidas a «${folder}»`, "success");
      setView("templates");
    });
  }

  function confirmImportShared(share) {
    if (!share || !Array.isArray(share.entries)) { toast("Rutina no válida", "error"); return; }
    const tags = (share.groups || []).map((k) => {
      const g = G[k]; return g ? `<span class="g-tag" style="background:${g.color}">${g.name}</span>` : "";
    }).join("");
    const list = share.entries.map((e) => `<li><span class="ex-dot" style="background:${(G[e.group] || {}).color || "#888"}"></span>${escapeHtml(e.name)} <em>${(e.sets || []).length}×</em></li>`).join("");
    openModal(`
      <div class="modal-head">
        <div><h2>${escapeHtml(share.name || "Rutina compartida")}</h2><p>Se añadirá a tus rutinas.</p></div>
        <button class="icon-btn" id="closeCImp"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="tpl-tags" style="margin-bottom:10px">${tags}</div>
      <ul class="tpl-ex" style="border-top:none;padding-top:0">${list}</ul>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelCImp">Cancelar</button>
        <button class="btn btn-primary" id="doImport">Añadir a mis rutinas</button>
      </div>
    `);
    $("#closeCImp").addEventListener("click", closeModal);
    $("#cancelCImp").addEventListener("click", closeModal);
    $("#doImport").addEventListener("click", () => {
      const t = importSharedTemplate(share);
      closeModal();
      toast(`Rutina "${t.name}" añadida`, "success");
      setView("templates");
    });
  }

  function importSharedTemplate(share, folder) {
    const entries = (share.entries || []).map((e) => {
      const group = G[e.group] ? e.group : "pecho";
      let ex = DB.get().exercises.find((x) => x.name === e.name && x.group === group);
      if (!ex) ex = DB.addExercise(e.name, group);
      return ex ? { exerciseId: ex.id, sets: cloneSets(e.sets) } : null;
    }).filter(Boolean);
    return DB.saveTemplate({
      name: (share.name || "Rutina compartida").slice(0, 80),
      folder: folder || undefined,
      groups: (share.groups || []).filter((k) => G[k]),
      entries,
    });
  }

  // If the page was opened with ?rutina=CODE, offer to import it.
  function maybeImportSharedRoutine() {
    if (!isBackend()) return;
    const params = new URLSearchParams(location.search);
    const code = params.get("rutina");
    if (!code) return;
    history.replaceState(null, "", location.pathname);
    fetchShared(parseShareCode(code));
  }

  function templateCard(t) {
    const tags = (t.groups || []).map((k) => {
      const g = G[k]; return g ? `<span class="g-tag" style="background:${g.color}">${g.name}</span>` : "";
    }).join("");
    const exItems = (t.entries || []).map((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex) return "";
      const g = G[ex.group];
      return `<li><span class="ex-dot" style="background:${g.color}"></span>${escapeHtml(ex.name)} <em>${en.sets.length}×</em></li>`;
    }).join("");
    const sets = (t.entries || []).reduce((a, en) => a + en.sets.length, 0);

    return `<div class="card tpl-card">
      <div class="tpl-head">
        <h3 class="tpl-name">${escapeHtml(t.name)}</h3>
        <div class="row" style="gap:6px">
          ${isBackend() ? `<button class="icon-btn" data-share-tpl="${t.id}" title="Compartir"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : ""}
          <button class="icon-btn" data-rename-tpl="${t.id}" title="Renombrar"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg></button>
          <button class="icon-btn danger" data-del-tpl="${t.id}" title="Eliminar"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v13a1 1 0 001 1h8a1 1 0 001-1V7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></button>
        </div>
      </div>
      <div class="tpl-tags">${tags}</div>
      <ul class="tpl-ex">${exItems}</ul>
      <div class="tpl-foot">
        <span class="tpl-meta">${(t.entries || []).length} ejercicios · ${sets} series</span>
        <button class="btn btn-accent btn-sm" data-use-tpl="${t.id}">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" stroke="currentColor" stroke-width="1.6" fill="currentColor" stroke-linejoin="round"/></svg>
          Empezar
        </button>
      </div>
    </div>`;
  }

  function promptRenameTemplate(id) {
    const t = DB.templateById(id);
    if (!t) return;
    openModal(`
      <div class="modal-head"><div><h2>Editar rutina</h2></div>
        <button class="icon-btn" id="closeRen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre</label><input class="input" id="renName" value="${escapeHtml(t.name)}" autocomplete="off"></div>
      ${folderField("renFolder", t.folder || "")}
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelRen">Cancelar</button><button class="btn btn-primary" id="saveRen">Guardar</button></div>
    `);
    const input = $("#renName"); input.focus(); input.select();
    const submit = () => {
      const name = input.value.trim(); if (!name) { toast("Ponle un nombre", "error"); return; }
      const folder = $("#renFolder").value.trim();
      const tpl = DB.templateById(id);
      if (tpl) { tpl.name = name; if (folder) tpl.folder = folder; else delete tpl.folder; DB.save(); }
      closeModal(); toast("Rutina actualizada", "success"); renderTemplates();
    };
    $("#closeRen").addEventListener("click", closeModal);
    $("#cancelRen").addEventListener("click", closeModal);
    $("#saveRen").addEventListener("click", submit);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  function confirmDeleteTemplate(id) {
    const t = DB.templateById(id);
    if (!t) return;
    openModal(`
      <div class="modal-head"><div><h2>Eliminar rutina</h2><p>Esto no afecta a tus entrenos registrados.</p></div></div>
      <p class="text-dim">Se eliminará la rutina <b style="color:var(--ink)">${escapeHtml(t.name)}</b>.</p>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelDelT">Cancelar</button><button class="btn btn-danger" id="confirmDelT">Sí, eliminar</button></div>
    `);
    $("#cancelDelT").addEventListener("click", closeModal);
    $("#confirmDelT").addEventListener("click", () => { DB.deleteTemplate(id); closeModal(); toast("Rutina eliminada", "info"); renderTemplates(); });
  }

  /* ============================================================
     VIEW: HISTORY
     ============================================================ */
  function renderHistory() {
    const workouts = DB.sortedWorkouts();

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div class="view-head-row">
            <div>
              <span class="eyebrow">Registro completo</span>
              <h1>Historial</h1>
              <p class="subtitle">${workouts.length ? workouts.length + " entrenos registrados. Toca uno para ver el detalle." : "Todavía no has registrado ningún entreno."}</p>
            </div>
            <button class="btn btn-primary" id="newFromHistory">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              Nuevo entreno
            </button>
          </div>
        </div>
        ${workouts.length ? `<div class="history-list">${workouts.map(historyCard).join("")}</div>`
          : `<div class="empty-hint"><span class="emoji">📅</span>Sin entrenos aún.<br>Empieza registrando tu <b>primer entreno</b> de hoy.</div>`}
      </div>`;

    $("#newFromHistory").addEventListener("click", () => { draft = newDraft(); setView("today"); });
    $$(".history-top").forEach((top) => {
      top.addEventListener("click", () => top.closest(".history-card").classList.toggle("is-open"));
    });
    $$("[data-edit]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); editWorkout(b.dataset.edit); }));
    $$("[data-del]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); confirmDeleteWorkout(b.dataset.del); }));
    $$("[data-tpl-from]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); templateFromWorkout(b.dataset.tplFrom); }));
  }

  function historyCard(w) {
    const d = new Date(w.date + "T00:00:00");
    const day = d.getDate();
    const mon = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
    const vol = DB.workoutVolume(w);
    const sets = DB.workoutSetCount(w);
    const cardioOnly = (w.entries || []).length > 0 && (w.entries || []).every((en) => {
      const ex = DB.exerciseById(en.exerciseId); return ex && ex.group === "cardio";
    });
    let metricsHtml;
    if (cardioOnly) {
      const cc = workoutCardio(w);
      metricsHtml = `<div class="history-metric"><b>${fmtDuration(cc.min)}</b><span>tiempo</span></div>` +
        (cc.km > 0
          ? `<div class="history-metric"><b>${fmtNum(Math.round(cc.km * 10) / 10)}</b><span>km</span></div>` +
            `<div class="history-metric"><b>${fmtPace(cc.min / cc.km)}</b><span>ritmo /km</span></div>`
          : `<div class="history-metric"><b>${sets}</b><span>series</span></div>`);
    } else {
      metricsHtml = `<div class="history-metric"><b>${fmtNum(vol)}</b><span>kg volumen</span></div>
          <div class="history-metric"><b>${sets}</b><span>series</span></div>`;
    }
    const groupTags = (w.groups || []).map((k) => {
      const g = G[k]; if (!g) return "";
      return `<span class="g-tag" style="background:${g.color}">${g.name}</span>`;
    }).join("");
    const exNames = (w.entries || []).map((en) => (DB.exerciseById(en.exerciseId) || {}).name).filter(Boolean);

    const body = (w.entries || []).map((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex) return "";
      const g = G[ex.group] || { name: ex.group || "—", color: "#888" };
      const bw = isBwMode(ex);
      const pills = en.sets.map((s) => isCardio(ex.group)
        ? `<span class="set-pill">${s.min ? `<b>${fmtNum(s.min)}</b> min` : ""}${s.min && s.km ? " · " : ""}${s.km ? `<b>${fmtNum(s.km)}</b> km` : ""}</span>`
        : bw
        ? `<span class="set-pill">${s.side ? `<span class="side-badge">${s.side}</span> ` : ""}${exMode(ex) === "loadable" && s.weight ? `+<b>${fmtNum(s.weight)}</b>kg × ` : ""}<b>${s.reps || 0}</b> reps</span>`
        : `<span class="set-pill${hasDrops(s) ? " has-drops" : ""}">${s.side ? `<span class="side-badge">${s.side}</span> ` : ""}<b>${fmtNum(s.weight)}</b>kg × <b>${s.reps}</b>${hasDrops(s) ? s.drops.map((d) => `<span class="drop-seg">↓ <b>${fmtNum(d.weight)}</b>×<b>${d.reps}</b></span>`).join("") : ""}</span>`
      ).join("");
      let pacePill = "";
      if (isCardio(ex.group)) {
        let km = 0, min = 0;
        en.sets.forEach((s) => { km += Number(s.km) || 0; min += Number(s.min) || 0; });
        if (km > 0) pacePill = `<span class="set-pill pace-pill"><b>${fmtPace(min / km)}</b> /km</span>`;
      }
      return `<div class="history-ex">
        <div class="history-ex-name"><span class="ex-dot" style="background:${g.color}"></span>${escapeHtml(ex.name)}</div>
        <div class="history-sets">${pills}${pacePill}</div>
        ${en.note ? `<div class="history-note"><span>📝</span>${escapeHtml(en.note)}</div>` : ""}
      </div>`;
    }).join("");

    return `<div class="history-card card">
      <div class="history-top">
        <div class="history-date">
          <div class="hd-day">${day}</div>
          <div class="hd-mon">${mon}</div>
        </div>
        <div class="history-info">
          <div class="history-groups">${groupTags}</div>
          <div class="history-summary">${escapeHtml(exNames.slice(0, 3).join(" · "))}${exNames.length > 3 ? " +" + (exNames.length - 3) : ""}</div>
        </div>
        <div class="history-metrics">${metricsHtml}</div>
        <svg class="history-chevron" viewBox="0 0 24 24" width="20" height="20"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="history-body">
        ${body}
        ${w.notes ? `<div class="history-ex text-dim" style="font-size:13px"><b style="color:var(--text-faint);font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.5px">Nota</b><br>${escapeHtml(w.notes)}</div>` : ""}
        <div class="history-actions">
          <button class="btn btn-ghost btn-sm" data-edit="${w.id}"><svg viewBox="0 0 24 24"><path d="M4 20h4L18 10l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>Editar</button>
          <button class="btn btn-ghost btn-sm" data-tpl-from="${w.id}"><svg viewBox="0 0 24 24"><path d="M5 5h11l3 3v11H5V5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M9 5v5h5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>Guardar como rutina</button>
          <button class="btn btn-danger btn-sm" data-del="${w.id}"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v13a1 1 0 001 1h8a1 1 0 001-1V7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>Eliminar</button>
        </div>
      </div>
    </div>`;
  }

  function editWorkout(id) {
    const w = DB.workoutById(id);
    if (!w) return;
    draft = JSON.parse(JSON.stringify(w));
    setView("today");
    toast("Editando entreno del " + fmtDate(w.date, { day: "numeric", month: "long" }), "info");
  }

  function confirmDeleteWorkout(id) {
    const w = DB.workoutById(id);
    openModal(`
      <div class="modal-head"><div><h2>Eliminar entreno</h2><p>Esta acción no se puede deshacer.</p></div></div>
      <p class="text-dim">Se eliminará el entreno del <b style="color:var(--text)">${fmtDate(w.date)}</b> con ${DB.workoutSetCount(w)} series registradas.</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelDel">Cancelar</button>
        <button class="btn btn-danger" id="confirmDel">Sí, eliminar</button>
      </div>
    `);
    $("#cancelDel").addEventListener("click", closeModal);
    $("#confirmDel").addEventListener("click", () => {
      DB.deleteWorkout(id);
      closeModal();
      toast("Entreno eliminado", "info");
      render();
    });
  }

  /* ============================================================
     VIEW: STATS
     ============================================================ */
  function renderStats() {
    const workouts = DB.sortedWorkouts();

    if (!workouts.length) {
      main.innerHTML = `<div class="view"><div class="view-head"><span class="eyebrow">Progreso</span><h1>Estadísticas</h1></div>
        <div class="empty-hint"><span class="emoji">📊</span>Aún no hay datos.<br>Registra tus entrenos y aquí verás tu <b>progreso, records y volumen</b>.</div></div>`;
      return;
    }

    const hasCardio = workouts.some((w) => (w.entries || []).some((en) => {
      const ex = DB.exerciseById(en.exerciseId); return ex && ex.group === "cardio";
    }));
    const hasStrength = workouts.some((w) => (w.entries || []).some((en) => {
      const ex = DB.exerciseById(en.exerciseId); return ex && ex.group !== "cardio";
    }));
    if (statsTab === "cardio" && !hasCardio && hasStrength) statsTab = "fuerza";
    if (statsTab === "fuerza" && !hasStrength && hasCardio) statsTab = "cardio";

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <span class="eyebrow">Progreso</span>
          <h1>Estadísticas</h1>
          <p class="subtitle">Tu rendimiento de un vistazo. Los números no mienten.</p>
        </div>
        ${heatmapCard()}
        ${achievementsCard()}
        <div class="seg" id="statsSeg">
          <button class="seg-btn ${statsTab === "fuerza" ? "is-active" : ""}" data-tab="fuerza">Fuerza</button>
          <button class="seg-btn ${statsTab === "cardio" ? "is-active" : ""}" data-tab="cardio">Cardio</button>
        </div>
        <div id="statsBody"></div>
      </div>`;

    bindHeatmap();
    bindAchievements();
    $$("#statsSeg .seg-btn").forEach((b) => b.addEventListener("click", () => {
      if (statsTab === b.dataset.tab) return;
      statsTab = b.dataset.tab;
      renderStats();
    }));

    if (statsTab === "cardio") fillCardioStats(workouts);
    else fillStrengthStats(workouts);
  }

  function fillStrengthStats(workouts) {
    const stats = computeStats(workouts);
    $("#statsBody").innerHTML = `
        <div class="stat-grid">
          ${statCard("Volumen total", fmtNum(stats.totalVolume), "kg movidos")}
          ${statCard("Entrenos", stats.count, "sesiones", stats.weekDelta)}
          ${statCard("Sesiones / sem", fmtNum(stats.sessionsPerWeek), "últimas 4 sem")}
          ${statCard("Racha actual", computeStreak(), "días seguidos")}
          ${statCard("Media / sesión", fmtNum(stats.avgVolume), "kg volumen")}
          ${statCard("Series totales", fmtNum(stats.totalSets), "de fuerza")}
        </div>

        ${lastWorkoutComparisonCard()}

        <div class="chart-grid">
          <div class="card chart-card">
            <div class="chart-head"><h3>Volumen por sesión</h3><span class="hint">Últimas ${stats.volumeSeries.length} sesiones</span></div>
            <div class="chart-wrap">${Charts.lineChart(stats.volumeSeries, { color: "#e0451f", color2: "#c07a1e", unit: "kg" })}</div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Reparto por grupo</h3><span class="hint">Series por músculo</span></div>
            <div class="row wrap" style="gap:18px;align-items:center;justify-content:center">
              <div style="max-width:220px;flex:1;min-width:180px">${Charts.donutChart(stats.groupDist, { centerLabel: String(stats.totalSets), centerSub: "series", unit: "series" })}</div>
              <div class="legend" style="flex-direction:column;gap:8px">${stats.groupDist.map((d) => `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span><b>${d.label}</b> · ${d.value} series</div>`).join("")}</div>
            </div>
          </div>

          <div class="card chart-card">
            <div class="chart-head">
              <h3>Progresión de fuerza</h3>
              <select class="select select-inline" id="progExercise">${stats.exerciseOptions}</select>
            </div>
            <div class="chart-wrap" id="progChart">${Charts.lineChart(stats.progSeries, { color: "#2e7d46", color2: "#2f6690", unit: "kg" })}</div>
            <div class="legend"><div class="legend-item"><span class="legend-dot" style="background:#2e7d46"></span>1RM estimado (Epley)</div></div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Volumen semanal</h3><span class="hint">Últimas 8 semanas</span></div>
            <div class="chart-wrap">${Charts.barChart(stats.weeklyVolume, { color: "#2f6690", unit: "kg" })}</div>
          </div>
        </div>

        <div class="card mt-24">
          <div class="section-title mb-16">Records personales <span class="count-pill">${stats.records.length}</span></div>
          ${stats.records.length ? stats.records.map((r, i) => {
            const recent = r.date && daysBetween(todayISO(), r.date) <= 30;
            return `
            <div class="record-row">
              <div class="record-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
              <div>
                <div class="record-name">${escapeHtml(r.name)}${recent ? ' <span class="pr-recent">nuevo</span>' : ""}</div>
                <div class="record-meta">${r.group} · ${r.bestReps} reps · 1RM est. ${fmtNum(r.oneRM)} kg</div>
              </div>
              <div class="record-val"><b>${fmtNum(r.maxWeight)} kg</b><span>mejor marca</span></div>
            </div>`; }).join("") : '<div class="text-dim">Registra más series para ver tus records.</div>'}
        </div>

        ${trainedYearsCard()}`;

    const sel = $("#progExercise");
    if (sel) {
      sel.value = statsExercise || sel.value;
      sel.addEventListener("change", () => {
        statsExercise = sel.value;
        $("#progChart").innerHTML = Charts.lineChart(progressionSeries(sel.value), { color: "#2e7d46", color2: "#2f6690", unit: "kg" });
      });
    }
  }

  /* ---------- Cardio dashboard ------------------------------ */
  const CARDIO_PALETTE = ["#a5324a", "#c07a1e", "#2f6690", "#3f7350", "#6b53a3", "#1f8a80", "#b0572f", "#6f8b2f"];

  function fillCardioStats(workouts) {
    const cs = computeCardioStats(workouts);
    const body = $("#statsBody");
    if (!cs.sessions) {
      body.innerHTML = `<div class="empty-hint"><span class="emoji">🏃</span>Aún no has registrado cardio.<br>Añade un ejercicio de <b>Cardio</b> con tiempo o distancia y verás aquí tu progreso.</div>`;
      return;
    }
    body.innerHTML = `
        <div class="stat-grid">
          ${statCard("Distancia total", fmtNum(Math.round(cs.totalKm * 10) / 10), "km recorridos")}
          ${statCard("Tiempo total", fmtDuration(cs.totalMin), "en movimiento")}
          ${statCard("Sesiones", cs.sessions, "de cardio")}
          ${statCard("Ritmo medio", fmtPace(cs.avgPace), "min/km")}
        </div>

        <div class="chart-grid">
          <div class="card chart-card">
            <div class="chart-head"><h3>Distancia por sesión</h3><span class="hint">km</span></div>
            <div class="chart-wrap">${Charts.lineChart(cs.distanceSeries, { color: "#a5324a", color2: "#c07a1e", unit: "km" })}</div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Reparto por actividad</h3><span class="hint">${cs.useKm ? "por distancia" : "por tiempo"}</span></div>
            <div class="row wrap" style="gap:18px;align-items:center;justify-content:center">
              <div style="max-width:220px;flex:1;min-width:180px">${Charts.donutChart(cs.activityDist, { centerLabel: cs.useKm ? fmtNum(Math.round(cs.totalKm)) : String(Math.round(cs.totalMin)), centerSub: cs.useKm ? "km" : "min", unit: cs.useKm ? "km" : "min" })}</div>
              <div class="legend" style="flex-direction:column;gap:8px">${cs.activityDist.map((d) => `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span><b>${escapeHtml(d.label)}</b> · ${fmtNum(d.value)} ${cs.useKm ? "km" : "min"}</div>`).join("")}</div>
            </div>
          </div>

          <div class="card chart-card">
            <div class="chart-head">
              <h3>Progresión de ritmo</h3>
              <select class="select select-inline" id="paceExercise">${cs.exerciseOptions}</select>
            </div>
            <div class="chart-wrap" id="paceChart">${Charts.lineChart(cs.paceSeries, { color: "#2f6690", color2: "#1f8a80", unit: "min/km" })}</div>
            <div class="legend"><div class="legend-item"><span class="legend-dot" style="background:#2f6690"></span>min/km · cuanto más bajo, mejor ↓</div></div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Distancia semanal</h3><span class="hint">Últimas 8 semanas · km</span></div>
            <div class="chart-wrap">${Charts.barChart(cs.weeklyDistance, { color: "#a5324a", unit: "km" })}</div>
          </div>
        </div>

        <div class="card mt-24">
          <div class="section-title mb-16">🏆 Records de cardio <span class="count-pill">${cs.records.length}</span></div>
          ${cs.records.length ? cs.records.map((r, i) => {
            const meta = [];
            if (r.bestPace) meta.push("mejor ritmo " + fmtPace(r.bestPace) + " /km");
            if (r.maxKm && r.maxMin) meta.push("sesión más larga " + fmtDuration(r.maxMin));
            return `<div class="record-row">
              <div class="record-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
              <div>
                <div class="record-name">${escapeHtml(r.name)}</div>
                <div class="record-meta">${meta.join(" · ") || "—"}</div>
              </div>
              <div class="record-val"><b>${r.maxKm ? fmtNum(Math.round(r.maxKm * 10) / 10) + " km" : fmtDuration(r.maxMin)}</b><span>${r.maxKm ? "más lejos" : "más tiempo"}</span></div>
            </div>`;
          }).join("") : '<div class="text-dim">Registra más cardio para ver tus records.</div>'}
        </div>`;

    const sel = $("#paceExercise");
    if (sel) {
      sel.value = cardioExercise || sel.value;
      sel.addEventListener("change", () => {
        cardioExercise = sel.value;
        $("#paceChart").innerHTML = Charts.lineChart(cardioPaceSeries(sel.value), { color: "#2f6690", color2: "#1f8a80", unit: "min/km" });
      });
    }
  }

  function statCard(label, value, sub, delta) {
    let deltaHtml = "";
    if (delta !== undefined && delta !== null && delta !== 0) {
      const up = delta > 0;
      deltaHtml = `<div class="stat-delta ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${Math.abs(delta)} vs. semana anterior</div>`;
    }
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value} <small>${sub}</small></div>
      ${deltaHtml}
    </div>`;
  }

  function computeStats(workouts) {
    const asc = [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1));
    // Only sessions that actually moved weight count for strength volume.
    const strengthWk = asc.filter((w) => DB.workoutVolume(w) > 0);
    const totalVolume = strengthWk.reduce((a, w) => a + DB.workoutVolume(w), 0);
    const count = asc.length;
    const avgVolume = strengthWk.length ? totalVolume / strengthWk.length : 0;

    // volume series (last 14 weighted sessions)
    const volumeSeries = strengthWk.slice(-14).map((w) => ({
      label: dateShort(w.date),
      value: DB.workoutVolume(w),
    }));

    // group distribution (strength series only)
    const groupCounts = {};
    let totalSets = 0;
    asc.forEach((w) => (w.entries || []).forEach((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex || ex.group === "cardio") return;
      groupCounts[ex.group] = (groupCounts[ex.group] || 0) + en.sets.length;
      totalSets += en.sets.length;
    }));
    const groupDist = Object.entries(groupCounts)
      .map(([k, v]) => ({ label: (G[k] || {}).name || k, value: v, color: (G[k] || {}).color || "#888" }))
      .sort((a, b) => b.value - a.value);

    // weekly volume (last 8 weeks)
    const weeklyVolume = computeWeeklyVolume(asc);

    // this week vs last week (# workouts)
    const weekDelta = computeWeekDelta(asc);

    // exercise options + default progression
    const usedExIds = [...new Set(asc.flatMap((w) => (w.entries || []).map((en) => en.exerciseId)))];
    const usedEx = usedExIds.map((id) => DB.exerciseById(id)).filter((e) => e && e.group !== "cardio");
    usedEx.sort((a, b) => a.name.localeCompare(b.name));
    const exerciseOptions = usedEx.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
    if (!statsExercise || !usedEx.find((e) => e.id === statsExercise)) {
      statsExercise = usedEx.length ? usedEx[0].id : null;
    }
    const progSeries = statsExercise ? progressionSeries(statsExercise) : [];

    // records
    const records = computeRecords(asc);

    // training frequency over the last 4 weeks (any workout counts)
    const cutoff = isoOf(new Date(Date.now() - 27 * 86400000));
    const sessionsPerWeek = Math.round((asc.filter((w) => w.date >= cutoff).length / 4) * 10) / 10;

    return { totalVolume, count, avgVolume, totalSets, volumeSeries, groupDist, weeklyVolume, weekDelta, exerciseOptions, progSeries, records, sessionsPerWeek };
  }

  function progressionSeries(exerciseId) {
    const asc = DB.sortedWorkouts().sort((a, b) => (a.date < b.date ? -1 : 1));
    const series = [];
    asc.forEach((w) => {
      (w.entries || []).forEach((en) => {
        if (en.exerciseId !== exerciseId) return;
        let best = 0;
        en.sets.forEach((s) => {
          const orm = DB.estimate1RM(s.weight, s.reps);
          if (orm > best) best = orm;
        });
        if (best > 0) {
          series.push({
            label: new Date(w.date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "numeric" }),
            value: Math.round(best),
          });
        }
      });
    });
    return series.slice(-14);
  }

  /* ---------- Cardio computations ---------- */
  function dateShort(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "numeric" });
  }
  function fmtDuration(min) {
    min = Math.round(Number(min) || 0);
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), m = min % 60;
    return h + "h" + (m ? " " + String(m).padStart(2, "0") : "");
  }
  function fmtPace(p) {
    if (!p || !isFinite(p)) return "—";
    const m = Math.floor(p), s = Math.round((p - m) * 60);
    return (s === 60 ? m + 1 : m) + ":" + String(s === 60 ? 0 : s).padStart(2, "0");
  }
  // Distance/time totals of the cardio entries in a workout.
  function workoutCardio(w) {
    let km = 0, min = 0;
    (w.entries || []).forEach((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex || ex.group !== "cardio") return;
      en.sets.forEach((s) => { km += Number(s.km) || 0; min += Number(s.min) || 0; });
    });
    return { km, min };
  }

  function computeCardioStats(workouts) {
    const asc = [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1));
    let totalKm = 0, totalMin = 0, paceKm = 0, paceMin = 0;
    const cardioSessions = [];
    asc.forEach((w) => {
      const { km, min } = workoutCardio(w);
      if (km > 0 || min > 0) { cardioSessions.push({ w, km, min }); totalKm += km; totalMin += min; }
      (w.entries || []).forEach((en) => {
        const ex = DB.exerciseById(en.exerciseId);
        if (!ex || ex.group !== "cardio") return;
        en.sets.forEach((s) => { if ((Number(s.km) || 0) > 0) { paceKm += Number(s.km); paceMin += Number(s.min) || 0; } });
      });
    });
    const sessions = cardioSessions.length;
    const avgPace = paceKm > 0 ? paceMin / paceKm : 0;

    const distanceSeries = cardioSessions.filter((c) => c.km > 0).slice(-14)
      .map((c) => ({ label: dateShort(c.w.date), value: Math.round(c.km * 10) / 10 }));

    const weeklyDistance = computeWeeklyCardio(asc);

    // distribution by activity (km, or minutes if no distance at all)
    const totals = {};
    asc.forEach((w) => (w.entries || []).forEach((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex || ex.group !== "cardio") return;
      if (!totals[ex.id]) totals[ex.id] = { km: 0, min: 0 };
      en.sets.forEach((s) => { totals[ex.id].km += Number(s.km) || 0; totals[ex.id].min += Number(s.min) || 0; });
    }));
    const useKm = totalKm > 0;
    const activityDist = Object.entries(totals)
      .map(([id, t]) => ({ label: (DB.exerciseById(id) || {}).name || "—", value: Math.round((useKm ? t.km : t.min) * 10) / 10 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .map((d, i) => ({ ...d, color: CARDIO_PALETTE[i % CARDIO_PALETTE.length] }));

    const usedIds = [...new Set(asc.flatMap((w) => (w.entries || []).map((en) => en.exerciseId)))];
    const usedEx = usedIds.map((id) => DB.exerciseById(id)).filter((e) => e && e.group === "cardio");
    usedEx.sort((a, b) => a.name.localeCompare(b.name));
    const exerciseOptions = usedEx.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
    if (!cardioExercise || !usedEx.find((e) => e.id === cardioExercise)) {
      cardioExercise = usedEx.length ? usedEx[0].id : null;
    }
    const paceSeries = cardioExercise ? cardioPaceSeries(cardioExercise) : [];
    const records = computeCardioRecords(asc);

    return { totalKm, totalMin, sessions, avgPace, distanceSeries, weeklyDistance, activityDist, useKm, exerciseOptions, paceSeries, records };
  }

  function cardioPaceSeries(exerciseId) {
    const asc = DB.sortedWorkouts().sort((a, b) => (a.date < b.date ? -1 : 1));
    const series = [];
    asc.forEach((w) => {
      let km = 0, min = 0;
      (w.entries || []).forEach((en) => {
        if (en.exerciseId !== exerciseId) return;
        en.sets.forEach((s) => { km += Number(s.km) || 0; min += Number(s.min) || 0; });
      });
      if (km > 0 && min > 0) series.push({ label: dateShort(w.date), value: Math.round((min / km) * 100) / 100 });
    });
    return series.slice(-14);
  }

  function computeWeeklyCardio(asc) {
    const weeks = {};
    asc.forEach((w) => { weeks[weekKey(w.date)] = (weeks[weekKey(w.date)] || 0) + workoutCardio(w).km; });
    const buckets = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7);
      const key = weekKey(isoOf(d));
      const label = mondayOf(d).toLocaleDateString("es-ES", { day: "numeric", month: "numeric" });
      buckets.push({ label, value: Math.round((weeks[key] || 0) * 10) / 10 });
    }
    return buckets;
  }

  function computeCardioRecords(asc) {
    const map = {};
    asc.forEach((w) => {
      const per = {};
      (w.entries || []).forEach((en) => {
        const ex = DB.exerciseById(en.exerciseId);
        if (!ex || ex.group !== "cardio") return;
        if (!per[ex.id]) per[ex.id] = { km: 0, min: 0 };
        en.sets.forEach((s) => { per[ex.id].km += Number(s.km) || 0; per[ex.id].min += Number(s.min) || 0; });
      });
      Object.entries(per).forEach(([id, t]) => {
        const ex = DB.exerciseById(id);
        if (!map[id]) map[id] = { id, name: ex.name, maxKm: 0, maxMin: 0, bestPace: Infinity };
        const r = map[id];
        if (t.km > r.maxKm) r.maxKm = t.km;
        if (t.min > r.maxMin) r.maxMin = t.min;
        if (t.km > 0 && t.min > 0) { const p = t.min / t.km; if (p < r.bestPace) r.bestPace = p; }
      });
    });
    return Object.values(map)
      .map((r) => ({ ...r, bestPace: isFinite(r.bestPace) ? r.bestPace : 0 }))
      .sort((a, b) => (b.maxKm - a.maxKm) || (b.maxMin - a.maxMin))
      .slice(0, 8);
  }

  function computeWeeklyVolume(asc) {
    const weeks = {};
    asc.forEach((w) => {
      const key = weekKey(w.date);
      weeks[key] = (weeks[key] || 0) + DB.workoutVolume(w);
    });
    // build last 8 week buckets ending this week
    const buckets = [];
    const now = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const key = weekKey(isoOf(d));
      const label = mondayOf(d).toLocaleDateString("es-ES", { day: "numeric", month: "numeric" });
      buckets.push({ label, value: Math.round(weeks[key] || 0) });
    }
    return buckets;
  }

  function computeWeekDelta(asc) {
    const thisWeek = weekKey(todayISO());
    const lastD = new Date(); lastD.setDate(lastD.getDate() - 7);
    const lastWeek = weekKey(isoOf(lastD));
    let tw = 0, lw = 0;
    asc.forEach((w) => {
      const k = weekKey(w.date);
      if (k === thisWeek) tw++;
      else if (k === lastWeek) lw++;
    });
    return tw - lw;
  }

  function computeRecords(asc) {
    const map = {};
    asc.forEach((w) => (w.entries || []).forEach((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex || ex.group === "cardio") return;
      en.sets.forEach((s) => {
        const wgt = Number(s.weight) || 0, reps = Number(s.reps) || 0;
        if (!reps) return;
        const orm = DB.estimate1RM(wgt, reps);
        if (!map[en.exerciseId]) map[en.exerciseId] = { id: en.exerciseId, name: ex.name, group: (G[ex.group] || {}).name || ex.group, maxWeight: 0, bestReps: 0, oneRM: 0, date: null };
        const rec = map[en.exerciseId];
        if (wgt > rec.maxWeight) { rec.maxWeight = wgt; rec.bestReps = reps; rec.date = w.date; }
        if (orm > rec.oneRM) rec.oneRM = orm;
      });
    }));
    return Object.values(map).filter((r) => r.maxWeight > 0).sort((a, b) => b.oneRM - a.oneRM).slice(0, 8);
  }

  /* ---------- Last workout vs. the previous time ------------- */
  // Per-exercise metrics for one session. Strength keeps top weight, volume,
  // best estimated 1RM and total reps; cardio keeps distance, time and pace.
  function exerciseMetrics(group, sets) {
    sets = sets || [];
    if (group === "cardio") {
      let km = 0, min = 0;
      sets.forEach((s) => { km += Number(s.km) || 0; min += Number(s.min) || 0; });
      return { km, min, pace: km > 0 && min > 0 ? min / km : 0 };
    }
    let maxW = 0, vol = 0, best1rm = 0, reps = 0;
    sets.forEach((s) => {
      const w = Number(s.weight) || 0, r = Number(s.reps) || 0;
      if (r <= 0) return;           // ignore blank/half-entered sets
      if (w > maxW) maxW = w;
      vol += w * r; reps += r;
      const o = DB.estimate1RM(w, r); if (o > best1rm) best1rm = o;
    });
    return { maxW, vol, best1rm, reps };
  }

  // Compare a session's metrics for one exercise against a previous session.
  // Picks the single fairest metric so we never compare apples to oranges:
  //  · Strength, both loaded → estimated 1RM (accounts for the weight×reps
  //    trade-off, e.g. 100×5 vs 105×3).
  //  · Strength, both bodyweight (no external load) → total reps.
  //  · Strength, one loaded + one bodyweight → not comparable (load changed).
  //  · Cardio → pace if both logged distance+time; else distance; else time.
  // Returns null when there's no honest comparison to make.
  function compareEntryMetrics(group, cur, prev) {
    let metric, curV, prevV, higherBetter, fmtV;
    if (group === "cardio") {
      if (prev.pace > 0 && cur.pace > 0) { metric = "Ritmo"; curV = cur.pace; prevV = prev.pace; higherBetter = false; fmtV = (v) => fmtPace(v) + " /km"; }
      else if (prev.km > 0 && cur.km > 0) { metric = "Distancia"; curV = cur.km; prevV = prev.km; higherBetter = true; fmtV = (v) => fmtNum(Math.round(v * 10) / 10) + " km"; }
      else if (prev.min > 0 && cur.min > 0) { metric = "Tiempo"; curV = cur.min; prevV = prev.min; higherBetter = true; fmtV = (v) => fmtDuration(v); }
      else return null;
    } else {
      if (prev.maxW > 0 && cur.maxW > 0) { metric = "1RM est."; curV = cur.best1rm; prevV = prev.best1rm; higherBetter = true; fmtV = (v) => fmtNum(Math.round(v)) + " kg"; }
      else if (prev.maxW === 0 && cur.maxW === 0 && prev.reps > 0 && cur.reps > 0) { metric = "Reps"; curV = cur.reps; prevV = prev.reps; higherBetter = true; fmtV = (v) => Math.round(v) + " reps"; }
      else return null;
    }
    const diff = curV - prevV;
    // Tolerance so float noise / an identical re-log reads as "igual", not a change.
    const eps = metric === "Ritmo" ? 0.03 : metric === "1RM est." ? 0.4 : 0.001;
    const verdict = Math.abs(diff) <= eps ? "same" : ((diff > 0) === higherBetter ? "up" : "down");
    const pct = prevV > 0 ? (diff / prevV) * 100 : null;
    return { metric, verdict, curText: fmtV(curV), prevText: fmtV(prevV), pct };
  }

  // Compare your most recent training DAY to each exercise's previous outing.
  // A single day can hold more than one saved record (e.g. push + pull logged
  // separately), so we merge every set trained that day per exercise, and
  // compare against the most recent *earlier day* that has the same exercise
  // (its sets merged too). This avoids same-day records comparing against each
  // other and keeps "último entreno" meaning "your last training day".
  function mergedSetsFor(workouts, exId) {
    const sets = [];
    workouts.forEach((w) => (w.entries || []).forEach((e) => { if (e.exerciseId === exId) sets.push(...(e.sets || [])); }));
    return sets;
  }
  function compareLastWorkout() {
    const ws = DB.sortedWorkouts(); // date desc
    if (!ws.length) return null;
    const lastDate = ws[0].date;
    const lastDay = ws.filter((w) => w.date === lastDate);

    // Exercises trained on the last day, in the order they appear.
    const order = [];
    lastDay.forEach((w) => (w.entries || []).forEach((en) => { if (!order.includes(en.exerciseId)) order.push(en.exerciseId); }));

    const rows = [];
    let up = 0, down = 0, same = 0, fresh = 0;
    order.forEach((exId) => {
      const ex = DB.exerciseById(exId);
      if (!ex) return;
      const curSets = mergedSetsFor(lastDay, exId);
      // Most recent earlier day containing this exercise (ws is date-desc).
      const prevW = ws.find((w) => w.date < lastDate && (w.entries || []).some((e) => e.exerciseId === exId));
      if (!prevW) { fresh++; rows.push({ name: ex.name, group: ex.group, fresh: true }); return; }
      const prevSets = mergedSetsFor(ws.filter((w) => w.date === prevW.date), exId);
      const cmp = compareEntryMetrics(ex.group, exerciseMetrics(ex.group, curSets), exerciseMetrics(ex.group, prevSets));
      if (!cmp) { rows.push({ name: ex.name, group: ex.group, na: true }); return; }
      if (cmp.verdict === "up") up++; else if (cmp.verdict === "down") down++; else same++;
      rows.push({ name: ex.name, group: ex.group, prevDate: prevW.date, ...cmp });
    });
    return { date: lastDate, rows, up, down, same, fresh };
  }

  function lastWorkoutComparisonCard() {
    const c = compareLastWorkout();
    if (!c || !c.rows.length) return "";
    const dateLabel = fmtDate(c.date, { day: "numeric", month: "long" });
    const chip = (n, cls, label) => (n ? `<span class="cmp-chip ${cls}">${label} ${n}</span>` : "");
    const summary = chip(c.up, "up", "↑ Mejor") + chip(c.same, "same", "= Igual") + chip(c.down, "down", "↓ Peor") + chip(c.fresh, "fresh", "★ Nuevo");
    const rows = c.rows.map((r) => {
      const g = G[r.group] || {};
      let right, meta;
      if (r.fresh) { right = `<div class="cmp-val fresh"><b>Primera vez</b></div>`; meta = "Sin registro anterior"; }
      else if (r.na) { right = `<div class="cmp-val na"><b>—</b></div>`; meta = "Cambió el tipo de carga"; }
      else {
        const arrow = r.verdict === "up" ? "↑" : r.verdict === "down" ? "↓" : "=";
        const pctText = (r.pct != null && r.verdict !== "same") ? ` · ${r.pct > 0 ? "+" : ""}${Math.round(r.pct)}%` : "";
        right = `<div class="cmp-val ${r.verdict}"><b>${arrow} ${r.curText}</b><span>antes ${r.prevText}${pctText}</span></div>`;
        meta = r.metric;
      }
      return `<div class="cmp-row">
        <span class="ex-dot" style="background:${g.color || "#888"}"></span>
        <div class="cmp-info"><div class="cmp-name">${escapeHtml(r.name)}</div><div class="cmp-metric">${meta}</div></div>
        ${right}
      </div>`;
    }).join("");
    return `<div class="card mt-24">
      <div class="section-title">Tu último entreno</div>
      <p class="text-dim" style="font-size:12.5px;margin:-6px 0 14px">${dateLabel} · comparado con la vez anterior de cada ejercicio</p>
      <div class="cmp-summary">${summary}</div>
      <div class="cmp-list">${rows}</div>
    </div>`;
  }

  // Per-day training load (total sets, strength + cardio) for the heatmap, so
  // every training day lights up regardless of whether weight was moved.
  function trainingHeatData() {
    const byDay = {};
    DB.get().workouts.forEach((w) => {
      if (!w.date) return;
      byDay[w.date] = (byDay[w.date] || 0) + DB.workoutSetCount(w);
    });
    return Object.entries(byDay).map(([date, value]) => ({ date, value }));
  }

  function heatmapCard() {
    if (!DB.get().workouts.length) return "";
    const legend = `<div class="heat-legend"><span>menos</span>${Charts.heatScale().map((c) => `<span class="hl-swatch" style="background:${c}"></span>`).join("")}<span>más</span></div>`;
    return `<div class="card chart-card" id="heatCard">
      <div class="chart-head">
        <h3>Constancia</h3>
        <div class="seg seg-sm" id="heatSeg">
          <button class="seg-btn ${heatWeeks === 26 ? "is-active" : ""}" data-weeks="26">6 meses</button>
          <button class="seg-btn ${heatWeeks === 53 ? "is-active" : ""}" data-weeks="53">1 año</button>
        </div>
      </div>
      <div class="heatmap-wrap">${Charts.heatmap(trainingHeatData(), { weeks: heatWeeks, unit: "series" })}</div>
      ${legend}
    </div>`;
  }
  function bindHeatmap() {
    const seg = $("#heatSeg");
    if (!seg) return;
    seg.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => {
      const wk = +b.dataset.weeks;
      if (wk === heatWeeks) return;
      heatWeeks = wk;
      seg.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("is-active", +x.dataset.weeks === wk));
      const wrap = $("#heatCard .heatmap-wrap");
      if (wrap) wrap.innerHTML = Charts.heatmap(trainingHeatData(), { weeks: heatWeeks, unit: "series" });
    }));
  }

  // Total distinct training days per calendar year (current year highlighted,
  // past years kept on record).
  function trainedYearsCard() {
    const years = trainedDaysByYear();
    if (!years.length) return "";
    const cur = String(new Date().getFullYear());
    const curDays = (years.find((y) => y.year === cur) || { days: 0 }).days;
    const past = years.filter((y) => y.year !== cur);
    const pastRows = past.map((y) => `<div class="record-row">
      <div class="record-rank">${y.year.slice(2)}</div>
      <div><div class="record-name">${y.year}</div><div class="record-meta">temporada cerrada</div></div>
      <div class="record-val"><b>${y.days}</b><span>días</span></div>
    </div>`).join("");
    return `<div class="card mt-24">
      <div class="section-title mb-16">Días entrenados por año</div>
      <div class="year-hero"><span class="year-hero-num">${curDays}</span><span class="year-hero-sub">días entrenados en <b>${cur}</b></span></div>
      ${pastRows}
    </div>`;
  }

  function isoOf(d) {
    const x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  }
  function mondayOf(date) {
    const d = typeof date === "string" ? new Date(date + "T00:00:00") : new Date(date);
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return d;
  }
  function weekKey(iso) {
    const m = mondayOf(iso);
    return isoOf(m);
  }

  /* ============================================================
     VIEW: EXERCISES (library)
     ============================================================ */
  function renderExercises() {
    const exercises = DB.get().exercises;
    const filtered = libFilter === "all" ? exercises : exercises.filter((e) => e.group === libFilter);
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    const filters = [`<button class="filter-chip ${libFilter === "all" ? "is-active" : ""}" data-filter="all">Todos <span class="count-pill" style="margin-left:2px">${exercises.length}</span></button>`]
      .concat(Object.entries(G).map(([k, g]) => {
        const n = exercises.filter((e) => e.group === k).length;
        return `<button class="filter-chip ${libFilter === k ? "is-active" : ""}" data-filter="${k}"><span class="fc-dot" style="background:${g.color}"></span>${g.name} ${n ? `<span style="opacity:.6">${n}</span>` : ""}</button>`;
      })).join("");

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div class="view-head-row">
            <div>
              <span class="eyebrow">Biblioteca</span>
              <h1>Ejercicios</h1>
              <p class="subtitle">${exercises.length} ejercicios disponibles. Crea los tuyos y aparecerán al registrar.</p>
            </div>
            <button class="btn btn-primary" id="newExerciseBtn">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              Nuevo ejercicio
            </button>
          </div>
        </div>
        <div class="picker-search" style="margin-bottom:14px">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <input class="input" id="libSearch" placeholder="Buscar ejercicio…" value="${escapeHtml(libSearch)}" autocomplete="off">
        </div>
        <div class="lib-filters">${filters}</div>
        <div class="lib-grid">
          ${filtered.map((e) => {
            const g = G[e.group];
            const imgs = resolveMedia(e);
            const icon = imgs.length
              ? `<img class="lib-thumb" src="${imgs[0]}" loading="lazy" alt="" onerror="this.remove()">`
              : g.abbr;
            return `<div class="card lib-card" data-open-ex="${e.id}" data-search="${escapeHtml(normText(e.name))}">
              <div class="lib-icon" style="background:${g.color}1a;color:${g.color}">${icon}</div>
              <div style="min-width:0">
                <div class="lib-name">${escapeHtml(e.name)}</div>
                <div class="lib-cat">${g.name}</div>
              </div>
              ${e.custom ? `<button class="icon-btn danger" data-del-ex="${e.id}" title="Eliminar" style="margin-left:auto"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`
                : `<span class="lib-badge">BASE</span>`}
            </div>`;
          }).join("") || `<div class="empty-hint" style="grid-column:1/-1">No hay ejercicios en este grupo.</div>`}
          <div class="empty-hint" id="libEmpty" hidden style="grid-column:1/-1">Sin resultados. Prueba otra palabra o crea el ejercicio.</div>
        </div>
      </div>`;

    $("#newExerciseBtn").addEventListener("click", () => openCreateExercise(libFilter !== "all" ? libFilter : "pecho", ""));
    $$("[data-filter]").forEach((b) => b.addEventListener("click", () => { libFilter = b.dataset.filter; renderExercises(); }));
    $$("[data-del-ex]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const ex = DB.exerciseById(b.dataset.delEx);
      DB.deleteExercise(b.dataset.delEx);
      renderExercises();
      if (ex) toastUndo(`«${ex.name}» eliminado`, () => { DB.addExercise(ex.name, ex.group, ex.unilateral); renderExercises(); });
    }));
    $$("[data-open-ex]").forEach((c) => c.addEventListener("click", () => openExerciseDetail(c.dataset.openEx)));
    const searchInput = $("#libSearch");
    const applyLibSearch = () => {
      const q = normText(libSearch);
      let shown = 0;
      $$(".lib-card").forEach((c) => { const ok = !q || (c.dataset.search || "").includes(q); c.style.display = ok ? "" : "none"; if (ok) shown++; });
      const emp = $("#libEmpty"); if (emp) emp.hidden = !(q && shown === 0);
    };
    if (searchInput) {
      searchInput.addEventListener("input", () => { libSearch = searchInput.value; applyLibSearch(); });
      applyLibSearch();
    }
  }

  // Resolve media URLs for an exercise: explicit URL wins, else the bundled dataset map.
  function resolveMedia(ex) {
    // Only bundled, first-party images (no user-supplied URLs).
    const map = window.EXERCISE_MEDIA || {};
    const base = window.EXERCISE_MEDIA_BASE || "";
    const paths = map[ex.name + "@@" + ex.group] || map[ex.name];
    if (!paths || !paths.length) return [];
    return paths.map((p) => (p.indexOf("http") === 0 || p.charAt(0) === "/") ? p : base + p);
  }

  function exerciseDetailStats(id, group) {
    let count = 0, last = null, bestW = 0, best1rm = 0, maxKm = 0, maxMin = 0, bestPace = Infinity;
    DB.sortedWorkouts().forEach((w) => {
      const en = (w.entries || []).find((e) => e.exerciseId === id);
      if (!en) return;
      count++;
      if (!last) last = w.date;
      if (group === "cardio") {
        let km = 0, min = 0;
        en.sets.forEach((s) => { km += Number(s.km) || 0; min += Number(s.min) || 0; });
        if (km > maxKm) maxKm = km;
        if (min > maxMin) maxMin = min;
        if (km > 0 && min > 0) { const p = min / km; if (p < bestPace) bestPace = p; }
      } else {
        en.sets.forEach((s) => {
          if ((Number(s.weight) || 0) > bestW) bestW = Number(s.weight);
          const o = DB.estimate1RM(s.weight, s.reps);
          if (o > best1rm) best1rm = o;
        });
      }
    });
    return { count, last, bestW, best1rm, maxKm, maxMin, bestPace: isFinite(bestPace) ? bestPace : 0 };
  }

  function openExerciseDetail(id) {
    const ex = DB.exerciseById(id);
    if (!ex) return;
    const g = G[ex.group];
    const imgs = resolveMedia(ex);
    const st = exerciseDetailStats(id, ex.group);

    const mediaInner = imgs.length
      ? `<img class="frame-a" src="${imgs[0]}" alt="${escapeHtml(ex.name)}" loading="lazy" onerror="this.closest('.ex-media-frame').classList.add('img-error')">
         ${imgs[1] ? `<img class="frame-b" src="${imgs[1]}" alt="" loading="lazy">` : ""}`
      : "";
    const mediaFrame = `<div class="ex-media-frame ${imgs.length > 1 ? "animate" : ""} ${imgs.length ? "" : "img-error"}" style="--c:${g.color}">
        ${mediaInner}
        <div class="ex-media-empty"><span class="ex-media-mark">${g.abbr}</span><span>Sin imagen</span></div>
      </div>`;

    let statLine;
    if (ex.group === "cardio") {
      statLine = st.count
        ? `${st.count} sesiones · ${st.maxKm ? "más lejos " + fmtNum(Math.round(st.maxKm * 10) / 10) + " km" : "máx " + fmtDuration(st.maxMin)}${st.bestPace ? " · mejor ritmo " + fmtPace(st.bestPace) + " /km" : ""}`
        : "Todavía no lo has registrado en ningún entreno";
    } else {
      statLine = st.count
        ? `${st.count} sesiones · PR ${fmtNum(st.bestW)} kg · 1RM est. ${fmtNum(Math.round(st.best1rm))} kg`
        : "Todavía no lo has registrado en ningún entreno";
    }
    const lastLine = st.last ? "Última vez: " + fmtDate(st.last, { day: "numeric", month: "long", year: "numeric" }) : "";

    openModal(`
      <div class="modal-head">
        <div>
          <h2>${escapeHtml(ex.name)}</h2>
          <p><span class="g-tag" style="background:${g.color}">${g.name}</span>${ex.custom ? ' <span class="lib-badge">TUYO</span>' : ""}</p>
        </div>
        <button class="icon-btn" id="closeDetail"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      ${mediaFrame}
      <div class="ex-detail-stats">
        <div class="eds-line">${statLine}</div>
        ${lastLine ? `<div class="eds-sub">${lastLine}</div>` : ""}
      </div>
      ${ex.group !== "cardio" ? `<label class="check-row"><input type="checkbox" id="uniDetail" ${isUnilateral(ex) ? "checked" : ""}><span>Unilateral <small>— muestra Izq/Dcha por serie</small></span></label>` : ""}
      <div class="modal-actions">
        ${ex.custom ? `<button class="btn btn-danger" id="delDetail">Eliminar</button>` : ""}
        <button class="btn btn-primary" id="startFromDetail">Usar en el entreno</button>
      </div>
    `);

    $("#closeDetail").addEventListener("click", closeModal);
    const uniDetail = $("#uniDetail");
    if (uniDetail) uniDetail.addEventListener("change", () => {
      DB.setUnilateral(id, uniDetail.checked);
      if (currentView === "today" && draft && draft.entries.some((en) => en.exerciseId === id)) refreshEntries();
    });
    $("#startFromDetail").addEventListener("click", () => {
      closeModal();
      if (!draft) draft = newDraft();
      addEntry(id);
    });
    const delBtn = $("#delDetail");
    if (delBtn) delBtn.addEventListener("click", () => {
      DB.deleteExercise(id);
      closeModal();
      toast("Ejercicio eliminado", "info");
      renderExercises();
    });
  }

  function openCreateExercise(defaultGroup, defaultName) {
    const groupOpts = Object.entries(G).map(([k, g]) => `<option value="${k}" ${k === defaultGroup ? "selected" : ""}>${g.name}</option>`).join("");
    openModal(`
      <div class="modal-head"><div><h2>Nuevo ejercicio</h2><p>Se añadirá a tu biblioteca personal.</p></div>
        <button class="icon-btn" id="closeCreate"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre del ejercicio</label><input class="input" id="exName" placeholder="Ej: Press inclinado en multipower" value="${escapeHtml(defaultName || "")}" autocomplete="off"></div>
      <div class="modal-field"><label>Grupo muscular</label><select class="select" id="exGroup">${groupOpts}</select></div>
      <label class="check-row" id="uniRow"><input type="checkbox" id="exUni"><span>Unilateral <small>— registra cada lado (Izq/Dcha) por separado</small></span></label>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelCreate">Cancelar</button>
        <button class="btn btn-primary" id="saveCreate">Crear ejercicio</button>
      </div>
    `);
    const nameInput = $("#exName");
    const uniInput = $("#exUni");
    let uniTouched = false;
    uniInput.addEventListener("change", () => { uniTouched = true; });
    // Auto-suggest the flag from the name until the user sets it manually.
    const suggestUni = () => { if (!uniTouched) uniInput.checked = nameLooksUnilateral(nameInput.value); };
    nameInput.addEventListener("input", suggestUni);
    suggestUni();
    nameInput.focus();
    $("#closeCreate").addEventListener("click", closeModal);
    $("#cancelCreate").addEventListener("click", closeModal);
    const submit = () => {
      const name = nameInput.value.trim();
      const group = $("#exGroup").value;
      if (!name) { toast("Escribe un nombre", "error"); return; }
      const ex = DB.addExercise(name, group, uniInput.checked);
      closeModal();
      toast("Ejercicio creado ✓", "success");
      if (currentView === "exercises") renderExercises();
      else if (currentView === "today" && draft) { if (swapEi != null) swapEntry(swapEi, ex.id); else addEntry(ex.id); }
    };
    $("#saveCreate").addEventListener("click", submit);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  /* ============================================================
     IMPORT / EXPORT
     ============================================================ */
  function closeActiveTools() {
    closeToolsMenu();
    if (global.RestTimer && typeof global.RestTimer.close === "function") global.RestTimer.close();
    if (!backdrop.hidden) closeModal();
  }

  /* ---------- kg ⇄ lb converter ---------- */
  function openConverter() {
    closeActiveTools();
    openModal(`
      <div class="modal-head">
        <h2 style="flex:1;font-size:20px">Conversor kg ⇄ lb</h2>
        <button class="icon-btn" id="closeConv"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="conv-row">
        <div class="modal-field"><label>Kilogramos</label><input class="input" id="convKg" type="number" step="0.1" inputmode="decimal" placeholder="0"></div>
        <span class="conv-eq">⇄</span>
        <div class="modal-field"><label>Libras</label><input class="input" id="convLb" type="number" step="0.1" inputmode="decimal" placeholder="0"></div>
      </div>
    `);
    const kg = $("#convKg"), lb = $("#convLb");
    kg.addEventListener("input", () => { const v = numLoc(kg.value); lb.value = kg.value === "" ? "" : (v * 2.2046226).toFixed(2); });
    lb.addEventListener("input", () => { const v = numLoc(lb.value); kg.value = lb.value === "" ? "" : (v / 2.2046226).toFixed(2); });
    $("#closeConv").addEventListener("click", closeModal);
    kg.focus();
  }
  (function () { const b = document.getElementById("convBtn"); if (b) b.addEventListener("click", openConverter); })();

  /* ---------- 1RM calculator ---------- */
  const ORM_PCTS = [100, 95, 90, 85, 80, 75, 70, 65, 60];
  function open1RM() {
    closeActiveTools();
    openModal(`
      <div class="modal-head">
        <h2 style="flex:1;font-size:20px">Calculadora de 1RM</h2>
        <button class="icon-btn" id="closeOrm"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="conv-row">
        <div class="modal-field"><label>Peso (kg)</label><input class="input" id="ormKg" type="number" step="0.5" min="0" inputmode="decimal" placeholder="0"></div>
        <div class="modal-field"><label>Repeticiones</label><input class="input" id="ormReps" type="number" step="1" min="1" max="20" inputmode="numeric" placeholder="reps"></div>
      </div>
      <div class="orm-result" id="ormResult"></div>
    `);
    const kg = $("#ormKg"), reps = $("#ormReps");
    const round = (w) => Math.round(w * 2) / 2;   // nearest 0.5 kg
    const calc = () => {
      const w = numLoc(kg.value), r = Math.round(numLoc(reps.value));
      const box = $("#ormResult");
      if (!w || !r || r < 1) { box.innerHTML = `<div class="orm-hint">Introduce el peso y las repeticiones que haces para estimar tu 1RM.</div>`; return; }
      const orm = DB.estimate1RM(w, r);
      const rows = ORM_PCTS.map((p) => {
        const pw = round(orm * p / 100);
        const er = p === 100 ? 1 : Math.max(1, Math.round(30 * (orm / pw - 1)));
        return `<div class="orm-row"><span class="orm-pct">${p}%</span><span>${fmtNum(pw)} kg</span><span>~${er} rep${er === 1 ? "" : "s"}</span></div>`;
      }).join("");
      box.innerHTML = `
        <div class="orm-hero">
          <div class="orm-big"><span class="orm-num">${fmtNum(round(orm))}</span><span class="orm-unit">kg</span></div>
          <div class="orm-sub">1RM estimado · fórmula de Epley</div>
        </div>
        <div class="orm-table"><div class="orm-row orm-head"><span>% 1RM</span><span>Peso</span><span>Aprox.</span></div>${rows}</div>`;
    };
    kg.addEventListener("input", calc);
    reps.addEventListener("input", calc);
    reps.addEventListener("keydown", (e) => { if (e.key === "Enter") kg.blur(); });
    $("#closeOrm").addEventListener("click", closeModal);
    calc();
    kg.focus();
  }
  (function () { const b = document.getElementById("ormBtn"); if (b) b.addEventListener("click", open1RM); })();

  /* ---------- Tools menu ---------- */
  const TOOL_ITEMS_HTML = `
    <button class="tool-item" id="toolTimer">
      <svg viewBox="0 0 24 24" fill="none"><path d="M7 3h10M7 21h10M8 3c0 4.5 4 5.5 4 9s-4 4.5-4 9M16 3c0 4.5-4 5.5-4 9s4 4.5 4 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Temporizador
    </button>
    <button class="tool-item" id="toolStopwatch">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2M9 2h6M12 5V2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Cronómetro
    </button>
    <button class="tool-item" id="toolConv">
      <svg viewBox="0 0 24 24" fill="none"><path d="M7 4H3m0 0l3-3M3 4l3 3M17 20h4m0 0l-3 3m3-3l-3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 4h9a4 4 0 013 7M17 20H8a4 4 0 01-3-7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>
      Conversor kg ⇄ lb
    </button>
    <button class="tool-item" id="tool1RM">
      <svg viewBox="0 0 24 24" fill="none"><path d="M6.5 8.5v7M3.5 10v4M17.5 8.5v7M20.5 10v4M6.5 12h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      Calculadora de 1RM
    </button>`;

  function wireToolItems(root, dismiss) {
    root.querySelector("#toolTimer").addEventListener("click", () => { dismiss(); global.RestTimer.open("rest", openTools); });
    root.querySelector("#toolStopwatch").addEventListener("click", () => { dismiss(); global.RestTimer.open("stopwatch", openTools); });
    root.querySelector("#toolConv").addEventListener("click", () => { dismiss(); openConverter(); });
    root.querySelector("#tool1RM").addEventListener("click", () => { dismiss(); open1RM(); });
  }

  let toolsMenuEl = null;
  function closeToolsMenu() {
    if (toolsMenuEl) toolsMenuEl.classList.remove("show");
  }

  // Mobile: dropdown anchored to the top-bar button. On desktop the sidebar
  // already lists the tools, so the only caller there is a tool's "back"
  // button → fall back to a centered dialog.
  function showToolsMenu(btn) {
    if (!toolsMenuEl) {
      toolsMenuEl = document.createElement("div");
      toolsMenuEl.className = "tools-menu"; toolsMenuEl.id = "toolsMenu";
      document.body.appendChild(toolsMenuEl);
      document.addEventListener("click", (e) => {
        if (toolsMenuEl && toolsMenuEl.classList.contains("show") && !toolsMenuEl.contains(e.target) && !btn.contains(e.target)) toolsMenuEl.classList.remove("show");
      });
    }
    toolsMenuEl.innerHTML = TOOL_ITEMS_HTML;
    wireToolItems(toolsMenuEl, closeToolsMenu);
    toolsMenuEl.classList.add("show");
  }

  function openTools() {
    const btn = document.getElementById("toolsBtn");
    closeActiveTools();
    // getClientRects() is truthy whenever the button is actually rendered
    // (mobile top bar). offsetParent can be null under a fixed top bar, which
    // wrongly fell back to the centered dialog.
    if (btn && btn.getClientRects().length) { showToolsMenu(btn); return; }
    openModal(`
      <div class="modal-head">
        <div><h2>Herramientas</h2></div>
        <button class="icon-btn" id="closeTools"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="tools-list">${TOOL_ITEMS_HTML}</div>
    `);
    $("#closeTools").addEventListener("click", closeModal);
    wireToolItems(document, closeModal);
  }
  global.__toolsBack = openTools;
  window.addEventListener("resize", () => {
    const btn = document.getElementById("toolsBtn");
    if (toolsMenuEl && (!btn || !btn.getClientRects().length)) closeToolsMenu();
  });
  (function () {
    const b = document.getElementById("toolsBtn");
    if (b) b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (toolsMenuEl && toolsMenuEl.classList.contains("show")) toolsMenuEl.classList.remove("show");
      else openTools();
    });
  })();

  /* ============================================================
     NUTRITION (Alimentación)
     ============================================================ */
  const MEALS = [["desayuno", "Desayuno"], ["comida", "Comida"], ["cena", "Cena"], ["snack", "Snacks"]];
  let foodSearchTimer = null;

  function N() { return DB.get().nutrition; }
  function addDays(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); }
  function ensureDay(date) {
    const log = N().log;
    if (!log[date]) log[date] = { desayuno: [], comida: [], cena: [], snack: [] };
    const d = log[date];
    MEALS.forEach(([k]) => { if (!Array.isArray(d[k])) d[k] = []; });
    return d;
  }
  function dayLog(date) {
    const d = N().log[date] || {};
    return { desayuno: d.desayuno || [], comida: d.comida || [], cena: d.cena || [], snack: d.snack || [] };
  }
  function dayTotals(date) {
    const d = dayLog(date); let kcal = 0, p = 0, c = 0, f = 0;
    MEALS.forEach(([k]) => d[k].forEach((e) => {
      const g = (Number(e.grams) || 0) / 100;
      kcal += (Number(e.kcal) || 0) * g; p += (Number(e.protein) || 0) * g;
      c += (Number(e.carbs) || 0) * g; f += (Number(e.fat) || 0) * g;
    }));
    return { kcal, protein: p, carbs: c, fat: f };
  }
  function hasFoodData(date) { const d = dayLog(date); return MEALS.some(([k]) => d[k].length); }

  // Parse a number tolerating comma decimals.
  function numLoc(v) { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) ? n : 0; }
  // Normalize height to cm (guard against meters like "1,61").
  function heightCm(v) { let h = numLoc(v); if (h > 0 && h < 3) h = h * 100; return Math.round(h); }

  // Mifflin-St Jeor BMR → TDEE → target by goal; macros from bodyweight.
  function computeTargets(profile) {
    const w = numLoc(profile.weight), h = heightCm(profile.height), a = numLoc(profile.age);
    if (!w || !h || !a) return null;
    const bmr = 10 * w + 6.25 * h - 5 * a + (profile.sex === "female" ? -161 : 5);
    const AF = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 };
    const tdee = bmr * (AF[profile.activity] || 1.55);
    const GF = { cut: -0.20, maintain: 0, bulk: 0.12 };
    const kcal = Math.round(tdee * (1 + (GF[profile.goal] != null ? GF[profile.goal] : 0)));
    const protein = Math.round(w * 2.0);
    const fat = Math.round((kcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const bmi = w / Math.pow(h / 100, 2);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat, bmi, water: waterGoalForWeight(w) };
  }
  function bmiCategory(bmi) {
    if (bmi < 18.5) return "Bajo peso";
    if (bmi < 25) return "Normal";
    if (bmi < 30) return "Sobrepeso";
    return "Obesidad";
  }

  function macroRing(consumed, target) {
    const R = 52, C = 2 * Math.PI * R;
    const frac = target > 0 ? Math.min(1, consumed / target) : 0;
    const over = target > 0 && consumed > target * 1.02;
    const col = over ? "var(--neg)" : "var(--accent)";
    return `<svg viewBox="0 0 120 120" class="kcal-ring">
      <circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
      <circle cx="60" cy="60" r="${R}" fill="none" style="stroke:${col}" stroke-width="11" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - frac)).toFixed(1)}"/>
    </svg>`;
  }
  function macroBar(label, consumed, target, color) {
    const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
    return `<div class="macro-bar">
      <div class="mb-top"><span>${label}</span><span><b>${Math.round(consumed)}</b> / ${Math.round(target)} g</span></div>
      <div class="mb-track"><div class="mb-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;
  }

  /* ---------- Water ---------- */
  const GLASS_ML = 250;
  // Daily goal ≈ 35 ml per kg of body weight (rounded to a glass), fallback 2.5 L.
  function waterGoalForWeight(w) {
    let ml = w > 0 ? Math.round((w * 35) / GLASS_ML) * GLASS_ML : 2500;
    return Math.max(1500, Math.min(4000, ml));
  }
  function waterGoalMl() { return waterGoalForWeight(numLoc(N().profile.weight)); }
  function dayWater(date) { return Number(N().water[date]) || 0; }
  function setWater(date, ml) {
    ml = Math.max(0, Math.round(ml));
    if (ml) N().water[date] = ml; else delete N().water[date];
    DB.save();
  }
  const GLASS_SVG = '<svg viewBox="0 0 24 24"><path d="M6 3h12l-1.3 16.2a1.6 1.6 0 0 1-1.6 1.5H8.9a1.6 1.6 0 0 1-1.6-1.5L6 3z"/></svg>';
  function waterCardHtml() {
    const cur = dayWater(foodDate), goal = waterGoalMl();
    const goalGlasses = Math.round(goal / GLASS_ML);
    const filled = Math.round(cur / GLASS_ML);
    const shown = Math.min(20, Math.max(goalGlasses, filled));
    const litres = (ml) => (ml / 1000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " L";
    let glasses = "";
    for (let i = 0; i < shown; i++) glasses += `<button class="water-glass${i < filled ? " is-full" : ""}" data-glass="${i}" title="${(i + 1) * GLASS_ML} ml">${GLASS_SVG}</button>`;
    const done = goal > 0 && cur >= goal;
    return `<div class="card water-card mt-16">
      <div class="water-top">
        <div><div class="water-title">💧 Agua</div><div class="water-sub">${litres(cur)} de ${litres(goal)}${done ? " · ¡meta! 🎉" : ""}</div></div>
        <div class="row" style="gap:8px">
          <button class="icon-btn" id="waterMinus" title="Quitar vaso"><svg viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          <button class="btn btn-ghost btn-sm" id="waterPlus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Vaso</button>
        </div>
      </div>
      <div class="water-glasses">${glasses}</div>
    </div>`;
  }
  function bindWater() {
    const p = $("#waterPlus"); if (p) p.addEventListener("click", () => { setWater(foodDate, dayWater(foodDate) + GLASS_ML); renderFoodDiary(); });
    const m = $("#waterMinus"); if (m) m.addEventListener("click", () => { setWater(foodDate, dayWater(foodDate) - GLASS_ML); renderFoodDiary(); });
    $$("[data-glass]").forEach((b) => b.addEventListener("click", () => {
      const i = +b.dataset.glass, filled = Math.round(dayWater(foodDate) / GLASS_ML);
      // tap the current top glass to empty it, otherwise fill up to it
      setWater(foodDate, (filled === i + 1 ? i : i + 1) * GLASS_ML);
      renderFoodDiary();
    }));
  }

  /* ---------- Diary ---------- */
  function renderFoodDiary() {
    if (!foodDate) foodDate = todayISO();
    const t = N().targets;
    const tot = dayTotals(foodDate);
    const isToday = foodDate === todayISO();
    const heading = isToday ? "Hoy" : fmtDate(foodDate, { weekday: "long", day: "numeric", month: "long" });
    const hasTargets = t && t.kcal > 0;
    const remaining = hasTargets ? Math.round(t.kcal - tot.kcal) : 0;

    const summary = hasTargets ? `
      <div class="card diary-summary">
        <div class="ds-ring">
          ${macroRing(tot.kcal, t.kcal)}
          <div class="ds-ring-label"><b>${Math.round(tot.kcal)}</b><span>de ${t.kcal} kcal</span></div>
        </div>
        <div class="ds-macros">
          <div class="ds-remain ${remaining < 0 ? "over" : ""}">${remaining >= 0 ? remaining + " kcal restantes" : Math.abs(remaining) + " kcal de más"}</div>
          ${macroBar("Proteína", tot.protein, t.protein, "#2f6690")}
          ${macroBar("Carbohidratos", tot.carbs, t.carbs, "#c07a1e")}
          ${macroBar("Grasas", tot.fat, t.fat, "#a5324a")}
        </div>
      </div>`
      : `<div class="empty-hint">Aún no tienes objetivos. Ve a <b>Objetivos</b> para calcular tus calorías y macros.</div>`;

    const meals = MEALS.map(([key, label]) => {
      const entries = dayLog(foodDate)[key];
      let mk = 0; entries.forEach((e) => (mk += (Number(e.kcal) || 0) * (Number(e.grams) || 0) / 100));
      const rows = entries.map((e, i) => {
        const f = (Number(e.grams) || 0) / 100;
        const kc = Math.round((Number(e.kcal) || 0) * f);
        const p = Math.round((Number(e.protein) || 0) * f);
        const c = Math.round((Number(e.carbs) || 0) * f);
        const gg = Math.round((Number(e.fat) || 0) * f);
        return `
        <div class="food-entry">
          <div class="fe-info">
            <div class="fe-name">${escapeHtml(e.name)}</div>
            <div class="fe-sub">${e.grams} g · <b>${kc}</b> kcal <span class="fe-macros"><span class="mp">P ${p}</span> <span class="mc">C ${c}</span> <span class="mg">G ${gg}</span></span></div>
          </div>
          <button class="icon-btn danger" data-del-entry="${key}:${i}" title="Quitar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>`;
      }).join("") || `<div class="fe-empty">Sin alimentos</div>`;
      return `<div class="card meal-card">
        <div class="meal-head"><h3>${label}</h3><span class="meal-kcal">${Math.round(mk)} kcal</span></div>
        ${rows}
        <button class="add-set-btn" data-add-food="${key}">+ Añadir alimento</button>
      </div>`;
    }).join("");

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <span class="eyebrow">Alimentación</span>
          <div class="view-head-row">
            <h1>Diario</h1>
            <div class="row wrap" style="gap:10px">
              <button class="btn btn-ghost btn-sm" id="copyDayBtn"><svg viewBox="0 0 24 24"><path d="M9 9h10v10H9zM5 15V5h10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Copiar de otro día</button>
            </div>
          </div>
          <div class="date-nav">
            <button class="icon-btn" id="prevDay"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="date-nav-label">${heading}</div>
            <button class="icon-btn" id="nextDay" ${isToday ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            ${isToday ? "" : `<button class="btn btn-ghost btn-sm" id="todayBtn">Hoy</button>`}
          </div>
        </div>
        ${summary}
        ${waterCardHtml()}
        <div class="meals-grid mt-16">${meals}</div>
      </div>`;

    bindWater();
    $("#prevDay").addEventListener("click", () => { foodDate = addDays(foodDate, -1); renderFoodDiary(); });
    const nx = $("#nextDay"); if (nx && !isToday) nx.addEventListener("click", () => { foodDate = addDays(foodDate, 1); renderFoodDiary(); });
    const tb = $("#todayBtn"); if (tb) tb.addEventListener("click", () => { foodDate = todayISO(); renderFoodDiary(); });
    $("#copyDayBtn").addEventListener("click", openCopyDay);
    $$("[data-add-food]").forEach((b) => b.addEventListener("click", () => openFoodPicker(b.dataset.addFood)));
    $$("[data-del-entry]").forEach((b) => b.addEventListener("click", () => {
      const [meal, idx] = b.dataset.delEntry.split(":");
      const day = ensureDay(foodDate); const i = +idx;
      const removed = day[meal][i];
      const date = foodDate;
      day[meal].splice(i, 1);
      DB.save();
      renderFoodDiary();
      if (removed) toastUndo(`«${removed.name}» eliminado`, () => {
        const d = ensureDay(date); d[meal].splice(i, 0, removed); DB.save();
        if (foodDate === date && currentView === "food-diary") renderFoodDiary();
      });
    }));
  }

  function openFoodPicker(meal) {
    const backend = isBackend();
    const customFoods = N().foods;
    openModal(`
      <div class="modal-head">
        <div><h2>Añadir alimento</h2><p>${backend ? "Busca en Open Food Facts o en tus alimentos." : "Elige de tus alimentos o crea uno nuevo."}</p></div>
        <button class="icon-btn" id="closeFp"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      ${backend ? `<div class="picker-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input class="input" id="fpSearch" placeholder="Buscar alimento (p. ej. avena, pollo…)" autocomplete="off"></div>` : ""}
      <div class="picker-list" id="fpList">${foodResultList(customFoods, "Mis alimentos")}</div>
      <div class="modal-actions">
        ${backend ? `<button class="btn btn-ghost" id="fpBarcode"><svg viewBox="0 0 24 24"><path d="M4 6v12M8 6v12M12 6v12M16 6v12M20 6v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Código de barras</button>` : ""}
        <button class="btn btn-ghost grow" id="fpCreate"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Crear manual</button>
      </div>
    `);
    $("#closeFp").addEventListener("click", closeModal);
    $("#fpCreate").addEventListener("click", () => openCreateFood(meal));
    const bc = $("#fpBarcode"); if (bc) bc.addEventListener("click", () => openBarcode(meal));
    bindFoodResults(meal);
    const s = $("#fpSearch");
    if (s) {
      s.focus();
      s.addEventListener("input", () => {
        const q = s.value.trim();
        clearTimeout(foodSearchTimer);
        if (q.length < 2) { $("#fpList").innerHTML = foodResultList(customFoods, "Mis alimentos"); bindFoodResults(meal); return; }
        $("#fpList").innerHTML = `<div class="loading-row"><span class="spinner"></span> Buscando alimentos…</div>`;
        foodSearchTimer = setTimeout(async () => {
          try {
            const data = await global.Auth.api("/api/food/search?q=" + encodeURIComponent(q), { auth: true });
            $("#fpList").innerHTML = foodResultList(data.items || [], "Resultados");
            bindFoodResults(meal);
          } catch (err) { $("#fpList").innerHTML = `<div class="loading-row">${escapeHtml(err.message || "No se pudo buscar. Revisa la conexión.")}</div>`; }
        }, 350);
      });
    }
  }

  function foodResultList(items, label) {
    if (!items.length) return `<div class="fe-empty" style="padding:18px">Nada por aquí. Prueba a buscar o crea un alimento.</div>`;
    const enc = (o) => encodeURIComponent(JSON.stringify(o));
    return `<div class="picker-group-label">${label}</div>` + items.map((it) => `
      <button class="picker-item food-item" data-food="${enc({ name: it.name, brand: it.brand || "", kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat })}">
        <span class="pi-name">${escapeHtml(it.name)}${it.brand ? ` <small>· ${escapeHtml(it.brand)}</small>` : ""}</span>
        <span class="pi-group">${it.kcal} kcal/100g</span>
      </button>`).join("");
  }
  function bindFoodResults(meal) {
    $$(".food-item").forEach((b) => b.addEventListener("click", () => {
      const food = JSON.parse(decodeURIComponent(b.dataset.food));
      openPortion(meal, food);
    }));
  }

  function openPortion(meal, food) {
    openModal(`
      <div class="modal-head">
        <div><h2>${escapeHtml(food.name)}</h2><p>${food.kcal} kcal · P ${food.protein} · C ${food.carbs} · G ${food.fat} (por 100 g)</p></div>
        <button class="icon-btn" id="closePor"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Cantidad (gramos)</label><input class="input" id="porGrams" type="number" inputmode="numeric" min="1" step="1" value="100"></div>
      <div class="portion-preview" id="porPreview"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelPor">Cancelar</button>
        <button class="btn btn-primary" id="addPor">Añadir</button>
      </div>
    `);
    const g = $("#porGrams");
    const preview = () => {
      const grams = Number(g.value) || 0; const f = grams / 100;
      $("#porPreview").innerHTML = `<b>${Math.round(food.kcal * f)}</b> kcal · P ${Math.round(food.protein * f)} · C ${Math.round(food.carbs * f)} · G ${Math.round(food.fat * f)}`;
    };
    preview(); g.addEventListener("input", preview); g.focus(); g.select();
    $("#closePor").addEventListener("click", closeModal);
    $("#cancelPor").addEventListener("click", closeModal);
    $("#addPor").addEventListener("click", () => {
      const grams = Math.max(1, Math.round(Number(g.value) || 0));
      ensureDay(foodDate)[meal].push({ id: DB.uid(), name: food.name, grams, kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat });
      saveFoodToLibrary(food);
      DB.save();
      closeModal();
      toast("Añadido al diario", "success");
      renderFoodDiary();
    });
  }

  function saveFoodToLibrary(food) {
    const foods = N().foods;
    const exists = foods.find((f) => f.name.toLowerCase() === food.name.toLowerCase() && (f.brand || "") === (food.brand || ""));
    if (!exists) foods.unshift({ id: DB.uid(), name: food.name, brand: food.brand || "", kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat });
    if (foods.length > 300) foods.length = 300;
  }

  function openCreateFood(meal) {
    openModal(`
      <div class="modal-head">
        <div><h2>Nuevo alimento</h2><p>Valores por 100 g. Se guardará en tus alimentos.</p></div>
        <button class="icon-btn" id="closeCf"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre</label><input class="input" id="cfName" placeholder="Ej: Arroz cocido" autocomplete="off"></div>
      <div class="cf-macros">
        <div class="modal-field"><label>Kcal /100g</label><input class="input" id="cfKcal" type="number" min="0" step="1" placeholder="0"></div>
        <div class="modal-field"><label>Proteína</label><input class="input" id="cfP" type="number" min="0" step="0.1" placeholder="0"></div>
        <div class="modal-field"><label>Carbos</label><input class="input" id="cfC" type="number" min="0" step="0.1" placeholder="0"></div>
        <div class="modal-field"><label>Grasas</label><input class="input" id="cfF" type="number" min="0" step="0.1" placeholder="0"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelCf">Cancelar</button>
        <button class="btn btn-primary" id="saveCf">${meal ? "Añadir al diario" : "Guardar alimento"}</button>
      </div>
    `);
    $("#cfName").focus();
    $("#closeCf").addEventListener("click", closeModal);
    $("#cancelCf").addEventListener("click", closeModal);
    $("#saveCf").addEventListener("click", () => {
      const name = $("#cfName").value.trim();
      if (!name) { toast("Ponle un nombre", "error"); return; }
      const food = { name, brand: "", kcal: Math.round(+$("#cfKcal").value || 0), protein: +$("#cfP").value || 0, carbs: +$("#cfC").value || 0, fat: +$("#cfF").value || 0 };
      saveFoodToLibrary(food);
      if (meal) { openPortion(meal, food); }
      else { DB.save(); closeModal(); toast("Alimento guardado", "success"); if (currentView === "food-foods") renderFoodFoods(); }
    });
  }

  function openBarcode(meal) {
    const hasNative = typeof window.BarcodeDetector !== "undefined";
    const canScan = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (hasNative || window.ZXing);
    let stream = null, raf = null, detector = null, zx = null;
    const stopScan = () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (zx) { try { zx.reset(); } catch (_) {} zx = null; }
    };

    openModal(`
      <div class="modal-head">
        <div><h2>Código de barras</h2><p>${canScan ? "Escanéalo con la cámara o escríbelo." : "Escribe el código del producto."}</p></div>
        <button class="icon-btn" id="closeBc"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      ${canScan ? `<div class="bc-scan" id="bcScan"><video id="bcVideo" playsinline muted></video><div class="bc-frame"></div></div>
        <button class="btn btn-ghost btn-block" id="bcStart">Abrir cámara</button>` : ""}
      <div class="modal-field" style="margin-top:14px"><label>Código (EAN / UPC)</label><input class="input" id="bcInput" type="text" inputmode="numeric" placeholder="p. ej. 3017620422003" autocomplete="off"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelBc">Cancelar</button>
        <button class="btn btn-primary" id="bcLookup">Buscar producto</button>
      </div>
    `);
    onModalClose = stopScan;

    const lookup = async (raw) => {
      const code = String(raw || "").replace(/[^0-9]/g, "");
      if (code.length < 6) { toast("Código no válido", "error"); return; }
      try {
        const data = await global.Auth.api("/api/food/barcode/" + code, { auth: true });
        stopScan();
        closeModal();
        openPortion(meal, data.item);
      } catch (err) { toast(err.message || "Producto no encontrado", "error"); }
    };

    $("#closeBc").addEventListener("click", closeModal);
    $("#cancelBc").addEventListener("click", closeModal);
    $("#bcLookup").addEventListener("click", () => lookup($("#bcInput").value));
    $("#bcInput").addEventListener("keydown", (e) => { if (e.key === "Enter") lookup($("#bcInput").value); });

    const startBtn = $("#bcStart");
    if (startBtn) startBtn.addEventListener("click", async () => {
      const video = $("#bcVideo");
      $("#bcScan").classList.add("live");
      startBtn.textContent = "Escaneando…"; startBtn.disabled = true;
      if (!hasNative && window.ZXing) {
        try {
          zx = new window.ZXing.BrowserMultiFormatReader();
          zx.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } }, video, (result) => {
            if (result) lookup(result.getText ? result.getText() : result.text);
          });
        } catch (e) { toast("No se pudo abrir la cámara", "error"); }
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        video.srcObject = stream; await video.play();
        detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        const tick = async () => {
          if (!stream) return;
          try {
            const codes = await detector.detect(video);
            if (codes && codes.length) { lookup(codes[0].rawValue); return; }
          } catch (_) {}
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        toast("No se pudo abrir la cámara", "error");
      }
    });
  }

  function openCopyDay() {
    const dates = Object.keys(N().log).filter((d) => d !== foodDate && hasFoodData(d)).sort().reverse().slice(0, 30);
    if (!dates.length) { toast("No hay otros días con comidas", "info"); return; }
    const rows = dates.map((d) => {
      const tt = dayTotals(d);
      return `<button class="reuse-item" data-copy="${d}">
        <span class="reuse-info"><span class="reuse-name">${fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}</span><span class="reuse-sub">${Math.round(tt.kcal)} kcal</span></span>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    }).join("");
    openModal(`
      <div class="modal-head"><div><h2>Copiar comidas</h2><p>Copiará las comidas de ese día a <b>${foodDate === todayISO() ? "hoy" : fmtDate(foodDate, { day: "numeric", month: "long" })}</b>.</p></div>
        <button class="icon-btn" id="closeCopy"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="picker-list">${rows}</div>
    `);
    $("#closeCopy").addEventListener("click", closeModal);
    $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
      const src = dayLog(b.dataset.copy);
      const dst = ensureDay(foodDate);
      MEALS.forEach(([k]) => { src[k].forEach((e) => dst[k].push({ ...e, id: DB.uid() })); });
      DB.save();
      closeModal();
      toast("Comidas copiadas", "success");
      renderFoodDiary();
    }));
  }

  /* ---------- Week ---------- */
  function renderFoodWeek() {
    if (!foodWeekStart) foodWeekStart = isoOf(mondayOf(todayISO()));
    const t = N().targets;
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(foodWeekStart, i));
    let weekKcal = 0, activeDays = 0;
    days.forEach((d) => { const k = dayTotals(d).kcal; if (k > 0) { weekKcal += k; activeDays++; } });
    const avg = activeDays ? Math.round(weekKcal / activeDays) : 0;
    const endLabel = fmtDate(addDays(foodWeekStart, 6), { day: "numeric", month: "short" });
    const startLabel = fmtDate(foodWeekStart, { day: "numeric", month: "short" });

    const rows = days.map((d) => {
      const tt = dayTotals(d);
      const pct = t && t.kcal > 0 ? Math.min(100, (tt.kcal / t.kcal) * 100) : 0;
      const over = t && t.kcal > 0 && tt.kcal > t.kcal * 1.05;
      const wd = new Date(d + "T00:00:00").toLocaleDateString("es-ES", { weekday: "short" });
      const dn = new Date(d + "T00:00:00").getDate();
      const isToday = d === todayISO();
      return `<button class="week-day ${isToday ? "is-today" : ""}" data-day="${d}">
        <div class="wd-date"><span class="wd-wd">${wd}</span><span class="wd-dn">${dn}</span></div>
        <div class="wd-bar-wrap"><div class="wd-bar" style="width:${pct}%;${over ? "background:var(--neg)" : ""}"></div></div>
        <div class="wd-kcal">${tt.kcal ? Math.round(tt.kcal) + " kcal" : "—"}</div>
      </button>`;
    }).join("");

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <span class="eyebrow">Alimentación</span>
          <h1>Semana</h1>
          <div class="date-nav">
            <button class="icon-btn" id="prevWeek"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="date-nav-label">${startLabel} – ${endLabel}</div>
            <button class="icon-btn" id="nextWeek"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
          </div>
        </div>
        <div class="card"><div class="row-between"><div><div class="s-label">Media diaria</div><div class="s-value" style="font-family:'Space Grotesk';font-size:24px;font-weight:700">${avg} <small style="font-size:13px;color:var(--text-dim)">kcal</small></div></div>${t && t.kcal ? `<div style="text-align:right"><div class="s-label">Objetivo</div><div class="s-value" style="font-family:'Space Grotesk';font-size:24px;font-weight:700">${t.kcal} <small style="font-size:13px;color:var(--text-dim)">kcal</small></div></div>` : ""}</div></div>
        <div class="week-list mt-16">${rows}</div>
      </div>`;

    $("#prevWeek").addEventListener("click", () => { foodWeekStart = addDays(foodWeekStart, -7); renderFoodWeek(); });
    $("#nextWeek").addEventListener("click", () => { foodWeekStart = addDays(foodWeekStart, 7); renderFoodWeek(); });
    $$("[data-day]").forEach((b) => b.addEventListener("click", () => { foodDate = b.dataset.day; setView("food-diary"); }));
  }

  /* ---------- Goals / profile ---------- */
  function renderFoodGoals() {
    const p = N().profile;
    const t = N().targets;
    const sexOpt = (v, l) => `<option value="${v}" ${p.sex === v ? "selected" : ""}>${l}</option>`;
    const actOpt = (v, l) => `<option value="${v}" ${p.activity === v ? "selected" : ""}>${l}</option>`;
    const goalOpt = (v, l) => `<option value="${v}" ${p.goal === v ? "selected" : ""}>${l}</option>`;

    main.innerHTML = `
      <div class="view">
        <div class="view-head"><span class="eyebrow">Alimentación</span><h1>Objetivos</h1><p class="subtitle">Tus datos calculan tus calorías y macros según tu meta.</p></div>
        <div class="goals-grid">
          <div class="card">
            <div class="section-title mb-16">Tus datos</div>
            <div class="goals-form">
              <div class="modal-field"><label>Sexo</label><select class="select" id="gSex">${sexOpt("male", "Hombre")}${sexOpt("female", "Mujer")}</select></div>
              <div class="modal-field"><label>Edad</label><input class="input" id="gAge" type="number" min="10" max="100" value="${p.age || ""}" placeholder="años"></div>
              <div class="modal-field"><label>Altura (cm)</label><input class="input" id="gHeight" type="number" min="120" max="230" value="${p.height || ""}" placeholder="cm"></div>
              <div class="modal-field"><label>Peso (kg)</label><input class="input" id="gWeight" type="number" min="30" max="250" step="0.1" value="${p.weight || ""}" placeholder="kg"></div>
              <div class="modal-field"><label>Actividad</label><select class="select" id="gActivity">${actOpt("sedentary", "Sedentario")}${actOpt("light", "Ligera (1-3 días)")}${actOpt("moderate", "Moderada (3-5 días)")}${actOpt("active", "Alta (6-7 días)")}${actOpt("athlete", "Atleta")}</select></div>
              <div class="modal-field"><label>Objetivo</label><select class="select" id="gGoal">${goalOpt("cut", "Definir (perder grasa)")}${goalOpt("maintain", "Mantener")}${goalOpt("bulk", "Ganar masa")}</select></div>
            </div>
          </div>
          <div class="card" id="goalsPreview"></div>
        </div>
      </div>`;

    const readProfile = () => ({ sex: $("#gSex").value, age: $("#gAge").value, height: $("#gHeight").value, weight: $("#gWeight").value, activity: $("#gActivity").value, goal: $("#gGoal").value });
    const renderPreview = () => {
      const prof = readProfile();
      const c = computeTargets(prof);
      const box = $("#goalsPreview");
      if (!c) { box.innerHTML = `<div class="empty-hint" style="border:none;padding:30px 10px">Rellena edad, altura y peso para calcular tus objetivos.</div>`; return; }
      box.innerHTML = `
        <div class="section-title mb-16">Recomendación</div>
        <div class="goal-kcal"><b>${c.kcal}</b> kcal / día</div>
        <div class="goal-water">💧 <b>${(c.water / 1000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L</b> de agua al día <small>(${Math.round(c.water / 250)} vasos)</small></div>
        <div class="goal-macros">
          <div class="gm"><span class="gm-dot" style="background:#2f6690"></span><b>${c.protein} g</b><span>proteína</span></div>
          <div class="gm"><span class="gm-dot" style="background:#c07a1e"></span><b>${c.carbs} g</b><span>carbos</span></div>
          <div class="gm"><span class="gm-dot" style="background:#a5324a"></span><b>${c.fat} g</b><span>grasas</span></div>
        </div>
        <div class="goal-extra">
          <div><span>IMC</span><b>${c.bmi.toFixed(1)}</b><em>${bmiCategory(c.bmi)}</em></div>
          <div><span>Metabolismo basal</span><b>${c.bmr}</b><em>kcal</em></div>
          <div><span>Gasto diario</span><b>${c.tdee}</b><em>kcal</em></div>
        </div>
        <button class="btn btn-primary btn-block mt-16" id="saveGoals">Guardar y usar estos objetivos</button>
        ${t && t.kcal ? `<div class="text-dim" style="font-size:12.5px;text-align:center;margin-top:10px">Objetivo actual: ${t.kcal} kcal · P${t.protein} C${t.carbs} G${t.fat}</div>` : ""}`;
      $("#saveGoals").addEventListener("click", () => {
        const prof2 = readProfile();
        const cc = computeTargets(prof2);
        if (!cc) { toast("Faltan datos", "error"); return; }
        const n = N();
        n.profile = { sex: prof2.sex, age: numLoc(prof2.age), height: heightCm(prof2.height), weight: numLoc(prof2.weight), activity: prof2.activity, goal: prof2.goal };
        n.targets = { kcal: cc.kcal, protein: cc.protein, carbs: cc.carbs, fat: cc.fat, auto: true };
        DB.save();
        toast("Objetivos guardados", "success");
        renderFoodGoals();
      });
    };
    ["#gSex", "#gAge", "#gHeight", "#gWeight", "#gActivity", "#gGoal"].forEach((s) => {
      const el = $(s); el.addEventListener(el.tagName === "SELECT" ? "change" : "input", renderPreview);
    });
    renderPreview();
  }

  /* ---------- Foods library ---------- */
  function renderFoodFoods() {
    const foods = N().foods;
    main.innerHTML = `
      <div class="view">
        <div class="view-head"><div class="view-head-row">
          <div><span class="eyebrow">Alimentación</span><h1>Alimentos</h1><p class="subtitle">${foods.length} alimentos guardados. Se añaden solos al usarlos en el diario.</p></div>
          <button class="btn btn-primary" id="newFoodBtn"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Nuevo alimento</button>
        </div></div>
        ${foods.length ? `<div class="lib-grid">${foods.map((f) => `
          <div class="card lib-card food-lib">
            <div style="min-width:0;flex:1">
              <div class="lib-name">${escapeHtml(f.name)}${f.brand ? ` <small class="text-dim">· ${escapeHtml(f.brand)}</small>` : ""}</div>
              <div class="lib-cat">${f.kcal} kcal · P${f.protein} C${f.carbs} G${f.fat} <span class="text-faint">/100g</span></div>
            </div>
            <button class="icon-btn danger" data-del-food="${f.id}" title="Eliminar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
          </div>`).join("")}</div>`
          : `<div class="empty-hint">Aún no tienes alimentos. Créalos o búscalos al añadir comida en el <b>Diario</b>.</div>`}
      </div>`;
    $("#newFoodBtn").addEventListener("click", () => openCreateFood(null));
    $$("[data-del-food]").forEach((b) => b.addEventListener("click", () => {
      N().foods = N().foods.filter((f) => f.id !== b.dataset.delFood);
      DB.save();
      renderFoodFoods();
    }));
  }

  /* ============================================================
     VIEW: BODY WEIGHT
     ============================================================ */
  function renderBodyweight() {
    const log = DB.bodyweightLog();               // ascending by date
    const profile = N().profile;
    const latest = log.length ? log[log.length - 1] : null;
    const hCm = heightCm(profile.height);
    const bmi = latest && hCm ? latest.kg / Math.pow(hCm / 100, 2) : 0;

    let delta30 = null, deltaAll = null;
    if (latest && log.length > 1) {
      deltaAll = Math.round((latest.kg - log[0].kg) * 10) / 10;
      const target = addDays(latest.date, -30);
      let ref = log[0];
      for (const e of log) { if (e.date <= target) ref = e; }
      delta30 = Math.round((latest.kg - ref.kg) * 10) / 10;
    }
    // Colour a change by the user's goal, not by direction: losing is "good"
    // when cutting, gaining is "good" when bulking, neutral when maintaining.
    const goal = profile.goal;
    const deltaChip = (d, label) => {
      if (d === null) return "";
      let cls = "";
      if (d !== 0 && goal === "cut") cls = d < 0 ? "good" : "bad";
      else if (d !== 0 && goal === "bulk") cls = d > 0 ? "good" : "bad";
      const txt = d === 0 ? "±0" : (d > 0 ? "+" : "") + fmtNum(d) + " kg";
      return `<div class="bw-stat"><span class="bw-stat-v ${cls}">${txt}</span><span class="bw-stat-l">${label}</span></div>`;
    };

    const cutoff = bwRange > 0 ? addDays(todayISO(), -bwRange) : null;
    const shown = cutoff ? log.filter((e) => e.date >= cutoff) : log;
    const series = shown.map((e) => ({ label: dateShort(e.date), value: e.kg }));
    const RANGES = [[30, "30 d"], [90, "90 d"], [365, "1 año"], [0, "Todo"]];

    const listRows = [...log].reverse().map((e, i, arr) => {
      const prev = arr[i + 1];                    // previous chronological entry
      const d = prev ? Math.round((e.kg - prev.kg) * 10) / 10 : null;
      const dHtml = d === null ? "" : `<span class="bw-delta ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "+" : ""}${fmtNum(d)}</span>`;
      return `<div class="record-row">
        <div><div class="record-name">${fmtNum(e.kg)} kg</div><div class="record-meta">${fmtDate(e.date, { weekday: "short", day: "numeric", month: "short" })}</div></div>
        <div class="record-val" style="display:flex;align-items:center;gap:14px">${dHtml}<button class="icon-btn danger" data-del-bw="${e.date}" title="Eliminar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      </div>`;
    }).join("");

    const prefill = latest ? latest.kg : (profile.weight || "");
    const form = `
      <div class="card bw-form">
        <div class="bw-form-row">
          <div class="modal-field"><label>Fecha</label><input type="date" class="input" id="bwDate" value="${todayISO()}" max="${todayISO()}"></div>
          <div class="modal-field"><label>Peso (kg)</label><input class="input" id="bwKg" type="number" inputmode="decimal" min="20" max="400" step="0.1" placeholder="kg" value="${prefill}"></div>
          <button class="btn btn-primary" id="bwAdd"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>Registrar</button>
        </div>
      </div>`;

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <span class="eyebrow">Progreso</span>
          <h1>Peso corporal</h1>
          <p class="subtitle">${log.length ? "Registra tu peso y sigue la tendencia. Un dato por día." : "Apunta tu peso para ver tu evolución con el tiempo."}</p>
        </div>
        ${form}
        ${latest ? `
        <div class="card bw-hero">
          <div>
            <div class="year-hero-num">${fmtNum(latest.kg)}<small class="bw-unit"> kg</small></div>
            <div class="year-hero-sub">último registro · ${fmtDate(latest.date, { day: "numeric", month: "long" })}</div>
          </div>
          <div class="bw-stats">
            ${bmi ? `<div class="bw-stat"><span class="bw-stat-v">${bmi.toFixed(1)}</span><span class="bw-stat-l">IMC · ${bmiCategory(bmi)}</span></div>` : ""}
            ${deltaChip(delta30, "30 días")}
            ${deltaChip(deltaAll, "desde el inicio")}
          </div>
        </div>
        <div class="card chart-card">
          <div class="chart-head"><h3>Evolución</h3>
            <div class="seg seg-sm" id="bwSeg">${RANGES.map(([v, l]) => `<button class="seg-btn ${bwRange === v ? "is-active" : ""}" data-days="${v}">${l}</button>`).join("")}</div>
          </div>
          <div class="chart-wrap">${series.length ? Charts.lineChart(series, { color: "#2f6690", color2: "#1f8a80", unit: "kg", yFrom: "auto" }) : '<div class="empty-hint" style="border:none">Sin registros en este periodo.</div>'}</div>
        </div>
        <div class="card mt-24">
          <div class="section-title mb-16">Historial <span class="count-pill">${log.length}</span></div>
          ${listRows}
        </div>` : `<div class="empty-hint"><span class="emoji">⚖️</span>Aún no has registrado tu peso.<br>Apunta el primero en el formulario de arriba.</div>`}
      </div>`;

    const doAdd = () => {
      const date = $("#bwDate").value || todayISO();
      const kg = numLoc($("#bwKg").value);
      if (!kg || kg <= 0) { toast("Introduce un peso válido", "error"); return; }
      DB.logBodyweight(date, kg);
      const lt = DB.latestBodyweight();
      if (lt) { N().profile.weight = lt.kg; DB.save(); }   // keep goals profile in sync
      toast("Peso registrado", "success");
      renderBodyweight();
    };
    $("#bwAdd").addEventListener("click", doAdd);
    $("#bwKg").addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
    const seg = $("#bwSeg");
    if (seg) seg.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => {
      const v = +b.dataset.days; if (v === bwRange) return; bwRange = v; renderBodyweight();
    }));
    const syncProfileWeight = () => { const lt = DB.latestBodyweight(); if (lt) { N().profile.weight = lt.kg; DB.save(); } };
    $$("[data-del-bw]").forEach((b) => b.addEventListener("click", () => {
      const date = b.dataset.delBw;
      const entry = DB.bodyweightLog().find((e) => e.date === date);
      DB.deleteBodyweight(date);
      syncProfileWeight();
      renderBodyweight();
      if (entry) toastUndo(`Registro de ${fmtNum(entry.kg)} kg eliminado`, () => {
        DB.logBodyweight(entry.date, entry.kg); syncProfileWeight(); renderBodyweight();
      });
    }));
  }

  /* ============================================================
     PROFILE / ACCOUNT
     ============================================================ */
  function fmtLongDate(ms) {
    return ms ? new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "—";
  }

  function openProfile() {
    const A = global.Auth || {};
    const uname = A.username || "";
    const initial = (uname || "?").charAt(0).toUpperCase();
    const workouts = DB.get().workouts || [];
    const days = new Set(workouts.map((w) => w.date).filter(Boolean)).size;
    const totalVol = workouts.reduce((a, w) => a + DB.workoutVolume(w), 0);
    const ach = computeAchievements();
    const achDone = ach.filter((a) => a.done).length;
    const backend = isBackend();

    openModal(`
      <div class="modal-head">
        <div class="profile-id">
          <span class="account-avatar lg">${initial}</span>
          <div style="min-width:0">
            <h2 style="margin:0">${escapeHtml(uname) || "Perfil"}</h2>
            <p style="margin:2px 0 0">${backend ? "Miembro desde " + fmtLongDate(A.createdAt) : "Modo local (sin cuenta)"}</p>
          </div>
        </div>
        <button class="icon-btn" id="closePf"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="profile-stats">
        <div><b>${workouts.length}</b><span>entrenos</span></div>
        <div><b>${days}</b><span>días</span></div>
        <div><b>${achDone}<small>/${ach.length}</small></b><span>logros</span></div>
        <div><b>${Charts.fmt(totalVol)}</b><span>kg vol</span></div>
      </div>
      ${backend ? `<div class="profile-sync">
        <span class="sync-status js-sync"><span class="sync-dot"></span>Sincronizado</span>
        <button class="btn btn-ghost btn-sm" id="pfSync"><svg viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 4v4h-4M3 20v-4h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Sincronizar</button>
      </div>` : ""}
      <div class="profile-actions">
        <button class="btn btn-ghost btn-block" id="pfExport"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4M4 19h16" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Exportar copia de seguridad</button>
        <button class="btn btn-ghost btn-block" id="pfImport"><svg viewBox="0 0 24 24"><path d="M12 15V3M8 7l4-4 4 4M4 19h16" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Importar copia</button>
        ${backend ? `<button class="btn btn-ghost btn-block" id="pfPass"><svg viewBox="0 0 24 24"><path d="M6 10V8a6 6 0 1112 0v2M5 10h14v10H5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Cambiar contraseña</button>` : ""}
        ${backend ? `<button class="btn btn-ghost btn-block" id="pfLogout"><svg viewBox="0 0 24 24"><path d="M15 12H3m0 0l4-4m-4 4l4 4M14 4h5a2 2 0 012 2v12a2 2 0 01-2 2h-5" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Cerrar sesión</button>` : ""}
        ${backend ? `<button class="btn btn-danger btn-block" id="pfDelete" style="margin-top:6px">Borrar cuenta</button>` : ""}
      </div>
    `);
    $("#closePf").addEventListener("click", closeModal);
    $("#pfExport").addEventListener("click", exportBackup);
    $("#pfImport").addEventListener("click", confirmImportBackup);
    const sy = $("#pfSync"); if (sy) sy.addEventListener("click", () => { if (A.forceSync) A.forceSync(); });
    const pp = $("#pfPass"); if (pp) pp.addEventListener("click", openChangePassword);
    const pl = $("#pfLogout"); if (pl) pl.addEventListener("click", () => { if (A.logout) A.logout(); });
    const pd = $("#pfDelete"); if (pd) pd.addEventListener("click", openDeleteAccount);
    if (A.paintSync) A.paintSync();   // reflect the real current status in the sheet
  }

  function exportBackup() {
    const btn = $("#pfExport");
    const orig = btn ? btn.innerHTML : "";
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Preparando copia…'; }
    // Brief "preparing" spinner before the download fires.
    setTimeout(() => {
      try {
        const blob = new Blob([DB.exportJSON()], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `gymandjam-${todayISO()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast("Copia exportada", "success");
      } catch (_) { toast("No se pudo exportar", "error"); }
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = orig; }
    }, 2000);
  }

  // Importing replaces ALL data, so confirm first.
  function confirmImportBackup() {
    openModal(`
      <div class="modal-head"><div><h2>Importar copia</h2><p>Reemplazará <b>todos</b> tus datos actuales por los del archivo. No se puede deshacer.</p></div></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="ciCancel">Cancelar</button><button class="btn btn-primary" id="ciPick">Elegir archivo…</button></div>
    `);
    $("#ciCancel").addEventListener("click", openProfile);
    $("#ciPick").addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "application/json,.json";
      input.addEventListener("change", () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            DB.importJSON(String(reader.result || ""));   // persists + marks pending → syncs when online
            toast("Copia importada", "success");
            location.reload();             // clean reset with the new data
          } catch (_) { toast("Archivo no válido", "error"); }
        };
        reader.readAsText(f);
      });
      input.click();
    });
  }

  function openChangePassword() {
    openModal(`
      <div class="modal-head"><div><h2>Cambiar contraseña</h2></div>
        <button class="icon-btn" id="cpClose"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Contraseña actual</label><input class="input" type="password" id="cpCur" autocomplete="current-password"></div>
      <div class="modal-field"><label>Nueva contraseña</label><input class="input" type="password" id="cpNew" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div>
      <div class="modal-field"><label>Repite la nueva</label><input class="input" type="password" id="cpNew2" autocomplete="new-password"></div>
      <div class="auth-error" id="cpErr" hidden></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cpCancel">Cancelar</button><button class="btn btn-primary" id="cpSave">Guardar</button></div>
    `);
    const err = $("#cpErr"), showErr = (m) => { err.textContent = m; err.hidden = false; };
    const submit = async () => {
      const cur = $("#cpCur").value, n1 = $("#cpNew").value, n2 = $("#cpNew2").value;
      if (n1.length < 6) return showErr("La nueva contraseña debe tener al menos 6 caracteres.");
      if (n1 !== n2) return showErr("Las contraseñas nuevas no coinciden.");
      const btn = $("#cpSave"); btn.disabled = true; btn.textContent = "Guardando…";
      try { await global.Auth.changePassword(cur, n1); closeModal(); toast("Contraseña actualizada", "success"); }
      catch (e) { showErr(e.message || "No se pudo cambiar."); btn.disabled = false; btn.textContent = "Guardar"; }
    };
    $("#cpClose").addEventListener("click", openProfile);
    $("#cpCancel").addEventListener("click", openProfile);
    $("#cpSave").addEventListener("click", submit);
    $("#cpNew2").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    $("#cpCur").focus();
  }

  function openDeleteAccount() {
    openModal(`
      <div class="modal-head"><div><h2>Borrar cuenta</h2><p>Acción <b>permanente</b>: se elimina tu cuenta y todos tus datos del servidor.</p></div></div>
      <div class="modal-field"><label>Escribe tu contraseña para confirmar</label><input class="input" type="password" id="daPass" autocomplete="current-password"></div>
      <div class="auth-error" id="daErr" hidden></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="daCancel">Cancelar</button><button class="btn btn-danger" id="daGo">Borrar mi cuenta</button></div>
    `);
    const err = $("#daErr");
    const submit = async () => {
      const pw = $("#daPass").value;
      if (!pw) { err.textContent = "Introduce tu contraseña."; err.hidden = false; return; }
      const btn = $("#daGo"); btn.disabled = true; btn.textContent = "Borrando…";
      try { await global.Auth.deleteAccount(pw); }   // reloads to the login screen on success
      catch (e) { err.textContent = e.message || "No se pudo borrar."; err.hidden = false; btn.disabled = false; btn.textContent = "Borrar mi cuenta"; }
    };
    $("#daCancel").addEventListener("click", openProfile);
    $("#daGo").addEventListener("click", submit);
    $("#daPass").focus();
  }

  global.__openProfile = openProfile;

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    document.documentElement.classList.remove("auth-pending");   // reveal the app shell
    DB.load();
    primeAchievements();   // baseline already-earned logros silently (no unlock spam)
    draft = loadDraft() || newDraft();
    // Re-render current view when the theme changes (recolors charts).
    global.__onThemeChange = function () { render(); };
    // Let the auth layer re-render the current view after a manual sync pull.
    global.__rerender = function () { render(); };

    let savedWs = "train";
    try { if (localStorage.getItem("gymandjam.workspace") === "food") savedWs = "food"; } catch (_) {}
    workspace = savedWs;
    document.getElementById("nav").hidden = savedWs !== "train";
    document.getElementById("navFood").hidden = savedWs !== "food";
    document.getElementById("mobileNav").hidden = savedWs !== "train";
    document.getElementById("mobileNavFood").hidden = savedWs !== "food";
    $$(".ws-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.ws === savedWs));
    setView(savedWs === "food" ? "food-diary" : "today");

    // Offer to import a shared routine if opened via ?rutina=CODE
    maybeImportSharedRoutine();
  }

  // Auth gate: in backend mode this shows login first and pulls the
  // user's data; in local mode (file:// or no server) it boots directly.
  if (global.Auth && typeof global.Auth.init === "function") {
    global.Auth.init({ onReady: boot });
  } else {
    boot();
  }
})(window);
