/* Kaiju Brawl - Web Audio API B-movie SFX synth & campy theremin + brass stinger soundtrack (M12). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const MAX_SFX_VOICES = 12;

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let sfxOn = true;
  let audioBlocked = false;
  let unlockBound = false;

  const activeVoices = [];
  let musicRunning = false;
  let timer = null;
  let nextT = 0;
  let step = 0;
  let patternIndex = 0;
  let getTime = function () { return 0; };
  let getRound = function () { return 1; };

  try {
    sfxOn = localStorage.getItem('kb_sfx') !== '0';
  } catch (e) { /* storage unavailable */ }

  function bindGestureUnlock() {
    if (unlockBound || typeof document === 'undefined' || !document.addEventListener) return;
    unlockBound = true;
    const onGesture = function () {
      resume();
    };
    document.addEventListener('pointerdown', onGesture, { once: true, passive: true });
    document.addEventListener('keydown', onGesture, { once: true, passive: true });
  }

  function init() {
    if (ctx) return true;
    if (audioBlocked) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = sfxOn ? 0.65 : 0;
      master.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.85;
      sfxBus.connect(master);

      musicBus = ctx.createGain();
      musicBus.gain.value = 0.30;
      musicBus.connect(master);

      const sr = ctx.sampleRate || 44100;
      noiseBuf = ctx.createBuffer(1, sr, sr);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      bindGestureUnlock();
      return true;
    } catch (e) {
      ctx = null;
      audioBlocked = true;
      return false;
    }
  }

  function resume() {
    if (!init()) return;
    try {
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') {
          p.catch(function () { /* ignore autoplay block */ });
        }
      }
    } catch (e) { /* ignore blocked AudioContext */ }
  }

  function pruneVoices(now) {
    for (let i = activeVoices.length - 1; i >= 0; i--) {
      if (activeVoices[i].end <= now || activeVoices[i].ended) {
        activeVoices.splice(i, 1);
      }
    }
  }

  function reserveSfxVoice(endTime, priority, node) {
    const now = ctx ? ctx.currentTime : 0;
    pruneVoices(now);
    const prio = priority || 1;
    if (activeVoices.length >= MAX_SFX_VOICES) {
      let victimIdx = -1;
      for (let i = 0; i < activeVoices.length; i++) {
        if (activeVoices[i].priority <= prio) {
          victimIdx = i;
          break;
        }
      }
      if (victimIdx === -1) return false;
      const victim = activeVoices.splice(victimIdx, 1)[0];
      try {
        if (victim.node && typeof victim.node.stop === 'function') victim.node.stop();
      } catch (e) { /* already stopped */ }
    }
    const entry = { end: endTime, priority: prio, node: node, ended: false };
    activeVoices.push(entry);
    if (node && 'onended' in node) {
      node.onended = function () { entry.ended = true; };
    }
    return true;
  }

  function tone(o) {
    if (!ctx || !sfxOn) return false;
    const isMusic = o.dest === musicBus;
    try {
      const t = o.t !== undefined ? o.t : ctx.currentTime + (o.at || 0);
      const d = o.d || 0.1;
      const v = o.v || 0.2;
      const osc = ctx.createOscillator();
      if (!isMusic && !reserveSfxVoice(t + d + 0.04, o.priority || 1, osc)) {
        return false;
      }
      const g = ctx.createGain();
      osc.type = o.type || 'triangle';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g);
      g.connect(o.dest || sfxBus);
      osc.start(t);
      osc.stop(t + d + 0.03);
      return true;
    } catch (e) {
      return false;
    }
  }

  function noise(o) {
    if (!ctx || !sfxOn || !noiseBuf) return false;
    try {
      const t = ctx.currentTime + (o.at || 0);
      const d = o.d || 0.2;
      const v = o.v || 0.15;
      const src = ctx.createBufferSource();
      if (!reserveSfxVoice(t + d + 0.04, o.priority || 1, src)) {
        return false;
      }
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
      return true;
    } catch (e) {
      return false;
    }
  }

  const sfx = {
    click: function () { tone({ f: 720, d: 0.035, v: 0.1, type: 'sine', priority: 0 }); },
    confirm: function () { tone({ f: 520, f2: 780, d: 0.08, v: 0.14, type: 'triangle', priority: 1 }); },
    deny: function () { tone({ f: 220, f2: 140, d: 0.12, v: 0.14, type: 'sawtooth', priority: 1 }); },
    start: function () {
      [262, 330, 392, 523].forEach(function (f, i) {
        tone({ f: f, d: 0.12, v: 0.18, at: i * 0.065, type: 'triangle', priority: 2 });
      });
    },
    gameOver: function () {
      [392, 349, 311, 262, 196].forEach(function (f, i) {
        tone({ f: f, d: 0.22, v: 0.22, at: i * 0.14, type: 'sawtooth', priority: 3 });
      });
    },
    whoosh: function () {
      noise({ d: 0.14, v: 0.12, f: 420, f2: 1500, type: 'bandpass', q: 1.0, priority: 0 });
    },
    lightHit: function () {
      noise({ d: 0.11, v: 0.22, f: 900, f2: 320, type: 'bandpass', q: 1.1, priority: 1 });
      tone({ f: 160, f2: 55, d: 0.12, v: 0.26, type: 'triangle', priority: 1 });
    },
    heavyHit: function () {
      noise({ d: 0.22, v: 0.3, f: 500, f2: 120, type: 'lowpass', q: 0.9, priority: 2 });
      tone({ f: 120, f2: 36, d: 0.26, v: 0.35, type: 'sawtooth', priority: 2 });
    },
    block: function () {
      tone({ f: 880, f2: 640, d: 0.07, v: 0.16, type: 'square', priority: 1 });
      noise({ d: 0.06, v: 0.12, f: 1800, type: 'highpass', priority: 1 });
    },
    perfectBlock: function () {
      tone({ f: 988, d: 0.08, v: 0.2, type: 'triangle', priority: 2 });
      tone({ f: 1480, d: 0.14, v: 0.22, at: 0.03, type: 'sine', priority: 2 });
    },
    guardBreak: function () {
      tone({ f: 340, f2: 95, d: 0.28, v: 0.28, type: 'sawtooth', priority: 3 });
      noise({ d: 0.25, v: 0.26, f: 1400, f2: 260, type: 'bandpass', priority: 3 });
    },
    dodge: function () {
      noise({ d: 0.15, v: 0.14, f: 1100, f2: 340, type: 'bandpass', q: 1.2, priority: 0 });
    },
    stomp: function () {
      tone({ f: 95, f2: 32, d: 0.22, v: 0.3, type: 'sine', priority: 2 });
      noise({ d: 0.18, v: 0.22, f: 380, f2: 90, type: 'lowpass', priority: 2 });
    },
    knockdown: function () {
      tone({ f: 110, f2: 34, d: 0.32, v: 0.32, type: 'triangle', priority: 2 });
      noise({ d: 0.28, v: 0.22, f: 300, f2: 80, type: 'lowpass', priority: 2 });
    },
    buildingHit: function () {
      tone({ f: 140, f2: 52, d: 0.12, v: 0.22, type: 'square', priority: 1 });
      noise({ d: 0.14, v: 0.22, f: 750, f2: 180, type: 'bandpass', q: 0.9, priority: 1 });
    },
    buildingCrack: function () {
      tone({ f: 240, f2: 70, d: 0.18, v: 0.25, type: 'sawtooth', priority: 2 });
      noise({ d: 0.22, v: 0.28, f: 1400, f2: 240, type: 'bandpass', q: 1.1, priority: 2 });
    },
    buildingCollapse: function () {
      tone({ f: 92, f2: 28, d: 0.48, v: 0.36, type: 'triangle', priority: 3 });
      noise({ d: 0.5, v: 0.34, f: 420, f2: 65, type: 'lowpass', q: 0.8, priority: 3 });
    },
    explosion: function () {
      tone({ f: 130, f2: 30, d: 0.45, v: 0.38, type: 'sawtooth', priority: 3 });
      noise({ d: 0.52, v: 0.38, f: 900, f2: 90, type: 'lowpass', q: 0.7, priority: 3 });
    },
    splash: function () {
      noise({ d: 0.35, v: 0.26, f: 1600, f2: 450, type: 'bandpass', q: 0.8, priority: 2 });
      tone({ f: 220, f2: 110, d: 0.18, v: 0.14, type: 'sine', priority: 2 });
    },
    pickup: function () {
      tone({ f: 523, f2: 784, d: 0.09, v: 0.18, type: 'triangle', priority: 1 });
      tone({ f: 1046, d: 0.11, v: 0.16, at: 0.06, type: 'sine', priority: 1 });
    },
    grab: function () {
      tone({ f: 180, f2: 290, d: 0.08, v: 0.18, type: 'triangle', priority: 1 });
    },
    throwProp: function () {
      noise({ d: 0.16, v: 0.16, f: 340, f2: 1100, type: 'bandpass', q: 1.0, priority: 1 });
      tone({ f: 200, f2: 110, d: 0.12, v: 0.18, type: 'triangle', priority: 1 });
    },
    clang: function () {
      tone({ f: 680, f2: 490, d: 0.18, v: 0.24, type: 'square', priority: 2 });
      tone({ f: 1020, d: 0.15, v: 0.16, at: 0.01, type: 'triangle', priority: 2 });
    },
    climbStep: function () {
      tone({ f: 130, f2: 95, d: 0.04, v: 0.11, type: 'triangle', priority: 0 });
    },
    breath: function () {
      tone({ f: 120, f2: 360, d: 0.35, v: 0.28, type: 'sawtooth', priority: 3 });
      noise({ d: 1.15, v: 0.24, f: 1400, f2: 480, type: 'bandpass', q: 1.4, priority: 3 });
    },
    meltdownCharge: function () {
      tone({ f: 90, f2: 680, d: 0.65, v: 0.30, type: 'sawtooth', priority: 3 });
      tone({ f: 180, f2: 880, d: 0.65, v: 0.18, at: 0.04, type: 'sine', priority: 3 });
    },
    meltdownBlast: function () {
      tone({ f: 220, f2: 26, d: 0.75, v: 0.42, type: 'sawtooth', priority: 3 });
      noise({ d: 0.85, v: 0.42, f: 1200, f2: 75, type: 'lowpass', q: 0.7, priority: 3 });
    }
  };
  sfx.meltdown_charge = sfx.meltdownCharge;
  sfx.meltdown_blast = sfx.meltdownBlast;

  /* ---- 1950s Campy B-Movie Theremin + Brass Stinger Soundtrack (3 alternating patterns) ---- */
  const PATTERNS = [
    {
      // Pattern 0: Spooky theremin minor glide + classic B-movie brass stinger
      bass: [110, 0, 110, 131, 147, 0, 123, 98],
      theremin: [523, 554, 494, 440, 587, 622, 554, 494],
      stingerStep: 0,
      brass: [220, 262, 330]
    },
    {
      // Pattern 1: Suspenseful rising sci-fi climb + staccato brass punch
      bass: [110, 123, 131, 0, 147, 165, 175, 0],
      theremin: [440, 494, 523, 587, 659, 698, 784, 659],
      stingerStep: 4,
      brass: [247, 294, 370]
    },
    {
      // Pattern 2: Climactic kaiju clash tremolo + double brass fanfare
      bass: [98, 0, 131, 0, 147, 131, 110, 98],
      theremin: [659, 622, 659, 784, 880, 784, 659, 587],
      stingerStep: 2,
      brass: [262, 330, 392]
    }
  ];

  function getStepDur(roundNum, elapsedSec) {
    const r = Math.max(1, Number(roundNum || 1));
    const t = Math.max(0, Number(elapsedSec || 0));
    const roundScale = Math.pow(0.93, Math.min(8, r - 1));
    const timeScale = Math.pow(0.997, Math.min(180, t));
    return Math.max(0.12, 0.21 * roundScale * timeScale);
  }

  function scheduleStepAt(t, roundNum, elapsedSec) {
    const pat = PATTERNS[patternIndex];
    const idx = step % 8;
    const dur = getStepDur(roundNum, elapsedSec);

    if (pat.bass[idx] > 0) {
      tone({ t: t, f: pat.bass[idx], d: dur * 0.85, v: 0.24, type: 'triangle', dest: musicBus });
    }

    // Eerie theremin glide (sine with slight pitch slide to next note)
    const f1 = pat.theremin[idx];
    const f2 = pat.theremin[(idx + 1) % 8];
    if (step % 2 === 0 || idx === 3 || idx === 7) {
      tone({ t: t, f: f1, f2: f2, d: dur * 1.45, v: 0.14, type: 'sine', dest: musicBus });
    }

    // Brass stinger chord hit
    if (idx === pat.stingerStep || (roundNum >= 3 && idx === (pat.stingerStep + 4) % 8)) {
      for (let b = 0; b < pat.brass.length; b++) {
        tone({ t: t, f: pat.brass[b], d: dur * 0.72, v: 0.10, type: 'sawtooth', dest: musicBus });
      }
    }

    step++;
    if (step % 16 === 0) {
      patternIndex = (patternIndex + 1) % PATTERNS.length;
    }
    return dur;
  }

  function schedule() {
    if (!ctx || !musicRunning) return;
    try {
      while (nextT < ctx.currentTime + 0.14) {
        const t = getTime ? getTime() : 0;
        const r = getRound ? getRound() : 1;
        nextT += scheduleStepAt(nextT, r, t);
      }
    } catch (e) { /* ignore audio scheduling error */ }
  }

  function musicStart(timeFn, roundFn) {
    if (typeof timeFn === 'object' && timeFn !== null) {
      getTime = timeFn.getTime || getTime;
      getRound = timeFn.getRound || getRound;
    } else {
      if (typeof timeFn === 'function') getTime = timeFn;
      if (typeof roundFn === 'function') getRound = roundFn;
    }
    if (!init()) return false;
    resume();
    if (musicRunning) return true;
    musicRunning = true;
    step = 0;
    patternIndex = 0;
    nextT = ctx ? ctx.currentTime + 0.12 : 0;
    if (typeof setInterval === 'function') {
      timer = setInterval(schedule, 25);
    }
    return true;
  }

  function musicStop() {
    musicRunning = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

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
    getStepDur: getStepDur,
    getState: function () {
      pruneVoices(ctx ? ctx.currentTime : 0);
      return {
        sfxOn: sfxOn,
        musicRunning: musicRunning,
        patternIndex: patternIndex,
        step: step,
        activeSfxVoices: activeVoices.length,
        maxVoices: MAX_SFX_VOICES,
        audioBlocked: audioBlocked
      };
    },
    get sfxOn() { return sfxOn; }
  };
})();
