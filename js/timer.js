/* ============================================================
   Gym&Jam — Temporizador (cuenta atrás) y Cronómetro (adelante)
   Floating panel. Opened in a given mode; each tool has a
   "back" button to return to the tools menu.
   ============================================================ */
(function (global) {
  "use strict";

  const PRESETS = [60, 90, 120, 180];
  let mode = "rest";           // "rest" (countdown) | "stopwatch" (count up)
  let backCb = null;
  let running = false;
  let tickId = null;

  // rest (countdown)
  let remaining = 0, total = 0, endAt = 0;
  // stopwatch (count up)
  let swElapsedMs = 0, swStartTs = 0;

  let panel = null;
  const R = 52, C = 2 * Math.PI * R;

  function beep() {
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (AC) {
        const ctx = new AC();
        [0, 0.28, 0.56].forEach((t) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = "sine"; o.frequency.value = 880;
          o.connect(g); g.connect(ctx.destination);
          const s = ctx.currentTime + t;
          g.gain.setValueAtTime(0.0001, s);
          g.gain.exponentialRampToValueAtTime(0.3, s + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
          o.start(s); o.stop(s + 0.24);
        });
        setTimeout(() => ctx.close(), 1200);
      }
    } catch (_) {}
    if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (_) {} }
  }

  function mmss(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function elapsedSec() { return Math.floor((swElapsedMs + (running && mode === "stopwatch" ? Date.now() - swStartTs : 0)) / 1000); }

  function render() {
    if (!panel) return;
    let secs, frac, done = false;
    if (mode === "rest") { secs = remaining; frac = total > 0 ? remaining / total : 0; done = total > 0 && remaining <= 0; }
    else { secs = elapsedSec(); frac = (secs % 60) / 60; }
    panel.querySelector(".timer-title").textContent = mode === "stopwatch" ? "Cronómetro" : "Temporizador";
    panel.querySelector(".timer-time").textContent = mmss(secs);
    panel.querySelector(".timer-ring-fg").style.strokeDashoffset = (C * (1 - frac)).toFixed(1);
    panel.classList.toggle("is-done", done);
    panel.classList.toggle("mode-stopwatch", mode === "stopwatch");
    panel.classList.toggle("mode-rest", mode === "rest");
    const play = panel.querySelector("#timerPlay");
    play.innerHTML = running
      ? '<svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>';
    play.title = running ? "Pausar" : (mode === "stopwatch" ? "Iniciar" : "Reanudar");
  }

  function startTick() { clearInterval(tickId); tickId = setInterval(tick, 200); }
  function stopTick() { clearInterval(tickId); tickId = null; }
  function tick() {
    if (mode === "rest") {
      remaining = (endAt - Date.now()) / 1000;
      if (remaining <= 0) { remaining = 0; running = false; stopTick(); render(); beep(); return; }
    }
    render();
  }

  function startWith(seconds) {
    total = seconds; remaining = seconds; running = true;
    endAt = Date.now() + seconds * 1000; startTick(); render();
  }
  function togglePlay() {
    if (mode === "rest") {
      if (total <= 0) return;
      if (running) { running = false; stopTick(); remaining = (endAt - Date.now()) / 1000; }
      else { if (remaining <= 0) return; running = true; endAt = Date.now() + remaining * 1000; startTick(); }
    } else {
      if (running) { swElapsedMs += Date.now() - swStartTs; running = false; stopTick(); }
      else { swStartTs = Date.now(); running = true; startTick(); }
    }
    render();
  }
  function adjust(delta) {
    if (mode !== "rest" || total <= 0) return;
    remaining = Math.max(0, remaining + delta);
    total = Math.max(total, remaining);
    if (running) endAt = Date.now() + remaining * 1000;
    render();
  }
  function reset() {
    running = false; stopTick();
    if (mode === "rest") { remaining = 0; total = 0; }
    else { swElapsedMs = 0; swStartTs = 0; }
    render();
  }

  function open(m, onBack) {
    mode = m === "stopwatch" ? "stopwatch" : "rest";
    backCb = typeof onBack === "function" ? onBack : null;
    ensure();
    panel.querySelector("#timerBack").style.display = backCb ? "" : "none";
    panel.classList.add("is-open");
    render();
  }
  function close() { if (panel) panel.classList.remove("is-open"); }

  function ensure() {
    if (panel) return;
    panel = document.createElement("div");
    panel.className = "timer-panel mode-rest";
    panel.innerHTML = `
      <div class="timer-head">
        <button class="icon-btn" id="timerBack" title="Herramientas"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <span class="timer-title">Temporizador</span>
        <button class="icon-btn" id="timerMin" title="Minimizar"><svg viewBox="0 0 24 24"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button class="icon-btn" id="timerClose" title="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="timer-dial">
        <svg viewBox="0 0 120 120">
          <circle class="timer-ring-bg" cx="60" cy="60" r="${R}" fill="none" stroke-width="8"/>
          <circle class="timer-ring-fg" cx="60" cy="60" r="${R}" fill="none" stroke-width="8" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
        </svg>
        <div class="timer-time">0:00</div>
      </div>
      <div class="timer-presets">
        ${PRESETS.map((s) => `<button class="timer-preset" data-sec="${s}">${mmss(s)}</button>`).join("")}
      </div>
      <div class="timer-controls">
        <button class="icon-btn ctl-rest" id="timerMinus" title="-15s">−15</button>
        <button class="timer-play" id="timerPlay" title="Iniciar"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg></button>
        <button class="icon-btn ctl-rest" id="timerPlus" title="+15s">+15</button>
        <button class="icon-btn" id="timerReset" title="Reiniciar"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector("#timerClose").addEventListener("click", close);
    panel.querySelector("#timerMin").addEventListener("click", () => panel.classList.toggle("min"));
    panel.querySelector("#timerBack").addEventListener("click", () => { close(); if (backCb) backCb(); });
    panel.querySelectorAll(".timer-preset").forEach((b) => b.addEventListener("click", () => startWith(+b.dataset.sec)));
    panel.querySelector("#timerPlay").addEventListener("click", togglePlay);
    panel.querySelector("#timerMinus").addEventListener("click", () => adjust(-15));
    panel.querySelector("#timerPlus").addEventListener("click", () => adjust(15));
    panel.querySelector("#timerReset").addEventListener("click", reset);
  }

  function init() {
    document.querySelectorAll(".js-timer-open").forEach((b) =>
      b.addEventListener("click", () => open(b.dataset.timerMode || "rest", global.__toolsBack)));
  }
  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);

  global.RestTimer = { open, close, startWith };
})(window);
