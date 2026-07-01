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
  let workspace = "train";  // "train" | "food"
  let foodDate = null;      // selected day in the food diary (YYYY-MM-DD)
  let foodWeekStart = null; // Monday of the week shown in the weekly view
  let statsExercise = null; // selected exercise id for strength progression chart
  let statsTab = "fuerza";  // "fuerza" | "cardio"
  let cardioExercise = null; // selected exercise id for cardio pace chart
  let libFilter = "all";

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
    if (currentView === "today") renderToday();
    else if (currentView === "templates") renderTemplates();
    else if (currentView === "history") renderHistory();
    else if (currentView === "stats") renderStats();
    else if (currentView === "exercises") renderExercises();
    else if (currentView === "food-diary") renderFoodDiary();
    else if (currentView === "food-week") renderFoodWeek();
    else if (currentView === "food-goals") renderFoodGoals();
    else if (currentView === "food-foods") renderFoodFoods();
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
    const dates = [...new Set(DB.get().workouts.map((w) => w.date))].sort().reverse();
    if (!dates.length) return 0;
    const today = todayISO();
    const gap0 = daysBetween(today, dates[0]);
    if (gap0 > 1) return 0; // streak broken
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      if (daysBetween(dates[i - 1], dates[i]) === 1) streak++;
      else break;
    }
    return streak;
  }
  function updateStreak() {
    const el = document.getElementById("streakNum");
    const badge = document.getElementById("streakBadge");
    const n = computeStreak();
    if (el) el.textContent = n;
    if (badge) badge.classList.toggle("is-hot", n > 0);
  }

  /* ============================================================
     VIEW: TODAY (session builder)
     ============================================================ */
  function renderToday() {
    if (!draft) draft = newDraft();

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

    main.innerHTML = `
      <div class="view">
        <div class="view-head">
          <div class="view-head-row">
            <div>
              <span class="eyebrow">${fmtDate(draft.date, { weekday: "long" })}</span>
              <h1>${draft.id ? "Editar entreno" : "Entreno de hoy"}</h1>
              <p class="subtitle">Selecciona los grupos musculares, añade ejercicios y registra tus series.</p>
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
            <div class="summary-row">
              <div class="summary-cell accent"><div class="s-label">Volumen total</div><div class="s-value">${fmtNum(totalVol)} <small>kg</small></div></div>
              <div class="summary-cell"><div class="s-label">Series</div><div class="s-value">${totalSets}</div></div>
              <div class="summary-cell"><div class="s-label">Ejercicios</div><div class="s-value">${draft.entries.length}</div></div>
            </div>
          </div>
        </div>
      </div>`;

    bindToday();
  }

  function exercisesInGroup(key) {
    return DB.get().exercises.filter((e) => e.group === key).length;
  }

  /* --- Cardio-aware set helpers ----------------------------- */
  function isCardio(group) { return group === "cardio"; }
  function newSetFor(group) { return isCardio(group) ? { min: "", km: "" } : { weight: "", reps: "" }; }

  // Fields shown per exercise type: [{key, placeholder, step}]
  function setFields(group) {
    return isCardio(group)
      ? [{ key: "min", ph: "min", step: "1" }, { key: "km", ph: "opcional", step: "0.1" }]
      : [{ key: "weight", ph: "kg", step: "0.5" }, { key: "reps", ph: "reps", step: "1" }];
  }
  function setHeadLabels(group) {
    return isCardio(group)
      ? ["Tiempo (min)", 'Distancia (km) <span class="opt">opcional</span>']
      : ["Peso (kg)", "Reps"];
  }
  function setHasData(group, s) {
    return isCardio(group)
      ? (Number(s.min) > 0 || Number(s.km) > 0)
      : Number(s.reps) > 0;
  }
  // Short, compact rendering of a set for "last time" / history.
  function fmtSetShort(group, s) {
    if (isCardio(group)) {
      const a = [];
      if (s.min) a.push(fmtNum(s.min) + " min");
      if (s.km) a.push(fmtNum(s.km) + " km");
      return a.join(" · ") || "—";
    }
    return fmtNum(s.weight) + "×" + s.reps;
  }
  // Per-set summary cell (right of the inputs).
  function setSummary(group, s) {
    if (isCardio(group)) {
      const a = [];
      if (s.km) a.push(fmtNum(s.km) + " km");
      else if (s.min) a.push(fmtNum(s.min) + " min");
      return a.join("");
    }
    return s.weight && s.reps ? fmtNum(DB.setVolume(s)) + " kg" : "";
  }
  // Exercise header total: volume for strength, time·distance for cardio.
  function entryTotal(group, entry) {
    if (isCardio(group)) {
      let min = 0, km = 0;
      entry.sets.forEach((s) => { min += Number(s.min) || 0; km += Number(s.km) || 0; });
      const a = [];
      if (min) a.push(fmtNum(min) + " min");
      if (km) a.push(fmtNum(km) + " km");
      return a.join(" · ") || "—";
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
      const g = G[ex.group];
      const cardio = isCardio(ex.group);
      const fields = setFields(ex.group);
      const [labA, labB] = setHeadLabels(ex.group);
      const last = lastPerformance(en.exerciseId, draft.id);
      const lastHtml = last ? `<div class="last-time">
        <span>Última vez</span>
        ${last.sets.map((s) => fmtSetShort(ex.group, s)).join(" · ")}
        <em>${new Date(last.date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "")}</em>
      </div>` : "";
      const setsHtml = en.sets.map((s, si) => {
        const isPR = !cardio && s.weight && s.reps && isPersonalRecord(en.exerciseId, s.weight, s.reps);
        return `<div class="set-row" data-ei="${ei}" data-si="${si}">
          <div class="set-idx">${si + 1}</div>
          <input class="set-input" type="number" inputmode="decimal" min="0" step="${fields[0].step}" placeholder="${fields[0].ph}" value="${s[fields[0].key] ?? ""}" data-field="${fields[0].key}">
          <input class="set-input" type="number" inputmode="decimal" min="0" step="${fields[1].step}" placeholder="${fields[1].ph}" value="${s[fields[1].key] ?? ""}" data-field="${fields[1].key}">
          <div class="set-vol">${setSummary(ex.group, s)} ${isPR ? '<span class="pr-tag">PR</span>' : ""}</div>
          <button class="icon-btn danger" data-action="del-set" title="Eliminar serie"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>`;
      }).join("");

      return `<div class="ex-block" data-ei="${ei}">
        <div class="ex-head">
          <span class="ex-dot" style="background:${g.color}"></span>
          <div>
            <div class="ex-name">${escapeHtml(ex.name)}</div>
            <div class="ex-group">${g.name}</div>
          </div>
          <div class="ex-vol">${cardio ? "Total" : "Vol"} <b>${entryTotal(ex.group, en)}</b></div>
          <button class="icon-btn danger" data-action="del-entry" title="Quitar ejercicio" style="margin-left:12px"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v13a1 1 0 001 1h8a1 1 0 001-1V7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg></button>
        </div>
        ${lastHtml}
        <div class="sets-table">
          <div class="set-row set-head"><span></span><span>${labA}</span><span>${labB}</span><span></span><span></span></div>
          ${setsHtml}
          <button class="add-set-btn" data-action="add-set">+ Añadir serie</button>
          ${cardio ? '<div class="set-hint">La distancia es opcional — registra el tiempo y, si quieres, completa los km al terminar.</div>' : ""}
        </div>
      </div>`;
    }).join("");
  }

  function isPersonalRecord(exerciseId, weight, reps) {
    weight = Number(weight); reps = Number(reps);
    if (!weight || !reps) return false;
    let maxW = 0;
    DB.get().workouts.forEach((w) => {
      (w.entries || []).forEach((en) => {
        if (en.exerciseId === exerciseId) {
          en.sets.forEach((s) => { if (Number(s.weight) > maxW) maxW = Number(s.weight); });
        }
      });
    });
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

  function onEntryInput(e) {
    const input = e.target.closest(".set-input");
    if (!input) return;
    const row = input.closest(".set-row");
    const ei = +row.dataset.ei, si = +row.dataset.si;
    const field = input.dataset.field;
    draft.entries[ei].sets[si][field] = input.value === "" ? "" : Number(input.value);
    // Update just the summary cell live
    const ex = DB.exerciseById(draft.entries[ei].exerciseId);
    const group = ex ? ex.group : "";
    const s = draft.entries[ei].sets[si];
    const volCell = row.querySelector(".set-vol");
    const pr = !isCardio(group) && s.weight && s.reps && isPersonalRecord(draft.entries[ei].exerciseId, s.weight, s.reps);
    volCell.innerHTML = setSummary(group, s) + (pr ? ' <span class="pr-tag">PR</span>' : "");
    // Update exercise header total
    const block = row.closest(".ex-block");
    block.querySelector(".ex-vol b").textContent = entryTotal(group, draft.entries[ei]);
  }

  function onEntryClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "add-set") {
      const ei = +btn.closest(".ex-block").dataset.ei;
      const ex = DB.exerciseById(draft.entries[ei].exerciseId);
      const group = ex ? ex.group : "";
      const sets = draft.entries[ei].sets;
      const last = sets[sets.length - 1];
      sets.push(last ? { ...last } : newSetFor(group));
      refreshEntries();
    } else if (action === "del-set") {
      const row = btn.closest(".set-row");
      const ei = +row.dataset.ei, si = +row.dataset.si;
      const ex = DB.exerciseById(draft.entries[ei].exerciseId);
      draft.entries[ei].sets.splice(si, 1);
      if (!draft.entries[ei].sets.length) draft.entries[ei].sets.push(newSetFor(ex ? ex.group : ""));
      refreshEntries();
    } else if (action === "del-entry") {
      const ei = +btn.closest(".ex-block").dataset.ei;
      draft.entries.splice(ei, 1);
      refreshEntries();
    }
  }

  function refreshEntries() {
    const wrap = $("#entriesWrap");
    wrap.innerHTML = renderEntries();
    // update counters
    $(".count-pill").textContent = draft.entries.length;
  }

  function openExercisePicker() {
    if (!draft.groups.length) {
      toast("Selecciona primero un tipo de entreno", "info");
      return;
    }
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

    openModal(`
      <div class="modal-head">
        <div><h2>Elegir ejercicio</h2><p>Toca un ejercicio para añadirlo a tu entreno.</p></div>
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

    const search = $("#pickerSearch");
    search.focus();
    search.addEventListener("input", () => renderPicker(search.value));
    $("#closePicker").addEventListener("click", closeModal);
    $("#createExFromPicker").addEventListener("click", () => openCreateExercise(draft.groups[0], query));
    $$("#pickerList .picker-item").forEach((it) => {
      it.addEventListener("click", () => addEntry(it.dataset.ex));
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

  function saveSession() {
    const hasData = draft.entries.some((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      return en.sets.some((s) => setHasData(ex ? ex.group : "", s));
    });
    if (!draft.groups.length) { toast("Selecciona un tipo de entreno", "error"); return; }
    if (!hasData) { toast("Añade al menos una serie con datos", "error"); return; }

    DB.saveWorkout(draft);
    toast(draft.id ? "Entreno actualizado" : "¡Entreno guardado! 💪", "success");
    draft = newDraft();
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
        sets: en.sets.map((s) => ({ ...s })),
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
      if (en && en.sets.length) return { date: w.date, sets: en.sets };
    }
    return null;
  }

  /* ============================================================
     TEMPLATES (routines)
     ============================================================ */
  function promptSaveTemplate() {
    if (!draft.entries.length) { toast("Añade ejercicios antes de guardar la rutina", "error"); return; }
    const suggested = draft.groups.map((k) => (G[k] || {}).name).filter(Boolean).join(" · ") || "Mi rutina";
    openModal(`
      <div class="modal-head">
        <div><h2>Guardar como rutina</h2><p>Guarda estos ejercicios y series como plantilla reutilizable.</p></div>
        <button class="icon-btn" id="closeTpl"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre de la rutina</label><input class="input" id="tplName" placeholder="Ej: Push A · Pecho, hombro y tríceps" value="${escapeHtml(suggested)}" autocomplete="off"></div>
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
      DB.saveTemplate({
        name,
        groups: [...draft.groups],
        entries: draft.entries.map((en) => ({
          exerciseId: en.exerciseId,
          sets: en.sets.map((s) => ({ ...s })),
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
    const rows = tpls.map((t) => {
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
    }).join("");
    const warn = draft.entries.length
      ? `<p style="color:var(--neg)">Se reemplazará el entreno que tienes ahora sin guardar.</p>`
      : `<p>Se cargará con sus pesos y reps de referencia para que solo ajustes los números.</p>`;
    openModal(`
      <div class="modal-head">
        <div><h2>Usar una rutina</h2>${warn}</div>
        <button class="icon-btn" id="closeUseTpl"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="picker-list">${rows}</div>
    `);
    $("#closeUseTpl").addEventListener("click", closeModal);
    $$(".reuse-item").forEach((it) => it.addEventListener("click", () => useTemplate(it.dataset.tpl)));
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
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelTplW">Cancelar</button><button class="btn btn-primary" id="saveTplW">Guardar rutina</button></div>
    `);
    const input = $("#tplNameW"); input.focus(); input.select();
    const submit = () => {
      const name = input.value.trim();
      if (!name) { toast("Ponle un nombre a la rutina", "error"); return; }
      DB.saveTemplate({
        name, groups: [...(w.groups || [])],
        entries: (w.entries || []).map((en) => ({
          exerciseId: en.exerciseId,
          sets: en.sets.map((s) => ({ ...s })),
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
        sets: en.sets.map((s) => ({ ...s })),
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
        ${tpls.length ? `<div class="tpl-grid">${tpls.map(templateCard).join("")}</div>`
          : `<div class="empty-hint"><span class="emoji">📋</span>Todavía no tienes rutinas.<br>Crea una desde cero, o en <b>Entreno de hoy</b> pulsa <b>Guardar como rutina</b>.</div>`}
      </div>`;

    $("#newTemplateBtn").addEventListener("click", () => { draft = newDraft(); setView("today"); toast("Monta tu rutina y pulsa «Guardar como rutina»", "info"); });
    const impBtn = $("#importRoutineBtn");
    if (impBtn) impBtn.addEventListener("click", () => openImportRoutine(""));
    $$("[data-use-tpl]").forEach((b) => b.addEventListener("click", () => useTemplate(b.dataset.useTpl)));
    $$("[data-share-tpl]").forEach((b) => b.addEventListener("click", () => shareTemplate(b.dataset.shareTpl)));
    $$("[data-rename-tpl]").forEach((b) => b.addEventListener("click", () => promptRenameTemplate(b.dataset.renameTpl)));
    $$("[data-del-tpl]").forEach((b) => b.addEventListener("click", () => confirmDeleteTemplate(b.dataset.delTpl)));
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
        return ex ? { name: ex.name, group: ex.group, sets: en.sets.map((s) => ({ ...s })) } : null;
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

  function shareLinkModal(name, code) {
    const link = location.origin + "/?rutina=" + code;
    openModal(`
      <div class="modal-head">
        <div><h2>Compartir rutina</h2><p>Cualquiera con este enlace podrá guardar «${escapeHtml(name)}» en su perfil.</p></div>
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
      confirmImportShared(data.template);
    } catch (err) {
      toast(err.message || "No se encontró la rutina", "error");
    }
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

  function importSharedTemplate(share) {
    const entries = (share.entries || []).map((e) => {
      const group = G[e.group] ? e.group : "pecho";
      let ex = DB.get().exercises.find((x) => x.name === e.name && x.group === group);
      if (!ex) ex = DB.addExercise(e.name, group);
      return ex ? { exerciseId: ex.id, sets: (e.sets || []).map((s) => ({ ...s })) } : null;
    }).filter(Boolean);
    return DB.saveTemplate({
      name: (share.name || "Rutina compartida").slice(0, 80),
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
      <div class="modal-head"><div><h2>Renombrar rutina</h2></div>
        <button class="icon-btn" id="closeRen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>Nombre</label><input class="input" id="renName" value="${escapeHtml(t.name)}" autocomplete="off"></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cancelRen">Cancelar</button><button class="btn btn-primary" id="saveRen">Guardar</button></div>
    `);
    const input = $("#renName"); input.focus(); input.select();
    const submit = () => { DB.renameTemplate(id, input.value); closeModal(); toast("Rutina renombrada", "success"); renderTemplates(); };
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
    const groupTags = (w.groups || []).map((k) => {
      const g = G[k]; if (!g) return "";
      return `<span class="g-tag" style="background:${g.color}">${g.name}</span>`;
    }).join("");
    const exNames = (w.entries || []).map((en) => (DB.exerciseById(en.exerciseId) || {}).name).filter(Boolean);

    const body = (w.entries || []).map((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex) return "";
      const g = G[ex.group];
      const pills = en.sets.map((s) => isCardio(ex.group)
        ? `<span class="set-pill">${s.min ? `<b>${fmtNum(s.min)}</b> min` : ""}${s.min && s.km ? " · " : ""}${s.km ? `<b>${fmtNum(s.km)}</b> km` : ""}</span>`
        : `<span class="set-pill"><b>${fmtNum(s.weight)}</b>kg × <b>${s.reps}</b></span>`
      ).join("");
      return `<div class="history-ex">
        <div class="history-ex-name"><span class="ex-dot" style="background:${g.color}"></span>${escapeHtml(ex.name)}</div>
        <div class="history-sets">${pills}</div>
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
        <div class="history-metrics">
          <div class="history-metric"><b>${fmtNum(vol)}</b><span>kg volumen</span></div>
          <div class="history-metric"><b>${sets}</b><span>series</span></div>
        </div>
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
        <div class="seg" id="statsSeg">
          <button class="seg-btn ${statsTab === "fuerza" ? "is-active" : ""}" data-tab="fuerza">Fuerza</button>
          <button class="seg-btn ${statsTab === "cardio" ? "is-active" : ""}" data-tab="cardio">Cardio</button>
        </div>
        <div id="statsBody"></div>
      </div>`;

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
          ${statCard("Racha actual", computeStreak(), "días seguidos")}
          ${statCard("Media / sesión", fmtNum(stats.avgVolume), "kg volumen")}
        </div>

        <div class="chart-grid">
          <div class="card chart-card">
            <div class="chart-head"><h3>Volumen por sesión</h3><span class="hint">Últimas ${Math.min(14, workouts.length)} sesiones</span></div>
            <div class="chart-wrap">${Charts.lineChart(stats.volumeSeries, { color: "#e0451f", color2: "#c07a1e" })}</div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Reparto por grupo</h3><span class="hint">Series por músculo</span></div>
            <div class="row wrap" style="gap:18px;align-items:center;justify-content:center">
              <div style="max-width:220px;flex:1;min-width:180px">${Charts.donutChart(stats.groupDist, { centerLabel: String(stats.totalSets), centerSub: "series" })}</div>
              <div class="legend" style="flex-direction:column;gap:8px">${stats.groupDist.map((d) => `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span><b>${d.label}</b> · ${d.value} series</div>`).join("")}</div>
            </div>
          </div>

          <div class="card chart-card">
            <div class="chart-head">
              <h3>Progresión de fuerza</h3>
              <select class="select select-inline" id="progExercise">${stats.exerciseOptions}</select>
            </div>
            <div class="chart-wrap" id="progChart">${Charts.lineChart(stats.progSeries, { color: "#2e7d46", color2: "#2f6690" })}</div>
            <div class="legend"><div class="legend-item"><span class="legend-dot" style="background:#2e7d46"></span>1RM estimado (Epley)</div></div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Volumen semanal</h3><span class="hint">Últimas 8 semanas</span></div>
            <div class="chart-wrap">${Charts.barChart(stats.weeklyVolume, { color: "#2f6690" })}</div>
          </div>
        </div>

        <div class="card mt-24">
          <div class="section-title mb-16">🏆 Records personales <span class="count-pill">${stats.records.length}</span></div>
          ${stats.records.length ? stats.records.map((r, i) => `
            <div class="record-row">
              <div class="record-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
              <div>
                <div class="record-name">${escapeHtml(r.name)}</div>
                <div class="record-meta">${r.group} · ${r.bestReps} reps · 1RM est. ${fmtNum(r.oneRM)} kg</div>
              </div>
              <div class="record-val"><b>${fmtNum(r.maxWeight)} kg</b><span>mejor marca</span></div>
            </div>`).join("") : '<div class="text-dim">Registra más series para ver tus records.</div>'}
        </div>`;

    const sel = $("#progExercise");
    if (sel) {
      sel.value = statsExercise || sel.value;
      sel.addEventListener("change", () => {
        statsExercise = sel.value;
        $("#progChart").innerHTML = Charts.lineChart(progressionSeries(sel.value), { color: "#2e7d46", color2: "#2f6690" });
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
            <div class="chart-wrap">${Charts.lineChart(cs.distanceSeries, { color: "#a5324a", color2: "#c07a1e" })}</div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Reparto por actividad</h3><span class="hint">${cs.useKm ? "por distancia" : "por tiempo"}</span></div>
            <div class="row wrap" style="gap:18px;align-items:center;justify-content:center">
              <div style="max-width:220px;flex:1;min-width:180px">${Charts.donutChart(cs.activityDist, { centerLabel: cs.useKm ? fmtNum(Math.round(cs.totalKm)) : String(Math.round(cs.totalMin)), centerSub: cs.useKm ? "km" : "min" })}</div>
              <div class="legend" style="flex-direction:column;gap:8px">${cs.activityDist.map((d) => `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span><b>${escapeHtml(d.label)}</b> · ${fmtNum(d.value)} ${cs.useKm ? "km" : "min"}</div>`).join("")}</div>
            </div>
          </div>

          <div class="card chart-card">
            <div class="chart-head">
              <h3>Progresión de ritmo</h3>
              <select class="select select-inline" id="paceExercise">${cs.exerciseOptions}</select>
            </div>
            <div class="chart-wrap" id="paceChart">${Charts.lineChart(cs.paceSeries, { color: "#2f6690", color2: "#1f8a80" })}</div>
            <div class="legend"><div class="legend-item"><span class="legend-dot" style="background:#2f6690"></span>min/km · cuanto más bajo, mejor ↓</div></div>
          </div>

          <div class="card chart-card">
            <div class="chart-head"><h3>Distancia semanal</h3><span class="hint">Últimas 8 semanas · km</span></div>
            <div class="chart-wrap">${Charts.barChart(cs.weeklyDistance, { color: "#a5324a" })}</div>
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
        $("#paceChart").innerHTML = Charts.lineChart(cardioPaceSeries(sel.value), { color: "#2f6690", color2: "#1f8a80" });
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
    const totalVolume = asc.reduce((a, w) => a + DB.workoutVolume(w), 0);
    const count = asc.length;
    const avgVolume = count ? totalVolume / count : 0;
    let totalSets = 0;
    asc.forEach((w) => (totalSets += DB.workoutSetCount(w)));

    // volume series (last 14)
    const recent = asc.slice(-14);
    const volumeSeries = recent.map((w) => ({
      label: new Date(w.date + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "numeric" }),
      value: DB.workoutVolume(w),
    }));

    // group distribution (series count)
    const groupCounts = {};
    asc.forEach((w) => (w.entries || []).forEach((en) => {
      const ex = DB.exerciseById(en.exerciseId);
      if (!ex) return;
      groupCounts[ex.group] = (groupCounts[ex.group] || 0) + en.sets.length;
    }));
    const groupDist = Object.entries(groupCounts)
      .map(([k, v]) => ({ label: G[k].name, value: v, color: G[k].color }))
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

    return { totalVolume, count, avgVolume, totalSets, volumeSeries, groupDist, weeklyVolume, weekDelta, exerciseOptions, progSeries, records };
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
        if (!map[en.exerciseId]) map[en.exerciseId] = { id: en.exerciseId, name: ex.name, group: G[ex.group].name, maxWeight: 0, bestReps: 0, oneRM: 0 };
        const rec = map[en.exerciseId];
        if (wgt > rec.maxWeight) { rec.maxWeight = wgt; rec.bestReps = reps; }
        if (orm > rec.oneRM) rec.oneRM = orm;
      });
    }));
    return Object.values(map).filter((r) => r.maxWeight > 0).sort((a, b) => b.oneRM - a.oneRM).slice(0, 8);
  }

  function isoOf(d) {
    const x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  }
  function mondayOf(date) {
    const d = new Date(date + (typeof date === "string" ? "T00:00:00" : ""));
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
        <div class="lib-filters">${filters}</div>
        <div class="lib-grid">
          ${filtered.map((e) => {
            const g = G[e.group];
            const imgs = resolveMedia(e);
            const icon = imgs.length
              ? `<img class="lib-thumb" src="${imgs[0]}" loading="lazy" alt="" onerror="this.remove()">`
              : g.abbr;
            return `<div class="card lib-card" data-open-ex="${e.id}">
              <div class="lib-icon" style="background:${g.color}1a;color:${g.color}">${icon}</div>
              <div style="min-width:0">
                <div class="lib-name">${escapeHtml(e.name)}</div>
                <div class="lib-cat">${g.name}</div>
              </div>
              ${e.custom ? `<button class="icon-btn danger" data-del-ex="${e.id}" title="Eliminar" style="margin-left:auto"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`
                : `<span class="lib-badge">BASE</span>`}
            </div>`;
          }).join("") || `<div class="empty-hint" style="grid-column:1/-1">No hay ejercicios en este grupo.</div>`}
        </div>
      </div>`;

    $("#newExerciseBtn").addEventListener("click", () => openCreateExercise(libFilter !== "all" ? libFilter : "pecho", ""));
    $$("[data-filter]").forEach((b) => b.addEventListener("click", () => { libFilter = b.dataset.filter; renderExercises(); }));
    $$("[data-del-ex]").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      DB.deleteExercise(b.dataset.delEx);
      toast("Ejercicio eliminado", "info");
      renderExercises();
    }));
    $$("[data-open-ex]").forEach((c) => c.addEventListener("click", () => openExerciseDetail(c.dataset.openEx)));
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
      <div class="modal-actions">
        ${ex.custom ? `<button class="btn btn-danger" id="delDetail">Eliminar</button>` : ""}
        <button class="btn btn-primary" id="startFromDetail">Usar en el entreno</button>
      </div>
    `);

    $("#closeDetail").addEventListener("click", closeModal);
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
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelCreate">Cancelar</button>
        <button class="btn btn-primary" id="saveCreate">Crear ejercicio</button>
      </div>
    `);
    const nameInput = $("#exName");
    nameInput.focus();
    $("#closeCreate").addEventListener("click", closeModal);
    $("#cancelCreate").addEventListener("click", closeModal);
    const submit = () => {
      const name = nameInput.value.trim();
      const group = $("#exGroup").value;
      if (!name) { toast("Escribe un nombre", "error"); return; }
      const ex = DB.addExercise(name, group);
      closeModal();
      toast("Ejercicio creado ✓", "success");
      if (currentView === "exercises") renderExercises();
      else if (currentView === "today" && draft) { addEntry(ex.id); }
    };
    $("#saveCreate").addEventListener("click", submit);
    nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  }

  /* ============================================================
     IMPORT / EXPORT
     ============================================================ */
  /* ---------- kg ⇄ lb converter ---------- */
  function openConverter() {
    openModal(`
      <div class="modal-head">
        <button class="icon-btn" id="convBack" title="Herramientas"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
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
    $("#convBack").addEventListener("click", openTools);
    kg.focus();
  }
  (function () { const b = document.getElementById("convBtn"); if (b) b.addEventListener("click", openConverter); })();

  /* ---------- Tools menu ---------- */
  function openTools() {
    openModal(`
      <div class="modal-head">
        <div><h2>Herramientas</h2></div>
        <button class="icon-btn" id="closeTools"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="tools-list">
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
      </div>
    `);
    $("#closeTools").addEventListener("click", closeModal);
    $("#toolTimer").addEventListener("click", () => { closeModal(); global.RestTimer.open("rest", openTools); });
    $("#toolStopwatch").addEventListener("click", () => { closeModal(); global.RestTimer.open("stopwatch", openTools); });
    $("#toolConv").addEventListener("click", openConverter);
  }
  global.__toolsBack = openTools;
  (function () { const b = document.getElementById("toolsBtn"); if (b) b.addEventListener("click", openTools); })();

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
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat, bmi };
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
      const rows = entries.map((e, i) => `
        <div class="food-entry">
          <div class="fe-info"><div class="fe-name">${escapeHtml(e.name)}</div><div class="fe-sub">${e.grams} g · ${Math.round((Number(e.kcal) || 0) * e.grams / 100)} kcal</div></div>
          <button class="icon-btn danger" data-del-entry="${key}:${i}" title="Quitar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>`).join("") || `<div class="fe-empty">Sin alimentos</div>`;
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
        <div class="meals-grid mt-16">${meals}</div>
      </div>`;

    $("#prevDay").addEventListener("click", () => { foodDate = addDays(foodDate, -1); renderFoodDiary(); });
    const nx = $("#nextDay"); if (nx && !isToday) nx.addEventListener("click", () => { foodDate = addDays(foodDate, 1); renderFoodDiary(); });
    const tb = $("#todayBtn"); if (tb) tb.addEventListener("click", () => { foodDate = todayISO(); renderFoodDiary(); });
    $("#copyDayBtn").addEventListener("click", openCopyDay);
    $$("[data-add-food]").forEach((b) => b.addEventListener("click", () => openFoodPicker(b.dataset.addFood)));
    $$("[data-del-entry]").forEach((b) => b.addEventListener("click", () => {
      const [meal, idx] = b.dataset.delEntry.split(":");
      ensureDay(foodDate)[meal].splice(+idx, 1);
      DB.save();
      renderFoodDiary();
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
        $("#fpList").innerHTML = `<div class="fe-empty" style="padding:20px">Buscando…</div>`;
        foodSearchTimer = setTimeout(async () => {
          try {
            const data = await global.Auth.api("/api/food/search?q=" + encodeURIComponent(q), { auth: true });
            $("#fpList").innerHTML = foodResultList(data.items || [], "Resultados");
            bindFoodResults(meal);
          } catch (err) { $("#fpList").innerHTML = `<div class="fe-empty" style="padding:20px">${escapeHtml(err.message || "Error al buscar")}</div>`; }
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
    const canScan = typeof window.BarcodeDetector !== "undefined" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    let stream = null, raf = null, detector = null;
    const stopScan = () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
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
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        video.srcObject = stream; await video.play();
        $("#bcScan").classList.add("live");
        startBtn.textContent = "Escaneando…"; startBtn.disabled = true;
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
     BOOT
     ============================================================ */
  function boot() {
    DB.load();
    draft = newDraft();
    // Re-render current view when the theme changes (recolors charts).
    global.__onThemeChange = function () { render(); };

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
