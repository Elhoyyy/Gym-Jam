/* ============================================================
   Gym&Jam — build script: generate PNG app icons
   Draws the dumbbell logo (ink background + accent bars) into a
   raster and writes PNGs with Node's zlib. No dependencies.
   Run: node scripts/gen-icons.js
   ============================================================ */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const INK = [27, 26, 22];      // #1b1a16
const ACCENT = [224, 69, 31];  // #e0451f

// --- CRC32 ---
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// --- simple raster ---
function makeIcon(S) {
  const buf = Buffer.alloc(S * S * 4);
  const set = (x, y, c) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4; buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  // background
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) set(x, y, INK);
  // logo geometry on a 24 grid, centered at ~58% size
  const L = S * 0.60, sc = L / 24, ox = (S - L) / 2, oy = (S - L) / 2;
  const gx = (u) => ox + u * sc, gy = (v) => oy + v * sc;
  const hw = 2.2 * sc / 2; // half stroke
  const rect = (x0, y0, x1, y1) => { for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) set(x, y, ACCENT); };
  const disc = (cx, cy, r) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) set(cx + x, cy + y, ACCENT); };
  const vline = (u, v0, v1) => { rect(gx(u) - hw, gy(v0), gx(u) + hw, gy(v1)); disc(gx(u), gy(v0), hw); disc(gx(u), gy(v1), hw); };
  const hline = (v, u0, u1) => { rect(gx(u0), gy(v) - hw, gx(u1), gy(v) + hw); disc(gx(u0), gy(v), hw); disc(gx(u1), gy(v), hw); };
  // dumbbell (mirrors the SVG logo paths)
  hline(12, 6.5, 17.5);
  vline(6.5, 8.5, 15.5);
  vline(3.5, 10, 14);
  vline(17.5, 8.5, 15.5);
  vline(20.5, 10, 14);
  return encodePNG(S, S, buf);
}

for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  writeFileSync(join(OUT, name), makeIcon(size));
  console.log("escrito assets/" + name + " (" + size + "px)");
}
