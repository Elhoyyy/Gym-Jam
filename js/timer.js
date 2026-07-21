/* ============================================================
   Gym&Jam — Temporizador (cuenta atrás) y Cronómetro (adelante)
  Floating panel. Opened in a given mode and controlled from the tools menu.
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
  let laps = [];               // total elapsed ms captured at each "Vuelta"

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
    notifyRestOver();
  }

  // System notification for when rest ends while the app isn't in view — the
  // beep/vibration above already cover the foreground case. Never prompts for
  // permission here: that only happens on an explicit user gesture (starting
  // a rest timer), so the first ask isn't a surprise popup on page load.
  function notifyRestOver() {
    if (!document.hidden) return;
    if (!("Notification" in global) || Notification.permission !== "granted") return;
    try {
      const n = new Notification("¡Descanso terminado!", {
        body: "Toca para volver a Gym&Jam y sigue con la siguiente serie.",
        icon: "/assets/icon-192.png",
        badge: "/assets/icon-192.png",
        tag: "gymjam-rest",
        renotify: true,
      });
      n.onclick = () => { global.focus(); n.close(); };
    } catch (_) {}
  }

  // Ask for notification permission once, on the first deliberate rest-timer
  // start — never unprompted on load. Silently no-ops if unsupported, denied,
  // or already decided.
  function maybeAskPermission() {
    if (!("Notification" in global)) return;
    if (Notification.permission !== "default") return;
    try { Notification.requestPermission(); } catch (_) {}
  }

  function mmss(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function elapsedMs() { return swElapsedMs + (running && mode === "stopwatch" ? Date.now() - swStartTs : 0); }
  function elapsedSec() { return Math.floor(elapsedMs() / 1000); }
  function fmtMs(ms) {
    const t = Math.max(0, Math.floor(ms)), s = Math.floor(t / 1000), cs = Math.floor((t % 1000) / 10);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + "." + String(cs).padStart(2, "0");
  }

  const PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor"/></svg>';
  const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>';
  let playShows = null;        // which icon the play button currently shows

  // Cheap per-frame update: time + progress ring only.
  function paint() {
    if (!panel) return;
    let secs, frac;
    if (mode === "rest") { secs = remaining; frac = total > 0 ? remaining / total : 0; }
    else { secs = elapsedSec(); frac = (elapsedMs() % 60000) / 60000; }
    panel.querySelector(".tt-main").textContent = mmss(secs);
    const centis = mode === "rest"
      ? String(Math.max(0, Math.floor((remaining % 1) * 100))).padStart(2, "0")
      : String(Math.floor((elapsedMs() % 1000) / 10)).padStart(2, "0");
    panel.querySelector(".timer-ms").textContent = "." + centis;
    panel.querySelector(".timer-ring-fg").style.strokeDashoffset = (C * (1 - frac)).toFixed(1);
  }

  // Full render: paint + state-dependent bits (title, classes, play icon).
  // The play icon is only rebuilt when its state actually changes, so tapping
  // it never races a per-frame DOM rebuild.
  function render() {
    if (!panel) return;
    const done = mode === "rest" && total > 0 && remaining <= 0;
    paint();
    renderTimeMeta();
    panel.querySelector(".timer-title").textContent = mode === "stopwatch" ? "Cronómetro" : "Temporizador";
    panel.classList.toggle("is-done", done);
    panel.classList.toggle("mode-stopwatch", mode === "stopwatch");
    panel.classList.toggle("mode-rest", mode === "rest");
    const lapBtn = panel.querySelector("#timerLap");
    if (lapBtn) lapBtn.hidden = mode !== "stopwatch";
    if (playShows !== running) {
      playShows = running;
      const play = panel.querySelector("#timerPlay");
      play.innerHTML = running ? PAUSE_SVG : PLAY_SVG;
      play.title = running ? "Pausar" : (mode === "stopwatch" ? "Iniciar" : "Reanudar");
    }
  }

  function renderTimeMeta() {
    if (!panel) return;
    const main = panel.querySelector(".tt-main");
    const ms = panel.querySelector(".timer-ms");
    const lapsInline = panel.querySelector(".timer-laps-inline");
    if (main && ms && mode === "stopwatch") {
      if (lapsInline) lapsInline.textContent = laps.length ? `${laps.length} vuelta${laps.length === 1 ? "" : "s"}` : "";
    }
  }

  function startTick() { clearInterval(tickId); tickId = setInterval(tick, 40); }
  function stopTick() { clearInterval(tickId); tickId = null; }
  function tick() {
    if (mode === "rest") {
      remaining = (endAt - Date.now()) / 1000;
      if (remaining <= 0) { remaining = 0; running = false; stopTick(); render(); beep(); return; }
    }
    paint();
  }

  function startWith(seconds) {
    total = seconds; remaining = seconds; running = true;
    endAt = Date.now() + seconds * 1000; startTick(); render();
    maybeAskPermission();
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
    else { swElapsedMs = 0; swStartTs = 0; laps = []; renderLaps(); }
    render();
  }
  function lap() {
    if (mode !== "stopwatch") return;
    const t = elapsedMs();
    if (t <= 0) return;
    laps.push(t);
    renderLaps();
  }
  function renderLaps() {
    const box = panel && panel.querySelector(".timer-laps");
    if (!box) return;
    let html = "";
    for (let i = laps.length - 1; i >= 0; i--) {
      const split = laps[i] - (i > 0 ? laps[i - 1] : 0);
      html += `<div class="lap-row"><span class="lap-n">Vuelta ${i + 1}</span><span class="lap-split">${fmtMs(split)}</span><span class="lap-total">${fmtMs(laps[i])}</span></div>`;
    }
    box.innerHTML = html;
  }

  function resetState(nextMode) {
    stopTick();
    running = false;
    playShows = null;
    remaining = 0;
    total = 0;
    endAt = 0;
    swElapsedMs = 0;
    swStartTs = 0;
    laps = [];
    if (panel) {
      panel.classList.remove("is-done");
      const lapsBox = panel.querySelector(".timer-laps");
      if (lapsBox) lapsBox.innerHTML = "";
    }
    if (nextMode !== "stopwatch" && panel) {
      const lapsInline = panel.querySelector(".timer-laps-inline");
      if (lapsInline) lapsInline.textContent = "";
    }
  }

  function open(m) {
    mode = m === "stopwatch" ? "stopwatch" : "rest";
    ensure();
    resetState(mode);
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
        <span class="timer-title">Temporizador</span>
        <button class="icon-btn" id="timerMin" title="Minimizar"><svg viewBox="0 0 24 24"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <button class="icon-btn" id="timerClose" title="Cerrar"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="timer-dial">
        <svg viewBox="0 0 120 120">
          <circle class="timer-ring-bg" cx="60" cy="60" r="${R}" fill="none" stroke-width="8"/>
          <circle class="timer-ring-fg" cx="60" cy="60" r="${R}" fill="none" stroke-width="8" stroke-linecap="round" transform="rotate(-90 60 60)" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"/>
        </svg>
        <div class="timer-time"><span class="tt-main">0:00</span><span class="timer-ms"></span><span class="timer-laps-inline"></span></div>
      </div>
      <div class="timer-presets">
        ${PRESETS.map((s) => `<button class="timer-preset" data-sec="${s}">${mmss(s)}</button>`).join("")}
      </div>
      <div class="timer-controls">
        <button class="icon-btn ctl-rest" id="timerMinus" title="-15s">−15</button>
        <button class="icon-btn ctl-sw" id="timerLap" title="Vuelta"><svg viewBox="0 0 24 24"><path d="M7 20V4m0 3c2.4-1.1 4.4 1 6.8 0s3.2-.9 3.2-.9v6.6s-1.2.9-3.4.9-4.4-1.1-6.6 0" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="timer-play" id="timerPlay" title="Iniciar"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg></button>
        <button class="icon-btn ctl-rest" id="timerPlus" title="+15s">+15</button>
        <button class="icon-btn" id="timerReset" title="Reiniciar"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
      <div class="timer-laps"></div>`;
    document.body.appendChild(panel);
    panel.querySelector("#timerClose").addEventListener("click", close);
    panel.querySelector("#timerMin").addEventListener("click", (e) => { e.stopPropagation(); panel.classList.add("min"); });
    panel.addEventListener("click", () => { if (panel.classList.contains("min")) panel.classList.remove("min"); });
    panel.querySelectorAll(".timer-preset").forEach((b) => b.addEventListener("click", () => startWith(+b.dataset.sec)));
    panel.querySelector("#timerPlay").addEventListener("click", togglePlay);
    panel.querySelector("#timerLap").addEventListener("click", (e) => { e.stopPropagation(); lap(); });
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
