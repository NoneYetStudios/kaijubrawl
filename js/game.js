/* Kaiju Brawl - fixed 60Hz simulation loop, orientation/fit, player kaiju & dev test helpers. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const Snd = KB.Audio;
  const In = KB.Input;
  const Iso = KB.Iso;
  const U = KB.Util;
  const Render = KB.Render;
  const Cities = KB.CITIES;
  const Entities = KB.Entities;
  const Combat = KB.Combat;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stageEl = document.getElementById('stage');

  const $ = function (id) { return document.getElementById(id); };

  const ORIENT_KEY = 'kb_orient';
  const HIGH_KEY = 'kb_high_v1';
  const MONSTER_KEY = 'kb_monster';
  const CITY_KEY = 'kb_city';
  const FIXED_DT = 1 / 60;
  const MAX_STEPS_PER_FRAME = 5;

  const DIMS = {
    landscape: { w: 1280, h: 720 },
    portrait: { w: 720, h: 1280 }
  };

  let orientPref = 'auto';
  try {
    const savedOrient = localStorage.getItem(ORIENT_KEY);
    if (savedOrient === 'auto' || savedOrient === 'portrait' || savedOrient === 'landscape') {
      orientPref = savedOrient;
    }
  } catch (e) { /* storage unavailable */ }

  let effectiveOrient = 'landscape';
  let W = DIMS.landscape.w;
  let H = DIMS.landscape.h;

  let mode = 'menu'; // 'menu' | 'play' | 'pause' | 'over'
  let elapsed = 0;
  let score = 0;
  let kos = 0;
  let wrecked = 0;
  let highScore = 0;
  try {
    highScore = Math.max(0, parseInt(localStorage.getItem(HIGH_KEY) || '0', 10) || 0);
  } catch (e) { /* storage unavailable */ }

  const urlParams = new URLSearchParams(window.location.search);
  let debugEnabled = urlParams.get('debug') === '1';
  const trainingMode = urlParams.get('training') === '1';
  const INTERMISSION_TICKS = 360; // 6s Civil Defense rebuild & REEL card
  const DEFEAT_CARD_TICKS = 60;   // 1s "THE END?" dramatic beat

  let round = 1;
  let roundPhase = 'fight'; // 'fight' | 'intermission' | 'defeat' | 'over'
  let intermissionTicks = 0;
  let defeatTicks = 0;
  let challengerOrder = [];
  let challengerAi = null;
  let titleCard = null;
  let runNewHigh = false;

  let selectedMonster = 'gorgantor';
  let selectedCity = 'pinebrook';
  try {
    const sm = localStorage.getItem(MONSTER_KEY);
    if (sm && KB.MONSTERS && KB.MONSTERS[sm]) selectedMonster = sm;
    const sc = localStorage.getItem(CITY_KEY);
    if (sc && Cities.DEFS && Cities.DEFS[sc]) selectedCity = sc;
  } catch (e) { /* storage unavailable */ }

  function pickChallengerId(playerId) {
    const forced = urlParams.get('dummy');
    if (forced && KB.MONSTERS && KB.MONSTERS[forced]) return forced;
    const order = KB.MONSTER_ORDER || Object.keys(KB.MONSTERS || {});
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== playerId && order[i] === 'tin_colossus') return 'tin_colossus';
    }
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== playerId) return order[i];
    }
    return 'gorgantor';
  }

  let city = Cities.create(urlParams.get('city') || selectedCity || 'pinebrook');
  let cam = Iso.createCamera(city.cols, city.rows);
  const initPlayerMonster = (urlParams.get('monster') && KB.MONSTERS[urlParams.get('monster')]) ? urlParams.get('monster') : selectedMonster;
  let player = Entities.createKaiju({
    id: 1000,
    isPlayer: true,
    monsterId: initPlayerMonster,
    x: city.spawns.player.x,
    y: city.spawns.player.y
  });
  let dummy = Entities.createKaiju({
    id: 1001,
    isPlayer: false,
    monsterId: pickChallengerId(initPlayerMonster),
    x: 4.0,
    y: 16.6,
    dirX: -0.832,
    dirY: 0.555
  });
  let cctx = Combat.createContext();
  let dummyMode = 'idle'; // 'idle' | 'block' | 'attack'
  let dummyAttackCooldown = 0;
  let dummySwingCount = 0;
  let dummyQueuedMove = null;

  const callbacks = {
    onAutoPause: null,
    onGameOver: null,
    onOrientChange: null
  };

  function getView() {
    return {
      w: W,
      h: H,
      zoom: Iso.zoomForOrient(effectiveOrient),
      bottomInset: Iso.bottomInsetForOrient(effectiveOrient, H)
    };
  }

  function detectAutoOrient() {
    const sw = stageEl ? stageEl.clientWidth : window.innerWidth;
    const sh = stageEl ? stageEl.clientHeight : window.innerHeight;
    if (sw > 0 && sh > 0) {
      return sh > sw ? 'portrait' : 'landscape';
    }
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  function fitCanvasCss() {
    if (!stageEl) return;
    const sw = Math.max(120, stageEl.clientWidth - 4);
    const sh = Math.max(120, stageEl.clientHeight - 4);
    const aspect = W / H;
    let dw = sw;
    let dh = dw / aspect;
    if (dh > sh) {
      dh = sh;
      dw = dh * aspect;
    }
    canvas.style.width = Math.floor(dw) + 'px';
    canvas.style.height = Math.floor(dh) + 'px';
  }

  function applyOrientation() {
    const next = orientPref === 'auto' ? detectAutoOrient() : orientPref;
    const changed = next !== effectiveOrient || W !== DIMS[next].w || H !== DIMS[next].h;

    if (changed) {
      effectiveOrient = next;
      W = DIMS[next].w;
      H = DIMS[next].h;
      canvas.width = W;
      canvas.height = H;
      In.setLogicalSize(W, H);
    }

    if (stageEl) {
      stageEl.classList.toggle('orient-portrait', effectiveOrient === 'portrait');
      stageEl.classList.toggle('orient-landscape', effectiveOrient !== 'portrait');
    }

    Iso.clampCamera(cam, city.cols, city.rows, getView());
    fitCanvasCss();
    if (callbacks.onOrientChange) {
      callbacks.onOrientChange(orientPref, effectiveOrient);
    }
  }

  function setOrientationMode(nextPref) {
    if (nextPref !== 'auto' && nextPref !== 'portrait' && nextPref !== 'landscape') return;
    orientPref = nextPref;
    try { localStorage.setItem(ORIENT_KEY, orientPref); } catch (e) { }
    applyOrientation();
  }

  window.addEventListener('resize', applyOrientation);
  window.addEventListener('orientationchange', function () {
    setTimeout(applyOrientation, 80);
  });

  window.addEventListener('keydown', function (e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.code === 'Backquote') {
      debugEnabled = !debugEnabled;
    }
  });

  function fmtTime(s) {
    s = Math.floor(s);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function setBarWidth(el, cur, max) {
    if (!el) return;
    el.style.width = U.clamp((cur / Math.max(1, max)) * 100, 0, 100).toFixed(1) + '%';
  }

  function updateHud() {
    const elScore = $('hudScore');
    const elHi = $('hudHi');
    const elKos = $('hudKos');
    const elWrecked = $('hudWrecked');
    const elTime = $('hudTime');
    if (elScore) elScore.textContent = score.toLocaleString();
    if (elHi) elHi.textContent = highScore.toLocaleString();
    if (elKos) elKos.textContent = String(kos);
    if (elWrecked) elWrecked.textContent = String(wrecked);
    if (elTime) elTime.textContent = fmtTime(elapsed);

    const pName = $('hudPlayerName');
    const pHp = $('hudPlayerHp');
    const pFuel = $('hudPlayerFuel');
    const pGuard = $('hudPlayerGuard');
    if (pName) {
      pName.textContent = player.fuel >= 80 ? (player.stats.name + ' ⚡ OVERCHARGE') : player.stats.name;
    }
    setBarWidth(pHp, player.hp, player.maxHp);
    setBarWidth(pFuel, player.fuel, player.fuelMax);
    if (pFuel && pFuel.parentElement) {
      pFuel.parentElement.classList.toggle('overcharge', player.fuel >= 80);
      pFuel.parentElement.classList.toggle('fuel-shake', cctx.fuelShakeTicks > 0);
    }
    setBarWidth(pGuard, player.guard, player.guardMax);
    if (pGuard && pGuard.parentElement) {
      pGuard.parentElement.classList.toggle('broken', player.state === 'guard_break');
    }

    const touchSpec = document.querySelector('#btnCluster .act-special');
    if (touchSpec) {
      const sCost = (player.stats.specials && player.stats.specials.special && player.stats.specials.special.cost) || 35;
      touchSpec.classList.toggle('dim', player.fuel < sCost);
    }
    const touchMelt = document.querySelector('#btnCluster .act-meltdown');
    if (touchMelt) {
      const ready = player.fuel >= player.fuelMax;
      touchMelt.classList.toggle('hidden', !ready);
      touchMelt.classList.toggle('ready', ready);
    }

    const eName = $('hudEnemyName');
    const eHp = $('hudEnemyHp');
    const eFuel = $('hudEnemyFuel');
    const eGuard = $('hudEnemyGuard');
    if (eName) {
      if (trainingMode) {
        eName.textContent = dummy.stats.name + ' (DUMMY)';
      } else {
        eName.textContent = (dummy.isBoss ? '★ BOSS: ' : '') + dummy.stats.name + ' (R' + round + ')';
      }
    }
    setBarWidth(eHp, dummy.hp, dummy.maxHp);
    setBarWidth(eFuel, dummy.fuel, dummy.fuelMax);
    setBarWidth(eGuard, dummy.guard, dummy.guardMax);
    if (eGuard && eGuard.parentElement) {
      eGuard.parentElement.classList.toggle('broken', dummy.state === 'guard_break');
    }

    const roundEl = $('hudRound');
    if (roundEl) {
      if (trainingMode) {
        roundEl.textContent = 'TRAINING';
      } else if (roundPhase === 'intermission') {
        roundEl.textContent = 'REBUILDING ' + Math.ceil(intermissionTicks / 60) + 's';
      } else {
        roundEl.textContent = round % 4 === 0 ? ('REEL ' + round + ' ★ BOSS') : ('REEL ' + round);
      }
    }

    const comboEl = $('comboCounter');
    if (comboEl) {
      if (cctx.playerCombo >= 2 && cctx.playerComboTimer > 0) {
        comboEl.textContent = cctx.playerCombo + ' HIT COMBO!';
        comboEl.classList.add('show');
      } else {
        comboEl.classList.remove('show');
      }
    }

    const btnDummy = $('btnDummyMode');
    if (btnDummy) {
      btnDummy.classList.toggle('hidden', !trainingMode);
      btnDummy.textContent = 'DUMMY: ' + dummyMode.toUpperCase();
    }
  }

  function computeRampageScore(kosCount, wreckedCount, timeSec, stylePts) {
    const baseScore = kosCount * 1000 + wreckedCount * 100 + Math.floor(timeSec) * 2;
    const rawStyle = Math.max(0, Math.round(stylePts || 0));
    const effectiveStyle = Math.min(rawStyle, baseScore);
    return {
      total: baseScore + effectiveStyle,
      baseScore: baseScore,
      rawStyle: rawStyle,
      effectiveStyle: effectiveStyle
    };
  }

  function buildChallengerPool(playerId) {
    const order = KB.MONSTER_ORDER || Object.keys(KB.MONSTERS || {});
    const pool = [];
    for (let i = 0; i < order.length; i++) {
      if (order[i] !== playerId) pool.push(order[i]);
    }
    if (!pool.length) pool.push(playerId || 'gorgantor');
    // Fisher-Yates shuffle for varied matinee opponent order
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool;
  }

  function pickChallengerSpawn() {
    const candidates = [
      city.spawns.dummy || { x: 4.0, y: 16.6 },
      { x: city.cols - 3.5, y: 4.0 },
      { x: 3.5, y: city.rows - 3.5 },
      { x: 4.0, y: 4.0 },
      { x: city.cols - 4.0, y: city.rows - 4.0 }
    ];
    let best = candidates[0];
    let bestDist = -1;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let blocked = false;
      for (let j = 0; j < city.buildings.length; j++) {
        const b = city.buildings[j];
        if (b.state === 'rubble') continue;
        const box = Entities.getBuildingCollBox(b);
        if (c.x >= box.x0 - 0.9 && c.x <= box.x1 + 0.9 && c.y >= box.y0 - 0.9 && c.y <= box.y1 + 0.9) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d > bestDist) {
        bestDist = d;
        best = c;
      }
    }
    const dir = U.vec2.norm((player.x - best.x) || 1, (player.y - best.y) || 0);
    return { x: best.x, y: best.y, dirX: dir.x, dirY: dir.y };
  }

  function spawnStartProps() {
    if (!city.startProps) return;
    for (let i = 0; i < city.startProps.length; i++) {
      const sp = city.startProps[i];
      if (!Entities.isPointInBuilding) {
        let inside = false;
        for (let j = 0; j < city.buildings.length; j++) {
          const b = city.buildings[j];
          if (b.state === 'rubble') continue;
          const box = Entities.getBuildingCollBox(b);
          if (sp.x >= box.x0 - 0.6 && sp.x <= box.x1 + 0.6 && sp.y >= box.y0 - 0.6 && sp.y <= box.y1 + 0.6) {
            inside = true;
            break;
          }
        }
        if (inside) continue;
      }
      Entities.spawnProp(cctx, sp.type, sp.x, sp.y, city);
    }
  }

  function spawnChallengerForRound(roundNum) {
    const forced = urlParams.get('dummy');
    const pool = challengerOrder.length ? challengerOrder : buildChallengerPool(player.monsterId);
    const mId = (forced && KB.MONSTERS[forced]) ? forced : pool[(roundNum - 1) % pool.length];
    const isBoss = (roundNum % 4 === 0);
    const hpMul = +(1 + 0.12 * roundNum) * (isBoss ? 1.35 : 1.0);
    const dmgMul = +(1 + 0.06 * roundNum) * (isBoss ? 1.12 : 1.0);
    const sp = pickChallengerSpawn();

    dummy = Entities.createKaiju({
      id: 1000 + roundNum,
      isPlayer: false,
      monsterId: mId,
      hpMul: hpMul,
      dmgMul: dmgMul,
      isBoss: isBoss,
      x: sp.x,
      y: sp.y,
      dirX: sp.dirX,
      dirY: sp.dirY
    });
    challengerAi = KB.AI ? KB.AI.createController({
      round: roundNum,
      isBoss: isBoss,
      seed: roundNum * 1337 + kos * 97
    }) : null;
    titleCard = {
      title: 'REEL ' + roundNum + (isBoss ? ' — BOSS!' : ''),
      sub: dummy.stats.name.toUpperCase() + (isBoss ? ' CRASHES THE SET!' : ' ENTERS THE BRAWL'),
      round: roundNum,
      boss: isBoss,
      ticks: 135,
      maxTicks: 135
    };
  }

  function resetDummyState() {
    dummy = Entities.createKaiju({
      id: 1001,
      isPlayer: false,
      monsterId: pickChallengerId(player ? player.monsterId : selectedMonster),
      x: 4.0,
      y: 16.6,
      dirX: -0.832,
      dirY: 0.555
    });
    dummyAttackCooldown = 45;
    dummySwingCount = 0;
    dummyQueuedMove = null;
  }

  function resetRun() {
    elapsed = 0;
    score = 0;
    kos = 0;
    wrecked = 0;
    round = 1;
    roundPhase = 'fight';
    intermissionTicks = 0;
    defeatTicks = 0;
    titleCard = null;
    runNewHigh = false;
    accumulator = 0;
    const cId = (urlParams.get('city') && Cities.DEFS[urlParams.get('city')]) ? urlParams.get('city') : selectedCity;
    const mId = (urlParams.get('monster') && KB.MONSTERS[urlParams.get('monster')]) ? urlParams.get('monster') : selectedMonster;
    city = Cities.create(cId || 'pinebrook');
    player = Entities.createKaiju({
      id: 1000,
      isPlayer: true,
      monsterId: mId || 'gorgantor',
      x: city.spawns.player.x,
      y: city.spawns.player.y
    });
    cctx = Combat.createContext();
    challengerOrder = buildChallengerPool(player.monsterId);
    if (trainingMode) {
      challengerAi = null;
      resetDummyState();
    } else {
      spawnChallengerForRound(1);
    }
    spawnStartProps();
    cam = Iso.createCamera(city.cols, city.rows);
    const cx = player.x * 0.7 + dummy.x * 0.3;
    const cy = player.y * 0.7 + dummy.y * 0.3;
    const p = Iso.worldToScreen(cx, cy, 0);
    cam.x = p.sx;
    cam.y = p.sy;
    Iso.clampCamera(cam, city.cols, city.rows, getView());
    In.reset();
    updateHud();
  }

  function start() {
    applyOrientation();
    resetRun();
    mode = 'play';
    document.body.classList.add('playing');
    Snd.resume();
    Snd.sfx.start();
    Snd.musicStart(function () { return elapsed; });
  }

  function pause() {
    if (mode !== 'play') return false;
    mode = 'pause';
    document.body.classList.remove('playing');
    Snd.musicStop();
    In.reset();
    return true;
  }

  function resume() {
    if (mode !== 'pause') return false;
    mode = 'play';
    document.body.classList.add('playing');
    Snd.resume();
    Snd.musicStart(function () { return elapsed; });
    return true;
  }

  function quit() {
    mode = 'menu';
    document.body.classList.remove('playing');
    Snd.musicStop();
    In.reset();
    resetRun();
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && mode === 'play') {
      if (pause() && callbacks.onAutoPause) callbacks.onAutoPause();
    }
  });

  window.addEventListener('blur', function () {
    In.reset();
    if (mode === 'play') {
      if (pause() && callbacks.onAutoPause) callbacks.onAutoPause();
    }
  });

  let lastTs = 0;
  let clock = 0;
  let accumulator = 0;
  let fpsAvg = 60;

  function makeEmptySimIntent() {
    return { moveX: 0, moveY: 0, light: false, heavy: false, grab: false, jumpPressed: false, jumpHeld: false, blockHeld: false, dodgePressed: false, specialPressed: false, ultimatePressed: false };
  }

  function makeDummyIntent() {
    const out = { moveX: 0, moveY: 0, light: false, heavy: false, blockHeld: false };
    const dx = player.x - dummy.x;
    const dy = player.y - dummy.y;
    const dist = Math.hypot(dx, dy);

    if (dummyQueuedMove) {
      if (dist > 0.01 && (dummy.state === 'idle' || dummy.state === 'walk' || dummy.state === 'block')) {
        dummy.dirX = dx / dist;
        dummy.dirY = dy / dist;
      }
      if (dummyQueuedMove === 'heavy') out.heavy = true;
      else out.light = true;
      dummyQueuedMove = null;
      return out;
    }

    if (dummyMode === 'block') {
      if (dist > 0.01 && (dummy.state === 'idle' || dummy.state === 'block')) {
        dummy.dirX = dx / dist;
        dummy.dirY = dy / dist;
      }
      if (dist <= 3.5 && dummy.state !== 'guard_break' && dummy.guard > 0) {
        out.blockHeld = true;
      }
      return out;
    }

    if (dummyMode === 'attack') {
      if (dist > 0.01 && (dummy.state === 'idle' || dummy.state === 'walk')) {
        dummy.dirX = dx / dist;
        dummy.dirY = dy / dist;
      }
      if (dist > 1.45 && dist < 8) {
        out.moveX = dx / dist;
        out.moveY = dy / dist;
      } else {
        if (dummyAttackCooldown > 0) dummyAttackCooldown--;
        else if (dummy.state === 'idle' || dummy.state === 'walk') {
          dummySwingCount++;
          if (dummySwingCount % 3 === 0) out.heavy = true;
          else out.light = true;
          dummyAttackCooldown = 85;
        }
      }
      return out;
    }

    return out;
  }

  function setDummyMode(nextMode) {
    if (nextMode !== 'idle' && nextMode !== 'block' && nextMode !== 'attack') return;
    dummyMode = nextMode;
    dummyAttackCooldown = 30;
    if (nextMode !== 'block' && dummy.state === 'block') dummy.state = 'idle';
    updateHud();
  }

  function cycleDummyMode() {
    const order = ['idle', 'block', 'attack'];
    const idx = order.indexOf(dummyMode);
    setDummyMode(order[(idx + 1) % order.length]);
    return dummyMode;
  }

  function stepCombatWorld(kA, kB, iA, iB, simCity, simCctx, dt, camObj, pickupHolders) {
    const kaijus = [kA, kB];
    const pRef = pickupHolders && pickupHolders[0] ? pickupHolders[0] : kA;
    if (kA.isPlayer) {
      kA._selfCostThisTick = 0;
      kA._healAmtThisTick = 0;
    }
    const pHpBefore = kA.isPlayer ? kA.hp : 0;

    Combat.updateFighter(kA, iA, simCity, dt, simCctx, kaijus, camObj);
    Combat.updateFighter(kB, iB, simCity, dt, simCctx, kaijus, camObj);
    if (kA.state !== 'climb' && kB.state !== 'climb') {
      Entities.resolveKaijuSeparation(kA, kB, simCity);
    }
    Combat.resolveMelee(kA, kB, simCctx, camObj, simCity, kaijus);
    Combat.resolveMelee(kB, kA, simCctx, camObj, simCity, kaijus);
    Combat.resolveBuildingMelee(kA, simCity, simCctx, pRef, kaijus, camObj);
    Combat.resolveBuildingMelee(kB, simCity, simCctx, pRef, kaijus, camObj);
    Combat.triggerLandingStomp(kA, simCity, simCctx, pRef, kaijus, camObj);
    Combat.triggerLandingStomp(kB, simCity, simCctx, pRef, kaijus, camObj);
    Combat.updateProps(simCctx, simCity, kaijus, pRef, camObj, dt);

    if (kA.isPlayer && simCctx && (kA.hp + (kA._selfCostThisTick || 0) < pHpBefore + (kA._healAmtThisTick || 0))) {
      simCctx.playerTookDamageThisRound = true;
    }

    Entities.updateBuildings(simCity, simCctx, dt);
    Entities.updatePickups(simCctx, pickupHolders || kaijus, simCity, dt);
    Entities.updateDebrisAndCivilians(simCctx, simCity, dt);
    Combat.updateFx(simCctx);
  }

  function updateScoreState() {
    wrecked = cctx.buildingsWrecked;
    if (trainingMode) {
      score = cctx.stylePoints;
    } else {
      score = computeRampageScore(kos, wrecked, elapsed, cctx.stylePoints).total;
    }
    if (score > highScore) {
      highScore = score;
      runNewHigh = true;
      try { localStorage.setItem(HIGH_KEY, String(highScore)); } catch (e) { /* noop */ }
    }
  }

  function finishRampageGameOver() {
    roundPhase = 'over';
    mode = 'over';
    document.body.classList.remove('playing');
    Snd.musicStop();
    In.reset();
    updateScoreState();
    updateHud();
    if (callbacks.onGameOver) {
      const bd = computeRampageScore(kos, wrecked, elapsed, cctx.stylePoints);
      callbacks.onGameOver({
        score: score,
        highScore: highScore,
        isNewHigh: runNewHigh,
        kos: kos,
        wrecked: wrecked,
        elapsed: elapsed,
        round: round,
        stylePoints: bd.effectiveStyle,
        rawStylePoints: bd.rawStyle
      });
    }
  }

  function stepSimulation() {
    if (titleCard && titleCard.ticks > 0) titleCard.ticks--;

    if (trainingMode) {
      const intent = In.sampleIntent();
      const dIntent = makeDummyIntent();
      const pPrevState = player.state;
      const dPrevState = dummy.state;

      stepCombatWorld(player, dummy, intent, dIntent, city, cctx, FIXED_DT, cam, [player]);

      // Training dummy idle regen after 3s out of combat stun
      if (dummyMode === 'block' && dummy.state === 'block' && dummy.regenTimer > 60) {
        dummy.guard = Math.min(dummy.guardMax, dummy.guard + 12 * FIXED_DT);
      }
      if (dummy.state === 'hitstun' || dummy.state === 'knockdown' || dummy.state === 'guard_break' || dummy.state === 'ko' || (dummy.state !== dPrevState && dummy.state === 'hitstun')) {
        dummy.regenTimer = 0;
      } else if (dummy.hitStop <= 0) {
        dummy.regenTimer++;
        if (dummy.regenTimer >= 180) {
          dummy.hp = Math.min(dummy.maxHp, dummy.hp + 80 * FIXED_DT);
          if (dummy.state === 'idle' || dummy.state === 'walk') {
            dummy.guard = dummy.guardMax;
          }
        }
      }

      // Training safeguard: keep player alive & gently heal after 4s out of hitstun
      if (player.hp < 1) player.hp = 1;
      if (player.state === 'hitstun' || player.state === 'knockdown' || player.state === 'guard_break' || (pPrevState !== player.state && player.state === 'hitstun')) {
        player.regenTimer = 0;
      } else {
        player.regenTimer++;
        if (player.regenTimer >= 480) {
          player.hp = Math.min(player.maxHp, player.hp + 30 * FIXED_DT);
        }
      }

      updateScoreState();
      In.endTick();
      elapsed += FIXED_DT;
      return;
    }

    // ---------- Rampage Mode Round Loop (PLAN.md §1.1, §7.2, M8) ----------
    if (roundPhase === 'defeat') {
      defeatTicks--;
      Entities.updateDebrisAndCivilians(cctx, city, FIXED_DT);
      Combat.updateFx(cctx);
      In.endTick();
      if (defeatTicks <= 0) {
        finishRampageGameOver();
      }
      return;
    }

    if (roundPhase === 'over') {
      In.endTick();
      return;
    }

    const intent = In.sampleIntent();

    if (roundPhase === 'intermission') {
      intermissionTicks--;
      const deadIntent = makeEmptySimIntent();
      stepCombatWorld(player, dummy, intent, deadIntent, city, cctx, FIXED_DT, cam, [player]);
      if (intermissionTicks === Math.floor(INTERMISSION_TICKS * 0.5)) {
        // Civil Defense rebuilds all buildings back to intact (preserving cumulative cctx.buildingsWrecked)
        Entities.rebuildCity(city);
        Entities.resolveBuildingCollisions(player, city);
        if (cctx.props.length < 4) spawnStartProps();
        const nextRound = round + 1;
        const nextBoss = (nextRound % 4 === 0);
        titleCard = {
          title: 'REEL ' + nextRound + (nextBoss ? ' — BOSS!' : ''),
          sub: nextBoss ? 'CIVIL DEFENSE ALERT: GIANT BOSS INBOUND!' : 'CIVIL DEFENSE REBUILT THE CITY!',
          round: nextRound,
          boss: nextBoss,
          ticks: Math.floor(INTERMISSION_TICKS * 0.5),
          maxTicks: Math.floor(INTERMISSION_TICKS * 0.5)
        };
      }
      elapsed += FIXED_DT;
      updateScoreState();
      In.endTick();
      if (intermissionTicks <= 0) {
        round++;
        cctx.playerTookDamageThisRound = false;
        spawnChallengerForRound(round);
        roundPhase = 'fight';
      }
      return;
    }

    // Active Fight Phase
    const dIntent = challengerAi ? challengerAi.decide(dummy, player, city, cctx) : makeEmptySimIntent();
    stepCombatWorld(player, dummy, intent, dIntent, city, cctx, FIXED_DT, cam, [player, dummy]);

    if (player.hp <= 0) {
      player.hp = 0;
      player.state = 'ko';
      player.stateTick = 0;
      player.attack = null;
      player.special = null;
      roundPhase = 'defeat';
      defeatTicks = DEFEAT_CARD_TICKS;
      titleCard = {
        title: 'THE END?',
        sub: 'FALLEN ON REEL ' + round,
        round: round,
        boss: false,
        ticks: DEFEAT_CARD_TICKS + 20,
        maxTicks: DEFEAT_CARD_TICKS + 20
      };
      updateScoreState();
      In.endTick();
      return;
    }

    if (dummy.hp <= 0) {
      dummy.hp = 0;
      dummy.state = 'ko';
      dummy.stateTick = 0;
      dummy.attack = null;
      dummy.special = null;
      kos++;
      const healAmt = Math.round(player.maxHp * 0.25);
      player.hp = Math.min(player.maxHp, player.hp + healAmt);
      player.fuel = Math.min(player.fuelMax, player.fuel + 15);
      if (!cctx.playerTookDamageThisRound) {
        cctx.stylePoints += 300;
        Combat.addPopup(cctx, player.x, player.y, player.z + 132, 'NO DAMAGE! +300', '#ffd23f', 1.25);
      }
      Combat.addPopup(cctx, player.x, player.y, player.z + 104, 'KO! +25% HP +15 FUEL', '#7dff4f', 1.18);
      Combat.addPopup(cctx, dummy.x, dummy.y, dummy.z + 104, 'K.O.!', '#ff6b57', 1.35);
      roundPhase = 'intermission';
      intermissionTicks = INTERMISSION_TICKS;
      titleCard = {
        title: 'K.O.! INTERMISSION',
        sub: 'CIVIL DEFENSE REBUILDING FOR REEL ' + (round + 1),
        round: round + 1,
        boss: ((round + 1) % 4 === 0),
        ticks: Math.floor(INTERMISSION_TICKS * 0.5),
        maxTicks: Math.floor(INTERMISSION_TICKS * 0.5)
      };
    }

    elapsed += FIXED_DT;
    updateScoreState();
    In.endTick();
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    const rawDt = Math.max(0.0001, (ts - lastTs) / 1000);
    const dt = Math.min(0.05, rawDt);
    lastTs = ts;
    clock += dt;
    fpsAvg = fpsAvg * 0.9 + (1 / rawDt) * 0.1;

    const view = getView();

    if (mode === 'play') {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
        stepSimulation();
        accumulator -= FIXED_DT;
        steps++;
      }
      const pdDist = Math.hypot(player.x - dummy.x, player.y - dummy.y);
      const dummyWeight = pdDist <= 4.5 ? 0.3 : U.clamp(0.3 * (1 - (pdDist - 4.5) / 3.0), 0, 0.3);
      const camTx = player.x * (1 - dummyWeight) + dummy.x * dummyWeight;
      const camTy = player.y * (1 - dummyWeight) + dummy.y * dummyWeight;
      Iso.updateCamera(cam, camTx, camTy, city.cols, city.rows, view, dt);
      updateHud();
    } else if (mode === 'menu') {
      const tx = city.cols * 0.5 + Math.cos(clock * 0.25) * 1.5;
      const ty = city.rows * 0.5 + Math.sin(clock * 0.25) * 1.5;
      Iso.updateCamera(cam, tx, ty, city.cols, city.rows, view, dt);
    }

    const drawables = city.buildings.slice();
    for (let i = 0; i < cctx.pickups.length; i++) drawables.push(cctx.pickups[i]);
    for (let i = 0; i < cctx.propDrops.length; i++) drawables.push(cctx.propDrops[i]);
    for (let i = 0; i < cctx.civilians.length; i++) drawables.push(cctx.civilians[i]);
    drawables.push(player);
    drawables.push(dummy);

    Render.renderScene(ctx, {
      city: city,
      cam: cam,
      drawables: drawables,
      debug: debugEnabled,
      player: player,
      dummy: dummy,
      dummyMode: dummyMode,
      titleCard: titleCard,
      cctx: cctx,
      stats: {
        fps: Math.round(fpsAvg),
        total: drawables.length
      }
    }, view, clock);

    if (debugEnabled) updateDebugTelemetry();

    requestAnimationFrame(frame);
  }

  let telemetryEl = null;
  let telemetryFrame = 0;
  function updateDebugTelemetry() {
    telemetryFrame++;
    if (telemetryFrame % 6 !== 0 && telemetryEl) return;
    if (!telemetryEl) {
      telemetryEl = document.getElementById('debugTelemetry');
      if (!telemetryEl) {
        telemetryEl = document.createElement('pre');
        telemetryEl.id = 'debugTelemetry';
        telemetryEl.hidden = true;
        document.body.appendChild(telemetryEl);
      }
      telemetryEl.dataset.lootStats = JSON.stringify(Entities.simLootStats(200));
    }
    let intact = 0, damaged = 0, rubble = 0;
    for (let i = 0; i < city.buildings.length; i++) {
      const st = city.buildings[i].state;
      if (st === 'intact') intact++;
      else if (st === 'damaged') damaged++;
      else rubble++;
    }
    telemetryEl.textContent = JSON.stringify({
      fps: Math.round(fpsAvg),
      mode: mode,
      player: {
        x: +player.x.toFixed(2),
        y: +player.y.toFixed(2),
        z: Math.round(player.z),
        hp: Math.round(player.hp),
        fuel: +player.fuel.toFixed(1),
        overcharged: !!player.overcharged,
        specialCooldown: player.specialCooldown,
        special: player.special ? { id: player.special.def.id, phase: player.special.phase, beamAngle: +(player.special.beamAngle || 0).toFixed(3), ticksFired: player.special.ticksFired || 0 } : null,
        state: player.state,
        carrying: player.carrying ? player.carrying.propType : null,
        climb: player.climb ? { buildingId: player.climb.building.id, face: player.climb.face } : null,
        burnTicks: player.burnTicks
      },
      fuelShakeTicks: cctx.fuelShakeTicks,
      novaWaves: cctx.novaWaves ? cctx.novaWaves.length : 0,
      comicCards: cctx.comicCards ? cctx.comicCards.map(function (c) { return c.text; }) : [],
      dummy: {
        x: +dummy.x.toFixed(2),
        y: +dummy.y.toFixed(2),
        z: Math.round(dummy.z),
        hp: Math.round(dummy.hp),
        state: dummy.state,
        burnTicks: dummy.burnTicks
      },
      buildingsWrecked: cctx.buildingsWrecked,
      buildingStates: { intact: intact, damaged: damaged, rubble: rubble },
      slowZones: city.slowZones.length,
      speedMult: Entities.getMoveSpeedMult(player, city),
      pickups: cctx.pickups.map(function (p) { return { type: p.pickupType, x: +p.x.toFixed(2), y: +p.y.toFixed(2) }; }),
      props: cctx.props.map(function (d) { return { type: d.propType, state: d.state, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: Math.round(d.z), usesLeft: d.usesLeft }; }),
      propDrops: cctx.propDrops.map(function (d) { return { type: d.propType, state: d.state, x: +d.x.toFixed(2), y: +d.y.toFixed(2) }; })
    });
  }

  /* ---- Verification & Test Helpers ---- */
  function checkOrderingViolations(sortedList) {
    let violations = 0;
    for (let i = 0; i < sortedList.length; i++) {
      for (let j = i + 1; j < sortedList.length; j++) {
        if (Iso.behind(sortedList[i], sortedList[j]) > 0) violations++;
      }
    }
    return violations;
  }

  function sortSelfCheck() {
    const rand = U.rng(9001);
    const items = [];
    const cols = 20;
    const rows = 10;

    let id = 1;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const w = 0.4 + rand() * 1.3;
        const h = 0.4 + rand() * 1.3;
        const x0 = gx * 2.0 + rand() * (1.85 - w);
        const y0 = gy * 2.0 + rand() * (1.85 - h);
        items.push({
          id: id++,
          fx0: x0,
          fx1: x0 + w,
          fy0: y0,
          fy1: y0 + h,
          zBase: 0,
          zTop: 30 + rand() * 150,
          screenPad: 8
        });
      }
    }

    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }

    const sortedFull = Iso.sortDrawables(items, false);
    const sortedBroad = Iso.sortDrawables(items, true);
    const vFull = checkOrderingViolations(sortedFull);

    let vBroad = 0;
    for (let i = 0; i < sortedBroad.length; i++) {
      for (let j = i + 1; j < sortedBroad.length; j++) {
        const A = sortedBroad[i];
        const B = sortedBroad[j];
        const screenOverlap = !(A.sMaxX <= B.sMinX || B.sMaxX <= A.sMinX || A.sMaxY <= B.sMinY || B.sMaxY <= A.sMinY);
        if (!screenOverlap) continue;
        if (Iso.behind(A, B) > 0) vBroad++;
      }
    }

    const wide = { id: 1, fx0: 5, fx1: 8, fy0: 5, fy1: 8, zBase: 0, zTop: 130, screenPad: 8 };
    const compassOffsets = [
      [6.5, 4.2], [8.6, 4.2], [8.6, 6.5], [8.6, 8.6],
      [6.5, 8.6], [4.2, 8.6], [4.2, 6.5], [4.2, 4.2]
    ];
    let wideViolations = 0;
    for (let k = 0; k < compassOffsets.length; k++) {
      const mx = compassOffsets[k][0];
      const my = compassOffsets[k][1];
      const mk = { id: 2, fx0: mx - 0.35, fx1: mx + 0.35, fy0: my - 0.35, fy1: my + 0.35, zBase: 0, zTop: 76, screenPad: 8 };
      wideViolations += checkOrderingViolations(Iso.sortDrawables([mk, wide], true));
    }

    const bot = { id: 10, fx0: 2, fx1: 4, fy0: 2, fy1: 4, zBase: 0, zTop: 40, screenPad: 8 };
    const top = { id: 11, fx0: 2.2, fx1: 3.8, fy0: 2.2, fy1: 3.8, zBase: 50, zTop: 110, screenPad: 8 };
    const zSorted = Iso.sortDrawables([top, bot], true);
    const zOk = (zSorted[0].id === 10 && zSorted[1].id === 11);

    return {
      ok: vFull === 0 && vBroad === 0 && wideViolations === 0 && zOk,
      count: items.length,
      violationsFull: vFull,
      violationsBroad: vBroad,
      wideViolations: wideViolations,
      zStackOk: zOk
    };
  }

  function movePlayer(x, y, z) {
    player.x = U.clamp(x, player.r, city.cols - player.r);
    player.y = U.clamp(y, player.r, city.rows - player.r);
    if (typeof z === 'number') player.z = Math.max(0, z);
    Entities.resolveBuildingCollisions(player, city.buildings);
    Entities.syncKaijuBounds(player);
    const p = Iso.worldToScreen(player.x, player.y, 0);
    cam.x = p.sx;
    cam.y = p.sy;
    Iso.clampCamera(cam, city.cols, city.rows, getView());
  }

  function worldToScreenInput(wx, wy) {
    const sx = wx - wy;
    const sy = (wx + wy) * 0.5;
    const m = Math.hypot(sx, sy) || 1;
    return { x: sx / m, y: sy / m };
  }

  function stepSimAiIntent(self, foe, cityObj, rand, state) {
    const intent = {
      moveX: 0, moveY: 0,
      light: false, heavy: false, grab: false,
      dodgePressed: false, jumpPressed: false, jumpHeld: false,
      blockHeld: false, specialPressed: false, ultimatePressed: false
    };
    const dx = foe.x - self.x;
    const dy = foe.y - self.y;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0.001 ? dx / dist : self.dirX;
    const uy = dist > 0.001 ? dy / dist : self.dirY;
    if (state.cd > 0) state.cd--;
    if (state.blockTicks > 0) {
      state.blockTicks--;
      intent.blockHeld = true;
    }

    // Approach foe in world space (converted to screen axes for Iso.screenDirToWorld)
    if (dist > 1.35) {
      const strafe = self.blindedTicks > 0 ? Math.sin(state.tick * 0.2) * 0.6 : Math.sin(state.tick * 0.06) * 0.22;
      const sc = worldToScreenInput(ux - uy * strafe, uy + ux * strafe);
      intent.moveX = sc.x;
      intent.moveY = sc.y;
    } else if (dist < 0.85) {
      const sc = worldToScreenInput(-ux, -uy);
      intent.moveX = sc.x * 0.4;
      intent.moveY = sc.y * 0.4;
    }

    // Occasional Lepidora glide / jump-attack entry
    if (!self.grounded && self.stats.canGlide && self.vz < 0 && dist < 3.6) {
      intent.jumpHeld = true;
    }

    const foeThreat = (foe.state === 'attack' || foe.state === 'special' || foe.state === 'ultimate') && dist < 3.4;
    if (foeThreat && state.cd <= 0 && rand() < 0.22) {
      if (rand() < 0.55) {
        intent.dodgePressed = true;
        const sc = worldToScreenInput(-uy * (rand() < 0.5 ? 1 : -1), ux * (rand() < 0.5 ? 1 : -1));
        intent.moveX = sc.x;
        intent.moveY = sc.y;
      } else {
        state.blockTicks = 16;
        intent.blockHeld = true;
      }
      state.cd = 16;
      return intent;
    }

    if (state.cd > 0) return intent;
    if (self.blindedTicks > 0 && rand() < 0.32) {
      state.cd = 10;
      return intent;
    }

    // Ultimate when ready & opponent reasonably close
    if (self.fuel >= self.fuelMax && dist <= 3.6 && rand() < 0.55) {
      intent.ultimatePressed = true;
      state.cd = 28;
      return intent;
    }

    // Special at >= 35 fuel
    const spCost = (self.stats.specials && self.stats.specials.special && self.stats.specials.special.cost) || 35;
    const spKind = self.stats.specials && self.stats.specials.special && self.stats.specials.special.kind;
    const spMin = spKind === 'beam' ? 2.1 : 0;
    const spRange = spKind === 'beam' ? 5.2 : (spKind === 'hurl' ? 5.2 : 3.0);
    if (self.fuel >= spCost && dist >= spMin && dist <= spRange && rand() < 0.28) {
      intent.specialPressed = true;
      state.cd = 26;
      return intent;
    }

    // Break blocks with grab
    if (foe.state === 'block' && dist <= 1.85 && rand() < 0.55) {
      intent.grab = true;
      state.cd = 22;
      return intent;
    }

    // Ranged Rocket Fist for Tin Colossus
    if (self.monsterId === 'tin_colossus' && !self.fistOut && dist >= 2.1 && dist <= 4.8 && rand() < 0.25) {
      intent.heavy = true;
      state.cd = 24;
      return intent;
    }

    // Dive Peck / Leap jump
    if (self.grounded && dist >= 2.2 && dist <= 3.8 && rand() < 0.08) {
      intent.jumpPressed = true;
      intent.jumpHeld = true;
      state.cd = 18;
      return intent;
    }

    // Melee mix
    if (dist <= 2.35) {
      const r = rand();
      if (r < 0.6) {
        intent.light = true;
        state.cd = 9;
      } else if (r < 0.85) {
        intent.heavy = true;
        state.cd = 22;
      } else {
        intent.grab = true;
        state.cd = 22;
      }
    }
    return intent;
  }

  function simMatchups(gamesPerPair) {
    const n = gamesPerPair || 200;
    const roster = KB.MONSTER_ORDER || ['gorgantor', 'mongo', 'lepidora', 'tin_colossus'];
    const pairs = [];
    const dt = 1 / 60;
    let maxWinRate = 0;

    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const mA = roster[i];
        const mB = roster[j];
        let winsA = 0;
        let winsB = 0;
        let draws = 0;

        for (let g = 0; g < n; g++) {
          const rand = U.rng(19540 + i * 1000 + j * 100 + g);
          const simCity = Cities.create('pinebrook');
          const simCctx = Combat.createContext({ headless: true });
          if (simCity.startProps) {
            for (let p = 0; p < simCity.startProps.length; p++) {
              const sp = simCity.startProps[p];
              Entities.spawnProp(simCctx, sp.type, sp.x, sp.y, simCity);
            }
          }
          const swap = (g % 2) === 1;
          const kA = Entities.createKaiju({
            id: 100 + g * 2,
            isPlayer: true,
            monsterId: mA,
            x: swap ? 5.2 : 11.2,
            y: swap ? 15.2 : 11.2
          });
          const kB = Entities.createKaiju({
            id: 101 + g * 2,
            isPlayer: false,
            monsterId: mB,
            x: swap ? 11.2 : 5.2,
            y: swap ? 11.2 : 15.2
          });
          const kaijus = [kA, kB];
          const stA = { cd: 10, blockTicks: 0, tick: 0 };
          const stB = { cd: 10, blockTicks: 0, tick: 0 };

          for (let tick = 0; tick < 3600; tick++) {
            stA.tick = tick;
            stB.tick = tick;
            const iA = stepSimAiIntent(kA, kB, simCity, rand, stA);
            const iB = stepSimAiIntent(kB, kA, simCity, rand, stB);
            stepCombatWorld(kA, kB, iA, iB, simCity, simCctx, dt, null, kaijus);
            if (kA.hp <= 0 || kB.hp <= 0) break;
          }

          const pctA = kA.hp / kA.maxHp;
          const pctB = kB.hp / kB.maxHp;
          if (kB.hp <= 0 && kA.hp > 0) winsA++;
          else if (kA.hp <= 0 && kB.hp > 0) winsB++;
          else if (pctA > pctB + 0.001) winsA++;
          else if (pctB > pctA + 0.001) winsB++;
          else draws++;
        }

        const rateA = Number((winsA / n).toFixed(3));
        const rateB = Number((winsB / n).toFixed(3));
        maxWinRate = Math.max(maxWinRate, rateA, rateB);
        pairs.push({
          a: mA,
          b: mB,
          winsA: winsA,
          winsB: winsB,
          draws: draws,
          winRateA: rateA,
          winRateB: rateB
        });
      }
    }
    return {
      gamesPerPair: n,
      pairs: pairs,
      maxWinRate: Number(maxWinRate.toFixed(3)),
      ok: maxWinRate <= 0.65
    };
  }

  KB.test = {
    sortSelfCheck: sortSelfCheck,
    lootStats: function (wrecks, seed) {
      return Entities.simLootStats(wrecks || 200, seed);
    },
    simMatchups: simMatchups,
    isTrainingMode: function () { return trainingMode; },
    stepTicks: function (n) {
      const steps = Math.max(0, Math.floor(n || 1));
      for (let i = 0; i < steps && mode === 'play'; i++) {
        stepSimulation();
      }
      updateHud();
      return { mode: mode, round: round, roundPhase: roundPhase, kos: kos, score: score, elapsed: elapsed };
    },
    getRoundState: function () {
      return {
        trainingMode: trainingMode,
        mode: mode,
        round: round,
        roundPhase: roundPhase,
        intermissionTicks: intermissionTicks,
        defeatTicks: defeatTicks,
        kos: kos,
        wrecked: wrecked,
        score: score,
        highScore: highScore,
        elapsed: +elapsed.toFixed(3),
        stylePoints: cctx ? cctx.stylePoints : 0,
        playerTookDamageThisRound: cctx ? !!cctx.playerTookDamageThisRound : false,
        titleCard: titleCard ? Object.assign({}, titleCard) : null,
        ai: challengerAi ? challengerAi.getState() : null,
        challenger: dummy ? {
          id: dummy.monsterId,
          hp: dummy.hp,
          maxHp: dummy.maxHp,
          hpMul: dummy.hpMul,
          dmgMul: dummy.dmgMul,
          isBoss: !!dummy.isBoss,
          telegraphTicks: dummy.telegraphTicks || 0
        } : null
      };
    },
    computeScoreBreakdown: computeRampageScore,
    movePlayer: movePlayer,
    moveMarker: movePlayer,
    setDebug: function (on) { debugEnabled = !!on; },
    setHp: function (hp) {
      player.hp = U.clamp(hp, 0, player.maxHp);
      updateHud();
    },
    setEnemyHp: function (hp) {
      dummy.hp = U.clamp(hp, 0, dummy.maxHp);
      updateHud();
    },
    setFuel: function (fuel) {
      player.fuel = U.clamp(fuel, 0, player.fuelMax);
      updateHud();
    },
    spawnProp: function (type, x, y) {
      return Entities.spawnProp(cctx, type || 'girder', x !== undefined ? x : player.x + 1, y !== undefined ? y : player.y, city);
    },
    setDummyMode: setDummyMode,
    triggerDummyAttack: function (moveName) {
      dummyQueuedMove = moveName === 'heavy' ? 'heavy' : 'light';
    },
    resetDummy: function () {
      resetDummyState();
      updateHud();
    },
    wreckAll: function () {
      const kaijus = [player, dummy];
      for (let i = 0; i < city.buildings.length; i++) {
        const b = city.buildings[i];
        if (b.state !== 'rubble') {
          Combat.damageBuilding(b, b.hp + 100, city, cctx, player, kaijus, cam);
        }
      }
      wrecked = cctx.buildingsWrecked;
      updateHud();
      return cctx.buildingsWrecked;
    },
    getBuildings: function () {
      return city.buildings.map(function (b) {
        return { id: b.id, type: b.type, label: b.label, hp: b.hp, maxHp: b.maxHp, state: b.state, zTop: b.zTop, collBox: b.collBox };
      });
    },
    getState: function () {
      const drawables = city.buildings.slice();
      for (let i = 0; i < cctx.pickups.length; i++) drawables.push(cctx.pickups[i]);
      for (let i = 0; i < cctx.propDrops.length; i++) drawables.push(cctx.propDrops[i]);
      drawables.push(player);
      drawables.push(dummy);
      const sorted = Iso.cullAndSort(drawables, cam, getView());
      let intactCnt = 0, damagedCnt = 0, rubbleCnt = 0;
      for (let i = 0; i < city.buildings.length; i++) {
        const st = city.buildings[i].state;
        if (st === 'intact') intactCnt++;
        else if (st === 'damaged') damagedCnt++;
        else rubbleCnt++;
      }
      return {
        mode: mode,
        city: city.id,
        buildings: city.buildings.length,
        buildingStates: { intact: intactCnt, damaged: damagedCnt, rubble: rubbleCnt },
        buildingsWrecked: cctx.buildingsWrecked,
        slowZones: city.slowZones.length,
        speedMult: Entities.getMoveSpeedMult(player, city),
        dummyMode: dummyMode,
        player: {
          x: player.x,
          y: player.y,
          z: player.z,
          vx: player.vx,
          vy: player.vy,
          vz: player.vz,
          hp: player.hp,
          maxHp: player.maxHp,
          fuel: player.fuel,
          guard: player.guard,
          guardMax: player.guardMax,
          state: player.state,
          stateTick: player.stateTick,
          hitStop: player.hitStop,
          grounded: player.grounded,
          counterWindow: player.counterWindow,
          dodgeCooldown: player.dodgeCooldown,
          carrying: player.carrying ? { id: player.carrying.id, type: player.carrying.propType, usesLeft: player.carrying.usesLeft } : null,
          climb: player.climb ? { buildingId: player.climb.building.id, face: player.climb.face } : null,
          burnTicks: player.burnTicks,
          overcharged: !!player.overcharged,
          specialCooldown: player.specialCooldown,
          special: player.special ? { id: player.special.def.id, phase: player.special.phase, beamAngle: player.special.beamAngle, ticksFired: player.special.ticksFired } : null,
          sortOrder: player._sortOrder
        },
        dummy: {
          x: dummy.x,
          y: dummy.y,
          z: dummy.z,
          hp: dummy.hp,
          maxHp: dummy.maxHp,
          guard: dummy.guard,
          guardMax: dummy.guardMax,
          state: dummy.state,
          stateTick: dummy.stateTick,
          hitStop: dummy.hitStop,
          grounded: dummy.grounded,
          burnTicks: dummy.burnTicks,
          comboReceived: dummy.comboReceived
        },
        combat: {
          playerCombo: cctx.playerCombo,
          playerComboTimer: cctx.playerComboTimer,
          stylePoints: cctx.stylePoints,
          pickups: cctx.pickups.map(function (p) { return { id: p.id, type: p.pickupType, x: p.x, y: p.y, life: +p.life.toFixed(2) }; }),
          props: cctx.props.map(function (d) { return { id: d.id, type: d.propType, state: d.state, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: Math.round(d.z), usesLeft: d.usesLeft }; }),
          propDrops: cctx.propDrops.map(function (d) { return { id: d.id, type: d.propType, state: d.state, x: d.x, y: d.y }; }),
          civilians: cctx.civilians.length,
          debris: cctx.debris.length,
          dust: cctx.dust.length,
          popups: cctx.popups.length,
          sparks: cctx.sparks.length
        },
        intent: Object.assign({}, In.readIntent()),
        sortedIds: sorted.map(function (it) { return it.id; })
      };
    }
  };

  applyOrientation();
  resetRun();
  updateHud();
  requestAnimationFrame(frame);

  KB.Game = {
    start: start,
    pause: pause,
    resume: resume,
    quit: quit,
    getMode: function () { return mode; },
    getHigh: function () { return highScore; },
    getSelectedMonster: function () { return selectedMonster; },
    setSelectedMonster: function (id) {
      if (KB.MONSTERS && KB.MONSTERS[id]) {
        selectedMonster = id;
        try { localStorage.setItem(MONSTER_KEY, id); } catch (e) { /* ignore */ }
      }
    },
    getSelectedCity: function () { return selectedCity; },
    setSelectedCity: function (id) {
      if (Cities.DEFS && Cities.DEFS[id]) {
        selectedCity = id;
        try { localStorage.setItem(CITY_KEY, id); } catch (e) { /* ignore */ }
      }
    },
    cycleDummyMode: cycleDummyMode,
    setDummyMode: setDummyMode,
    getDummyMode: function () { return dummyMode; },
    setOrientationMode: setOrientationMode,
    getOrientationMode: function () { return orientPref; },
    getEffectiveOrientation: function () { return effectiveOrient; },
    applyOrientation: applyOrientation,
    set onAutoPause(fn) { callbacks.onAutoPause = fn; },
    set onGameOver(fn) { callbacks.onGameOver = fn; },
    set onOrientChange(fn) { callbacks.onOrientChange = fn; }
  };
})();
