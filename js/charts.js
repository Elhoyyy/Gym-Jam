/* ============================================================
   Gym&Jam — Lightweight SVG charts (no dependencies)
   Returns SVG markup strings. Responsive via viewBox.
   Colors adapt to the active light/dark theme.
   ============================================================ */
(function (global) {
  "use strict";

  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  function themeColors() {
    const dark = typeof document !== "undefined" &&
      document.documentElement.getAttribute("data-theme") === "dark";
    return dark
      ? { grid: "#302b21", axis: "#8f8774", center: "#f2eee5", sub: "#a79f8d", dot: "#1e1c16", ring: "#302b21" }
      : { grid: "#e7e1d3", axis: "#a49d8b", center: "#1b1a16", sub: "#6a6459", dot: "#ffffff", ring: "#ece7db" };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  /* --- Shared interactive tooltip ---------------------------- */
  // One floating element, driven by delegation: any mark carrying data-tip
  // (label) + optional data-tipv (value) gets a styled hover tooltip. Works
  // across re-rendered charts because it listens on the document, not the SVG.
  let tipEl = null;
  function ensureTip() {
    if (tipEl || typeof document === "undefined") return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "chart-tip";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
    return tipEl;
  }
  function showTip(el, x, y) {
    const t = ensureTip();
    if (!t) return;
    // textContent only → never injects markup from user-derived labels.
    t.textContent = "";
    const l = document.createElement("span"); l.className = "tip-l"; l.textContent = el.getAttribute("data-tip") || "";
    t.appendChild(l);
    const v = el.getAttribute("data-tipv");
    if (v) { const b = document.createElement("b"); b.className = "tip-v"; b.textContent = v; t.appendChild(b); }
    t.style.display = "flex";
    const r = t.getBoundingClientRect(), pad = 14;
    let left = x + pad, top = y + pad;
    if (left + r.width > window.innerWidth - 6) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 6) top = y - r.height - pad;
    t.style.left = Math.max(6, left) + "px";
    t.style.top = Math.max(6, top) + "px";
  }
  function hideTip() { if (tipEl) tipEl.style.display = "none"; }
  if (typeof document !== "undefined") {
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest && e.target.closest("[data-tip]");
      if (el) showTip(el, e.clientX, e.clientY); else hideTip();
    }, { passive: true });
    document.addEventListener("pointerdown", hideTip, { passive: true });
    window.addEventListener("scroll", hideTip, { passive: true, capture: true });
    // Note: no document-level "pointerleave" — pointermove already hides the
    // tooltip when the cursor is over any element without [data-tip].
  }

  function isoLocal(d) {
    const x = new Date(d);
    x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
    return x.toISOString().slice(0, 10);
  }

  function niceMax(v) {
    if (v <= 0) return 10;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    let step;
    if (n <= 1) step = 1; else if (n <= 2) step = 2;
    else if (n <= 5) step = 5; else step = 10;
    return step * pow;
  }

  function fmt(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }
  // fmt() rounds to integers, which is fine for compact AXIS labels but wrong
  // for tooltips/point labels of decimal series (78.4 kg → "78", 5.2 km → "5").
  // fmtVal keeps one decimal for exact readouts.
  function fmtVal(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1000) return fmt(n);
    return String(Math.round(n * 10) / 10);
  }

  /* --- Line / area chart ------------------------------------ */
  // data: [{label, value}]
  function lineChart(data, opts) {
    opts = opts || {};
    const tc = themeColors();
    const W = 640, H = 260;
    const padL = 46, padR = 18, padT = 18, padB = 34;
    const color = opts.color || "#e0451f";
    const color2 = opts.color2 || "#c07a1e";
    const gid = "g" + Math.random().toString(36).slice(2, 7);

    if (!data.length) return emptyChart(W, H);

    const n = data.length;
    const vals = data.map((d) => d.value);
    // opts.yFrom === "auto" zooms the Y axis to the data range (with padding)
    // instead of starting at 0 — essential for body weight / pace, where a
    // 0-based axis squashes the line into a flat band at the top.
    const autoY = opts.yFrom === "auto" && n > 1;
    let yMin = 0, yMax;
    if (autoY) {
      const dmin = Math.min(...vals), dmax = Math.max(...vals);
      const range = (dmax - dmin) || Math.max(1, dmax * 0.1);
      yMin = Math.max(0, dmin - range * 0.25);
      yMax = dmax + range * 0.25;
    } else {
      yMax = niceMax(Math.max(...vals, 1));
    }
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const span = (yMax - yMin) || 1;
    const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v) => padT + innerH - ((v - yMin) / span) * innerH;

    let grid = "";
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const gy = padT + (r / rows) * innerH;
      const val = yMax - (r / rows) * span;
      grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${tc.grid}" stroke-width="1" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" fill="${tc.axis}" font-size="11" text-anchor="end" font-family="Inter">${fmt(val)}</text>`;
    }

    let xlabels = "";
    const step = Math.max(1, Math.ceil(n / 7));
    data.forEach((d, i) => {
      if (i % step === 0 || i === n - 1) {
        xlabels += `<text x="${x(i).toFixed(1)}" y="${H - 12}" fill="${tc.axis}" font-size="10.5" text-anchor="middle" font-family="Inter">${esc(d.label)}</text>`;
      }
    });

    const linePts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
    const areaPts = `${padL},${(padT + innerH).toFixed(1)} ${linePts} ${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`;

    const unit = opts.unit ? " " + opts.unit : "";
    let dots = "";
    data.forEach((d, i) => {
      dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.5" fill="${color}" stroke="${tc.dot}" stroke-width="2"/>`;
    });

    // Full-column transparent hit-bands → easy hover tooltip anywhere on the plot.
    let bands = "";
    data.forEach((d, i) => {
      const l = i === 0 ? padL : (x(i - 1) + x(i)) / 2;
      const r = i === n - 1 ? (W - padR) : (x(i) + x(i + 1)) / 2;
      bands += `<rect x="${l.toFixed(1)}" y="${padT}" width="${Math.max(0, r - l).toFixed(1)}" height="${innerH}" fill="transparent" data-tip="${esc(d.label)}" data-tipv="${esc(fmtVal(d.value) + unit)}"/>`;
    });

    // Direct label on the most recent point (selective labelling).
    const lv = data[n - 1];
    const lx = x(n - 1), ly = y(lv.value);
    const labelY = ly < padT + 16 ? ly + 16 : ly - 10;
    const lastLabel = `<text x="${lx.toFixed(1)}" y="${labelY.toFixed(1)}" fill="${tc.center}" font-size="12" font-weight="700" text-anchor="${n === 1 ? "middle" : "end"}" font-family="Space Grotesk">${fmtVal(lv.value)}</text>`;

    return `<svg ${NS} viewBox="0 0 ${W} ${H}" role="img" class="gj-chart">
      <defs>
        <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${gid}l" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${color}"/>
          <stop offset="100%" stop-color="${color2}"/>
        </linearGradient>
      </defs>
      ${grid}
      <polygon points="${areaPts}" fill="url(#${gid})"/>
      <polyline points="${linePts}" fill="none" stroke="url(#${gid}l)" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${lastLabel}
      ${xlabels}
      ${bands}
    </svg>`;
  }

  /* --- Bar chart -------------------------------------------- */
  // data: [{label, value, color?}]
  function barChart(data, opts) {
    opts = opts || {};
    const tc = themeColors();
    const W = 640, H = 260;
    const padL = 46, padR = 18, padT = 18, padB = 34;
    const baseColor = opts.color || "#2f6690";

    if (!data.length) return emptyChart(W, H);

    const maxV = niceMax(Math.max(...data.map((d) => d.value), 1));
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const n = data.length;
    const slot = innerW / n;
    const bw = Math.min(46, slot * 0.62);
    const y = (v) => padT + innerH - (v / maxV) * innerH;

    let grid = "";
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const gy = padT + (r / rows) * innerH;
      const val = maxV * (1 - r / rows);
      grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${tc.grid}" stroke-width="1" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" fill="${tc.axis}" font-size="11" text-anchor="end" font-family="Inter">${fmt(val)}</text>`;
    }

    const unit = opts.unit ? " " + opts.unit : "";
    let bars = "";
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const bx = cx - bw / 2;
      const by = y(d.value);
      const bh = padT + innerH - by;
      const c = d.color || baseColor;
      // Full-height hit target so hovering the column (not just the bar) works.
      bars += `<rect x="${(cx - slot / 2).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${innerH}" fill="transparent" data-tip="${esc(d.label)}" data-tipv="${esc(fmtVal(d.value) + unit)}"/>`;
      bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="6" fill="${c}" pointer-events="none"/>`;
      bars += `<text x="${cx.toFixed(1)}" y="${H - 12}" fill="${tc.sub}" font-size="10.5" text-anchor="middle" font-family="Inter">${esc(d.label)}</text>`;
    });

    return `<svg ${NS} viewBox="0 0 ${W} ${H}" role="img" class="gj-chart">${grid}${bars}</svg>`;
  }

  /* --- Donut chart ------------------------------------------ */
  // data: [{label, value, color}]
  function donutChart(data, opts) {
    opts = opts || {};
    const tc = themeColors();
    const size = 220, r = 88, r2 = 58, cx = size / 2, cy = size / 2;
    const total = data.reduce((a, d) => a + d.value, 0);

    if (!total) {
      return `<svg ${NS} viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${(r + r2) / 2}" fill="none" stroke="${tc.ring}" stroke-width="${r - r2}"/><text x="${cx}" y="${cy + 5}" fill="${tc.axis}" font-size="13" text-anchor="middle" font-family="Inter">Sin datos</text></svg>`;
    }

    let a0 = -Math.PI / 2;
    let arcs = "";
    data.forEach((d) => {
      if (d.value <= 0) return;
      const frac = d.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const xi1 = cx + r2 * Math.cos(a1), yi1 = cy + r2 * Math.sin(a1);
      const xi0 = cx + r2 * Math.cos(a0), yi0 = cy + r2 * Math.sin(a0);
      arcs += `<path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${xi1.toFixed(2)} ${yi1.toFixed(2)} A ${r2} ${r2} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z" fill="${d.color}" data-tip="${esc(d.label)}" data-tipv="${esc(fmtVal(d.value) + (opts.unit ? " " + opts.unit : "") + " · " + Math.round(frac * 100) + "%")}"/>`;
      a0 = a1;
    });

    const centerLabel = opts.centerLabel || fmt(total);
    const centerSub = opts.centerSub || "total";

    return `<svg ${NS} viewBox="0 0 ${size} ${size}" role="img">
      ${arcs}
      <text x="${cx}" y="${cy - 2}" fill="${tc.center}" font-size="26" font-weight="700" text-anchor="middle" font-family="Space Grotesk">${esc(centerLabel)}</text>
      <text x="${cx}" y="${cy + 18}" fill="${tc.sub}" font-size="12" text-anchor="middle" font-family="Inter">${esc(centerSub)}</text>
    </svg>`;
  }

  function emptyChart(W, H) {
    const tc = themeColors();
    return `<svg ${NS} viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" fill="${tc.axis}" font-size="14" text-anchor="middle" font-family="Inter">Sin datos suficientes todavía</text></svg>`;
  }

  /* --- Calendar heatmap (training consistency) --------------- */
  // data: [{date:"YYYY-MM-DD", value:Number}]. One column per week (Mon→Sun
  // rows), colour intensity by value quartiles. Fixed cell size + intrinsic
  // width so it scrolls in its container rather than shrinking to mush.
  const HEAT_STEPS_LIGHT = ["#f3d3c6", "#e8a684", "#dd6f42", "#c1432e"];
  const HEAT_STEPS_DARK = ["#43201a", "#7c3b23", "#b3542c", "#e0451f"];
  const HEAT_MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function heatmap(data, opts) {
    opts = opts || {};
    const tc = themeColors();
    const dark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";
    const steps = dark ? HEAT_STEPS_DARK : HEAT_STEPS_LIGHT;
    const weeks = Math.max(6, Math.min(53, opts.weeks || 26));
    const unit = opts.unit || "";
    const cell = 13, gap = 3, pitch = cell + gap, padL = 22, padT = 18;

    const map = {};
    (data || []).forEach((d) => { if (d && d.date) map[d.date] = (map[d.date] || 0) + (Number(d.value) || 0); });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = isoLocal(today);
    const dow = (today.getDay() + 6) % 7;               // Mon=0
    const start = new Date(today);
    start.setDate(start.getDate() - dow - (weeks - 1) * 7); // Monday, `weeks` cols back

    const vals = Object.values(map).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0);
    const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75);
    // Strict upper bounds so the busiest days always reach the darkest step.
    const bucket = (v) => (v <= 0 ? -1 : v < t1 ? 0 : v < t2 ? 1 : v < t3 ? 2 : 3);

    const W = padL + weeks * pitch, H = padT + 7 * pitch;
    let cells = "", months = "", lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const col = new Date(start); col.setDate(col.getDate() + w * 7);
      const m = col.getMonth();
      if (m !== lastMonth) { lastMonth = m; months += `<text x="${padL + w * pitch}" y="${padT - 6}" fill="${tc.axis}" font-size="10" font-family="Inter">${HEAT_MON[m]}</text>`; }
      for (let r = 0; r < 7; r++) {
        const cd = new Date(start); cd.setDate(cd.getDate() + w * 7 + r);
        const iso = isoLocal(cd);
        if (iso > todayISO) continue;
        const v = map[iso] || 0, b = bucket(v);
        const fill = b < 0 ? tc.ring : steps[b];
        const label = cd.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
        const tipv = v > 0 ? fmt(v) + (unit ? " " + unit : "") : (opts.emptyLabel || "Sin entreno");
        cells += `<rect x="${padL + w * pitch}" y="${padT + r * pitch}" width="${cell}" height="${cell}" rx="2.5" fill="${fill}" data-tip="${esc(label)}" data-tipv="${esc(tipv)}"/>`;
      }
    }
    let dowLabels = "";
    [["L", 0], ["X", 2], ["V", 4]].forEach(([lab, r]) => {
      dowLabels += `<text x="${padL - 7}" y="${padT + r * pitch + cell - 3}" fill="${tc.axis}" font-size="9.5" text-anchor="end" font-family="Inter">${lab}</text>`;
    });
    return `<svg ${NS} viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" class="gj-chart gj-heatmap">${months}${dowLabels}${cells}</svg>`;
  }

  // Swatch colours for a "menos → más" legend, matching the active theme.
  function heatScale() {
    const dark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";
    return [themeColors().ring].concat(dark ? HEAT_STEPS_DARK : HEAT_STEPS_LIGHT);
  }

  global.Charts = { lineChart, barChart, donutChart, heatmap, heatScale, fmt };
})(window);
