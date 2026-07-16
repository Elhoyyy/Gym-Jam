/* ============================================================
   Gym&Jam — build script: generate js/exercise-extra.js
   Extended exercise catalog curated in extra-exercises.mjs,
   images from free-exercise-db (public domain).
   Validates every dataset name and every group, and checks the
   Spanish names don't collide with the base defaults.
   Run: node scripts/gen-extra.js
   ============================================================ */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { EXTRA, REMAP } from "./extra-exercises.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

// --- load base defaults via the storage module (same trick as gen-media) ---
globalThis.window = {};
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
await import("../js/storage.js");
const DB = window.DB; DB.load();
const base = DB.get().exercises.filter((e) => !e.custom);
const baseKeys = new Set(base.map((e) => e.name.toLowerCase() + "@@" + e.group));
const GROUPS = new Set(Object.keys(DB.GROUPS));

const data = await (await fetch(DATA_URL)).json();
const byName = new Map(data.map((e) => [e.name, e]));

const errors = [];
const media = {};
const catalog = [];
const seen = new Set();

EXTRA.forEach(([es, group, en, flags]) => {
  const d = byName.get(en);
  const key = es.toLowerCase() + "@@" + group;
  if (!d) errors.push(`No existe en el dataset: "${en}" (${es})`);
  else if (!d.images || !d.images.length) errors.push(`Sin imágenes: "${en}" (${es})`);
  if (!GROUPS.has(group)) errors.push(`Grupo desconocido "${group}" (${es})`);
  if (baseKeys.has(key)) errors.push(`Colisiona con un ejercicio base: "${es}" (${group})`);
  if (seen.has(key)) errors.push(`Duplicado en EXTRA: "${es}" (${group})`);
  seen.add(key);
  if (!d || !d.images || !d.images.length) return;
  catalog.push(flags ? [es, group, flags] : [es, group]);
  media[es + "@@" + group] = d.images.slice(0, 2);
});

// Media fixes for base exercises (override entries in EXERCISE_MEDIA).
Object.entries(REMAP).forEach(([key, en]) => {
  const d = byName.get(en);
  const [name, group] = key.split("@@");
  if (!d || !d.images || !d.images.length) { errors.push(`REMAP: no existe o sin imágenes "${en}" (${key})`); return; }
  if (!baseKeys.has(name.toLowerCase() + "@@" + group)) errors.push(`REMAP: "${key}" no es un ejercicio base`);
  media[key] = d.images.slice(0, 2);
});

if (errors.length) {
  console.error("ERRORES:\n" + errors.join("\n"));
  process.exit(1);
}

// Report base defaults that still have no media at all (informative).
const mediaFile = await import("../js/exercise-media.js").catch(() => null);
const baseMedia = window.EXERCISE_MEDIA || {};
const unmapped = base.filter((e) => e.group !== "cardio" && !baseMedia[e.name + "@@" + e.group] && !media[e.name + "@@" + e.group]);
if (unmapped.length) console.log("Ejercicios base sin imagen (ni base ni remap):\n  " + unmapped.map((e) => e.name + " · " + e.group).join("\n  "));

const body = `/* Auto-generado por scripts/gen-extra.js — NO editar a mano.
   Catálogo ampliado (curado en scripts/extra-exercises.mjs) con imágenes de
   free-exercise-db (https://github.com/yuhonas/free-exercise-db, dominio público).
   - EXERCISE_EXTRA: [nombre, grupo, flags?] — storage.js lo fusiona con los
     ejercicios por defecto en cada load() (no destructivo).
   - Las entradas de imagen se añaden sobre EXERCISE_MEDIA (mismas claves
     "nombre@@grupo"); las repetidas corrigen mapeos antiguos. */
window.EXERCISE_EXTRA = ${JSON.stringify(catalog)};
Object.assign(window.EXERCISE_MEDIA = window.EXERCISE_MEDIA || {}, ${JSON.stringify(media)});
`;
writeFileSync(join(ROOT, "js", "exercise-extra.js"), body);
console.log(`OK: ${catalog.length} ejercicios nuevos + ${Object.keys(REMAP).length} correcciones de imagen → js/exercise-extra.js`);
const perGroup = {};
catalog.forEach(([, g]) => (perGroup[g] = (perGroup[g] || 0) + 1));
console.log("Por grupo:", perGroup);
