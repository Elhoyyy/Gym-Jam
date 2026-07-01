/* ============================================================
   Gym&Jam — build script: generate js/exercise-media.js
   Maps each default exercise to images from free-exercise-db
   (public domain). Manual overrides first, strict auto-matcher
   as fallback. Run: node scripts/gen-media.js
   ============================================================ */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_URL = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";
const IMG_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// --- load my default exercises via the storage module ---
globalThis.window = {};
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] };
await import("../js/storage.js");
const DB = window.DB; DB.load();
const mine = DB.get().exercises.filter((e) => !e.custom);

const data = await (await fetch(DATA_URL)).json();
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const byName = {}; data.forEach((e) => (byName[norm(e.name)] = e));

// --- manual overrides: exact Spanish name -> exact English dataset name ---
const OV = {
  // Pecho
  "Press banca con barra": "Barbell Bench Press - Medium Grip", "Press banca con mancuernas": "Dumbbell Bench Press",
  "Press inclinado con barra": "Barbell Incline Bench Press - Medium Grip", "Press inclinado con mancuernas": "Incline Dumbbell Press",
  "Press declinado con barra": "Decline Barbell Bench Press", "Press declinado con mancuernas": "Decline Dumbbell Bench Press",
  "Press en máquina": "Machine Bench Press", "Press inclinado en máquina": "Leverage Incline Chest Press",
  "Press banca en multipower": "Smith Machine Bench Press", "Press inclinado en multipower": "Smith Machine Incline Bench Press",
  "Aperturas con mancuernas": "Dumbbell Flyes", "Aperturas inclinadas con mancuernas": "Incline Dumbbell Flyes",
  "Aperturas en máquina (peck deck)": "Butterfly", "Cruce de poleas (alto)": "Cable Crossover",
  "Cruce de poleas (medio)": "Cable Crossover", "Cruce de poleas (bajo)": "Low Cable Crossover",
  "Fondos en paralelas": "Dips - Chest Version", "Flexiones": "Pushups", "Pullover con mancuerna": "Bent-Arm Dumbbell Pullover",
  // Espalda
  "Dominadas": "Pullups", "Dominadas supinas (chin-up)": "Chin-Up", "Dominadas agarre estrecho": "Close-Grip Front Lat Pulldown",
  "Jalón al pecho": "Wide-Grip Lat Pulldown", "Jalón agarre estrecho": "Close-Grip Front Lat Pulldown",
  "Jalón agarre supino": "Underhand Cable Pulldowns", "Jalón unilateral en polea": "Close-Grip Front Lat Pulldown",
  "Remo con barra": "Bent Over Barbell Row",
  "Remo Pendlay": "Bent Over Barbell Row", "Remo con mancuerna": "One-Arm Dumbbell Row",
  "Remo en polea baja": "Seated Cable Rows", "Remo en punta (T-bar)": "Lying T-Bar Row",
  "Remo Gironda (al pecho)": "Seated Cable Rows", "Peso muerto convencional": "Barbell Deadlift",
  "Peso muerto sumo": "Sumo Deadlift", "Pullover en polea": "Straight-Arm Pulldown",
  "Encogimientos con barra": "Barbell Shrug", "Encogimientos con mancuernas": "Dumbbell Shrug",
  "Hiperextensiones lumbares": "Hyperextensions (Back Extensions)",
  // Hombro
  "Press militar con barra": "Standing Military Press", "Press militar con mancuernas": "Dumbbell Shoulder Press",
  "Press Arnold": "Arnold Dumbbell Press", "Press militar en multipower": "Smith Machine Overhead Shoulder Press",
  "Elevaciones laterales con mancuernas": "Side Lateral Raise", "Elevaciones laterales en polea": "Cable Seated Lateral Raise",
  "Elevaciones frontales con mancuernas": "Front Dumbbell Raise", "Elevaciones frontales con barra": "Standing Front Barbell Raise Over Head",
  "Elevaciones frontales con disco": "Front Plate Raise", "Pájaros con mancuernas (posterior)": "Reverse Flyes",
  "Pájaros en máquina (posterior)": "Reverse Machine Flyes", "Face pull": "Face Pull", "Remo al mentón (upright row)": "Upright Barbell Row",
  // Bíceps
  "Curl con barra": "Barbell Curl", "Curl con barra Z": "Close-Grip EZ Bar Curl", "Curl con mancuernas": "Dumbbell Bicep Curl",
  "Curl alterno con mancuernas": "Dumbbell Alternate Bicep Curl", "Curl martillo": "Hammer Curls", "Curl predicador (Scott)": "Preacher Curl",
  "Curl predicador en máquina": "Machine Preacher Curls", "Curl en polea": "Standing Biceps Cable Curl",
  "Curl concentrado": "Concentration Curls", "Curl inclinado con mancuernas": "Incline Dumbbell Curl",
  "Curl araña (spider)": "Spider Curl",
  // Tríceps
  "Press francés con barra": "Lying Triceps Press", "Press francés con mancuernas": "Lying Triceps Press",
  "Extensión en polea con barra": "Triceps Pushdown", "Extensión en polea con cuerda": "Triceps Pushdown - Rope Attachment",
  "Extensión sobre la cabeza en polea": "Cable Rope Overhead Triceps Extension", "Extensión con mancuerna sobre la cabeza": "Standing Dumbbell Triceps Extension",
  "Fondos en banco": "Bench Dips", "Fondos en paralelas (tríceps)": "Dips - Triceps Version",
  "Patada de tríceps": "Tricep Dumbbell Kickback", "Press cerrado": "Close-Grip Barbell Bench Press",
  // Pierna
  "Sentadilla con barra": "Barbell Full Squat", "Sentadilla frontal": "Front Barbell Squat", "Sentadilla goblet": "Goblet Squat",
  "Sentadilla en multipower": "Smith Machine Squat", "Prensa inclinada": "Leg Press", "Prensa horizontal": "Leg Press",
  "Hack squat": "Barbell Hack Squat", "Extensión de cuádriceps": "Leg Extensions", "Curl femoral tumbado": "Lying Leg Curls",
  "Curl femoral sentado": "Seated Leg Curl", "Peso muerto rumano": "Romanian Deadlift", "Peso muerto piernas rígidas": "Stiff-Legged Barbell Deadlift",
  "Zancadas": "Barbell Lunge", "Zancadas caminando": "Dumbbell Walking Lunge", "Subida al cajón (step-up)": "Dumbbell Step Ups",
  "Elevación de gemelos de pie": "Standing Calf Raises", "Elevación de gemelos sentado": "Seated Calf Raise",
  "Elevación de gemelos en prensa": "Calf Press", "Aductores en máquina": "Thigh Adductor", "Abductores en máquina": "Thigh Abductor",
  // Glúteo
  "Hip thrust con barra": "Barbell Hip Thrust", "Puente de glúteo": "Butt Lift (Bridge)", "Patada de glúteo en polea": "Glute Kickback",
  "Patada de glúteo en máquina": "Glute Kickback", "Sentadilla sumo": "Plie Dumbbell Squat", "Peso muerto rumano (glúteo)": "Romanian Deadlift",
  "Kickback con tobillera": "Glute Kickback",
  // Abdomen
  "Crunch": "Crunches", "Crunch en máquina": "Cable Crunch", "Crunch en polea (de rodillas)": "Cable Crunch",
  "Elevación de piernas colgado": "Hanging Leg Raise", "Elevación de piernas en banco": "Flat Bench Lying Leg Raise",
  "Elevación de rodillas en paralelas": "Hanging Knee Raise", "Plancha": "Plank", "Plancha lateral": "Side Bridge",
  "Rueda abdominal": "Ab Roller", "Russian twist": "Russian Twist", "Mountain climbers": "Mountain Climbers",
  "Oblicuos con mancuerna (side bend)": "Dumbbell Side Bend",
  // extra coverage
  "Fondos en máquina asistida": "Dips - Chest Version", "Dominadas asistidas": "Band Assisted Pull-Up",
  "Remo en máquina": "Seated Cable Rows", "Elevaciones laterales en máquina": "Seated Side Lateral Raise",
  "Curl crucifijo en polea alta": "High Cable Curls", "Curl 21s": "Barbell Curl",
  "Extensión en polea unilateral": "Triceps Pushdown", "Extensión en máquina": "Triceps Pushdown",
  "Sentadilla sissy": "Weighted Sissy Squat", "Sentadilla búlgara": "Dumbbell Rear Lunge",
  "Hip thrust en máquina": "Barbell Hip Thrust", "Abducción de cadera en máquina": "Thigh Abductor",
  "Abducción con banda elástica": "Thigh Abductor", "Zancadas caminando": "Barbell Walking Lunge",
  "Elevación de rodillas en paralelas": "Knee/Hip Raise On Parallel Bars",
};

// group-specific overrides (resolve name collisions across groups)
const OV_G = {
  "Press en máquina@@hombro": "Machine Shoulder (Military) Press",
};

// --- strict auto-matcher (group-constrained) as fallback ---
const T = { "press":"press","banca":"bench","barra":"barbell","mancuernas":"dumbbell","mancuerna":"dumbbell","inclinado":"incline","declinado":"decline","maquina":"machine","multipower":"smith","aperturas":"fly","poleas":"cable","polea":"cable","fondos":"dips","paralelas":"dips","flexiones":"pushup","pullover":"pullover","dominadas":"pullup","supinas":"chin","estrecho":"close","jalon":"pulldown","supino":"underhand","remo":"row","rumano":"romanian","rigidas":"stiff","encogimientos":"shrug","militar":"press","arnold":"arnold","elevaciones":"raise","laterales":"lateral","frontales":"front","disco":"plate","pajaros":"reverse","posterior":"rear","menton":"upright","curl":"curl","z":"ez","martillo":"hammer","predicador":"preacher","concentrado":"concentration","frances":"triceps","extension":"extension","cuerda":"rope","cabeza":"overhead","patada":"kickback","triceps":"triceps","cuadriceps":"extension","femoral":"curl","zancadas":"lunge","subida":"step","gemelos":"calf","sentado":"seated","aductores":"adductor","abductores":"abductor","hip":"hip","thrust":"thrust","gluteo":"glute","puente":"bridge","abduccion":"abduction","kickback":"kickback","crunch":"crunch","plancha":"plank","oblicuos":"side","rueda":"roller","sentadilla":"squat","goblet":"goblet","hack":"hack","prensa":"press","colgado":"hanging","banco":"bench","asistida":"assisted","agarre":"grip","piernas":"leg","bulgara":"bulgarian split","sissy":"sissy" };
const MOVE = new Set(["press","bench","row","deadlift","squat","curl","raise","pulldown","pushup","fly","extension","crunch","plank","lunge","dips","shrug","pullover","pullup","thrust","bridge","kickback","calf","hyperextension","chin","abduction","adductor"]);
const GROUP = { pecho:["chest"], espalda:["lats","middle back","lower back","traps"], hombro:["shoulders"], biceps:["biceps"], triceps:["triceps"], pierna:["quadriceps","hamstrings","calves","glutes","adductors","abductors"], gluteo:["glutes","hamstrings"], abdomen:["abdominals"], cardio:[] };
const GENERIC = new Set(["the","with","a","to","and","of","medium","grip","version","exercise"]);
const q = (n) => { const out = []; norm(n).split(" ").forEach((t) => { if (T[t] !== undefined) { if (T[t]) out.push(...T[t].split(" ")); } else out.push(t); }); return out.filter(Boolean); };
const docs = data.map((e) => ({ e, nt: norm(e.name).split(" "), tok: new Set((norm(e.name) + " " + norm(e.equipment || "") + " " + norm((e.primaryMuscles || []).join(" "))).split(" ")), pm: e.primaryMuscles || [] }));
function auto(m) {
  const qs = q(m.name), qset = new Set(qs), hasMove = qs.some((t) => MOVE.has(t)), allow = GROUP[m.group] || [];
  if (!allow.length) return null;
  let bs = -99, bd = null;
  for (const d of docs) {
    if (!d.pm.some((p) => allow.includes(p))) continue;
    let s = 0; qs.forEach((t) => { if (d.tok.has(t)) s += MOVE.has(t) ? 2 : 1; });
    let extra = 0; d.nt.forEach((t) => { if (!qset.has(t) && !GENERIC.has(t)) extra++; });
    s -= extra * 0.5;
    if (s > bs) { bs = s; bd = d; }
  }
  return bd && bs >= 3.5 && hasMove ? bd.e : null;
}

// --- build map (key: "name@@group") ---
const out = {};
let ov = 0, autoN = 0; const fell = [], autos = [];
mine.forEach((m) => {
  if (m.group === "cardio") return;
  let e = null, via = "";
  const gk = m.name + "@@" + m.group;
  if (OV_G[gk]) { e = byName[norm(OV_G[gk])]; via = "ov"; if (!e) fell.push(gk + " => " + OV_G[gk]); }
  if (!e && OV[m.name]) { e = byName[norm(OV[m.name])]; via = "ov"; if (!e) fell.push(m.name + " => " + OV[m.name]); }
  if (!e) { e = auto(m); via = "auto"; }
  if (e) { out[m.name + "@@" + m.group] = e.images.slice(0, 2); if (via === "ov") ov++; else { autoN++; autos.push(m.name.padEnd(38) + " -> " + e.name); } }
});

const body = `/* Auto-generado por scripts/gen-media.js — NO editar a mano salvo correcciones puntuales.
   Imágenes: free-exercise-db (https://github.com/yuhonas/free-exercise-db, dominio público).
   Clave: "Nombre del ejercicio@@grupo". Valor: rutas relativas a EXERCISE_MEDIA_BASE. */
window.EXERCISE_MEDIA_BASE = ${JSON.stringify(IMG_BASE)};
window.EXERCISE_MEDIA = ${JSON.stringify(out)};
`;
writeFileSync(join(ROOT, "js", "exercise-media.js"), body);

console.log(`Cobertura: ${Object.keys(out).length}/${mine.length}  (overrides ${ov} + auto ${autoN})`);
if (fell.length) console.log("\nOverrides que NO existen en el dataset (cayeron a auto):\n" + fell.join("\n"));
console.log("\n--- AUTO (revisar) ---\n" + autos.join("\n"));
