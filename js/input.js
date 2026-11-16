/* Kaiju Brawl - unified keyboard & multitouch pointer input with 6-tick buffering. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const U = KB.Util;
  const BUFFER_TICKS = 6;
  const JOY_RADIUS = 56;
  const JOY_DEADZONE = 0.12;
  const FLICK_WINDOW_MS = 250;

  const keys = Object.create(null);
  const touchHeld = {
    jump: 0,
    block: 0
  };

  const buf = {
    light: 0,
    heavy: 0,
    grab: 0,
    jumpPressed: 0,
    dodgePressed: 0,
    specialPressed: 0,
    ultimatePressed: 0,
    facePressed: 0,
    pausePressed: 0
  };

  const intent = {
    moveX: 0,
    moveY: 0,
    light: false,
    heavy: false,
    grab: false,
    jumpPressed: false,
    jumpHeld: false,
    blockHeld: false,
    dodgePressed: false,
    specialPressed: false,
    ultimatePressed: false,
    facePressed: false,
    pausePressed: false
  };

  const isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  const joyZone = document.getElementById('joyZone');
  const joyBase = document.getElementById('joyBase');
  const joyKnob = document.getElementById('joyKnob');
  const btnCluster = document.getElementById('btnCluster');
  const touchControls = document.getElementById('touchControls');

  const joyState = {
    pointerId: null,
    originX: 0,
    originY: 0,
    vx: 0,
    vy: 0,
    aboveFlick: false,
    lastFlickAt: 0,
    lastFlickAngle: 0
  };

  const activeButtons = new Map(); // pointerId -> { btn, act }

  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  }

  function isPlaying() {
    return document.body.classList.contains('playing');
  }

  function triggerAction(act) {
    if (act === 'light') buf.light = BUFFER_TICKS;
    else if (act === 'heavy') buf.heavy = BUFFER_TICKS;
    else if (act === 'grab') buf.grab = BUFFER_TICKS;
    else if (act === 'jump') buf.jumpPressed = BUFFER_TICKS;
    else if (act === 'dodge') buf.dodgePressed = BUFFER_TICKS;
    else if (act === 'special') buf.specialPressed = BUFFER_TICKS;
    else if (act === 'ultimate') buf.ultimatePressed = BUFFER_TICKS;
    else if (act === 'face') buf.facePressed = BUFFER_TICKS;
    else if (act === 'pause') buf.pausePressed = BUFFER_TICKS;
  }

  /* ---- Desktop Keyboard ---- */
  const KEY_ACTIONS = {
    KeyJ: 'light',
    KeyK: 'heavy',
    KeyL: 'grab',
    Space: 'jump',
    Semicolon: 'dodge',
    KeyC: 'dodge',
    KeyI: 'special',
    KeyQ: 'special',
    KeyO: 'ultimate',
    KeyE: 'ultimate',
    KeyH: 'face',
    KeyP: 'pause',
    Escape: 'pause'
  };

  window.addEventListener('keydown', function (e) {
    if (isTyping(e)) return;
    if (isPlaying() && (e.code === 'Space' || e.code.indexOf('Arrow') === 0)) {
      e.preventDefault();
    }
    const wasDown = !!keys[e.code];
    keys[e.code] = true;
    if (!wasDown && !e.repeat && isPlaying()) {
      const act = KEY_ACTIONS[e.code];
      if (act) triggerAction(act);
    }
  });

  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

  /* ---- Floating Virtual Joystick ---- */
  function resetJoystickVisual() {
    if (joyBase) {
      joyBase.classList.remove('active');
      joyBase.style.left = '';
      joyBase.style.top = '';
      joyBase.style.bottom = '';
    }
    if (joyKnob) {
      joyKnob.style.left = '50%';
      joyKnob.style.top = '50%';
    }
  }

  function updateJoystickFromClient(clientX, clientY) {
    const dx = clientX - joyState.originX;
    const dy = clientY - joyState.originY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(JOY_RADIUS, dist);
    const nx = dist > 1e-4 ? dx / dist : 0;
    const ny = dist > 1e-4 ? dy / dist : 0;

    if (joyKnob) {
      joyKnob.style.left = (50 + (nx * clampedDist / JOY_RADIUS) * 50) + '%';
      joyKnob.style.top = (50 + (ny * clampedDist / JOY_RADIUS) * 50) + '%';
    }

    const rawMag = clampedDist / JOY_RADIUS;
    if (rawMag < JOY_DEADZONE) {
      joyState.vx = 0;
      joyState.vy = 0;
      if (rawMag < 0.40) joyState.aboveFlick = false;
      return;
    }

    const scaled = (rawMag - JOY_DEADZONE) / (1 - JOY_DEADZONE);
    joyState.vx = nx * scaled;
    joyState.vy = ny * scaled;

    // Double-flick beyond 80% deflection within 250ms triggers dodge
    if (rawMag >= 0.80) {
      if (!joyState.aboveFlick) {
        const now = performance.now();
        const angle = Math.atan2(ny, nx);
        let diff = Math.abs(angle - joyState.lastFlickAngle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (now - joyState.lastFlickAt < FLICK_WINDOW_MS && diff < Math.PI / 3) {
          triggerAction('dodge');
          joyState.lastFlickAt = 0;
        } else {
          joyState.lastFlickAt = now;
          joyState.lastFlickAngle = angle;
        }
      }
      joyState.aboveFlick = true;
    } else if (rawMag < 0.40) {
      joyState.aboveFlick = false;
    }
  }

  if (joyZone) {
    joyZone.addEventListener('pointerdown', function (e) {
      if (!isPlaying() || joyState.pointerId !== null) return;
      e.preventDefault();
      joyState.pointerId = e.pointerId;
      try { joyZone.setPointerCapture(e.pointerId); } catch (err) { }

      const rect = joyZone.getBoundingClientRect();
      const pad = JOY_RADIUS + 4;
      const minX = rect.left + pad;
      const maxX = Math.max(minX, rect.right - pad);
      const minY = rect.top + pad;
      const maxY = Math.max(minY, rect.bottom - pad);
      joyState.originX = U.clamp(e.clientX, minX, maxX);
      joyState.originY = U.clamp(e.clientY, minY, maxY);

      if (joyBase) {
        joyBase.classList.add('active');
        joyBase.style.left = (joyState.originX - rect.left - JOY_RADIUS) + 'px';
        joyBase.style.top = (joyState.originY - rect.top - JOY_RADIUS) + 'px';
        joyBase.style.bottom = 'auto';
      }
      updateJoystickFromClient(e.clientX, e.clientY);
    });

    joyZone.addEventListener('pointermove', function (e) {
      if (e.pointerId !== joyState.pointerId) return;
      e.preventDefault();
      updateJoystickFromClient(e.clientX, e.clientY);
    });

    const releaseJoy = function (e) {
      if (e.pointerId !== joyState.pointerId) return;
      joyState.pointerId = null;
      joyState.vx = 0;
      joyState.vy = 0;
      joyState.aboveFlick = false;
      resetJoystickVisual();
    };
    joyZone.addEventListener('pointerup', releaseJoy);
    joyZone.addEventListener('pointercancel', releaseJoy);
    joyZone.addEventListener('lostpointercapture', releaseJoy);
  }

  /* ---- Multitouch Action Button Cluster ---- */
  if (btnCluster) {
    btnCluster.addEventListener('pointerdown', function (e) {
      const btn = e.target && e.target.closest('.act-btn');
      if (!btn || !isPlaying() || btn.classList.contains('hidden')) return;
      e.preventDefault();
      const act = btn.getAttribute('data-act');
      if (!act) return;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { }
      activeButtons.set(e.pointerId, { btn: btn, act: act });
      btn.classList.add('pressed');
      if (act === 'jump') touchHeld.jump++;
      if (act === 'block') touchHeld.block++;
      triggerAction(act);
    });

    const releaseBtn = function (e) {
      const info = activeButtons.get(e.pointerId);
      if (!info) return;
      activeButtons.delete(e.pointerId);
      info.btn.classList.remove('pressed');
      if (info.act === 'jump') touchHeld.jump = Math.max(0, touchHeld.jump - 1);
      if (info.act === 'block') touchHeld.block = Math.max(0, touchHeld.block - 1);
    };
    btnCluster.addEventListener('pointerup', releaseBtn);
    btnCluster.addEventListener('pointercancel', releaseBtn);
    btnCluster.addEventListener('lostpointercapture', releaseBtn);
  }

  if (touchControls) {
    ['touchstart', 'touchmove'].forEach(function (evName) {
      touchControls.addEventListener(evName, function (e) {
        if (isPlaying()) e.preventDefault();
      }, { passive: false });
    });
  }

  function reset() {
    for (const k in keys) keys[k] = false;
    for (const k in buf) buf[k] = 0;
    touchHeld.jump = 0;
    touchHeld.block = 0;
    joyState.pointerId = null;
    joyState.vx = 0;
    joyState.vy = 0;
    joyState.aboveFlick = false;
    resetJoystickVisual();
    activeButtons.forEach(function (info) {
      info.btn.classList.remove('pressed');
    });
    activeButtons.clear();
  }

  function sampleIntent() {
    let kx = 0;
    let ky = 0;
    if (keys.KeyA || keys.ArrowLeft) kx -= 1;
    if (keys.KeyD || keys.ArrowRight) kx += 1;
    if (keys.KeyW || keys.ArrowUp) ky -= 1;
    if (keys.KeyS || keys.ArrowDown) ky += 1;
    if (kx !== 0 && ky !== 0) {
      const inv = 1 / Math.SQRT2;
      kx *= inv;
      ky *= inv;
    }

    let mx = kx + joyState.vx;
    let my = ky + joyState.vy;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }

    intent.moveX = mx;
    intent.moveY = my;
    intent.light = buf.light > 0;
    intent.heavy = buf.heavy > 0;
    intent.grab = buf.grab > 0;
    intent.jumpPressed = buf.jumpPressed > 0;
    intent.jumpHeld = !!keys.Space || touchHeld.jump > 0;
    intent.blockHeld = !!keys.KeyU || !!keys.ShiftLeft || !!keys.ShiftRight || touchHeld.block > 0;
    intent.dodgePressed = buf.dodgePressed > 0;
    intent.specialPressed = buf.specialPressed > 0;
    intent.ultimatePressed = buf.ultimatePressed > 0;
    intent.facePressed = buf.facePressed > 0;
    intent.pausePressed = buf.pausePressed > 0;
    return intent;
  }

  function consume(flagName) {
    if (Object.prototype.hasOwnProperty.call(buf, flagName)) {
      buf[flagName] = 0;
      intent[flagName] = false;
    }
  }

  function endTick() {
    for (const k in buf) {
      if (buf[k] > 0) buf[k]--;
    }
  }

  KB.Input = {
    isTouchDevice: isTouchDevice,
    setLogicalSize: function () { },
    reset: reset,
    sampleIntent: sampleIntent,
    consume: consume,
    endTick: endTick,
    readIntent: function () { return intent; }
  };
})();
