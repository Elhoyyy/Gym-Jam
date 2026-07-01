/* ============================================================
   GymAndJam — Lightweight SVG charts (no dependencies)
   Returns SVG markup strings. Responsive via viewBox.
   ============================================================ */
(function (global) {
  "use strict";

  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
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

  /* --- Line / area chart ------------------------------------ */
  // data: [{label, value}]
  function lineChart(data, opts) {
    opts = opts || {};
    const W = 640, H = 260;
    const padL = 46, padR = 18, padT = 18, padB = 34;
    const color = opts.color || "#7c5cff";
    const color2 = opts.color2 || "#ff5d8f";
    const gid = "g" + Math.random().toString(36).slice(2, 7);

    if (!data.length) return emptyChart(W, H);

    const maxV = niceMax(Math.max(...data.map((d) => d.value), 1));
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const n = data.length;
    const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v) => padT + innerH - (v / maxV) * innerH;

    // grid + y labels
    let grid = "";
    const rows = 4;
    for (let r = 0; r <= rows; r++) {
      const gy = padT + (r / rows) * innerH;
      const val = maxV * (1 - r / rows);
      grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#e7e1d3" stroke-width="1" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" fill="#a49d8b" font-size="11" text-anchor="end" font-family="Inter">${fmt(val)}</text>`;
    }

    // x labels (max ~7)
    let xlabels = "";
    const step = Math.max(1, Math.ceil(n / 7));
    data.forEach((d, i) => {
      if (i % step === 0 || i === n - 1) {
        xlabels += `<text x="${x(i).toFixed(1)}" y="${H - 12}" fill="#a49d8b" font-size="10.5" text-anchor="middle" font-family="Inter">${esc(d.label)}</text>`;
      }
    });

    const linePts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
    const areaPts = `${padL},${(padT + innerH).toFixed(1)} ${linePts} ${x(n - 1).toFixed(1)},${(padT + innerH).toFixed(1)}`;

    let dots = "";
    data.forEach((d, i) => {
      dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="2"><title>${esc(d.label)}: ${fmt(d.value)}</title></circle>`;
    });

    return `<svg ${NS} viewBox="0 0 ${W} ${H}" role="img">
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
      ${xlabels}
    </svg>`;
  }

  /* --- Bar chart -------------------------------------------- */
  // data: [{label, value, color?}]
  function barChart(data, opts) {
    opts = opts || {};
    const W = 640, H = 260;
    const padL = 46, padR = 18, padT = 18, padB = 34;
    const baseColor = opts.color || "#7c5cff";

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
      grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#e7e1d3" stroke-width="1" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" fill="#a49d8b" font-size="11" text-anchor="end" font-family="Inter">${fmt(val)}</text>`;
    }

    let bars = "";
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const bx = cx - bw / 2;
      const by = y(d.value);
      const bh = padT + innerH - by;
      const c = d.color || baseColor;
      bars += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, bh).toFixed(1)}" rx="6" fill="${c}"><title>${esc(d.label)}: ${fmt(d.value)}</title></rect>`;
      bars += `<text x="${cx.toFixed(1)}" y="${H - 12}" fill="#6a6459" font-size="10.5" text-anchor="middle" font-family="Inter">${esc(d.label)}</text>`;
    });

    return `<svg ${NS} viewBox="0 0 ${W} ${H}" role="img">${grid}${bars}</svg>`;
  }

  /* --- Donut chart ------------------------------------------ */
  // data: [{label, value, color}]
  function donutChart(data, opts) {
    opts = opts || {};
    const size = 220, r = 88, r2 = 58, cx = size / 2, cy = size / 2;
    const total = data.reduce((a, d) => a + d.value, 0);

    if (!total) {
      return `<svg ${NS} viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${(r + r2) / 2}" fill="none" stroke="#ece7db" stroke-width="${r - r2}"/><text x="${cx}" y="${cy + 5}" fill="#a49d8b" font-size="13" text-anchor="middle" font-family="Inter">Sin datos</text></svg>`;
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
      arcs += `<path d="M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${xi1.toFixed(2)} ${yi1.toFixed(2)} A ${r2} ${r2} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z" fill="${d.color}"><title>${esc(d.label)}: ${Math.round(frac * 100)}%</title></path>`;
      a0 = a1;
    });

    const centerLabel = opts.centerLabel || fmt(total);
    const centerSub = opts.centerSub || "total";

    return `<svg ${NS} viewBox="0 0 ${size} ${size}" role="img">
      ${arcs}
      <text x="${cx}" y="${cy - 2}" fill="#1b1a16" font-size="26" font-weight="700" text-anchor="middle" font-family="Space Grotesk">${esc(centerLabel)}</text>
      <text x="${cx}" y="${cy + 18}" fill="#6a6459" font-size="12" text-anchor="middle" font-family="Inter">${esc(centerSub)}</text>
    </svg>`;
  }

  function emptyChart(W, H) {
    return `<svg ${NS} viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" fill="#a49d8b" font-size="14" text-anchor="middle" font-family="Inter">Sin datos suficientes todavía</text></svg>`;
  }

  global.Charts = { lineChart, barChart, donutChart, fmt };
})(window);
