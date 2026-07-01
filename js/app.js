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

  function openModal(html) {
    modal.innerHTML = html;
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
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
    updateStreak();
  }

  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest(".nav-item");
    if (btn && btn.dataset.view) setView(btn.dataset.view);
  });
  document.getElementById("mobileNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".mnav-item");
    if (btn) setView(btn.dataset.view);
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
            <button class="btn btn-primary" id="newTemplateBtn">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              Crear rutina
            </button>
          </div>
        </div>
        ${tpls.length ? `<div class="tpl-grid">${tpls.map(templateCard).join("")}</div>`
          : `<div class="empty-hint"><span class="emoji">📋</span>Todavía no tienes rutinas.<br>Crea una desde cero, o en <b>Entreno de hoy</b> pulsa <b>Guardar como rutina</b>.</div>`}
      </div>`;

    $("#newTemplateBtn").addEventListener("click", () => { draft = newDraft(); setView("today"); toast("Monta tu rutina y pulsa «Guardar como rutina»", "info"); });
    $$("[data-use-tpl]").forEach((b) => b.addEventListener("click", () => useTemplate(b.dataset.useTpl)));
    $$("[data-rename-tpl]").forEach((b) => b.addEventListener("click", () => promptRenameTemplate(b.dataset.renameTpl)));
    $$("[data-del-tpl]").forEach((b) => b.addEventListener("click", () => confirmDeleteTemplate(b.dataset.delTpl)));
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
    if (ex.media) return [ex.media];
    const map = window.EXERCISE_MEDIA || {};
    const base = window.EXERCISE_MEDIA_BASE || "";
    const paths = map[ex.name + "@@" + ex.group] || map[ex.name];
    return paths && paths.length ? paths.map((p) => base + p) : [];
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
        : "Aún no registrado";
    } else {
      statLine = st.count
        ? `${st.count} sesiones · PR ${fmtNum(st.bestW)} kg · 1RM est. ${fmtNum(Math.round(st.best1rm))} kg`
        : "Aún no registrado";
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
      ${ex.instructions ? `<div class="ex-instructions">${escapeHtml(ex.instructions)}</div>` : ""}
      <div class="modal-actions">
        ${ex.custom ? `<button class="btn btn-danger" id="delDetail">Eliminar</button>` : ""}
        <button class="btn btn-ghost" id="editMedia">${imgs.length ? "Cambiar imagen" : "Añadir imagen"}</button>
        <button class="btn btn-primary" id="startFromDetail">Usar en el entreno</button>
      </div>
    `);

    $("#closeDetail").addEventListener("click", closeModal);
    $("#editMedia").addEventListener("click", () => editExerciseMedia(id));
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

  function editExerciseMedia(id) {
    const ex = DB.exerciseById(id);
    if (!ex) return;
    openModal(`
      <div class="modal-head">
        <div><h2>Imagen e instrucciones</h2><p>Pega la URL de una imagen o GIF. Déjalo vacío para usar la de la biblioteca.</p></div>
        <button class="icon-btn" id="closeEM"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="modal-field"><label>URL de imagen / GIF</label><input class="input" id="emMedia" placeholder="https://…/ejercicio.gif" value="${escapeHtml(ex.media || "")}" autocomplete="off"></div>
      <div class="modal-field"><label>Instrucciones (opcional)</label><textarea class="input" id="emInstr" placeholder="Técnica, consejos, notas…">${escapeHtml(ex.instructions || "")}</textarea></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelEM">Cancelar</button>
        <button class="btn btn-primary" id="saveEM">Guardar</button>
      </div>
    `);
    $("#closeEM").addEventListener("click", closeModal);
    $("#cancelEM").addEventListener("click", closeModal);
    $("#saveEM").addEventListener("click", () => {
      DB.setExerciseMedia(id, $("#emMedia").value, $("#emInstr").value);
      closeModal();
      toast("Guardado", "success");
      openExerciseDetail(id);
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
  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([DB.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gym&jam-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Datos exportados", "success");
  });

  const importFile = document.getElementById("importFile");
  document.getElementById("importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        DB.importJSON(reader.result);
        toast("Datos importados correctamente", "success");
        draft = null;
        render();
      } catch (err) {
        toast("Archivo no válido", "error");
      }
    };
    reader.readAsText(file);
    importFile.value = "";
  });

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    DB.load();
    draft = newDraft();
    setView("today");
    // Re-render current view when the theme changes (recolors charts).
    global.__onThemeChange = function () { render(); };
  }

  // Auth gate: in backend mode this shows login first and pulls the
  // user's data; in local mode (file:// or no server) it boots directly.
  if (global.Auth && typeof global.Auth.init === "function") {
    global.Auth.init({ onReady: boot });
  } else {
    boot();
  }
})(window);
