/* ============================================================
   Gym&Jam — Rest timer
   Floating countdown with presets, pause/resume, ±15s, beep +
   vibration on finish. Independent of the app boot, so it works
   on every screen. Launched from the sidebar menu or its FAB.
   ============================================================ */
(function (global) {
  "use strict";

  const PRESETS = [60, 90, 120, 180];
  let remaining = 0;      // seconds left
  let total = 0;          // seconds of the current run
  let running = false;
  let tickId = null;
  let endAt = 0;          // timestamp when it should reach 0

  let panel, fab;

  /* ---------- sound & haptics ---------- */
  function beep() {
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      [0, 0.28, 0.56].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        o.connect(g); g.connect(ctx.destination);
        const start = ctx.currentTime + t;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        o.start(start); o.stop(start + 0.24);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch (_) {}
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (_) {} }
  }

  /* ---------- format ---------- */
  function mmss(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  /* ---------- rendering ---------- */
  const R = 52, C = 2 * Math.PI * R;

  function render() {
    if (!panel) return;
    const frac = total > 0 ? remaining / total : 0;
    const offset = C * (1 - frac);
    const done = total > 0 && remaining <= 0;

    panel.querySelector(".timer-time").textContent = mmss(remaining);
    panel.querySelector(".timer-ring-fg").style.strokeDashoffset = offset.toFixed(1);
    panel.classList.toggle("is-done", done);
    panel.classList.toggle("is-running", running);

    const playBtn = panel.querySelector("#timerPlay");
    playBtn.innerHTML = running
      ? '<svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>';
    playBtn.setAttribute("title", running ? "Pausar" : "Reanudar");
  }

  function tick() {
    remaining = (endAt - Date.now()) / 1000;
    if (remaining <= 0) {
      remaining = 0; running = false;
      clearInterval(tickId); tickId = null;
      render();
      beep();
      return;
    }
    render();
  }

  /* ---------- controls ---------- */
  function startWith(seconds) {
    total = seconds;
    remaining = seconds;
    running = true;
    endAt = Date.now() + seconds * 1000;
    clearInterval(tickId);
    tickId = setInterval(tick, 200);
    render();
  }
  function togglePause() {
    if (total <= 0) return;
    if (running) {
      running = false;
      clearInterval(tickId); tickId = null;
      remaining = (endAt - Date.now()) / 1000;
    } else {
      if (remaining <= 0) return;
      running = true;
      endAt = Date.now() + remaining * 1000;
      tickId = setInterval(tick, 200);
    }
    render();
  }
  function adjust(delta) {
    if (total <= 0) return;
    remaining = Math.max(0, remaining + delta);
    total = Math.max(total, remaining);
    if (running) endAt = Date.now() + remaining * 1000;
    render();
  }
  function reset() {
    running = false; clearInterval(tickId); tickId = null;
    remaining = 0; total = 0;
    render();
  }

  /* ---------- open / close ---------- */
  function open() { ensure(); panel.classList.add("is-open"); render(); }
  function close() { if (panel) panel.classList.remove("is-open"); }
  function toggle() { if (panel && panel.classList.contains("is-open")) close(); else open(); }

  /* ---------- build DOM ---------- */
  function ensure() {
    if (panel) return;
    panel = document.createElement("div");
    panel.className = "timer-panel";
    panel.innerHTML = `
      <div class="timer-head">
        <span class="timer-title">Descanso</span>
        <button class="icon-btn" id="timerClose" title="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="timer-dial">
        <svg viewBox="0 0 120 120">
          <circle class="timer-ring-bg" cx="60" cy="60" r="${R}" fill="none" stroke-width="8"/>
          <circle class="timer-ring-fg" cx="60" cy="60" r="${R}" fill="none" stroke-width="8"
            stroke-linecap="round" transform="rotate(-90 60 60)"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
        </svg>
        <div class="timer-time">0:00</div>
      </div>
      <div class="timer-presets">
        ${PRESETS.map((s) => `<button class="timer-preset" data-sec="${s}">${mmss(s)}</button>`).join("")}
      </div>
      <div class="timer-controls">
        <button class="icon-btn" id="timerMinus" title="-15s">−15</button>
        <button class="timer-play" id="timerPlay" title="Reanudar"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg></button>
        <button class="icon-btn" id="timerPlus" title="+15s">+15</button>
        <button class="icon-btn" id="timerReset" title="Reiniciar"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`;
    document.body.appendChild(panel);

    panel.querySelector("#timerClose").addEventListener("click", close);
    panel.querySelectorAll(".timer-preset").forEach((b) =>
      b.addEventListener("click", () => startWith(+b.dataset.sec)));
    panel.querySelector("#timerPlay").addEventListener("click", togglePause);
    panel.querySelector("#timerMinus").addEventListener("click", () => adjust(-15));
    panel.querySelector("#timerPlus").addEventListener("click", () => adjust(15));
    panel.querySelector("#timerReset").addEventListener("click", reset);
  }

  function buildFab() {
    fab = document.createElement("button");
    fab.className = "timer-fab";
    fab.id = "timerFab";
    fab.type = "button";
    fab.title = "Temporizador de descanso";
    fab.setAttribute("aria-label", "Temporizador de descanso");
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2M9 2h6M12 5V2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    fab.addEventListener("click", toggle);
    document.body.appendChild(fab);
  }

  function init() {
    buildFab();
    const menuBtn = document.getElementById("restTimerBtn");
    if (menuBtn) menuBtn.addEventListener("click", open);
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.RestTimer = { open, close, toggle, startWith };
})(window);
