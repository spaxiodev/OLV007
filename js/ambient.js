/* ============================================================
   OLV007 - ambient soundtrack
   Subtle background music with a seamless crossfade loop.
   The track is looped within a window [LOOP_START → end]: as one
   player nears the end, a second player starts from LOOP_START and
   the two are gain-crossfaded into each other, so the seam is
   inaudible. User controls: mute toggle + volume slider.

   The site WANTS sound on from the start, but browsers block
   autoplay-with-sound until the user interacts. So we mark the
   control "on" immediately and start the engine either right away
   (if allowed) or on the very first user gesture. `wantsOn` is the
   user's intent; `running` is whether the audio engine is active.
   ============================================================ */
(function () {
  "use strict";

  var wrap = document.getElementById("ambient");
  if (!wrap) return;

  var toggle = document.getElementById("ambientToggle");
  var volEl  = document.getElementById("ambientVol");

  var SRC        = "assets/audio/Tzivaeri-loop.m4a"; // pre-trimmed to the loop window
  var LOOP_START = parseFloat(wrap.getAttribute("data-loop-start")) || 0; // seconds
  var CROSSFADE  = 3.5;   // seconds of overlap between the two players
  var FADE_IN    = 4;     // seconds to gently fade up when sound first begins
  var masterVol  = (parseInt(volEl.value, 10) || 18) / 100;

  /* ---------- two ping-pong players ---------- */
  function makePlayer() {
    var a = new Audio(SRC);
    a.preload = "auto";
    a.loop = false;            // we handle looping manually
    a.volume = 0;
    return a;
  }
  var players = [makePlayer(), makePlayer()];
  var active = 0;             // index of the currently-foreground player
  var crossfading = false;
  var running = false;        // engine actually playing audio
  var wantsOn = true;         // user intent — default ON
  var watching = false;
  var didFadeIn = false;      // only ramp up the very first time sound starts

  // Gently ramp a player from silence up to the master volume.
  function fadeIn(p) {
    var t0 = performance.now();
    (function tick(now) {
      if (!running || crossfading) return;   // crossfade/stop takes over
      var k = Math.min(1, (now - t0) / (FADE_IN * 1000));
      p.volume = masterVol * k;
      if (k < 1 && p === players[active]) requestAnimationFrame(tick);
      else if (p === players[active]) p.volume = masterVol;
    })(t0);
  }

  /* ---------- crossfade engine ---------- */
  // Smoothly ramp two players over CROSSFADE seconds, then settle.
  function runCrossfade(outP, inP) {
    crossfading = true;
    try { inP.currentTime = LOOP_START; } catch (e) {}
    inP.volume = 0;
    var pr = inP.play();
    if (pr && pr.catch) pr.catch(function () {});

    var t0 = performance.now();
    (function tick(now) {
      var k = Math.min(1, (now - t0) / (CROSSFADE * 1000));
      // equal-power crossfade keeps perceived loudness flat through the seam
      inP.volume  = masterVol * Math.sin(k * Math.PI / 2);
      outP.volume = masterVol * Math.cos(k * Math.PI / 2);
      if (k < 1) {
        requestAnimationFrame(tick);
      } else {
        outP.pause();
        try { outP.currentTime = LOOP_START; } catch (e) {}
        inP.volume = masterVol;
        active = (active === 0) ? 1 : 0;
        crossfading = false;
      }
    })(t0);
  }

  // Watch the active player and trigger the crossfade near the end.
  function watch() {
    if (!running) { watching = false; return; }
    var cur = players[active];
    if (!crossfading && cur.duration && isFinite(cur.duration)) {
      if (cur.duration - cur.currentTime <= CROSSFADE) {
        runCrossfade(cur, players[active === 0 ? 1 : 0]);
      }
    }
    requestAnimationFrame(watch);
  }

  /* ---------- engine start / stop ---------- */
  function startEngine() {
    if (running) return;
    var p = players[active];
    try { p.currentTime = LOOP_START; } catch (e) {}
    p.volume = didFadeIn ? masterVol : 0;
    var pr = p.play();
    if (pr && pr.then) {
      pr.then(function () {
        running = true;
        if (!didFadeIn) { didFadeIn = true; fadeIn(p); }
        if (!watching) { watching = true; requestAnimationFrame(watch); }
      }).catch(function () {
        // Autoplay blocked - stay "on" visually, retry on first gesture.
        running = false;
      });
    } else {
      running = true;
      if (!didFadeIn) { didFadeIn = true; fadeIn(p); }
      if (!watching) { watching = true; requestAnimationFrame(watch); }
    }
  }

  function stopEngine() {
    running = false;
    crossfading = false;
    players.forEach(function (p) { p.pause(); });
  }

  /* ---------- UI sync ---------- */
  function paint() {
    wrap.classList.toggle("is-playing", wantsOn);
    toggle.setAttribute("aria-pressed", wantsOn ? "true" : "false");
    toggle.setAttribute("aria-label", wantsOn ? "Mute background music" : "Play background music");
  }

  /* ---------- controls ---------- */
  toggle.addEventListener("click", function () {
    wantsOn = !wantsOn;
    if (wantsOn) startEngine(); else stopEngine();
    paint();
  });

  volEl.addEventListener("input", function () {
    masterVol = (parseInt(volEl.value, 10) || 0) / 100;
    if (running && !crossfading) players[active].volume = masterVol;
  });

  /* ---------- boot: on by default, start ASAP ---------- */
  paint();
  startEngine();   // works where autoplay-with-sound is permitted

  // Fallback: if autoplay was blocked, kick the engine on the first
  // genuine user gesture — but only if the user still wants it on.
  var firstGesture = function () {
    if (wantsOn && !running) startEngine();
    if (running || !wantsOn) {
      window.removeEventListener("pointerdown", firstGesture, true);
      window.removeEventListener("keydown", firstGesture, true);
      window.removeEventListener("scroll", firstGesture, true);
    }
  };
  window.addEventListener("pointerdown", firstGesture, true);
  window.addEventListener("keydown", firstGesture, true);
  window.addEventListener("scroll", firstGesture, { capture: true, passive: true });
})();
