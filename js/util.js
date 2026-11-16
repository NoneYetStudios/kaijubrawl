/* Kaiju Brawl - math, seeded RNG, easing, and object pool helpers. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function posMod(n, m) {
    return ((n % m) + m) % m;
  }

  /* Mulberry32 deterministic PRNG */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const vec2 = {
    len: function (x, y) { return Math.hypot(x, y); },
    dist: function (ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); },
    norm: function (x, y) {
      const l = Math.hypot(x, y);
      return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
    }
  };

  function easeOutCubic(t) {
    const u = 1 - clamp(t, 0, 1);
    return 1 - u * u * u;
  }

  function easeInOutQuad(t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function createPool(factory, reset, initialSize) {
    const items = [];
    for (let i = 0; i < (initialSize || 0); i++) items.push(factory());
    return {
      acquire: function () {
        const item = items.length ? items.pop() : factory();
        if (reset) reset(item);
        return item;
      },
      release: function (item) {
        items.push(item);
      },
      size: function () { return items.length; }
    };
  }

  KB.Util = {
    clamp: clamp,
    lerp: lerp,
    posMod: posMod,
    rng: rng,
    vec2: vec2,
    easeOutCubic: easeOutCubic,
    easeInOutQuad: easeInOutQuad,
    createPool: createPool
  };
})();
