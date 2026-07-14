/* ============================================================
   Gym&Jam — Storage layer & exercise library
   Pure data. No DOM. Persists to localStorage.
   ============================================================ */
(function (global) {
  "use strict";

  const STORAGE_KEY = "gym&jam.v1";

  /* --- Muscle groups ---------------------------------------- */
  const GROUPS = {
    pecho:    { name: "Pecho",     abbr: "PE", color: "#c1432e" },
    espalda:  { name: "Espalda",   abbr: "ES", color: "#2f6690" },
    hombro:   { name: "Hombro",    abbr: "HO", color: "#1f8a80" },
    biceps:   { name: "Bíceps",    abbr: "BI", color: "#6f8b2f" },
    triceps:  { name: "Tríceps",   abbr: "TR", color: "#c07a1e" },
    pierna:   { name: "Pierna",    abbr: "PI", color: "#3f7350" },
    gluteo:   { name: "Glúteo",    abbr: "GL", color: "#b0572f" },
    abdomen:  { name: "Abdomen",   abbr: "AB", color: "#6b53a3" },
    cardio:   { name: "Cardio",    abbr: "CA", color: "#a5324a" },
    movilidad:{ name: "Movilidad", abbr: "MO", color: "#5b8a72" },
  };

  /* --- Default exercise library ----------------------------- */
  const DEFAULT_EXERCISES = [
    // ---- Pecho ----
    ["Press banca con barra", "pecho"], ["Press banca con mancuernas", "pecho"],
    ["Press inclinado con barra", "pecho"], ["Press inclinado con mancuernas", "pecho"],
    ["Press declinado con barra", "pecho"], ["Press declinado con mancuernas", "pecho"],
    ["Press en máquina", "pecho"], ["Press inclinado en máquina", "pecho"],
    ["Press banca en multipower", "pecho"], ["Press inclinado en multipower", "pecho"],
    ["Aperturas con mancuernas", "pecho"], ["Aperturas inclinadas con mancuernas", "pecho"],
    ["Aperturas en máquina (peck deck)", "pecho"], ["Cruce de poleas (alto)", "pecho"],
    ["Cruce de poleas (medio)", "pecho"], ["Cruce de poleas (bajo)", "pecho"],
    ["Fondos en paralelas", "pecho", { bw: true }], ["Fondos en paralelas con lastre", "pecho", { bw: true, loadable: true }],
    ["Fondos en máquina asistida", "pecho"],
    ["Flexiones", "pecho", { bw: true }], ["Pullover con mancuerna", "pecho"],

    // ---- Espalda ----
    ["Dominadas", "espalda", { bw: true }], ["Dominada con lastre", "espalda", { bw: true, loadable: true }],
    ["Dominadas supinas (chin-up)", "espalda", { bw: true }],
    ["Dominadas agarre estrecho", "espalda", { bw: true }], ["Dominadas asistidas", "espalda"],
    ["Jalón al pecho", "espalda"], ["Jalón agarre estrecho", "espalda"],
    ["Jalón agarre supino", "espalda"], ["Jalón unilateral en polea", "espalda"],
    ["Jalón con agarre en V", "espalda"], ["Jalón tras nuca", "espalda"],
    ["Remo con barra", "espalda"], ["Remo Pendlay", "espalda"],
    ["Remo a 45° con barra (Yates)", "espalda"],
    ["Remo con mancuerna", "espalda"], ["Remo inclinado en banco (mancuernas)", "espalda"],
    ["Remo en máquina", "espalda"],
    ["Remo en polea baja", "espalda"], ["Remo en punta (T-bar)", "espalda"],
    ["Remo Gironda (al pecho)", "espalda"], ["Remo invertido", "espalda", { bw: true }],
    ["Peso muerto convencional", "espalda"],
    ["Peso muerto sumo", "espalda"], ["Pullover en polea", "espalda"],
    ["Encogimientos con barra", "espalda"], ["Encogimientos con mancuernas", "espalda"],
    ["Hiperextensiones lumbares", "espalda"],

    // ---- Hombro ----
    ["Press militar con barra", "hombro"], ["Press militar con mancuernas", "hombro"],
    ["Press Arnold", "hombro"], ["Press en máquina", "hombro"],
    ["Press militar en multipower", "hombro"], ["Elevaciones laterales con mancuernas", "hombro"],
    ["Elevaciones laterales en polea", "hombro"], ["Elevaciones laterales en máquina", "hombro"],
    ["Elevaciones frontales con mancuernas", "hombro"], ["Elevaciones frontales con barra", "hombro"],
    ["Elevaciones frontales con disco", "hombro"], ["Pájaros con mancuernas (posterior)", "hombro"],
    ["Pájaros en máquina (posterior)", "hombro"], ["Face pull", "hombro"],
    ["Remo al mentón (upright row)", "hombro"],

    // ---- Bíceps ----
    ["Curl con barra", "biceps"], ["Curl con barra Z", "biceps"],
    ["Curl con mancuernas", "biceps"], ["Curl alterno con mancuernas", "biceps"],
    ["Curl martillo", "biceps"], ["Curl martillo en polea", "biceps"],
    ["Curl predicador (Scott)", "biceps"],
    ["Curl predicador en máquina", "biceps"], ["Curl en polea", "biceps"],
    ["Curl bayesian", "biceps"], ["Curl tumbado en banco inclinado", "biceps"],
    ["Curl crucifijo en polea alta", "biceps"], ["Curl concentrado", "biceps"],
    ["Curl inclinado con mancuernas", "biceps"], ["Curl araña (spider)", "biceps"],
    ["Curl 21s", "biceps"], ["Curl inverso (prono)", "biceps"],
    ["Curl con cuerda en polea", "biceps"],

    // ---- Tríceps ----
    ["Press francés con barra", "triceps"], ["Press francés con mancuernas", "triceps"],
    ["Extensión en polea con barra", "triceps"], ["Extensión en polea con cuerda", "triceps"],
    ["Extensión en polea unilateral", "triceps"], ["Extensión sobre la cabeza en polea", "triceps"],
    ["Extensión con mancuerna sobre la cabeza", "triceps"], ["Fondos en banco", "triceps"],
    ["Fondos en paralelas (tríceps)", "triceps"], ["Patada de tríceps", "triceps"],
    ["Press cerrado", "triceps"], ["Extensión en máquina", "triceps"],
    ["Extensión en polea tras nuca (cuerda)", "triceps"], ["Press francés en polea", "triceps"],
    ["Fondos en máquina asistida", "triceps"],

    // ---- Pierna ----
    ["Sentadilla con barra", "pierna"], ["Sentadilla frontal", "pierna"],
    ["Sentadilla búlgara", "pierna"], ["Sentadilla goblet", "pierna"],
    ["Sentadilla en multipower", "pierna"], ["Sentadilla sissy", "pierna"],
    ["Prensa inclinada", "pierna"], ["Prensa horizontal", "pierna"],
    ["Hack squat", "pierna"], ["Extensión de cuádriceps", "pierna"],
    ["Curl femoral tumbado", "pierna"], ["Curl femoral sentado", "pierna"],
    ["Peso muerto rumano", "pierna"], ["Peso muerto piernas rígidas", "pierna"],
    ["Zancadas", "pierna"], ["Zancadas caminando", "pierna"],
    ["Subida al cajón (step-up)", "pierna"], ["Elevación de gemelos de pie", "pierna"],
    ["Elevación de gemelos sentado", "pierna"], ["Elevación de gemelos en prensa", "pierna"],
    ["Aductores en máquina", "pierna"], ["Abductores en máquina", "pierna"],

    // ---- Glúteo ----
    ["Hip thrust con barra", "gluteo"], ["Hip thrust en máquina", "gluteo"],
    ["Puente de glúteo", "gluteo"], ["Patada de glúteo en polea", "gluteo"],
    ["Patada de glúteo en máquina", "gluteo"], ["Abducción de cadera en máquina", "gluteo"],
    ["Abducción con banda elástica", "gluteo"], ["Sentadilla sumo", "gluteo"],
    ["Peso muerto rumano (glúteo)", "gluteo"], ["Kickback con tobillera", "gluteo"],

    // ---- Abdomen ----
    ["Crunch", "abdomen"], ["Crunch en máquina", "abdomen"],
    ["Crunch en polea (de rodillas)", "abdomen"], ["Elevación de piernas colgado", "abdomen"],
    ["Elevación de piernas en banco", "abdomen"], ["Elevación de rodillas en paralelas", "abdomen"],
    ["Plancha", "abdomen"], ["Plancha lateral", "abdomen"],
    ["Rueda abdominal", "abdomen"], ["Russian twist", "abdomen"],
    ["Mountain climbers", "abdomen"], ["Oblicuos con mancuerna (side bend)", "abdomen"],

    // ---- Cardio ----
    ["Cinta de correr", "cardio"], ["Caminata inclinada", "cardio"],
    ["Bicicleta estática", "cardio"], ["Bicicleta de spinning", "cardio"],
    ["Elíptica", "cardio"], ["Remo (máquina)", "cardio"], ["Remo", "cardio"],
    ["Escaladora (stairmaster)", "cardio"], ["Assault bike", "cardio"],
    ["Comba", "cardio"], ["Sprints", "cardio"], ["Burpees", "cardio"],
    ["Caminar", "cardio"], ["Nadar", "cardio"], ["Senderismo", "cardio"],
    ["Patinar", "cardio"], ["Esquí", "cardio"],

    // ---- Movilidad / estiramientos ----
    ["Estiramiento de isquiotibiales", "movilidad"], ["Estiramiento de cuádriceps", "movilidad"],
    ["Estiramiento de gemelos", "movilidad"], ["Estiramiento de glúteo", "movilidad"],
    ["Estiramiento de pecho", "movilidad"], ["Estiramiento de espalda (gato)", "movilidad"],
    ["Postura del niño", "movilidad"], ["Rodillas al pecho", "movilidad"],
    ["Estiramiento de cuello", "movilidad"], ["Círculos de brazos", "movilidad"],
  ];

  /* --- ID helper -------------------------------------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* --- Default state ---------------------------------------- */
  function seedExercises() {
    return DEFAULT_EXERCISES.map(([name, group, flags]) => ({
      id: uid(), name, group, custom: false, ...(flags || {}),
    }));
  }

  function defaultNutrition() {
    return {
      profile: { sex: "", age: "", height: "", weight: "", activity: "moderate", goal: "maintain" },
      targets: { kcal: 0, protein: 0, carbs: 0, fat: 0, auto: true },
      foods: [],   // custom saved foods: {id, name, brand, kcal, protein, carbs, fat}  (per 100 g)
      log: {},     // "YYYY-MM-DD": { desayuno:[entry], comida:[], cena:[], snack:[] }
      water: {},   // "YYYY-MM-DD": ml drunk that day
    };            // entry: {id, name, grams, kcal, protein, carbs, fat}  (macros per 100 g)
  }

  function defaultState() {
    return {
      version: 1,
      exercises: seedExercises(),
      workouts: [],    // {id, date, groups:[], notes, entries:[{exerciseId, sets:[{weight, reps}]}]}
      templates: [],   // {id, name, groups:[], entries:[{exerciseId, sets:[{weight, reps}]}]}
      nutrition: defaultNutrition(),
      bodyweight: [],  // [{date:"YYYY-MM-DD", kg}] — one entry per day
      settings: { unit: "kg" },
    };
  }

  /* --- Load / save ------------------------------------------ */
  let state = null;
  let cacheKey = STORAGE_KEY;   // localStorage key (per-user when logged in)
  const saveHooks = [];         // called after every persisted change (for cloud sync)

  function setCacheKey(key) { cacheKey = key || STORAGE_KEY; }
  function onSave(fn) { if (typeof fn === "function") saveHooks.push(fn); }

  // Add any default exercises the user doesn't already have (non-destructive).
  function mergeDefaults() {
    const seen = new Set(
      state.exercises.map((e) => (e.name || "").toLowerCase() + "|" + e.group)
    );
    let added = 0;
    DEFAULT_EXERCISES.forEach(([name, group, flags]) => {
      const key = name.toLowerCase() + "|" + group;
      if (!seen.has(key)) {
        state.exercises.push({ id: uid(), name, group, custom: false, ...(flags || {}) });
        seen.add(key);
        added++;
      } else if (flags && flags.bw) {
        // Backfill the bodyweight flag onto a pre-existing default exercise
        // (e.g. "Dominadas" saved before this flag existed) so it switches to
        // reps-only. Custom user exercises are left untouched.
        const ex = state.exercises.find((e) => !e.custom && (e.name || "").toLowerCase() === name.toLowerCase() && e.group === group);
        if (ex && !ex.bw) { ex.bw = true; if (flags.loadable) ex.loadable = true; invalidateEx(); }
      }
    });
    if (added) invalidateEx();
    return added;
  }

  // Strip the stored `weight` from already-saved sets of bodyweight exercises
  // (reps-only). Runs once per state load; keeps drops' weights off too. Returns
  // the number of sets changed so callers can persist if anything moved.
  function migrateBodyweightSets() {
    let changed = 0;
    const isBw = (id) => { const e = exerciseById(id); return e && e.bw && !e.loadable; };
    const strip = (s) => {
      if (s.weight !== undefined && s.weight !== "" && Number(s.weight) !== 0) { s.weight = ""; changed++; }
      if (Array.isArray(s.drops)) s.drops.forEach((d) => { if (d.weight !== undefined && d.weight !== "" && Number(d.weight) !== 0) { d.weight = ""; changed++; } });
    };
    (state.workouts || []).forEach((w) => (w.entries || []).forEach((en) => { if (isBw(en.exerciseId)) (en.sets || []).forEach(strip); }));
    (state.templates || []).forEach((t) => (t.entries || []).forEach((en) => { if (isBw(en.exerciseId)) (en.sets || []).forEach(strip); }));
    return changed;
  }

  // Normalize a raw state object into a valid state (in place on `state`).
  function normalize() {
    if (!Array.isArray(state.exercises) || !state.exercises.length) {
      state.exercises = seedExercises();
    }
    if (!Array.isArray(state.workouts)) state.workouts = [];
    if (!Array.isArray(state.templates)) state.templates = [];
    if (!state.nutrition || typeof state.nutrition !== "object") state.nutrition = defaultNutrition();
    else {
      const d = defaultNutrition();
      if (!state.nutrition.profile) state.nutrition.profile = d.profile;
      if (!state.nutrition.targets) state.nutrition.targets = d.targets;
      if (!Array.isArray(state.nutrition.foods)) state.nutrition.foods = [];
      if (!state.nutrition.log || typeof state.nutrition.log !== "object") state.nutrition.log = {};
      if (!state.nutrition.water || typeof state.nutrition.water !== "object") state.nutrition.water = {};
    }
    if (!Array.isArray(state.bodyweight)) state.bodyweight = [];
    const added = mergeDefaults();               // also backfills bw flags
    const migrated = migrateBodyweightSets();    // strip weight from bw sets
    return added + migrated;                     // >0 → caller persists
  }

  function load() {
    invalidateEx();
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) { state = defaultState(); save(true); return state; }
      state = Object.assign(defaultState(), JSON.parse(raw));
      if (normalize() > 0) save(true);
      return state;
    } catch (e) {
      console.error("No se pudo cargar; se reinicia estado.", e);
      state = defaultState();
      return state;
    }
  }

  // Replace the whole state (e.g. pulled from the server). Does not trigger sync.
  function replaceState(obj) {
    state = Object.assign(defaultState(), obj || {});
    invalidateEx();
    normalize();
    save(true);
    return state;
  }

  function save(silent) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(state));
    } catch (e) {
      console.error("No se pudo guardar en localStorage.", e);
    }
    if (!silent) saveHooks.forEach((h) => { try { h(state); } catch (_) {} });
  }

  function get() { return state || load(); }

  /* --- Exercises -------------------------------------------- */
  let exIndex = null;   // id -> exercise (lazy cache for O(1) lookups)
  function invalidateEx() { exIndex = null; }

  function addExercise(name, group, unilateral) {
    name = (name || "").trim();
    if (!name) return null;
    const exists = state.exercises.find(
      (e) => e.name.toLowerCase() === name.toLowerCase() && e.group === group
    );
    if (exists) return exists;
    const ex = { id: uid(), name, group, custom: true };
    if (unilateral) ex.unilateral = true;
    state.exercises.push(ex);
    invalidateEx();
    save();
    return ex;
  }
  // Toggle the "unilateral" flag on an existing exercise (cosmetic Izq/Dcha labels).
  function setUnilateral(id, val) {
    const ex = exerciseById(id);
    if (!ex) return;
    if (val) ex.unilateral = true; else delete ex.unilateral;
    save();
  }

  function deleteExercise(id) {
    state.exercises = state.exercises.filter((e) => e.id !== id);
    invalidateEx();
    save();
  }

  function exerciseById(id) {
    if (!exIndex) exIndex = new Map(state.exercises.map((e) => [e.id, e]));
    return exIndex.get(id) || null;
  }

  /* --- Workouts --------------------------------------------- */
  function saveWorkout(workout) {
    // Strip empty sets / entries (cardio sets use min/km instead of weight/reps)
    workout.entries = (workout.entries || [])
      .map((en) => {
        const ex = exerciseById(en.exerciseId);
        const cardio = ex && ex.group === "cardio";
        const note = typeof en.note === "string" ? en.note.trim() : "";
        return {
          exerciseId: en.exerciseId,
          ...(note ? { note } : {}),
          sets: (en.sets || [])
            .filter((s) =>
              cardio
                ? (Number(s.min) > 0 || Number(s.km) > 0)
                : (Number(s.weight) >= 0 && Number(s.reps) > 0)
            )
            .map((s) => {
              // Drop empty drop segments; remove the array if none remain.
              if (!cardio && Array.isArray(s.drops)) {
                const drops = s.drops.filter((d) => Number(d.reps) > 0 && Number(d.weight) >= 0);
                if (drops.length) s.drops = drops; else delete s.drops;
              }
              return s;
            }),
        };
      })
      .filter((en) => en.sets.length > 0);

    if (workout.id) {
      const idx = state.workouts.findIndex((w) => w.id === workout.id);
      if (idx >= 0) state.workouts[idx] = workout;
      else state.workouts.push(workout);
    } else {
      workout.id = uid();
      state.workouts.push(workout);
    }
    save();
    return workout;
  }

  function deleteWorkout(id) {
    state.workouts = state.workouts.filter((w) => w.id !== id);
    save();
  }

  function workoutById(id) {
    return state.workouts.find((w) => w.id === id) || null;
  }

  function sortedWorkouts() {
    return [...state.workouts].sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /* --- Templates (routines) --------------------------------- */
  function saveTemplate(tpl) {
    tpl.entries = (tpl.entries || [])
      .map((en) => ({
        exerciseId: en.exerciseId,
        // Deep-copy: a shallow {...s} would share the nested `drops` array, so
        // editing the template later would mutate the source workout's drops.
        sets: (en.sets || []).map((s) => {
          const c = { ...s };
          if (Array.isArray(s.drops)) c.drops = s.drops.map((d) => ({ ...d }));
          return c;
        }),
      }))
      .filter((en) => en.sets.length > 0);

    if (tpl.id) {
      const idx = state.templates.findIndex((t) => t.id === tpl.id);
      if (idx >= 0) state.templates[idx] = tpl;
      else state.templates.push(tpl);
    } else {
      tpl.id = uid();
      tpl.createdAt = Date.now();
      state.templates.push(tpl);
    }
    save();
    return tpl;
  }

  function deleteTemplate(id) {
    state.templates = state.templates.filter((t) => t.id !== id);
    save();
  }

  function templateById(id) {
    return state.templates.find((t) => t.id === id) || null;
  }

  function renameTemplate(id, name) {
    const t = templateById(id);
    if (t) { t.name = (name || "").trim() || t.name; save(); }
    return t;
  }

  function sortedTemplates() {
    return [...state.templates].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "es", { sensitivity: "base" })
    );
  }

  /* --- Body weight ------------------------------------------ */
  // One entry per day (re-logging the same day overwrites). Returns asc by date.
  function bodyweightLog() {
    return [...(state.bodyweight || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  function logBodyweight(date, kg) {
    kg = Math.round(Number(kg) * 10) / 10;
    if (!date || !isFinite(kg) || kg <= 0) return null;
    if (!Array.isArray(state.bodyweight)) state.bodyweight = [];
    const existing = state.bodyweight.find((e) => e.date === date);
    if (existing) existing.kg = kg;
    else state.bodyweight.push({ date, kg });
    save();
    return { date, kg };
  }
  function deleteBodyweight(date) {
    state.bodyweight = (state.bodyweight || []).filter((e) => e.date !== date);
    save();
  }
  function latestBodyweight() {
    const log = bodyweightLog();
    return log.length ? log[log.length - 1] : null;
  }

  /* --- Metrics helpers -------------------------------------- */
  // A dropset is one set with extra lighter "drops" done back-to-back. Its
  // volume includes every drop segment; the top (main) weight/reps still drive
  // 1RM and PRs elsewhere (drops are lighter, so they're ignored for strength).
  function setVolume(s) {
    let v = (Number(s.weight) || 0) * (Number(s.reps) || 0);
    if (Array.isArray(s.drops)) s.drops.forEach((d) => { v += (Number(d.weight) || 0) * (Number(d.reps) || 0); });
    return v;
  }

  function workoutVolume(w) {
    let v = 0;
    (w.entries || []).forEach((en) =>
      (en.sets || []).forEach((s) => (v += setVolume(s)))
    );
    return v;
  }

  function workoutSetCount(w) {
    let c = 0;
    (w.entries || []).forEach((en) => (c += (en.sets || []).length));
    return c;
  }

  // Estimated 1RM (Epley formula)
  function estimate1RM(weight, reps) {
    weight = Number(weight) || 0; reps = Number(reps) || 0;
    if (reps <= 0) return 0;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  }

  /* --- Import / export -------------------------------------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.workouts)) {
      throw new Error("Archivo no válido");
    }
    state = Object.assign(defaultState(), parsed);
    // Use the same normalizer as load()/replaceState() so nutrition and
    // bodyweight are validated too (a malformed backup with a non-array
    // bodyweight would otherwise crash later in bodyweightLog()).
    normalize();
    save();
    return state;
  }

  function resetAll() {
    state = defaultState();
    save();
    return state;
  }

  global.DB = {
    GROUPS, STORAGE_KEY,
    load, save, get, uid,
    addExercise, deleteExercise, exerciseById, setUnilateral,
    saveWorkout, deleteWorkout, workoutById, sortedWorkouts,
    saveTemplate, deleteTemplate, templateById, renameTemplate, sortedTemplates,
    bodyweightLog, logBodyweight, deleteBodyweight, latestBodyweight,
    setVolume, workoutVolume, workoutSetCount, estimate1RM,
    exportJSON, importJSON, resetAll,
    setCacheKey, onSave, replaceState,
  };
})(window);
