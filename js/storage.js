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
    ["Fondos en paralelas", "pecho"], ["Fondos en máquina asistida", "pecho"],
    ["Flexiones", "pecho"], ["Pullover con mancuerna", "pecho"],

    // ---- Espalda ----
    ["Dominadas", "espalda"], ["Dominadas supinas (chin-up)", "espalda"],
    ["Dominadas agarre estrecho", "espalda"], ["Dominadas asistidas", "espalda"],
    ["Jalón al pecho", "espalda"], ["Jalón agarre estrecho", "espalda"],
    ["Jalón agarre supino", "espalda"], ["Jalón unilateral en polea", "espalda"],
    ["Remo con barra", "espalda"], ["Remo Pendlay", "espalda"],
    ["Remo con mancuerna", "espalda"], ["Remo en máquina", "espalda"],
    ["Remo en polea baja", "espalda"], ["Remo en punta (T-bar)", "espalda"],
    ["Remo Gironda (al pecho)", "espalda"], ["Peso muerto convencional", "espalda"],
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
    ["Curl martillo", "biceps"], ["Curl predicador (Scott)", "biceps"],
    ["Curl predicador en máquina", "biceps"], ["Curl en polea", "biceps"],
    ["Curl crucifijo en polea alta", "biceps"], ["Curl concentrado", "biceps"],
    ["Curl inclinado con mancuernas", "biceps"], ["Curl araña (spider)", "biceps"],
    ["Curl 21s", "biceps"],

    // ---- Tríceps ----
    ["Press francés con barra", "triceps"], ["Press francés con mancuernas", "triceps"],
    ["Extensión en polea con barra", "triceps"], ["Extensión en polea con cuerda", "triceps"],
    ["Extensión en polea unilateral", "triceps"], ["Extensión sobre la cabeza en polea", "triceps"],
    ["Extensión con mancuerna sobre la cabeza", "triceps"], ["Fondos en banco", "triceps"],
    ["Fondos en paralelas (tríceps)", "triceps"], ["Patada de tríceps", "triceps"],
    ["Press cerrado", "triceps"], ["Extensión en máquina", "triceps"],

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
    ["Elíptica", "cardio"], ["Remo (máquina)", "cardio"],
    ["Escaladora (stairmaster)", "cardio"], ["Assault bike", "cardio"],
    ["Comba", "cardio"], ["Sprints", "cardio"], ["Burpees", "cardio"],
  ];

  /* --- ID helper -------------------------------------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* --- Default state ---------------------------------------- */
  function seedExercises() {
    return DEFAULT_EXERCISES.map(([name, group]) => ({
      id: uid(), name, group, custom: false,
    }));
  }

  function defaultState() {
    return {
      version: 1,
      exercises: seedExercises(),
      workouts: [],    // {id, date, groups:[], notes, entries:[{exerciseId, sets:[{weight, reps}]}]}
      templates: [],   // {id, name, groups:[], entries:[{exerciseId, sets:[{weight, reps}]}]}
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
    DEFAULT_EXERCISES.forEach(([name, group]) => {
      const key = name.toLowerCase() + "|" + group;
      if (!seen.has(key)) {
        state.exercises.push({ id: uid(), name, group, custom: false });
        seen.add(key);
        added++;
      }
    });
    return added;
  }

  // Normalize a raw state object into a valid state (in place on `state`).
  function normalize() {
    if (!Array.isArray(state.exercises) || !state.exercises.length) {
      state.exercises = seedExercises();
    }
    if (!Array.isArray(state.workouts)) state.workouts = [];
    if (!Array.isArray(state.templates)) state.templates = [];
    return mergeDefaults();
  }

  function load() {
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
  function addExercise(name, group) {
    name = (name || "").trim();
    if (!name) return null;
    const exists = state.exercises.find(
      (e) => e.name.toLowerCase() === name.toLowerCase() && e.group === group
    );
    if (exists) return exists;
    const ex = { id: uid(), name, group, custom: true };
    state.exercises.push(ex);
    save();
    return ex;
  }

  function deleteExercise(id) {
    state.exercises = state.exercises.filter((e) => e.id !== id);
    save();
  }

  function exerciseById(id) {
    return state.exercises.find((e) => e.id === id) || null;
  }

  // Set an optional media URL (image/gif) and/or instructions on an exercise.
  function setExerciseMedia(id, media, instructions) {
    const ex = exerciseById(id);
    if (!ex) return null;
    ex.media = (media || "").trim();
    ex.instructions = (instructions || "").trim();
    if (!ex.media) delete ex.media;
    if (!ex.instructions) delete ex.instructions;
    save();
    return ex;
  }

  /* --- Workouts --------------------------------------------- */
  function saveWorkout(workout) {
    // Strip empty sets / entries (cardio sets use min/km instead of weight/reps)
    workout.entries = (workout.entries || [])
      .map((en) => {
        const ex = exerciseById(en.exerciseId);
        const cardio = ex && ex.group === "cardio";
        return {
          exerciseId: en.exerciseId,
          sets: (en.sets || []).filter((s) =>
            cardio
              ? (Number(s.min) > 0 || Number(s.km) > 0)
              : (Number(s.weight) >= 0 && Number(s.reps) > 0)
          ),
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
        sets: (en.sets || []).map((s) => ({ ...s })),
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

  /* --- Metrics helpers -------------------------------------- */
  function setVolume(s) { return (Number(s.weight) || 0) * (Number(s.reps) || 0); }

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
    if (!Array.isArray(state.exercises) || !state.exercises.length) {
      state.exercises = seedExercises();
    }
    if (!Array.isArray(state.templates)) state.templates = [];
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
    addExercise, deleteExercise, exerciseById, setExerciseMedia,
    saveWorkout, deleteWorkout, workoutById, sortedWorkouts,
    saveTemplate, deleteTemplate, templateById, renameTemplate, sortedTemplates,
    setVolume, workoutVolume, workoutSetCount, estimate1RM,
    exportJSON, importJSON, resetAll,
    setCacheKey, onSave, replaceState,
  };
})(window);
