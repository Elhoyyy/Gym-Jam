/* ============================================================
   Gym&Jam — build script: avatares de animales
   Pulls animal silhouettes from Game Icons (game-icons.net,
   CC BY 3.0) via the Iconify API and composes each onto a
   muted solid tile from the app palette. Self-hosted output
   (offline, no deps). Run: node scripts/gen-avatars.js
   Attribution lives in README.md and inside each SVG.
   ============================================================ */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "avatars");
mkdirSync(OUT, { recursive: true });

const INK = "#f3eee2"; // warm cream, same family as --paper

// filename -> [game-icons id, tile colour]
// Colours are muted/earthy on purpose so the tiles sit well on the
// warm-paper UI in both themes.
const MAP = {
  gorila:   ["gorilla",    "#4a4238"],
  oso:      ["bear-head",  "#7a5c3e"],
  toro:     ["bull",       "#b0442a"],
  lobo:     ["wolf-head",  "#5b6770"],
  leon:     ["lion",       "#c08a2e"],
  tigre:    ["tiger-head", "#d97f2a"],
  aguila:   ["eagle-head", "#46604f"],
  elefante: ["elephant",   "#8a8577"],
  tiburon:  ["shark-jaws", "#3e5c74"],
  zorro:    ["fox-head",   "#c26436"],
  jabali:   ["boar",       "#6b4a44"],
  panda:    ["panda",      "#37413b"],
};

for (const [file, [id, bg]] of Object.entries(MAP)) {
  const res = await fetch("https://api.iconify.design/game-icons/" + id + ".svg");
  const svg = await res.text();
  const m = svg.match(/viewBox="0 0 512 512">([\s\S]*)<\/svg>/);
  if (!m) { console.log("!! no se pudo parsear", id); continue; }
  const inner = m[1].replaceAll("currentColor", INK);
  // Full-bleed tile; the UI clips it to whatever radius the chip uses.
  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${file}">
  <!-- icon: game-icons:${id} · game-icons.net · CC BY 3.0 -->
  <rect width="96" height="96" fill="${bg}"/>
  <g transform="translate(48 48) scale(0.145) translate(-256 -256)">${inner}</g>
</svg>
`;
  writeFileSync(join(OUT, file + ".svg"), out);
  console.log("escrito assets/avatars/" + file + ".svg  <- game-icons:" + id);
}
