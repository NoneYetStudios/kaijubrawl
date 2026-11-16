/* Kaiju Brawl - Web Audio API B-movie SFX synth (expanded for M3 combat). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let noiseBuf = null;
  let sfxOn = true;

  try {
    sfxOn = localStorage.getItem('kb_sfx') !== '0';
  } catch (e) { /* storage unavailable */ }

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = sfxOn ? 0.65 : 0;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.85;
    sfxBus.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() {
    if (!init()) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () { /* ignore autoplay block */ });
    }
  }

  function tone(o) {
    if (!ctx || !sfxOn) return;
    const t = o.t !== undefined ? o.t : ctx.currentTime + (o.at || 0);
    const d = o.d || 0.1;
    const v = o.v || 0.2;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g);
    g.connect(sfxBus);
    osc.start(t);
    osc.stop(t + d + 0.03);
  }

  function noise(o) {
    if (!ctx || !sfxOn || !noiseBuf) return;
    const t = ctx.currentTime + (o.at || 0);
    const d = o.d || 0.2;
    const v = o.v || 0.15;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    src.loop = true;
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 900, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f2), t + d);
    f.Q.value = o.q || 1.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.05, d * 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(f);
    f.connect(g);
    g.connect(sfxBus);
    src.start(t);
    src.stop(t + d + 0.03);
  }

  const sfx = {
    click: function () { tone({ f: 720, d: 0.035, v: 0.1, type: 'sine' }); },
    confirm: function () { tone({ f: 520, f2: 780, d: 0.08, v: 0.14, type: 'triangle' }); },
    deny: function () { tone({ f: 220, f2: 140, d: 0.12, v: 0.14, type: 'sawtooth' }); },
    start: function () {
      [262, 330, 392, 523].forEach(function (f, i) {
        tone({ f: f, d: 0.12, v: 0.18, at: i * 0.065, type: 'triangle' });
      });
    },
    whoosh: function () {
      noise({ d: 0.14, v: 0.12, f: 420, f2: 1500, type: 'bandpass', q: 1.0 });
    },
    lightHit: function () {
      noise({ d: 0.11, v: 0.22, f: 900, f2: 320, type: 'bandpass', q: 1.1 });
      tone({ f: 160, f2: 55, d: 0.12, v: 0.26, type: 'triangle' });
    },
    heavyHit: function () {
      noise({ d: 0.22, v: 0.3, f: 500, f2: 120, type: 'lowpass', q: 0.9 });
      tone({ f: 120, f2: 36, d: 0.26, v: 0.35, type: 'sawtooth' });
    },
    block: function () {
      tone({ f: 880, f2: 640, d: 0.07, v: 0.16, type: 'square' });
      noise({ d: 0.06, v: 0.12, f: 1800, type: 'highpass' });
    },
    perfectBlock: function () {
      tone({ f: 988, d: 0.08, v: 0.2, type: 'triangle' });
      tone({ f: 1480, d: 0.14, v: 0.22, at: 0.03, type: 'sine' });
    },
    guardBreak: function () {
      tone({ f: 340, f2: 95, d: 0.28, v: 0.28, type: 'sawtooth' });
      noise({ d: 0.25, v: 0.26, f: 1400, f2: 260, type: 'bandpass' });
    },
    dodge: function () {
      noise({ d: 0.15, v: 0.14, f: 1100, f2: 340, type: 'bandpass', q: 1.2 });
    },
    stomp: function () {
      tone({ f: 95, f2: 32, d: 0.22, v: 0.3, type: 'sine' });
      noise({ d: 0.18, v: 0.22, f: 380, f2: 90, type: 'lowpass' });
    },
    knockdown: function () {
      tone({ f: 110, f2: 34, d: 0.32, v: 0.32, type: 'triangle' });
      noise({ d: 0.28, v: 0.22, f: 300, f2: 80, type: 'lowpass' });
    },
    buildingHit: function () {
      tone({ f: 140, f2: 52, d: 0.12, v: 0.22, type: 'square' });
      noise({ d: 0.14, v: 0.22, f: 750, f2: 180, type: 'bandpass', q: 0.9 });
    },
    buildingCrack: function () {
      tone({ f: 240, f2: 70, d: 0.18, v: 0.25, type: 'sawtooth' });
      noise({ d: 0.22, v: 0.28, f: 1400, f2: 240, type: 'bandpass', q: 1.1 });
    },
    buildingCollapse: function () {
      tone({ f: 92, f2: 28, d: 0.48, v: 0.36, type: 'triangle' });
      noise({ d: 0.5, v: 0.34, f: 420, f2: 65, type: 'lowpass', q: 0.8 });
    },
    explosion: function () {
      tone({ f: 130, f2: 30, d: 0.45, v: 0.38, type: 'sawtooth' });
      noise({ d: 0.52, v: 0.38, f: 900, f2: 90, type: 'lowpass', q: 0.7 });
    },
    splash: function () {
      noise({ d: 0.35, v: 0.26, f: 1600, f2: 450, type: 'bandpass', q: 0.8 });
      tone({ f: 220, f2: 110, d: 0.18, v: 0.14, type: 'sine' });
    },
    pickup: function () {
      tone({ f: 523, f2: 784, d: 0.09, v: 0.18, type: 'triangle' });
      tone({ f: 1046, d: 0.11, v: 0.16, at: 0.06, type: 'sine' });
    },
    grab: function () {
      tone({ f: 180, f2: 290, d: 0.08, v: 0.18, type: 'triangle' });
    },
    throwProp: function () {
      noise({ d: 0.16, v: 0.16, f: 340, f2: 1100, type: 'bandpass', q: 1.0 });
      tone({ f: 200, f2: 110, d: 0.12, v: 0.18, type: 'triangle' });
    },
    clang: function () {
      tone({ f: 680, f2: 490, d: 0.18, v: 0.24, type: 'square' });
      tone({ f: 1020, d: 0.15, v: 0.16, at: 0.01, type: 'triangle' });
    },
    climbStep: function () {
      tone({ f: 130, f2: 95, d: 0.04, v: 0.11, type: 'triangle' });
    },
    breath: function () {
      tone({ f: 120, f2: 360, d: 0.35, v: 0.28, type: 'sawtooth' });
      noise({ d: 1.15, v: 0.24, f: 1400, f2: 480, type: 'bandpass', q: 1.4 });
    },
    meltdownCharge: function () {
      tone({ f: 90, f2: 680, d: 0.65, v: 0.30, type: 'sawtooth' });
      tone({ f: 180, f2: 880, d: 0.65, v: 0.18, at: 0.04, type: 'sine' });
    },
    meltdownBlast: function () {
      tone({ f: 220, f2: 26, d: 0.75, v: 0.42, type: 'sawtooth' });
      noise({ d: 0.85, v: 0.42, f: 1200, f2: 75, type: 'lowpass', q: 0.7 });
    }
  };
  sfx.meltdown_charge = sfx.meltdownCharge;
  sfx.meltdown_blast = sfx.meltdownBlast;

  function musicStart() { /* implemented in M12 */ }
  function musicStop() { /* implemented in M12 */ }

  function setSfx(on) {
    sfxOn = !!on;
    try { localStorage.setItem('kb_sfx', sfxOn ? '1' : '0'); } catch (e) { }
    if (master) master.gain.value = sfxOn ? 0.65 : 0;
  }

  KB.Audio = {
    resume: resume,
    sfx: sfx,
    musicStart: musicStart,
    musicStop: musicStop,
    setSfx: setSfx,
    get sfxOn() { return sfxOn; }
  };
})();
