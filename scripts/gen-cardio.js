/* ============================================================
   Gym&Jam — build script: cardio illustrations
   Pulls clean pictograms from Tabler Icons (MIT) via the Iconify
   API and composes each into a 3:2 white card that matches the
   exercise media frame. Self-hosted output (offline, no deps).
   Run: node scripts/gen-cardio.js
   ============================================================ */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "cardio");
const COLOR = "#33302a";

// filename -> Tabler icon id
const MAP = {
  treadmill: "tabler:treadmill",
  bike: "tabler:bike",
  elliptical: "tabler:walk",
  rower: "tabler:kayak",
  stairs: "tabler:stairs",
  jumprope: "tabler:jump-rope",
  run: "tabler:run",
};

for (const [file, id] of Object.entries(MAP)) {
  const res = await fetch("https://api.iconify.design/" + id.replace(":", "/") + ".svg");
  const svg = await res.text();
  const m = svg.match(/viewBox="0 0 24 24">([\s\S]*)<\/svg>/);
  if (!m) { console.log("!! no se pudo parsear", id); continue; }
  const inner = m[1].replaceAll("currentColor", COLOR);
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" role="img" aria-label="${file}">
  <rect width="120" height="80" fill="#ffffff"/>
  <g transform="translate(60 40) scale(2.6) translate(-12 -12)">${inner}</g>
</svg>
`;
  writeFileSync(join(OUT, file + ".svg"), out);
  console.log("escrito assets/cardio/" + file + ".svg  <- " + id);
}
