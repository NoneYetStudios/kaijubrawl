/* Kaiju Brawl - frame-data combat state machine, hit/hurtboxes, block, dodge, hit-stop. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const U = KB.Util;
  const In = KB.Input;
  const Snd = KB.Audio;

  /* Frame data at 60 fps (PLAN.md §5.1) */
  const MOVES = {
    light1: {
      startup: 5, active: 3, recovery: 8,
      chainWindow: 14, nextMove: 'light2',
      dmg: 8, guardDmg: 10, stagger: 20,
      reach: 1.48, arc: Math.PI * 0.62, zMin: 0, zMax: 96,
      knockback: 0.35, hitstun: 14, hitStop: 3, fuelGain: 4,
      lunge: 0.22, launcher: false
    },
    light2: {
      startup: 5, active: 3, recovery: 8,
      chainWindow: 14, nextMove: 'light3',
      dmg: 9, guardDmg: 12, stagger: 24,
      reach: 1.54, arc: Math.PI * 0.65, zMin: 0, zMax: 96,
      knockback: 0.42, hitstun: 15, hitStop: 3, fuelGain: 4,
      lunge: 0.26, launcher: false
    },
    light3: {
      startup: 7, active: 4, recovery: 16,
      chainWindow: 0, nextMove: null,
      dmg: 14, guardDmg: 18, stagger: 50,
      reach: 1.68, arc: Math.PI * 0.72, zMin: 0, zMax: 112,
      knockback: 1.05, hitstun: 22, hitStop: 5, fuelGain: 4,
      lunge: 0.35, launcher: true, launchVz: 5.5
    },
    heavy: {
      startup: 14, active: 4, recovery: 22,
      armorStart: 6, armorEnd: 14,
      dmg: 26, guardDmg: 56, stagger: 62,
      buildingMult: 1.5,
      reach: 1.85, arc: Math.PI * 0.75, zMin: 0, zMax: 120,
      knockback: 1.25, hitstun: 24, hitStop: 6, fuelGain: 8,
      lunge: 0.45, launcher: false
    },
    jump_atk: {
      startup: 4, active: 8, recovery: 10,
      dmg: 12, guardDmg: 18, stagger: 45,
      radial: true, reach: 1.25, zMin: 0, zMax: 85,
      knockback: 0.85, hitstun: 20, hitStop: 4, fuelGain: 5,
      lunge: 0, launcher: false
    },
    grab: {
      startup: 8, active: 3, recovery: 20,
      dmg: 18, slamDmg: 24,
      reach: 1.35, arc: Math.PI * 0.72, zMin: 0, zMax: 100,
      fuelGain: 5, hitStop: 5, lunge: 0.35
    },
    prop_smash: {
      startup: 10, active: 4, recovery: 16,
      dmg: 22, guardDmg: 28, stagger: 52,
      reach: 1.75, arc: Math.PI * 0.76, zMin: 0, zMax: 112,
      knockback: 1.1, hitstun: 20, hitStop: 5, fuelGain: 4,
      lunge: 0.32, launcher: false
    }
  };

  const DODGE_TOTAL = 18;
  const DODGE_IFRAME_START = 3;
  const DODGE_IFRAME_END = 14; // 12 ticks: frames 3..14 inclusive
  const DODGE_COOLDOWN = 60;
  const COUNTER_WINDOW_TICKS = 45;

  const PERFECT_BLOCK_TICKS = 6;
  const GUARD_BREAK_TICKS = 40;
  const KNOCKDOWN_TICKS = 50;
  const GETUP_TICKS = 30;
  const GETUP_IFRAME_TICKS = 10;

  let nextAtkId = 1;

  function createCombatContext(opts) {
    const props = [];
    return {
      headless: !!(opts && opts.headless),
      popups: [],
      sparks: [],
      pickups: [],
      props: props,
      propDrops: props,
      projectiles: [],
      clouds: [],
      debris: [],
      dust: [],
      civilians: [],
      novaWaves: [],
      comicCards: [],
      screenFlash: null,
      fuelShakeTicks: 0,
      buildingsWrecked: 0,
      noHealthOrbSec: 0,
      stylePoints: 0,
      playerCombo: 0,
      playerComboTimer: 0,
      playerTookDamageThisRound: false
    };
  }

  function effectivePower(k) {
    let p = k.stats.power || 1.0;
    if (k.stats.batteryThreshold && k.fuel >= k.stats.batteryThreshold) {
      p *= (k.stats.batteryDmgMult || 1.1);
    }
    p *= (k.dmgMul || 1.0);
    return p;
  }

  function spawnComicCard(cctx, x, y, z, text, color) {
    if (!cctx || cctx.headless || !cctx.comicCards) return;
    cctx.comicCards.push({
      x: x,
      y: y,
      z: z,
      text: text || 'KAPOW!',
      color: color || '#ffd23f',
      tilt: (Math.random() - 0.5) * 0.24,
      life: 46,
      maxLife: 46
    });
  }

  function addPopup(cctx, x, y, z, text, color, scale) {
    if (!cctx || cctx.headless) return;
    cctx.popups.push({
      x: x,
      y: y,
      z: z,
      text: text,
      color: color || '#ffd23f',
      scale: scale || 1,
      life: 44,
      maxLife: 44
    });
  }

  function addSpark(cctx, x, y, z, color, size) {
    if (!cctx || cctx.headless) return;
    cctx.sparks.push({
      x: x,
      y: y,
      z: z,
      color: color || '#ffd23f',
      size: size || 26,
      life: 14,
      maxLife: 14
    });
  }

  function updateFx(cctx) {
    if (!cctx) return;
    for (let i = cctx.popups.length - 1; i >= 0; i--) {
      const p = cctx.popups[i];
      p.z += 0.8;
      p.life--;
      if (p.life <= 0) cctx.popups.splice(i, 1);
    }
    for (let i = cctx.sparks.length - 1; i >= 0; i--) {
      cctx.sparks[i].life--;
      if (cctx.sparks[i].life <= 0) cctx.sparks.splice(i, 1);
    }
    if (cctx.novaWaves) {
      for (let i = cctx.novaWaves.length - 1; i >= 0; i--) {
        cctx.novaWaves[i].life--;
        if (cctx.novaWaves[i].life <= 0) cctx.novaWaves.splice(i, 1);
      }
    }
    if (cctx.comicCards) {
      for (let i = cctx.comicCards.length - 1; i >= 0; i--) {
        cctx.comicCards[i].z += 0.35;
        cctx.comicCards[i].life--;
        if (cctx.comicCards[i].life <= 0) cctx.comicCards.splice(i, 1);
      }
    }
    if (cctx.screenFlash) {
      cctx.screenFlash.life--;
      if (cctx.screenFlash.life <= 0) cctx.screenFlash = null;
    }
    if (cctx.fuelShakeTicks > 0) cctx.fuelShakeTicks--;
    if (cctx.playerComboTimer > 0) {
      cctx.playerComboTimer--;
      if (cctx.playerComboTimer === 0) cctx.playerCombo = 0;
    }
  }

  function isInvulnerable(k) {
    if (k.state === 'ko') return true;
    if (k.state === 'ultimate' && k.special && k.special.phase === 'blast') return true;
    if (k.state === 'dodge') {
      return k.stateTick >= DODGE_IFRAME_START && k.stateTick <= DODGE_IFRAME_END;
    }
    if (k.state === 'knockdown') return true;
    if (k.state === 'getup') {
      return k.stateTick > (GETUP_TICKS - GETUP_IFRAME_TICKS);
    }
    return false;
  }

  function hasArmor(k) {
    if (k.state === 'ultimate' && k.special && (k.special.phase === 'charge' || (k.special.def && (k.special.def.kind === 'rush' || k.special.def.kind === 'vortex')))) return true;
    if (k.state !== 'heavy' || !k.attack || !k.armorCharges) return false;
    const def = k.attack.def || MOVES.heavy;
    if (def.kind === 'rocket_fist') return false;
    return k.stateTick >= def.armorStart && k.stateTick <= def.armorEnd;
  }

  function startAttack(k, moveName, intent) {
    const baseDef = MOVES[moveName];
    if (!baseDef) return;
    let def = baseDef;
    if (moveName === 'heavy' && k.stats.heavyMove) {
      if (k.stats.heavyMove.kind === 'rocket_fist' && k.fistOut) return;
      def = Object.assign({}, baseDef, k.stats.heavyMove);
    } else if ((moveName === 'light1' || moveName === 'light2' || moveName === 'light3') && k.stats.lightSpeedMult && k.stats.lightSpeedMult !== 1) {
      const m = 1 / k.stats.lightSpeedMult;
      def = Object.assign({}, baseDef, {
        startup: Math.max(3, Math.round(baseDef.startup * m)),
        active: Math.max(4, Math.round(baseDef.active * (0.7 + 0.3 * m))),
        recovery: Math.max(5, Math.round(baseDef.recovery * m)),
        chainWindow: Math.max(4, Math.round(baseDef.chainWindow * m))
      });
    }
    k.state = moveName;
    k.stateTick = 0;
    k.chainQueued = false;
    k.armorCharges = moveName === 'heavy' ? 1 : 0;

    // Snap facing toward held direction when starting an attack (except back+grab slam)
    let grabSlam = false;
    if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
      const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
      if (wd.x !== 0 || wd.y !== 0) {
        if (moveName === 'grab' && (wd.x * k.dirX + wd.y * k.dirY) < -0.35) {
          grabSlam = true;
        } else {
          k.dirX = wd.x;
          k.dirY = wd.y;
        }
      }
    }

    k.attack = {
      id: nextAtkId++,
      name: moveName,
      def: def,
      grabSlam: grabSlam,
      hitSet: new Set(),
      dodgedSet: new Set(),
      active: false,
      shockwaveTriggered: false,
      projectileFired: false
    };

    if (def.hopVz && k.grounded) {
      k.vz = def.hopVz;
      k.grounded = false;
    }
    if (def.lunge > 0) {
      k.vx = k.dirX * def.lunge * 6.5;
      k.vy = k.dirY * def.lunge * 6.5;
    }
    Snd.sfx.whoosh();
  }

  function startDodge(k, intent) {
    let dx = k.dirX;
    let dy = k.dirY;
    if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
      const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
      if (wd.x !== 0 || wd.y !== 0) {
        dx = wd.x;
        dy = wd.y;
      }
    }
    k.dirX = dx;
    k.dirY = dy;
    k.state = 'dodge';
    k.stateTick = 0;
    k.dodgeCooldown = DODGE_COOLDOWN;
    k.attack = null;
    k.vx = dx * k.stats.speed * 2.35;
    k.vy = dy * k.stats.speed * 2.35;
    Snd.sfx.dodge();
  }

  function dropCarriedProp(k, cctx, city) {
    if (!k || !k.carrying) return;
    const p = k.carrying;
    k.carrying = null;
    p.state = 'ground';
    p.ownerId = null;
    p.hitSet = null;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.z = 0;
    p.rot = 0;
    p.x = city ? U.clamp(k.x + k.dirX * 0.45, 0.5, city.cols - 0.5) : k.x;
    p.y = city ? U.clamp(k.y + k.dirY * 0.45, 0.5, city.rows - 0.5) : k.y;
    KB.Entities.syncPropBounds(p);
  }

  function findNearestGroundProp(k, cctx) {
    if (!cctx || !cctx.props) return null;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < cctx.props.length; i++) {
      const p = cctx.props[i];
      if (!p || p.state !== 'ground') continue;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      const maxD = k.r + p.r + 0.78;
      if (d <= maxD && d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function throwCarriedProp(k, intent, cctx) {
    if (!k || !k.carrying) return;
    const prop = k.carrying;
    k.carrying = null;
    if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
      const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
      if (wd.x !== 0 || wd.y !== 0) {
        k.dirX = wd.x;
        k.dirY = wd.y;
      }
    }
    const throwMult = k.stats.throwMult || 1.0;
    prop.state = 'thrown';
    prop.ownerId = k.id;
    prop.ownerPower = k.stats.power;
    prop.ownerIsPlayer = k.isPlayer;
    prop.x = k.x + k.dirX * (k.r + prop.r + 0.12);
    prop.y = k.y + k.dirY * (k.r + prop.r + 0.12);
    prop.z = k.z + 52;
    prop.vx = k.dirX * 15.5 * throwMult;
    prop.vy = k.dirY * 15.5 * throwMult;
    prop.vz = 4.2;
    prop.rot = 0;
    prop.hitSet = new Set([k.id]);
    KB.Entities.syncPropBounds(prop);

    if (prop.def.fuelOnThrow && !prop.fuelGranted) {
      prop.fuelGranted = true;
      k.fuel = Math.min(k.fuelMax, k.fuel + prop.def.fuelOnThrow);
      addPopup(cctx, k.x, k.y, k.z + 108, '+' + prop.def.fuelOnThrow + ' FUEL', '#7dff4f', 1.08);
    }

    k.state = 'throw_anim';
    k.stateTick = 0;
    k.attack = null;
    Snd.sfx.throwProp();
  }

  function beamHitsBox(kx, ky, ux, uy, length, halfW, box) {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * length;
      const px = kx + ux * t;
      const py = ky + uy * t;
      const cx = U.clamp(px, box.x0, box.x1);
      const cy = U.clamp(py, box.y0, box.y1);
      if (Math.hypot(px - cx, py - cy) <= halfW) return true;
    }
    return false;
  }

  function startSpecial(k, intent, cctx) {
    const def = k.stats.specials && k.stats.specials.special;
    if (!def) return false;
    const cost = def.cost || 35;
    if (k.specialCooldown > 0) {
      addPopup(cctx, k.x, k.y, k.z + 96, 'RECHARGING!', '#5ee6ff', 0.9);
      return false;
    }
    if (k.fuel < cost) {
      if (k.isPlayer && cctx) cctx.fuelShakeTicks = 24;
      Snd.sfx.block();
      addPopup(cctx, k.x, k.y, k.z + 96, 'NEED ' + cost + ' FUEL!', '#ff6b57', 1.0);
      return false;
    }
    if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
      const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
      if (wd.x !== 0 || wd.y !== 0) {
        k.dirX = wd.x;
        k.dirY = wd.y;
      }
    }
    k.fuel = Math.max(0, k.fuel - cost);
    k.overcharged = k.fuel >= 80;
    k.specialCooldown = def.cooldownTicks || 90;
    k.attack = null;
    k.state = 'special';
    k.stateTick = 0;
    const baseAngle = Math.atan2(k.dirY, k.dirX);
    k.special = {
      mode: 'special',
      def: def,
      phase: 'startup',
      baseAngle: baseAngle,
      beamAngle: baseAngle,
      ticksFired: 0
    };
    k.vx *= 0.25;
    k.vy *= 0.25;
    spawnComicCard(cctx, k.x, k.y, k.z + 118, def.cardText || 'ROAAAR!', def.color || '#7dff4f');
    Snd.sfx.breath();
    return true;
  }

  function startUltimate(k, cctx) {
    const def = k.stats.specials && k.stats.specials.ultimate;
    if (!def) return false;
    const cost = def.cost || 100;
    if (k.fuel < cost) {
      if (k.isPlayer && cctx) cctx.fuelShakeTicks = 24;
      Snd.sfx.block();
      addPopup(cctx, k.x, k.y, k.z + 96, 'NEED ' + cost + ' FUEL!', '#ff6b57', 1.0);
      return false;
    }
    k.fuel = 0;
    k.overcharged = false;
    k.attack = null;
    k.state = 'ultimate';
    k.stateTick = 0;
    k.special = {
      mode: 'ultimate',
      def: def,
      phase: 'charge',
      blasted: false
    };
    k.vx = 0;
    k.vy = 0;
    if (cctx && !cctx.headless) {
      cctx.screenFlash = { color: def.color || '#7dff4f', alpha: 0.45, life: 16, maxLife: 16 };
    }
    spawnComicCard(cctx, k.x, k.y, k.z + 124, 'MELTDOWN!', def.ringColor || '#ffd23f');
    Snd.sfx.meltdownCharge();
    return true;
  }

  function spawnProjectile(cctx, opts) {
    if (!cctx || !cctx.projectiles) return null;
    const p = Object.assign({
      id: nextAtkId++,
      kind: 'chunk',
      ownerId: null,
      ownerIsPlayer: false,
      ownerRef: null,
      x: 0,
      y: 0,
      z: 36,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      r: 0.45,
      dmg: 32,
      buildingMult: 1.5,
      knockback: 7.5,
      life: 120,
      returning: false,
      maxRange: 5.0,
      startX: 0,
      startY: 0,
      pierceLeft: 0,
      explodeRadius: 0,
      color: '#ff9a2e',
      hitSet: new Set()
    }, opts || {});
    cctx.projectiles.push(p);
    return p;
  }

  function applyRadialBurst(k, rad, dmg, buildingMult, cctx, city, allKaijus, cam, label, cardColor) {
    const E = KB.Entities;
    if (cctx && !cctx.headless) {
      cctx.novaWaves.push({ x: k.x, y: k.y, z: k.z + 12, radius: rad, life: 24, maxLife: 24, color: cardColor || '#ffd23f' });
    }
    addSpark(cctx, k.x, k.y, k.z + 32, cardColor || '#ffd23f', 64);
    if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 16);

    if (allKaijus) {
      for (let i = 0; i < allKaijus.length; i++) {
        const t = allKaijus[i];
        if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t)) continue;
        const dx = t.x - k.x;
        const dy = t.y - k.y;
        if (Math.hypot(dx, dy) <= rad + t.r) {
          const actual = Math.max(1, Math.round(dmg * t.stats.defense));
          t.hp = Math.max(0, t.hp - actual);
          t.fuel = Math.min(t.fuelMax, t.fuel + 2);
          t.hitFlash = 8;
          dropCarriedProp(t, cctx, city);
          if (t.state === 'climb') { t.climb = null; t.climbCooldown = 20; }
          const kn = U.vec2.norm(dx || 0.7, dy || 0.7);
          t.vx = (kn.x * 8.8) / t.stats.weight;
          t.vy = (kn.y * 8.8) / t.stats.weight;
          t.vz = 5.2;
          t.grounded = false;
          t.state = 'knockdown';
          t.stateTick = 0;
          addPopup(cctx, t.x, t.y, t.z + 108, (label || 'BURST!') + ' -' + actual, cardColor || '#ff6b57', 1.2);
          if (k.isPlayer && cctx) cctx.stylePoints += 90;
        }
      }
    }
    if (city && city.buildings) {
      for (let i = 0; i < city.buildings.length; i++) {
        const b = city.buildings[i];
        if (b.state === 'rubble') continue;
        const box = E.getBuildingCollBox(b);
        const cx = U.clamp(k.x, box.x0, box.x1);
        const cy = U.clamp(k.y, box.y0, box.y1);
        if (Math.hypot(k.x - cx, k.y - cy) <= rad) {
          damageBuilding(b, Math.round(dmg * (buildingMult || 1.5)), city, cctx, k.isPlayer ? k : null, allKaijus, cam);
        }
      }
    }
  }

  function applyBeamTick(k, sp, city, dt, cctx, allKaijus, cam) {
    const def = sp.def;
    const ux = Math.cos(sp.beamAngle);
    const uy = Math.sin(sp.beamAngle);
    const len = def.length || 6.0;
    const hw = def.halfWidth || 0.58;
    const pwr = effectivePower(k);

    // 1. Kaiju hits along beam
    if (allKaijus) {
      for (let i = 0; i < allKaijus.length; i++) {
        const t = allKaijus[i];
        if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t)) continue;
        if (t.z > 125) continue;
        const dx = t.x - k.x;
        const dy = t.y - k.y;
        const proj = U.clamp(dx * ux + dy * uy, 0, len);
        const cx = k.x + ux * proj;
        const cy = k.y + uy * proj;
        if (Math.hypot(t.x - cx, t.y - cy) <= hw + t.r) {
          if (t.state === 'block') {
            const cDmg = Math.max(1, Math.round(def.dmgPerTick * 0.25));
            t.hp = Math.max(0, t.hp - cDmg);
            t.guard = Math.max(0, t.guard - 10);
            t.hitFlash = 3;
            addSpark(cctx, t.x, t.y, t.z + 52, '#5ee6ff', 22);
          } else {
            const bDmg = Math.max(1, Math.round(def.dmgPerTick * pwr * t.stats.defense));
            t.hp = Math.max(0, t.hp - bDmg);
            t.fuel = Math.min(t.fuelMax, t.fuel + 2);
            t.hitFlash = 4;
            t.vx += (ux * 2.4) / t.stats.weight;
            t.vy += (uy * 2.4) / t.stats.weight;
            if (def.setsFire && !t.stats.fireImmune) {
              t.burnTicks = Math.max(t.burnTicks || 0, 150);
            }
            addSpark(cctx, t.x, t.y, t.z + 54, def.color || '#7dff4f', 26);
            addPopup(cctx, t.x, t.y, t.z + 96, '-' + bDmg, def.color || '#7dff4f', 0.95);
            if (k.isPlayer && cctx) {
              cctx.playerCombo++;
              cctx.playerComboTimer = 90;
              if (!sp.hitStyleSet) sp.hitStyleSet = new Set();
              if (!sp.hitStyleSet.has(t.id)) {
                sp.hitStyleSet.add(t.id);
                cctx.stylePoints += 30;
              }
            }
          }
        }
      }
    }

    // 2. Ignites Fuel Tankers along beam line
    if (cctx && cctx.props && def.ignites) {
      for (let i = cctx.props.length - 1; i >= 0; i--) {
        const p = cctx.props[i];
        if (!p || !p.def.explodes || p._detonated || p.state === 'carried') continue;
        const dx = p.x - k.x;
        const dy = p.y - k.y;
        const proj = U.clamp(dx * ux + dy * uy, 0, len);
        const cx = k.x + ux * proj;
        const cy = k.y + uy * proj;
        if (Math.hypot(p.x - cx, p.y - cy) <= hw + p.r + 0.15) {
          if (p.def.fuelOnThrow && !p.fuelGranted) {
            p.fuelGranted = true;
            k.fuel = Math.min(k.fuelMax, k.fuel + p.def.fuelOnThrow);
            addPopup(cctx, k.x, k.y, k.z + 112, '+' + p.def.fuelOnThrow + ' FUEL', '#7dff4f', 1.05);
          }
          detonateProp(p, p.x, p.y, city, cctx, k.isPlayer ? k : null, allKaijus, cam, { beamIgniterId: k.id });
        }
      }
    }

    // 3. Wrecks buildings along beam line (gas stations take extra heat)
    if (city && city.buildings) {
      const E = KB.Entities;
      for (let i = 0; i < city.buildings.length; i++) {
        const b = city.buildings[i];
        if (b.state === 'rubble') continue;
        const box = E.getBuildingCollBox(b);
        if (beamHitsBox(k.x, k.y, ux, uy, len, hw, box)) {
          const bTickDmg = (def.buildingDmgPerTick || 20) * (b.explodes ? 2.2 : 1.0) * pwr;
          damageBuilding(b, bTickDmg, city, cctx, k.isPlayer ? k : null, allKaijus, cam);
        }
      }
    }
  }

  function stepSpecialState(k, intent, city, dt, cctx, allKaijus, cam) {
    const sp = k.special;
    if (!sp || !sp.def) {
      k.state = 'idle';
      k.stateTick = 0;
      k.special = null;
      return;
    }
    const def = sp.def;
    const pwr = effectivePower(k);
    k.stateTick++;

    if (sp.mode === 'special') {
      k.vx *= 0.80;
      k.vy *= 0.80;

      if (def.kind === 'beam') {
        const startEnd = def.startupTicks || 10;
        const activeEnd = startEnd + (def.durationTicks || 72);
        const total = activeEnd + (def.recoveryTicks || 10);

        if (k.stateTick <= startEnd) {
          sp.phase = 'startup';
          if (k.stateTick === startEnd) {
            sp.phase = 'active';
            spawnComicCard(cctx, k.x + k.dirX * 1.4, k.y + k.dirY * 1.4, k.z + 82, def.cardText || 'ZZAP!', def.color || '#7dff4f');
          }
        } else if (k.stateTick <= activeEnd) {
          sp.phase = 'active';
          if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
            const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
            if (wd.x !== 0 || wd.y !== 0) {
              const targetAng = Math.atan2(wd.y, wd.x);
              let diff = targetAng - sp.baseAngle;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              const maxSweep = def.sweepMaxRad || (25 * Math.PI) / 180;
              const clampedGoal = sp.baseAngle + U.clamp(diff, -maxSweep, maxSweep);
              let stepDiff = clampedGoal - sp.beamAngle;
              while (stepDiff > Math.PI) stepDiff -= Math.PI * 2;
              while (stepDiff < -Math.PI) stepDiff += Math.PI * 2;
              const maxStep = (def.sweepSpeed || 1.45) * dt;
              sp.beamAngle += U.clamp(stepDiff, -maxStep, maxStep);
              k.dirX = Math.cos(sp.beamAngle);
              k.dirY = Math.sin(sp.beamAngle);
            }
          }

          const aTick = k.stateTick - startEnd - 1;
          const interval = def.tickInterval || 12;
          if (aTick % interval === 0) {
            sp.ticksFired++;
            applyBeamTick(k, sp, city, dt, cctx, allKaijus, cam);
          }
        } else if (k.stateTick < total) {
          sp.phase = 'recovery';
        } else {
          k.special = null;
          k.state = 'idle';
          k.stateTick = 0;
        }
      } else if (def.kind === 'hurl') {
        // Mighty Mongo: Skyscraper Hurl (pulls nearest prop or rips building chunk & hurls for 60 dmg)
        const startEnd = def.startupTicks || 12;
        const total = startEnd + (def.durationTicks || 16) + (def.recoveryTicks || 14);
        if (k.stateTick < startEnd) {
          sp.phase = 'startup';
          if (!sp.pullTarget && cctx && cctx.props) {
            let bestP = null;
            let bestD = def.pullRadius || 2.2;
            for (let i = 0; i < cctx.props.length; i++) {
              const pr = cctx.props[i];
              if (!pr || pr.state !== 'ground') continue;
              const d = Math.hypot(pr.x - k.x, pr.y - k.y);
              if (d <= bestD) { bestD = d; bestP = pr; }
            }
            if (bestP) {
              sp.pullTarget = bestP;
              bestP.state = 'carried';
              bestP.ownerId = k.id;
            }
          }
          if (sp.pullTarget) {
            sp.pullTarget.x = U.lerp(sp.pullTarget.x, k.x + k.dirX * 0.4, 0.28);
            sp.pullTarget.y = U.lerp(sp.pullTarget.y, k.y + k.dirY * 0.4, 0.28);
            sp.pullTarget.z = U.lerp(sp.pullTarget.z, k.z + 52, 0.28);
            KB.Entities.syncPropBounds(sp.pullTarget);
          }
        } else if (k.stateTick === startEnd) {
          sp.phase = 'active';
          if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
            const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
            if (wd.x !== 0 || wd.y !== 0) { k.dirX = wd.x; k.dirY = wd.y; }
          }
          const spd = def.speed || 17.5;
          if (sp.pullTarget) {
            const prop = sp.pullTarget;
            sp.pullTarget = null;
            prop.state = 'thrown';
            prop.ownerId = k.id;
            prop.ownerPower = pwr;
            prop.ownerIsPlayer = k.isPlayer;
            prop.x = k.x + k.dirX * (k.r + prop.r + 0.15);
            prop.y = k.y + k.dirY * (k.r + prop.r + 0.15);
            prop.z = k.z + 52;
            prop.vx = k.dirX * spd * (k.stats.throwMult || 1.0);
            prop.vy = k.dirY * spd * (k.stats.throwMult || 1.0);
            prop.vz = 3.8;
            prop.hitSet = new Set([k.id]);
            prop.hurlDmgOverride = def.dmg || 60;
            KB.Entities.syncPropBounds(prop);
          } else {
            // Rip chunk from nearest building within 2.5 tiles (or boulder from ground)
            if (city && city.buildings) {
              const E = KB.Entities;
              let nearB = null;
              let nearD = 2.6;
              for (let i = 0; i < city.buildings.length; i++) {
                const b = city.buildings[i];
                if (b.state === 'rubble') continue;
                const box = E.getBuildingCollBox(b);
                const cx = U.clamp(k.x, box.x0, box.x1);
                const cy = U.clamp(k.y, box.y0, box.y1);
                const d = Math.hypot(k.x - cx, k.y - cy);
                if (d <= nearD) { nearD = d; nearB = b; }
              }
              if (nearB) {
                damageBuilding(nearB, 35 * pwr, city, cctx, k.isPlayer ? k : null, allKaijus, cam);
              }
            }
            spawnProjectile(cctx, {
              kind: 'chunk',
              ownerId: k.id,
              ownerIsPlayer: k.isPlayer,
              ownerRef: k,
              x: k.x + k.dirX * (k.r + 0.45),
              y: k.y + k.dirY * (k.r + 0.45),
              z: k.z + 54,
              vx: k.dirX * spd,
              vy: k.dirY * spd,
              vz: 3.4,
              gravity: 0.36,
              r: 0.52,
              dmg: Math.round((def.dmg || 60) * pwr),
              buildingMult: 1.6,
              knockback: 9.2,
              pierceLeft: 1,
              life: 90,
              color: '#b89468'
            });
          }
          Snd.sfx.throwProp();
          addSpark(cctx, k.x + k.dirX * 0.9, k.y + k.dirY * 0.9, k.z + 48, '#ff9a2e', 38);
          if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 9);
        } else if (k.stateTick < total) {
          sp.phase = 'recovery';
        } else {
          k.special = null;
          k.state = 'idle';
          k.stateTick = 0;
        }
      } else if (def.kind === 'cloud') {
        // Lepidora: Scale Dust Cloud (3-tile mist for 4s, slows enemies and deals 4/s DoT)
        const startEnd = def.startupTicks || 8;
        const total = startEnd + 16;
        if (k.stateTick < startEnd) {
          sp.phase = 'startup';
        } else if (k.stateTick === startEnd) {
          sp.phase = 'active';
          if (cctx && cctx.clouds) {
            cctx.clouds.push({
              id: nextAtkId++,
              ownerId: k.id,
              ownerIsPlayer: k.isPlayer,
              ownerPower: pwr,
              x: U.clamp(k.x + k.dirX * 0.85, 1.0, (city ? city.cols : 20) - 1.0),
              y: U.clamp(k.y + k.dirY * 0.85, 1.0, (city ? city.rows : 20) - 1.0),
              radius: def.radius || 3.0,
              life: def.durationTicks || 240,
              maxLife: def.durationTicks || 240,
              dmgPerSec: def.dmgPerSec || 4,
              slowMult: def.slowMult || 0.65,
              dotTick: 0,
              color: def.color || '#d49eff'
            });
          }
          addSpark(cctx, k.x, k.y, k.z + 52, '#d49eff', 42);
        } else if (k.stateTick < total) {
          sp.phase = 'recovery';
        } else {
          k.special = null;
          k.state = 'idle';
          k.stateTick = 0;
        }
      } else {
        const total = (def.startupTicks || 10) + (def.durationTicks || 18) + (def.recoveryTicks || 12);
        if (k.stateTick >= total) {
          k.special = null;
          k.state = 'idle';
          k.stateTick = 0;
        }
      }
      return;
    }

    // ---- Ultimates / Meltdowns ----
    if (def.kind === 'rush') {
      // Mighty Mongo: Wasteland Rampage (3s super-armored rolling stomps, 2x building dmg)
      const cTicks = def.chargeTicks || 16;
      const dTicks = def.durationTicks || 180;
      const rTicks = def.recoveryTicks || 18;
      if (k.stateTick <= cTicks) {
        sp.phase = 'charge';
        k.vx *= 0.7;
        k.vy *= 0.7;
        return;
      }
      if (k.stateTick <= cTicks + dTicks) {
        sp.phase = 'active';
        if (!sp.hitCooldowns) sp.hitCooldowns = new Map();
        if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
          const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
          if (wd.x !== 0 || wd.y !== 0) {
            k.dirX = U.lerp(k.dirX, wd.x, 0.16);
            k.dirY = U.lerp(k.dirY, wd.y, 0.16);
            const dn = U.vec2.norm(k.dirX, k.dirY);
            k.dirX = dn.x;
            k.dirY = dn.y;
          }
        }
        const rushSpd = k.stats.speed * (def.speedMult || 1.65);
        k.vx = k.dirX * rushSpd;
        k.vy = k.dirY * rushSpd;
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        k.walkPhase += rushSpd * dt * 5.0;

        if (city) {
          if (k.x < k.r) { k.x = k.r; k.dirX = Math.abs(k.dirX); }
          else if (k.x > city.cols - k.r) { k.x = city.cols - k.r; k.dirX = -Math.abs(k.dirX); }
          if (k.y < k.r) { k.y = k.r; k.dirY = Math.abs(k.dirY); }
          else if (k.y > city.rows - k.r) { k.y = city.rows - k.r; k.dirY = -Math.abs(k.dirY); }
        }

        if (k.stateTick % 14 === 0) {
          Snd.sfx.stomp();
          if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 5);
        }

        if (allKaijus) {
          for (let i = 0; i < allKaijus.length; i++) {
            const t = allKaijus[i];
            if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t)) continue;
            const readyAt = sp.hitCooldowns.get(t.id) || 0;
            if (k.stateTick < readyAt) continue;
            if (Math.hypot(t.x - k.x, t.y - k.y) <= k.r + t.r + 0.55) {
              sp.hitCooldowns.set(t.id, k.stateTick + (def.hitCooldownTicks || 22));
              const dmg = Math.max(1, Math.round((def.dmg || 22) * pwr * t.stats.defense));
              t.hp = Math.max(0, t.hp - dmg);
              t.hitFlash = 5;
              const kn = U.vec2.norm(t.x - k.x || k.dirX, t.y - k.y || k.dirY);
              t.vx = (kn.x * 7.8) / t.stats.weight;
              t.vy = (kn.y * 7.8) / t.stats.weight;
              t.state = 'hitstun';
              t.stunTicks = 18;
              t.stateTick = 0;
              Snd.sfx.heavyHit();
              addSpark(cctx, t.x, t.y, t.z + 44, '#ff6b57', 34);
              addPopup(cctx, t.x, t.y, t.z + 98, 'STOMP! -' + dmg, '#ff6b57', 1.1);
              if (k.isPlayer && cctx) cctx.stylePoints += 30;
            }
          }
        }

        if (city && city.buildings) {
          const E = KB.Entities;
          for (let i = 0; i < city.buildings.length; i++) {
            const b = city.buildings[i];
            if (b.state === 'rubble') continue;
            const box = E.getBuildingCollBox(b);
            const cx = U.clamp(k.x, box.x0, box.x1);
            const cy = U.clamp(k.y, box.y0, box.y1);
            if (Math.hypot(k.x - cx, k.y - cy) <= k.r + 0.35) {
              const key = 'b:' + b.id;
              const readyAt = sp.hitCooldowns.get(key) || 0;
              if (k.stateTick >= readyAt) {
                sp.hitCooldowns.set(key, k.stateTick + 16);
                damageBuilding(b, Math.round((def.dmg || 22) * (def.buildingMult || 2.0) * pwr), city, cctx, k.isPlayer ? k : null, allKaijus, cam);
              }
            }
          }
          KB.Entities.resolveBuildingCollisions(k, city.buildings);
        }
        return;
      }
      if (k.stateTick < cTicks + dTicks + rTicks) {
        sp.phase = 'recovery';
        k.vx *= 0.8;
        k.vy *= 0.8;
        return;
      }
      k.special = null;
      k.state = 'idle';
      k.stateTick = 0;
      return;
    }

    if (def.kind === 'vortex') {
      // Lepidora: Moonlit Tornado (3s vortex pulling props/orbs, shredding buildings in 3 tiles, final 70 dmg burst)
      const cTicks = def.chargeTicks || 18;
      const dTicks = def.durationTicks || 180;
      const rTicks = def.recoveryTicks || 20;
      if (k.stateTick <= cTicks) {
        sp.phase = 'charge';
        k.vx *= 0.7;
        k.vy *= 0.7;
        return;
      }
      if (k.stateTick <= cTicks + dTicks) {
        sp.phase = 'active';
        k.z = U.lerp(k.z, 26, 0.25);
        k.grounded = false;
        if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
          const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
          const spMove = k.stats.speed * 0.65;
          k.vx = wd.x * spMove;
          k.vy = wd.y * spMove;
        } else {
          k.vx *= 0.85;
          k.vy *= 0.85;
        }
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        if (city) {
          k.x = U.clamp(k.x, k.r, city.cols - k.r);
          k.y = U.clamp(k.y, k.r, city.rows - k.r);
        }

        const pullR = def.pullRadius || 3.8;
        const rad = def.radius || 3.0;
        if (cctx && cctx.pickups) {
          for (let i = 0; i < cctx.pickups.length; i++) {
            const pk = cctx.pickups[i];
            const dx = k.x - pk.x;
            const dy = k.y - pk.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.2 && d <= pullR) {
              pk.x += (dx / d) * 3.8 * dt;
              pk.y += (dy / d) * 3.8 * dt;
            }
          }
        }
        if (cctx && cctx.props) {
          for (let i = 0; i < cctx.props.length; i++) {
            const pr = cctx.props[i];
            if (!pr || pr.state !== 'ground') continue;
            const dx = k.x - pr.x;
            const dy = k.y - pr.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.35 && d <= pullR) {
              pr.x += (dx / d) * 3.2 * dt;
              pr.y += (dy / d) * 3.2 * dt;
              KB.Entities.syncPropBounds(pr);
            }
          }
        }
        if (allKaijus) {
          for (let i = 0; i < allKaijus.length; i++) {
            const t = allKaijus[i];
            if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t)) continue;
            const dx = k.x - t.x;
            const dy = k.y - t.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.6 && d <= pullR) {
              const pull = (3.0 * dt) / t.stats.weight;
              t.x += (dx / d) * pull;
              t.y += (dy / d) * pull;
              if (city) KB.Entities.resolveBuildingCollisions(t, city.buildings);
              KB.Entities.syncKaijuBounds(t);
            }
          }
        }

        if ((k.stateTick - cTicks) % 24 === 0) {
          if (city && city.buildings) {
            const E = KB.Entities;
            for (let i = 0; i < city.buildings.length; i++) {
              const b = city.buildings[i];
              if (b.state === 'rubble') continue;
              const box = E.getBuildingCollBox(b);
              const cx = U.clamp(k.x, box.x0, box.x1);
              const cy = U.clamp(k.y, box.y0, box.y1);
              if (Math.hypot(k.x - cx, k.y - cy) <= rad) {
                damageBuilding(b, (def.buildingTickDmg || 24) * pwr, city, cctx, k.isPlayer ? k : null, allKaijus, cam);
              }
            }
          }
          if (allKaijus) {
            for (let i = 0; i < allKaijus.length; i++) {
              const t = allKaijus[i];
              if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t)) continue;
              if (Math.hypot(t.x - k.x, t.y - k.y) <= rad * 0.8 + t.r) {
                const tickD = Math.max(1, Math.round((def.tickDmg || 6) * pwr * t.stats.defense));
                t.hp = Math.max(0, t.hp - tickD);
                t.hitFlash = 3;
                addPopup(cctx, t.x, t.y, t.z + 96, '-' + tickD, '#5ee6ff', 0.9);
              }
            }
          }
        }
        return;
      }

      if (!sp.blasted) {
        sp.blasted = true;
        sp.phase = 'blast';
        k.z = 0;
        k.vz = 0;
        k.grounded = true;
        if (cctx && !cctx.headless) {
          cctx.screenFlash = { color: '#d49eff', alpha: 0.65, life: 16, maxLife: 16 };
        }
        spawnComicCard(cctx, k.x, k.y, k.z + 128, def.cardText || 'WHIRLWIND!', '#5ee6ff');
        Snd.sfx.meltdownBlast();
        applyRadialBurst(k, def.radius || 3.0, Math.round((def.dmg || 70) * pwr), 1.8, cctx, city, allKaijus, cam, 'TORNADO!', '#5ee6ff');
      }

      if (k.stateTick >= cTicks + dTicks + rTicks) {
        k.special = null;
        k.state = 'idle';
        k.stateTick = 0;
      }
      return;
    }

    // Nova / Meltdown Nova / Overload Self-Destruct
    k.vx *= 0.80;
    k.vy *= 0.80;
    const cTicks = def.chargeTicks || 40;
    const rTicks = def.recoveryTicks || 24;
    if (k.stateTick < cTicks) {
      sp.phase = 'charge';
      return;
    }
    if (!sp.blasted) {
      sp.blasted = true;
      sp.phase = 'blast';
      const rad = def.radius || 4.0;
      const blastDmg = Math.round((def.dmg || 90) * pwr);
      if (def.selfHpCostPct) {
        const beforeSelf = k.hp;
        k.hp = Math.max(1, Math.round(k.hp * (1 - def.selfHpCostPct)));
        k._selfCostThisTick = (k._selfCostThisTick || 0) + (beforeSelf - k.hp);
      }
      if (cctx && !cctx.headless) {
        cctx.screenFlash = { color: '#eaffdc', alpha: 0.85, life: 22, maxLife: 22 };
        cctx.novaWaves.push({ x: k.x, y: k.y, z: k.z + 12, radius: rad, life: 28, maxLife: 28, color: def.color || '#7dff4f' });
      }
      spawnComicCard(cctx, k.x, k.y, k.z + 132, def.cardText || 'KA-BOOM!', '#ff6b57');
      addSpark(cctx, k.x, k.y, k.z + 36, def.color || '#7dff4f', 78);
      addSpark(cctx, k.x, k.y, k.z + 48, '#ffd23f', 54);
      Snd.sfx.meltdownBlast();
      if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 22);

      if (allKaijus) {
        for (let i = 0; i < allKaijus.length; i++) {
          const t = allKaijus[i];
          if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t)) continue;
          const dx = t.x - k.x;
          const dy = t.y - k.y;
          if (Math.hypot(dx, dy) <= rad + t.r) {
            const actual = Math.max(1, Math.round(blastDmg * t.stats.defense));
            t.hp = Math.max(0, t.hp - actual);
            t.fuel = Math.min(t.fuelMax, t.fuel + 2);
            t.hitFlash = 8;
            dropCarriedProp(t, cctx, city);
            if (t.state === 'climb') { t.climb = null; t.climbCooldown = 20; }
            const kn = U.vec2.norm(dx || 0.7, dy || 0.7);
            t.vx = (kn.x * 9.5) / t.stats.weight;
            t.vy = (kn.y * 9.5) / t.stats.weight;
            t.vz = 5.5;
            t.grounded = false;
            t.state = 'knockdown';
            t.stateTick = 0;
            addPopup(cctx, t.x, t.y, t.z + 110, 'NOVA! -' + actual, '#ff6b57', 1.25);
            if (k.isPlayer && cctx) cctx.stylePoints += 120;
          }
        }
      }

      if (cctx && cctx.props) {
        for (let i = cctx.props.length - 1; i >= 0; i--) {
          const p = cctx.props[i];
          if (!p || !p.def.explodes || p._detonated || p.state === 'carried') continue;
          if (Math.hypot(p.x - k.x, p.y - k.y) <= rad) {
            p.state = 'fusing';
            p.fuseTicks = 4;
          }
        }
      }

      if (city && city.buildings) {
        const E = KB.Entities;
        const flattenTypes = def.instantFlattenTypes || [];
        for (let i = 0; i < city.buildings.length; i++) {
          const b = city.buildings[i];
          if (b.state === 'rubble') continue;
          const box = E.getBuildingCollBox(b);
          const cx = U.clamp(k.x, box.x0, box.x1);
          const cy = U.clamp(k.y, box.y0, box.y1);
          if (Math.hypot(k.x - cx, k.y - cy) <= rad) {
            const flat = flattenTypes.indexOf(b.type) !== -1;
            const bDmg = flat ? (b.hp + 100) : Math.round(blastDmg * 2);
            damageBuilding(b, bDmg, city, cctx, k.isPlayer ? k : null, allKaijus, cam);
          }
        }
      }
    }

    if (k.stateTick >= cTicks + rTicks) {
      k.special = null;
      k.state = 'idle';
      k.stateTick = 0;
    }
  }

  function startPropSmash(k, intent) {
    if (!k || !k.carrying) return;
    const prop = k.carrying;
    const base = MOVES.prop_smash;
    const customDef = {
      startup: base.startup,
      active: base.active,
      recovery: base.recovery,
      dmg: prop.def.smashDmg,
      guardDmg: Math.round(prop.def.smashDmg * 1.3),
      stagger: 55,
      reach: prop.def.reach || base.reach,
      arc: base.arc,
      zMin: 0,
      zMax: 112,
      knockback: base.knockback,
      hitstun: base.hitstun,
      hitStop: base.hitStop,
      fuelGain: base.fuelGain,
      lunge: base.lunge,
      buildingMult: prop.def.buildingMult || 1.0,
      isPropSmash: true,
      propRef: prop
    };
    k.state = 'prop_smash';
    k.stateTick = 0;
    k.chainQueued = false;
    k.armorCharges = 0;
    if (intent && (intent.moveX !== 0 || intent.moveY !== 0)) {
      const wd = KB.Iso.screenDirToWorld(intent.moveX, intent.moveY);
      if (wd.x !== 0 || wd.y !== 0) {
        k.dirX = wd.x;
        k.dirY = wd.y;
      }
    }
    k.attack = {
      id: nextAtkId++,
      name: 'prop_smash',
      def: customDef,
      hitSet: new Set(),
      dodgedSet: new Set(),
      active: false,
      shockwaveTriggered: false
    };
    k.vx = k.dirX * customDef.lunge * 6.5;
    k.vy = k.dirY * customDef.lunge * 6.5;
    Snd.sfx.whoosh();
  }

  function tryAttachClimb(k, intent, city, cctx) {
    if (!city || !city.buildings || k.carrying || (k.climbCooldown || 0) > 0) return false;
    const E = KB.Entities;
    const wantAttach = intent.jumpPressed || (!k.grounded && (intent.moveX !== 0 || intent.moveY !== 0));
    if (!wantAttach) return false;

    const wd = (intent.moveX !== 0 || intent.moveY !== 0)
      ? KB.Iso.screenDirToWorld(intent.moveX, intent.moveY)
      : { x: k.dirX, y: k.dirY };

    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      if (b.state === 'rubble') continue;
      if ((b.climbTier || 0) > (k.stats.maxClimbTier || 0)) continue;
      const box = E.getBuildingCollBox(b);
      const cx = U.clamp(k.x, box.x0, box.x1);
      const cy = U.clamp(k.y, box.y0, box.y1);
      const dist = Math.hypot(k.x - cx, k.y - cy) - k.r;
      if (dist > 0.28) continue;

      const toBx = cx - k.x;
      const toBy = cy - k.y;
      const pushDot = toBx * wd.x + toBy * wd.y;
      if (!intent.jumpPressed && pushDot <= 0) continue;

      if (dist < bestDist) {
        bestDist = dist;
        best = { b: b, box: box };
      }
    }
    if (!best) return false;

    const b = best.b;
    const box = best.box;
    const dX0 = Math.abs(k.x - box.x0);
    const dX1 = Math.abs(box.x1 - k.x);
    const dY0 = Math.abs(k.y - box.y0);
    const dY1 = Math.abs(box.y1 - k.y);
    const minD = Math.min(dX0, dX1, dY0, dY1);
    let face = 'y1';
    if (minD === dX0) face = 'x0';
    else if (minD === dX1) face = 'x1';
    else if (minD === dY0) face = 'y0';

    if (face === 'x0') {
      k.x = box.x0 - 0.16;
      k.y = U.clamp(k.y, box.y0 + 0.25, box.y1 - 0.25);
      k.dirX = 1; k.dirY = 0;
    } else if (face === 'x1') {
      k.x = box.x1 + 0.16;
      k.y = U.clamp(k.y, box.y0 + 0.25, box.y1 - 0.25);
      k.dirX = -1; k.dirY = 0;
    } else if (face === 'y0') {
      k.y = box.y0 - 0.16;
      k.x = U.clamp(k.x, box.x0 + 0.25, box.x1 - 0.25);
      k.dirX = 0; k.dirY = 1;
    } else {
      k.y = box.y1 + 0.16;
      k.x = U.clamp(k.x, box.x0 + 0.25, box.x1 - 0.25);
      k.dirX = 0; k.dirY = -1;
    }

    k.climb = { building: b, face: face, punchCd: 0 };
    k.state = 'climb';
    k.stateTick = 0;
    k.vx = 0;
    k.vy = 0;
    k.vz = 0;
    k.z = Math.max(8, k.z);
    k.grounded = false;
    k.attack = null;
    if (k.isPlayer && intent.jumpPressed) In.consume('jumpPressed');
    Snd.sfx.grab();
    addPopup(cctx, k.x, k.y, k.z + 96, 'CLIMB!', '#7dff4f', 0.95);
    E.syncKaijuBounds(k);
    return true;
  }

  function releaseClimbJump(k, leapOut, city) {
    const face = k.climb ? k.climb.face : 'y1';
    let outX = 0, outY = 0;
    if (face === 'x0') outX = -1;
    else if (face === 'x1') outX = 1;
    else if (face === 'y0') outY = -1;
    else outY = 1;

    k.climb = null;
    k.climbCooldown = 18;
    k.state = 'jump';
    k.stateTick = 0;
    k.grounded = false;
    k.airAttackUsed = false;
    k.vz = leapOut ? 7.5 : 0;
    k.x += outX * (k.r + 0.18);
    k.y += outY * (k.r + 0.18);
    if (city) {
      k.x = U.clamp(k.x, k.r, city.cols - k.r);
      k.y = U.clamp(k.y, k.r, city.rows - k.r);
    }
    if (leapOut) {
      k.dirX = outX;
      k.dirY = outY;
      k.vx = outX * 4.8;
      k.vy = outY * 4.8;
    } else {
      k.vx = 0;
      k.vy = 0;
      k.z = 0;
      k.grounded = true;
      k.state = 'idle';
    }
    KB.Entities.syncKaijuBounds(k);
  }

  /* Update combat state machine + movement integration for one kaiju (60 Hz tick) */
  function updateFighter(k, intent, city, dt, cctx, allKaijus, cam) {
    if (k.hitFlash > 0) k.hitFlash--;
    if (k.dodgeCooldown > 0) k.dodgeCooldown--;
    if (k.counterWindow > 0) k.counterWindow--;
    if (k.climbCooldown > 0) k.climbCooldown--;
    if (k.specialCooldown > 0) k.specialCooldown--;
    if (k.cloudSlowTicks > 0) k.cloudSlowTicks--;
    if (k.blindedTicks > 0) k.blindedTicks--;

    // Passive Atomic Fuel regen (+1.5/s baseline), Overcharge (>= 80), & Tin Colossus Battery (>= 50)
    if (k.hp > 0) {
      k.fuel = Math.min(k.fuelMax, k.fuel + (k.stats.fuelRegen || 1.5) * dt);
      k.overcharged = k.fuel >= 80;
      k.batteryActive = !!(k.stats.batteryThreshold && k.fuel >= k.stats.batteryThreshold);
    } else {
      k.batteryActive = false;
    }

    // Burn DoT (from Fuel Tanker fire)
    if (k.burnTicks > 0) {
      k.burnTicks--;
      k.burnTimer = (k.burnTimer || 0) + 1;
      if (k.burnTimer >= 30) {
        k.burnTimer = 0;
        if (!k.stats.fireImmune && k.hp > 0) {
          k.hp = Math.max(0, k.hp - 3);
          k.hitFlash = 3;
          addPopup(cctx, k.x, k.y, k.z + 92, '-3 BURN', '#ff9a2e', 0.9);
        }
        if (k.hp <= 0) k.burnTicks = 0;
      }
    }

    if (k.hitStop > 0) {
      k.hitStop--;
      return;
    }

    k.lastMoveX = intent.moveX || 0;
    k.lastMoveY = intent.moveY || 0;

    // Climbing state machine (PLAN.md §5.3)
    if (k.state === 'climb' && k.climb) {
      const b = k.climb.building;
      if (!b || b.state === 'rubble') {
        k.climb = null;
        k.climbCooldown = 20;
        if (k.monsterId === 'mongo' || k.monsterId === 'lepidora') {
          k.state = 'jump';
          k.vz = 1.5;
          k.grounded = false;
          k.airAttackUsed = false;
        } else {
          k.hp = Math.max(0, k.hp - 8);
          k.state = 'hitstun';
          k.stunTicks = 28;
          k.stateTick = 0;
          k.vz = -1.5;
          k.grounded = false;
          k.hitFlash = 6;
          addPopup(cctx, k.x, k.y, k.z + 96, 'COLLAPSE! -8', '#ff6b57', 1.1);
        }
        KB.Entities.syncKaijuBounds(k);
        return;
      }

      k.stateTick++;
      if (k.climb.punchCd > 0) k.climb.punchCd--;

      const climbSpd = 75 * (k.stats.climbSpeedMult || 1.0);
      const vInput = -intent.moveY; // W / Stick Up moves upward
      if (Math.abs(vInput) > 0.12) {
        k.z += vInput * climbSpd * dt;
        k.walkPhase += Math.abs(vInput) * dt * 10;
        if (k.stateTick % 14 === 0) Snd.sfx.climbStep();
      }

      if (intent.specialPressed && k.monsterId === 'mongo') {
        const spDef = k.stats.specials && k.stats.specials.special;
        const cost = (spDef && spDef.cost) || 35;
        if (k.isPlayer) In.consume('specialPressed');
        if (k.specialCooldown <= 0 && k.fuel >= cost) {
          // Mighty Mongo: Roof Rip (climb special) — tears masonry cluster down around the building
          k.fuel = Math.max(0, k.fuel - cost);
          k.overcharged = k.fuel >= 80;
          k.specialCooldown = (spDef && spDef.cooldownTicks) || 90;
          const pwr = effectivePower(k);
          damageBuilding(b, Math.round(45 * pwr), city, cctx, k.isPlayer ? k : null, allKaijus, cam);
          const box = KB.Entities.getBuildingCollBox(b);
          const bcx = (box.x0 + box.x1) * 0.5;
          const bcy = (box.y0 + box.y1) * 0.5;
          for (let ci = 0; ci < 3; ci++) {
            const ang = (ci * Math.PI * 2) / 3 + 0.35;
            spawnProjectile(cctx, {
              kind: 'chunk',
              ownerId: k.id,
              ownerIsPlayer: k.isPlayer,
              ownerRef: k,
              x: k.x,
              y: k.y,
              z: Math.max(48, k.z + 24),
              vx: Math.cos(ang) * 4.5 + (bcx - k.x) * -0.4,
              vy: Math.sin(ang) * 4.5 + (bcy - k.y) * -0.4,
              vz: 3.2,
              gravity: 0.42,
              r: 0.55,
              dmg: Math.round(24 * pwr),
              buildingMult: 1.5,
              knockback: 6.5,
              explodeRadius: 1.1,
              life: 90,
              color: '#ff9a2e'
            });
          }
          spawnComicCard(cctx, k.x, k.y, k.z + 115, 'ROOF RIP!', '#ff9a2e');
          Snd.sfx.buildingCrack();
          if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 10);
        } else if (k.fuel < cost && k.isPlayer && cctx) {
          cctx.fuelShakeTicks = 24;
          Snd.sfx.block();
          addPopup(cctx, k.x, k.y, k.z + 96, 'NEED ' + cost + ' FUEL!', '#ff6b57', 1.0);
        }
      } else if (intent.light && k.climb.punchCd <= 0) {
        if (k.isPlayer) In.consume('light');
        k.climb.punchCd = 14;
        const pDmg = Math.round(10 * effectivePower(k));
        damageBuilding(b, pDmg, city, cctx, k.isPlayer ? k : null, allKaijus, cam);
        k.fuel = Math.min(k.fuelMax, k.fuel + 3);
      } else if (intent.heavy && k.climb.punchCd <= 0) {
        if (k.isPlayer) In.consume('heavy');
        k.climb.punchCd = 24;
        const bDmg = Math.round(22 * effectivePower(k));
        const smashDmg = Math.round(18 * effectivePower(k));
        damageBuilding(b, bDmg, city, cctx, k.isPlayer ? k : null, allKaijus, cam);
        Snd.sfx.heavyHit();
        addSpark(cctx, k.x, k.y, Math.max(24, k.z + 20), '#ff6b57', 40);
        if (allKaijus) {
          for (let i = 0; i < allKaijus.length; i++) {
            const t = allKaijus[i];
            if (!t || t.id === k.id || isInvulnerable(t)) continue;
            if (Math.hypot(t.x - k.x, t.y - k.y) <= 0.8 + t.r) {
              const actual = Math.max(1, Math.round(smashDmg * t.stats.defense));
              t.hp = Math.max(0, t.hp - actual);
              t.state = 'knockdown';
              t.stateTick = 0;
              t.hitFlash = 6;
              addPopup(cctx, t.x, t.y, t.z + 96, 'ROOF SMASH! -' + actual, '#ff6b57', 1.1);
            }
          }
        }
      }

      if (intent.jumpPressed || k.z >= b.zTop) {
        if (k.isPlayer && intent.jumpPressed) In.consume('jumpPressed');
        releaseClimbJump(k, true, city);
        Snd.sfx.dodge();
        return;
      }
      if (k.z <= 0) {
        releaseClimbJump(k, false, city);
        return;
      }

      KB.Entities.syncKaijuBounds(k);
      return;
    }

    // Kaiju currently flying horizontally from a shoulder throw
    if (k.state === 'thrown_kaiju') {
      k.stateTick++;
      KB.Entities.updateKaiju(k, { moveX: 0, moveY: 0, jumpPressed: false }, city, dt, true);
      if (city && city.buildings && !k.throwHitBuilding) {
        const E = KB.Entities;
        for (let i = 0; i < city.buildings.length; i++) {
          const b = city.buildings[i];
          if (b.state === 'rubble') continue;
          const box = E.getBuildingCollBox(b);
          const cx = U.clamp(k.x, box.x0, box.x1);
          const cy = U.clamp(k.y, box.y0, box.y1);
          if (Math.hypot(k.x - cx, k.y - cy) <= k.r + 0.12) {
            k.throwHitBuilding = true;
            damageBuilding(b, 18, city, cctx, null, allKaijus, cam);
            k.vx *= -0.35;
            k.vy *= -0.35;
            break;
          }
        }
      }
      if (k.grounded) {
        if (!k.throwBounced) {
          k.throwBounced = true;
          k.vz = 2.6;
          k.grounded = false;
          k.vx *= 0.45;
          k.vy *= 0.45;
          Snd.sfx.knockdown();
          addSpark(cctx, k.x, k.y, 10, '#ffd23f', 32);
        } else {
          k.throwBounced = false;
          k.throwHitBuilding = false;
          k.state = 'knockdown';
          k.stateTick = 0;
        }
      }
      return;
    }

    const canAct = k.state === 'idle' || k.state === 'walk' || k.state === 'block';

    // Active Special or Ultimate state
    if (k.state === 'special' || k.state === 'ultimate') {
      stepSpecialState(k, intent, city, dt, cctx, allKaijus, cam);
      KB.Entities.syncKaijuBounds(k);
      return;
    }

    // Handle active attack chain/phases
    if (k.state === 'light1' || k.state === 'light2' || k.state === 'light3' || k.state === 'heavy' || k.state === 'grab' || k.state === 'prop_smash') {
      k.stateTick++;
      const def = k.attack.def;
      const activeEnd = def.startup + def.active;
      const total = activeEnd + def.recovery;
      k.attack.active = (k.stateTick >= def.startup && k.stateTick < activeEnd);

      // Monster-specific Heavy triggers on startup frame
      if (k.state === 'heavy' && k.stateTick === def.startup && !k.attack.projectileFired) {
        if (def.kind === 'rocket_fist') {
          k.attack.projectileFired = true;
          k.attack.active = false; // damage comes from the flying fist projectile
          k.fistOut = true;
          const spd = def.speed || 18.0;
          spawnProjectile(cctx, {
            kind: 'rocket_fist',
            ownerId: k.id,
            ownerIsPlayer: k.isPlayer,
            ownerRef: k,
            x: k.x + k.dirX * (k.r + 0.3),
            y: k.y + k.dirY * (k.r + 0.3),
            z: k.z + 50,
            startX: k.x,
            startY: k.y,
            vx: k.dirX * spd,
            vy: k.dirY * spd,
            vz: 0,
            gravity: 0,
            r: 0.48,
            dmg: Math.round((def.dmg || 32) * effectivePower(k)),
            buildingMult: 1.5,
            knockback: 7.5,
            maxRange: def.range || 5.0,
            speed: spd,
            returning: false,
            life: 80,
            color: '#ff4d5a'
          });
          Snd.sfx.throwProp();
          addSpark(cctx, k.x + k.dirX * 0.7, k.y + k.dirY * 0.7, k.z + 50, '#ffd23f', 26);
        } else if (def.kind === 'slam' && !k.attack.shockwaveTriggered) {
          k.attack.shockwaveTriggered = true;
          Snd.sfx.stomp();
          if (cctx && !cctx.headless) {
            cctx.novaWaves.push({ x: k.x, y: k.y, z: k.z + 4, radius: def.reach || 1.5, life: 16, maxLife: 16, color: '#ff9a2e' });
          }
          addSpark(cctx, k.x, k.y, k.z + 10, '#ff9a2e', 38);
          if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 8);
        }
      }
      if (k.state === 'heavy' && def.kind === 'rocket_fist') {
        k.attack.active = false;
      }

      // Friction during ground attacks
      k.vx *= 0.84;
      k.vy *= 0.84;

      // Chain light1 -> light2 -> light3
      if (def.nextMove && intent.light && k.stateTick >= 2) {
        k.chainQueued = true;
        if (k.isPlayer) In.consume('light');
      }

      if (k.chainQueued && k.stateTick >= activeEnd && k.stateTick <= activeEnd + def.chainWindow) {
        startAttack(k, def.nextMove, intent);
      } else if (k.stateTick >= total) {
        const wasPropSmash = k.state === 'prop_smash';
        k.attack = null;
        if (wasPropSmash && k.carrying) {
          k.state = 'carry';
        } else {
          k.state = 'idle';
        }
        k.stateTick = 0;
      }
    } else if (k.state === 'throw_anim') {
      k.stateTick++;
      k.vx *= 0.82;
      k.vy *= 0.82;
      if (k.stateTick >= 10) {
        k.state = 'idle';
        k.stateTick = 0;
      }
    } else if (k.state === 'jump_atk') {
      k.stateTick++;
      const def = MOVES.jump_atk;
      k.attack.active = (k.stateTick >= def.startup);
      if (k.grounded && !k.attack.shockwaveTriggered) {
        // Diving stomp shockwave on landing
        k.attack.shockwaveTriggered = true;
        k.attack.active = true;
        k.stateTick = def.startup;
        Snd.sfx.stomp();
        addSpark(cctx, k.x, k.y, 4, '#ffd23f', 36);
      }
      if (k.grounded && k.stateTick >= def.startup + 6) {
        k.attack = null;
        k.state = 'idle';
        k.stateTick = 0;
      }
    } else if (k.state === 'dodge') {
      k.stateTick++;
      k.vx *= 0.91;
      k.vy *= 0.91;
      if (k.stateTick >= DODGE_TOTAL) {
        k.state = 'idle';
        k.stateTick = 0;
      }
    } else if (k.state === 'hitstun') {
      k.stateTick++;
      k.vx *= 0.82;
      k.vy *= 0.82;
      if (k.stateTick >= k.stunTicks && k.grounded) {
        k.state = 'idle';
        k.stateTick = 0;
        k.comboReceived = 0;
      }
    } else if (k.state === 'guard_break') {
      k.stateTick++;
      k.vx *= 0.8;
      k.vy *= 0.8;
      if (k.stateTick >= GUARD_BREAK_TICKS) {
        k.guard = k.guardMax * 0.35;
        k.state = 'idle';
        k.stateTick = 0;
        k.comboReceived = 0;
      }
    } else if (k.state === 'knockdown') {
      k.stateTick++;
      k.vx *= 0.86;
      k.vy *= 0.86;
      if (k.grounded && k.stateTick >= KNOCKDOWN_TICKS) {
        k.state = 'getup';
        k.stateTick = 0;
      }
    } else if (k.state === 'getup') {
      k.stateTick++;
      k.vx *= 0.8;
      k.vy *= 0.8;
      if (k.stateTick >= GETUP_TICKS) {
        k.state = 'idle';
        k.stateTick = 0;
        k.stagger = 0;
        k.comboReceived = 0;
      }
    }

    // Free movement / action transitions
    if (k.state === 'carry') {
      if (!k.carrying) {
        k.state = 'idle';
      } else {
        k.carrying.x = k.x;
        k.carrying.y = k.y;
        k.carrying.z = k.z + 64;
        if (intent.grab || intent.light) {
          if (k.isPlayer) {
            if (intent.grab) In.consume('grab');
            if (intent.light) In.consume('light');
          }
          throwCarriedProp(k, intent, cctx);
        } else if (intent.heavy) {
          if (k.isPlayer) In.consume('heavy');
          startPropSmash(k, intent);
        }
      }
    } else if (tryAttachClimb(k, intent, city, cctx)) {
      return;
    } else if (!k.grounded && k.state === 'jump') {
      if (intent.light && !k.airAttackUsed) {
        k.airAttackUsed = true;
        if (k.isPlayer) In.consume('light');
        startAttack(k, 'jump_atk', intent);
        k.vz = Math.min(k.vz, -4.5);
      }
    }

    if (k.grounded && canAct) {
      if (intent.dodgePressed && k.dodgeCooldown <= 0) {
        if (k.isPlayer) In.consume('dodgePressed');
        startDodge(k, intent);
      } else if (intent.blockHeld && k.guard > 0) {
        if (k.state !== 'block') {
          k.state = 'block';
          k.blockTicks = 0;
        }
        k.blockTicks++;
        k.vx *= 0.72;
        k.vy *= 0.72;
        k.guard = Math.max(0, k.guard - 12 * dt);
        if (k.guard <= 0) {
          k.state = 'guard_break';
          k.stateTick = 0;
          Snd.sfx.guardBreak();
          addPopup(cctx, k.x, k.y, k.z + 90, 'GUARD BREAK!', '#ff6b57', 1.15);
        }
      } else {
        if (k.state === 'block') k.state = 'idle';
        if (intent.ultimatePressed) {
          if (k.isPlayer) In.consume('ultimatePressed');
          startUltimate(k, cctx);
        } else if (intent.specialPressed) {
          if (k.isPlayer) In.consume('specialPressed');
          startSpecial(k, intent, cctx);
        } else if (intent.grab) {
          if (k.isPlayer) In.consume('grab');
          const nearProp = findNearestGroundProp(k, cctx);
          if (nearProp) {
            nearProp.state = 'carried';
            nearProp.ownerId = k.id;
            nearProp.hitSet = null;
            nearProp.vx = 0;
            nearProp.vy = 0;
            nearProp.vz = 0;
            k.carrying = nearProp;
            k.state = 'carry';
            k.stateTick = 0;
            k.attack = null;
            Snd.sfx.grab();
            addPopup(cctx, k.x, k.y, k.z + 100, nearProp.def.name.toUpperCase() + '!', '#ffd23f', 0.95);
          } else {
            startAttack(k, 'grab', intent);
          }
        } else if (intent.heavy) {
          if (k.isPlayer) In.consume('heavy');
          startAttack(k, 'heavy', intent);
        } else if (intent.light) {
          if (k.isPlayer) In.consume('light');
          startAttack(k, 'light1', intent);
        }
      }
    }

    // Passive guard & stagger regen when idle/walking
    if (k.state === 'idle' || k.state === 'walk') {
      k.guard = Math.min(k.guardMax, k.guard + 25 * dt);
      k.stagger = Math.max(0, k.stagger - 12 * dt);
      k.comboReceived = 0;
    }

    // Delegate spatial movement, jump initiation, AABB collision & bounds to Entities
    const allowWalk = (k.state === 'idle' || k.state === 'walk' || k.state === 'jump' || k.state === 'jump_atk' || k.state === 'carry');
    const moveIntent = allowWalk
      ? intent
      : { moveX: 0, moveY: 0, jumpPressed: false };
    KB.Entities.updateKaiju(k, moveIntent, city, dt, true);
  }

  /* Check if attacker's current active hitbox overlaps target kaiju hurtbox */
  function hitboxHitsTarget(atkKaiju, target) {
    const atk = atkKaiju.attack;
    if (!atk || !atk.active) return false;
    const def = atk.def;

    // Z-range overlap
    const tZ0 = target.z;
    const tZ1 = target.z + target.height;
    if (def.zMax < tZ0 || def.zMin > tZ1) return false;

    const dx = target.x - atkKaiju.x;
    const dy = target.y - atkKaiju.y;
    const dist = Math.hypot(dx, dy);
    const maxDist = def.reach + target.r;
    if (dist > maxDist) return false;

    if (def.radial || dist <= target.r + 0.35) return true;

    const nx = dx / dist;
    const ny = dy / dist;
    const dot = nx * atkKaiju.dirX + ny * atkKaiju.dirY;
    const halfCos = Math.cos(def.arc * 0.5);
    return dot >= halfCos;
  }

  /* Resolve attacker -> defender melee hits (or grab / prop_smash) */
  function resolveMelee(attacker, defender, cctx, cam, city, allKaijus) {
    const atk = attacker.attack;
    if (!atk || !atk.active) return;
    if (atk.hitSet.has(defender.id)) return;

    // Handle Kaiju Grab & Leg-Pull off walls (PLAN.md §5.1, §5.3)
    if (atk.name === 'grab') {
      const dist = Math.hypot(defender.x - attacker.x, defender.y - attacker.y);
      const isLowClimber = defender.state === 'climb' && defender.z <= 105;
      const maxD = atk.def.reach + defender.r + (isLowClimber ? 0.35 : 0.05);
      if (dist > maxD) return;
      if (!isLowClimber && (defender.z > 96 || (Math.hypot(defender.x - attacker.x, defender.y - attacker.y) > defender.r + 0.45 && (((defender.x - attacker.x) / dist) * attacker.dirX + ((defender.y - attacker.y) / dist) * attacker.dirY) < Math.cos(atk.def.arc * 0.5)))) {
        return;
      }
      if (isInvulnerable(defender)) return;

      atk.hitSet.add(defender.id);
      if (isLowClimber) {
        const pullDmg = Math.max(1, Math.round(12 * attacker.stats.power * defender.stats.defense));
        defender.climb = null;
        defender.climbCooldown = 25;
        defender.hp = Math.max(0, defender.hp - pullDmg);
        defender.state = 'knockdown';
        defender.stateTick = 0;
        defender.vz = 2.0;
        defender.grounded = false;
        defender.hitFlash = 6;
        defender.attack = null;
        dropCarriedProp(defender, cctx, city);
        Snd.sfx.knockdown();
        addSpark(cctx, defender.x, defender.y, defender.z + 40, '#ff6b57', 34);
        addPopup(cctx, defender.x, defender.y, defender.z + 100, 'PULLED OFF! -' + pullDmg, '#ff6b57', 1.15);
        return;
      }

      if (defender.state === 'block') {
        Snd.sfx.block();
        addPopup(cctx, defender.x, defender.y, defender.z + 96, 'GRAB BLOCKED!', '#5ee6ff', 1.0);
        return;
      }

      // Check back-direction input -> Slam (24+ dmg) vs forward Throw / Talon Snatch
      const wd = (attacker.lastMoveX || attacker.lastMoveY)
        ? KB.Iso.screenDirToWorld(attacker.lastMoveX, attacker.lastMoveY)
        : { x: 0, y: 0 };
      const isBack = !!atk.grabSlam || (wd.x * attacker.dirX + wd.y * attacker.dirY) < -0.35;
      const gMove = attacker.stats.grabMove || {};
      const atkPwr = effectivePower(attacker);

      dropCarriedProp(defender, cctx, city);
      defender.attack = null;
      defender.hitFlash = 7;
      attacker.hitStop = 5;
      if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, isBack ? 12 : 9);

      if (isBack) {
        const baseSlam = gMove.slamDmg || 24;
        const slamDmg = Math.max(1, Math.round(baseSlam * atkPwr * defender.stats.defense));
        defender.x = attacker.x + attacker.dirX * (attacker.r + defender.r + 0.12);
        defender.y = attacker.y + attacker.dirY * (attacker.r + defender.r + 0.12);
        if (city) {
          defender.x = U.clamp(defender.x, defender.r, city.cols - defender.r);
          defender.y = U.clamp(defender.y, defender.r, city.rows - defender.r);
          KB.Entities.resolveBuildingCollisions(defender, city.buildings);
        }
        defender.z = 0;
        defender.vx = 0;
        defender.vy = 0;
        defender.vz = 0;
        defender.grounded = true;
        defender.hp = Math.max(0, defender.hp - slamDmg);
        defender.state = 'knockdown';
        defender.stateTick = 0;
        attacker.fuel = Math.min(attacker.fuelMax, attacker.fuel + 6);
        if (attacker.isPlayer && cctx) cctx.stylePoints += 35;
        Snd.sfx.heavyHit();
        addSpark(cctx, defender.x, defender.y, 18, '#ff6b57', 46);
        addPopup(cctx, defender.x, defender.y, 102, (gMove.name || 'SLAM') + '! -' + slamDmg, '#ff6b57', 1.2);
      } else {
        const baseThrow = gMove.throwDmg || 18;
        const throwDmg = Math.max(1, Math.round(baseThrow * atkPwr * defender.stats.defense));
        defender.hp = Math.max(0, defender.hp - throwDmg);
        if (gMove.aerialSnatch) {
          // Lepidora: Talon Snatch -> aerial carry-and-drop arc
          defender.z = Math.max(defender.z, 36);
          defender.vx = attacker.dirX * 6.4;
          defender.vy = attacker.dirY * 6.4;
          defender.vz = 7.4;
        } else {
          defender.vx = attacker.dirX * 8.6;
          defender.vy = attacker.dirY * 8.6;
          defender.vz = 5.4;
        }
        defender.grounded = false;
        defender.throwBounced = false;
        defender.throwHitBuilding = false;
        defender.state = 'thrown_kaiju';
        defender.stateTick = 0;
        attacker.fuel = Math.min(attacker.fuelMax, attacker.fuel + 5);
        if (attacker.isPlayer && cctx) cctx.stylePoints += 30;
        Snd.sfx.throwProp();
        addSpark(cctx, defender.x, defender.y, 44, '#ffd23f', 36);
        addPopup(cctx, defender.x, defender.y, defender.z + 102, (gMove.aerialSnatch ? 'TALON SNATCH! -' : 'THROW! -') + throwDmg, '#ffd23f', 1.15);
      }
      KB.Entities.syncKaijuBounds(defender);
      return;
    }

    if (!hitboxHitsTarget(attacker, defender)) return;

    // Invulnerability & dodge-through counter window
    if (isInvulnerable(defender)) {
      if (defender.state === 'dodge' && !atk.dodgedSet.has(defender.id)) {
        atk.dodgedSet.add(defender.id);
        defender.counterWindow = COUNTER_WINDOW_TICKS;
        if (defender.isPlayer && cctx) cctx.stylePoints += 40;
        addPopup(cctx, defender.x, defender.y, defender.z + 95, 'DODGE COUNTER READY!', '#5ee6ff', 1.05);
      }
      return;
    }

    atk.hitSet.add(defender.id);
    const def = atk.def;
    const mx = (attacker.x + defender.x) * 0.5;
    const my = (attacker.y + defender.y) * 0.5;
    const mz = Math.max(attacker.z, defender.z) + 52;

    // Check blocking
    if (defender.state === 'block') {
      const isPerfect = defender.blockTicks <= PERFECT_BLOCK_TICKS;
      if (isPerfect) {
        defender.fuel = Math.min(defender.fuelMax, defender.fuel + 10);
        attacker.state = 'hitstun';
        attacker.stunTicks = 18;
        attacker.stateTick = 0;
        attacker.attack = null;
        attacker.hitStop = 5;
        defender.hitStop = 5;
        Snd.sfx.perfectBlock();
        addSpark(cctx, mx, my, mz, '#7dff4f', 34);
        addPopup(cctx, defender.x, defender.y, defender.z + 105, 'PERFECT BLOCK! +10 FUEL', '#7dff4f', 1.1);
        return;
      }

      const blockedDmg = Math.max(1, Math.round(def.dmg * attacker.stats.power * defender.stats.defense * 0.20));
      defender.hp = Math.max(0, defender.hp - blockedDmg);
      defender.guard = Math.max(0, defender.guard - def.guardDmg);
      defender.hitFlash = 4;
      attacker.hitStop = 3;
      defender.hitStop = 3;
      addSpark(cctx, mx, my, mz, '#5ee6ff', 24);

      if (defender.guard <= 0) {
        defender.state = 'guard_break';
        defender.stateTick = 0;
        defender.hitStop = 6;
        attacker.hitStop = 6;
        if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 8);
        Snd.sfx.guardBreak();
        addPopup(cctx, defender.x, defender.y, defender.z + 105, 'GUARD BREAK! -' + blockedDmg, '#ff6b57', 1.2);
      } else {
        Snd.sfx.block();
        addPopup(cctx, defender.x, defender.y, defender.z + 95, 'BLOCKED -' + blockedDmg, '#5ee6ff', 0.95);
      }
      return;
    }

    // Direct hit: compute combo scaling + counter bonus + glide bonus + battery passive + defense
    const scale = Math.max(0.60, 1 - 0.06 * defender.comboReceived);
    let counterMult = 1.0;
    const isLight = atk.name === 'light1' || atk.name === 'light2' || atk.name === 'light3';
    if (isLight && attacker.counterWindow > 0) {
      counterMult = 1.5;
      attacker.counterWindow = 0;
    }
    const glideMult = (atk.name === 'jump_atk' && attacker.wasGliding && attacker.stats.glideAttackMult)
      ? attacker.stats.glideAttackMult
      : 1.0;

    const rawDmg = def.dmg * effectivePower(attacker) * defender.stats.defense * scale * counterMult * glideMult;
    const finalDmg = Math.max(1, Math.round(rawDmg));
    defender.hp = Math.max(0, defender.hp - finalDmg);
    defender.hitFlash = 6;

    // Gorgantor: Atomic Chomp heals +4 HP on hit
    if (def.healOnHit && attacker.hp > 0) {
      const prevA = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + def.healOnHit);
      attacker._healAmtThisTick = (attacker._healAmtThisTick || 0) + (attacker.hp - prevA);
      addPopup(cctx, attacker.x, attacker.y, attacker.z + 108, '+' + def.healOnHit + ' HP', '#7dff4f', 0.95);
    }

    // Fuel gain
    attacker.fuel = Math.min(attacker.fuelMax, attacker.fuel + def.fuelGain);
    defender.fuel = Math.min(defender.fuelMax, defender.fuel + 2);

    // Hit-stop & camera shake
    attacker.hitStop = def.hitStop;
    defender.hitStop = def.hitStop;
    if (cam) {
      cam.shakeAmp = Math.max(cam.shakeAmp, atk.name === 'heavy' ? 10 : (atk.name === 'light3' ? 7 : 4));
    }

    // Knockback direction
    const kdx = defender.x - attacker.x;
    const kdy = defender.y - attacker.y;
    const kn = U.vec2.norm(kdx || attacker.dirX, kdy || attacker.dirY);
    const kbForce = (def.knockback * 6.5) / defender.stats.weight;

    // Check armor on defender!
    if (hasArmor(defender)) {
      defender.armorCharges--;
      defender.vx += kn.x * kbForce * 0.25;
      defender.vy += kn.y * kbForce * 0.25;
      Snd.sfx.heavyHit();
      addSpark(cctx, mx, my, mz, '#ff9a2e', 30);
      addPopup(cctx, defender.x, defender.y, defender.z + 100, 'ARMOR! -' + finalDmg, '#ff9a2e', 1.05);
      return;
    }

    // Interrupt & apply hitstun or knockdown
    defender.attack = null;
    defender.special = null;
    dropCarriedProp(defender, cctx, city);
    if (defender.state === 'climb') {
      defender.climb = null;
      defender.climbCooldown = 20;
    }
    defender.comboReceived++;
    defender.stagger += def.stagger;

    if (atk.name === 'prop_smash' && def.propRef && !atk.propUsed) {
      atk.propUsed = true;
      const pr = def.propRef;
      if (pr.def.explodes) {
        detonateProp(pr, (attacker.x + defender.x) * 0.5, (attacker.y + defender.y) * 0.5, city, cctx, attacker.isPlayer ? attacker : null, allKaijus || [attacker, defender], cam);
        attacker.carrying = null;
        removePropFromList(cctx, pr);
      } else if (pr.def.floods && city && city.slowZones) {
        city.slowZones.push({ x: defender.x, y: defender.y, r: pr.def.radius || 1.8, age: 0 });
        Snd.sfx.splash();
        attacker.carrying = null;
        removePropFromList(cctx, pr);
      } else {
        pr.usesLeft--;
        if (pr.propType === 'girder' || pr.propType === 'lamp') Snd.sfx.clang();
        if (pr.usesLeft <= 0) {
          attacker.carrying = null;
          removePropFromList(cctx, pr);
          addPopup(cctx, attacker.x, attacker.y, attacker.z + 95, 'BROKE!', '#ffd23f', 0.9);
        }
      }
    }

    if (attacker.isPlayer && cctx) {
      cctx.playerCombo++;
      cctx.playerComboTimer = 90; // 1.5s combo display window
      if (counterMult > 1) cctx.stylePoints += 40;
      if (cctx.playerCombo >= 3 && (atk.name === 'light3' || atk.name === 'heavy' || atk.name === 'prop_smash')) {
        cctx.stylePoints += Math.max(1, cctx.playerCombo - 2) * 25;
      }
    }

    const staggerMax = 100 * defender.stats.weight;
    if (def.launcher || defender.stagger >= staggerMax || defender.hp <= 0) {
      defender.state = 'knockdown';
      defender.stateTick = 0;
      defender.stagger = 0;
      defender.vx = kn.x * kbForce * 1.2;
      defender.vy = kn.y * kbForce * 1.2;
      if (def.launchVz) {
        defender.vz = def.launchVz;
        defender.grounded = false;
      }
      Snd.sfx.knockdown();
      addSpark(cctx, mx, my, mz, '#ff6b57', 38);
      addPopup(cctx, defender.x, defender.y, defender.z + 105, (counterMult > 1 ? 'COUNTER! ' : '') + '-' + finalDmg + '!', '#ff6b57', 1.2);
    } else {
      defender.state = 'hitstun';
      defender.stateTick = 0;
      const baseStun = def.stunTicks || def.hitstun;
      defender.stunTicks = Math.max(8, baseStun - (defender.comboReceived - 1) * 2);
      defender.vx = kn.x * kbForce;
      defender.vy = kn.y * kbForce;
      if (atk.name === 'heavy' || atk.name === 'jump_atk') Snd.sfx.heavyHit();
      else Snd.sfx.lightHit();
      addSpark(cctx, mx, my, mz, counterMult > 1 ? '#5ee6ff' : '#ffd23f', atk.name === 'heavy' ? 36 : 26);
      addPopup(
        cctx,
        defender.x,
        defender.y,
        defender.z + 96,
        (counterMult > 1 ? 'COUNTER -' : '-') + finalDmg,
        counterMult > 1 ? '#5ee6ff' : '#ffd23f',
        atk.name === 'heavy' ? 1.15 : 1.0
      );
    }
  }

  /* ---- Building Destruction, Explosions & Loot Dispatch (M4) ---- */
  function spawnLootDrop(cctx, dropType, cx, cy, city, spreadIdx) {
    const E = KB.Entities;
    if (!E || !cctx) return;
    const ang = (spreadIdx || 0) * 1.9 + Math.random() * 0.9;
    const dist = 0.35 + Math.random() * 0.55;
    const dx = cx + Math.cos(ang) * dist;
    const dy = cy + Math.sin(ang) * dist;
    if (dropType === 'health' || dropType === 'fuel') {
      E.spawnPickup(cctx, dropType, dx, dy, city);
    } else if (dropType === 'girder' || dropType === 'tanker') {
      E.spawnPropDrop(cctx, dropType, dx, dy, city);
    }
  }

  function rollAndSpawnBuildingLoot(b, stage, cx, cy, rolls, city, cctx, playerRef) {
    const E = KB.Entities;
    if (!E || !cctx) return;
    for (let i = 0; i < rolls; i++) {
      let drop;
      if (playerRef && playerRef.hp < playerRef.maxHp * 0.40 && cctx.noHealthOrbSec >= 25) {
        drop = 'health';
        cctx.noHealthOrbSec = 0;
      } else {
        drop = E.rollLootItem(stage);
      }
      if (drop !== 'nothing') {
        spawnLootDrop(cctx, drop, cx, cy, city, i);
      }
    }
  }

  function removePropFromList(cctx, prop) {
    if (!cctx || !cctx.props || !prop) return;
    const idx = cctx.props.indexOf(prop);
    if (idx !== -1) cctx.props.splice(idx, 1);
  }

  function detonateProp(prop, ex, ey, city, cctx, playerRef, kaijus, cam, extraOpts) {
    if (!prop || prop._detonated) return;
    prop._detonated = true;
    const rad = prop.def.radius || 1.8;
    const bDmg = prop.def.blastDmg || 45;
    const opts = Object.assign({ burnSec: prop.def.burnSec || 3, fireSpark: true, isTanker: !!prop.def.explodes }, extraOpts || {});
    triggerExplosion(ex, ey, rad, bDmg, city, cctx, playerRef, kaijus, cam, opts);
    removePropFromList(cctx, prop);
  }

  function triggerExplosion(ex, ey, radius, dmg, city, cctx, playerRef, kaijus, cam, opts) {
    Snd.sfx.explosion();
    addSpark(cctx, ex, ey, 36, '#ff6b57', 64);
    addSpark(cctx, ex, ey, 50, '#ffd23f', 44);
    addPopup(cctx, ex, ey, 85, 'KABOOM! -' + dmg, '#ff6b57', 1.25);
    if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 14);

    let enemiesCaught = 0;
    if (kaijus) {
      for (let i = 0; i < kaijus.length; i++) {
        const k = kaijus[i];
        if (!k || k.hp <= 0) continue;
        if (opts && opts.beamIgniterId && opts.beamIgniterId === k.id) continue;
        const dx = k.x - ex;
        const dy = k.y - ey;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius + k.r) {
          if (!isInvulnerable(k)) {
            if (!k.isPlayer) enemiesCaught++;
            const actual = Math.max(1, Math.round(dmg * k.stats.defense));
            k.hp = Math.max(0, k.hp - actual);
            k.fuel = Math.min(k.fuelMax, k.fuel + 2);
            k.hitFlash = 7;
            k.attack = null;
            k.special = null;
            dropCarriedProp(k, cctx, city);
            if (k.state === 'climb') { k.climb = null; k.climbCooldown = 20; }
            const kn = U.vec2.norm(dx || 0.7, dy || 0.7);
            k.vx += (kn.x * 7.5) / k.stats.weight;
            k.vy += (kn.y * 7.5) / k.stats.weight;
            k.state = 'knockdown';
            k.stateTick = 0;
            addPopup(cctx, k.x, k.y, k.z + 96, '-' + actual + ' BLAST!', '#ff6b57', 1.1);
            if (opts && opts.burnSec) {
              if (k.stats.fireImmune) {
                addPopup(cctx, k.x, k.y, k.z + 118, 'FIRE IMMUNE', '#5ee6ff', 0.85);
              } else {
                k.burnTicks = Math.max(k.burnTicks || 0, Math.round(opts.burnSec * 60));
              }
            }
          }
        }
      }
    }

    if (playerRef && playerRef.isPlayer && cctx && opts && opts.isTanker) {
      cctx.stylePoints += 150 + enemiesCaught * 50;
    }

    // Chain-detonate nearby explosive props (e.g. Fuel Tankers)
    if (cctx && cctx.props) {
      for (let i = 0; i < cctx.props.length; i++) {
        const p = cctx.props[i];
        if (!p || p._detonated || !p.def.explodes || p.state === 'carried' || p.state === 'fusing') continue;
        if ((p.spawnGrace || 0) > 0) continue;
        if (Math.hypot(p.x - ex, p.y - ey) <= radius + 0.35) {
          p.state = 'fusing';
          p.fuseTicks = 6;
        }
      }
    }

    if (city && city.buildings) {
      const E = KB.Entities;
      for (let i = 0; i < city.buildings.length; i++) {
        const nb = city.buildings[i];
        if (nb.state === 'rubble') continue;
        const box = E.getBuildingCollBox(nb);
        const cx = U.clamp(ex, box.x0, box.x1);
        const cy = U.clamp(ey, box.y0, box.y1);
        if (Math.hypot(ex - cx, ey - cy) <= radius) {
          damageBuilding(nb, dmg, city, cctx, playerRef, kaijus, cam);
        }
      }
    }
  }

  function damageBuilding(b, rawDmg, city, cctx, playerRef, kaijus, cam) {
    if (!b || b.state === 'rubble') return 0;
    const E = KB.Entities;
    const box = E.getBuildingCollBox(b);
    const cx = (box.x0 + box.x1) * 0.5;
    const cy = (box.y0 + box.y1) * 0.5;

    const dmg = Math.max(1, Math.round(rawDmg));
    b.hp = Math.max(0, b.hp - dmg);
    b.hitFlash = 3;
    b.shakeT = Math.max(b.shakeT, 8);

    addSpark(cctx, cx, cy, Math.max(24, b.zTop * 0.55), '#ffd23f', 26);
    E.spawnBuildingDebris(cctx, b, 5, 3);
    addPopup(cctx, cx, cy, b.zTop * 0.8 + 18, '-' + dmg, '#ffd23f', 0.92);

    const ratio = b.hp / b.maxHp;
    if (b.state === 'intact' && ratio <= 0.60 && b.hp > 0) {
      b.state = 'damaged';
      b.crackTicks = 12;
      b.zTop = Math.round(b.maxZTop * 0.85);
      Snd.sfx.buildingCrack();
      E.spawnBuildingDebris(cctx, b, 10, 6);
      E.spawnCivilians(cctx, b, 2, city);
      addPopup(cctx, cx, cy, b.zTop + 26, 'CRACKED!', '#ff9a2e', 1.0);
      const dmgRolls = Math.max(1, Math.ceil((b.lootRolls || 1) * 0.5));
      rollAndSpawnBuildingLoot(b, 'damaged', cx, cy, dmgRolls, city, cctx, playerRef);
      return dmg;
    }

    if (b.hp <= 0) {
      b.state = 'rubble';
      b.collapseStartZ = b.zTop;
      b.collapseTick = 30;
      if (cctx) {
        cctx.buildingsWrecked++;
        cctx.stylePoints += b.isLandmark ? 250 : 100;
      }
      Snd.sfx.buildingCollapse();
      E.spawnBuildingDebris(cctx, b, 18, 12);
      E.spawnCivilians(cctx, b, b.isLandmark ? 6 : 3, city);
      if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 10);
      addPopup(cctx, cx, cy, 48, 'WRECKED!', '#ff6b57', 1.15);

      rollAndSpawnBuildingLoot(b, 'rubble', cx, cy, b.lootRolls || 1, city, cctx, playerRef);
      if (b.guaranteedGirder) {
        spawnLootDrop(cctx, 'girder', cx, cy, city, 5);
      }
      if (b.guaranteedHealth) {
        for (let h = 0; h < b.guaranteedHealth; h++) {
          spawnLootDrop(cctx, 'health', cx, cy, city, 7 + h);
        }
      }
      if (b.explodes && !b.exploded) {
        b.exploded = true;
        triggerExplosion(cx, cy, 1.5, 30, city, cctx, playerRef, kaijus, cam, { burnSec: 2 });
        const dropT = E.spawnProp(cctx, 'tanker', cx + 0.4, cy + 0.4, city);
        if (dropT) dropT.spawnGrace = 15;
      }
      if (b.floods && city && city.slowZones) {
        city.slowZones.push({ x: cx, y: cy, r: 1.9, age: 0 });
        Snd.sfx.splash();
        addSpark(cctx, cx, cy, 14, '#5ee6ff', 40);
        addPopup(cctx, cx, cy, 56, 'FLOODED! SLOW ZONE', '#5ee6ff', 1.05);
        E.spawnProp(cctx, 'water_tank', cx - 0.35, cy + 0.35, city);
      }
    } else {
      Snd.sfx.buildingHit();
    }
    return dmg;
  }

  function hitboxHitsBuilding(atkKaiju, b) {
    const atk = atkKaiju.attack;
    if (!atk || !atk.active || b.state === 'rubble') return false;
    const def = atk.def;
    if (def.zMax < b.zBase || def.zMin > b.zTop) return false;

    const box = KB.Entities.getBuildingCollBox(b);
    const nxPt = U.clamp(atkKaiju.x, box.x0, box.x1);
    const nyPt = U.clamp(atkKaiju.y, box.y0, box.y1);
    const dx = nxPt - atkKaiju.x;
    const dy = nyPt - atkKaiju.y;
    const dist = Math.hypot(dx, dy);
    if (dist > def.reach) return false;
    if (def.radial || dist <= 0.35) return true;

    const halfCos = Math.cos(def.arc * 0.5);
    const dotEdge = (dx / dist) * atkKaiju.dirX + (dy / dist) * atkKaiju.dirY;
    if (dotEdge >= halfCos) return true;

    const cx = (box.x0 + box.x1) * 0.5 - atkKaiju.x;
    const cy = (box.y0 + box.y1) * 0.5 - atkKaiju.y;
    const cDist = Math.hypot(cx, cy);
    if (cDist > 1e-4) {
      const dotCenter = (cx / cDist) * atkKaiju.dirX + (cy / cDist) * atkKaiju.dirY;
      if (dotCenter >= halfCos) return true;
    }
    return false;
  }

  function resolveBuildingMelee(attacker, city, cctx, playerRef, kaijus, cam) {
    const atk = attacker.attack;
    if (!atk || !atk.active || !city || !city.buildings) return;
    const def = atk.def;
    const mult = def.buildingMult || 1.0;
    const dmg = def.dmg * effectivePower(attacker) * mult;

    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      if (b.state === 'rubble') continue;
      const hitKey = 'b:' + b.id;
      if (atk.hitSet.has(hitKey)) continue;
      if (!hitboxHitsBuilding(attacker, b)) continue;

      atk.hitSet.add(hitKey);
      damageBuilding(b, dmg, city, cctx, playerRef, kaijus, cam);
      if (atk.name === 'prop_smash' && def.propRef && !atk.propUsed) {
        atk.propUsed = true;
        const pr = def.propRef;
        if (pr.def.explodes) {
          const box = KB.Entities.getBuildingCollBox(b);
          if (pr.def.fuelOnThrow && !pr.fuelGranted) {
            pr.fuelGranted = true;
            attacker.fuel = Math.min(attacker.fuelMax, attacker.fuel + pr.def.fuelOnThrow);
            addPopup(cctx, attacker.x, attacker.y, attacker.z + 108, '+' + pr.def.fuelOnThrow + ' FUEL', '#7dff4f', 1.08);
          }
          detonateProp(pr, (box.x0 + box.x1) * 0.5, (box.y0 + box.y1) * 0.5, city, cctx, attacker.isPlayer ? attacker : null, kaijus, cam);
          attacker.carrying = null;
          removePropFromList(cctx, pr);
        } else if (pr.def.floods && city && city.slowZones) {
          city.slowZones.push({ x: attacker.x + attacker.dirX * 0.8, y: attacker.y + attacker.dirY * 0.8, r: pr.def.radius || 1.8, age: 0 });
          Snd.sfx.splash();
          attacker.carrying = null;
          removePropFromList(cctx, pr);
        } else {
          pr.usesLeft--;
          if (pr.propType === 'girder' || pr.propType === 'lamp') Snd.sfx.clang();
          if (pr.usesLeft <= 0) {
            attacker.carrying = null;
            removePropFromList(cctx, pr);
            addPopup(cctx, attacker.x, attacker.y, attacker.z + 95, 'BROKE!', '#ffd23f', 0.9);
          }
        }
      }
      attacker.hitStop = Math.max(attacker.hitStop, atk.name === 'heavy' || atk.name === 'prop_smash' ? 4 : 2);
      if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, atk.name === 'heavy' || atk.name === 'prop_smash' ? 8 : 4);
    }
  }

  function updateProps(cctx, city, kaijus, playerRef, cam, dt) {
    if (!cctx || !cctx.props) return;
    const E = KB.Entities;
    const props = cctx.props;

    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i];
      if (!p) continue;
      if (p.spawnGrace > 0) p.spawnGrace--;
      if (p.state === 'carried') continue;

      if (p.state === 'fusing') {
        p.fuseTicks--;
        if (p.fuseTicks <= 0) {
          detonateProp(p, p.x, p.y, city, cctx, playerRef, kaijus, cam);
        }
        continue;
      }

      if (p.state === 'thrown') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz;
        p.vz -= 0.50;
        p.rot += dt * 11;

        let removed = false;

        // 1. Kaiju projectile hit
        if (kaijus) {
          for (let j = 0; j < kaijus.length; j++) {
            const k = kaijus[j];
            if (!k || k.hp <= 0 || (p.hitSet && p.hitSet.has(k.id))) continue;
            if (isInvulnerable(k)) continue;
            if (p.z > k.z + k.height + 18) continue;
            const d = Math.hypot(k.x - p.x, k.y - p.y);
            if (d <= k.r + p.r + 0.14) {
              if (!p.hitSet) p.hitSet = new Set();
              p.hitSet.add(k.id);

              if (p.def.explodes) {
                const impDmg = Math.max(1, Math.round(p.def.throwDmg * k.stats.defense));
                k.hp = Math.max(0, k.hp - impDmg);
                addPopup(cctx, k.x, k.y, k.z + 115, 'IMPACT -' + impDmg, '#ffd23f', 1.0);
                detonateProp(p, p.x, p.y, city, cctx, playerRef, kaijus, cam);
                removed = true;
                break;
              }

              if (p.def.floods) {
                const wDmg = Math.max(1, Math.round(p.def.throwDmg * k.stats.defense));
                k.hp = Math.max(0, k.hp - wDmg);
                k.state = 'knockdown';
                k.stateTick = 0;
                k.hitFlash = 7;
                if (city && city.slowZones) {
                  city.slowZones.push({ x: p.x, y: p.y, r: p.def.radius || 1.8, age: 0 });
                }
                Snd.sfx.splash();
                addSpark(cctx, p.x, p.y, 18, '#5ee6ff', 42);
                addPopup(cctx, p.x, p.y, 64, 'SPLASH! -' + wDmg, '#5ee6ff', 1.15);
                removePropFromList(cctx, p);
                removed = true;
                break;
              }

              const baseThrowDmg = p.hurlDmgOverride || p.def.throwDmg;
              const actual = Math.max(1, Math.round(baseThrowDmg * (p.ownerPower || 1) * k.stats.defense));
              k.hp = Math.max(0, k.hp - actual);
              k.hitFlash = 7;
              dropCarriedProp(k, cctx, city);
              if (k.state === 'climb') { k.climb = null; k.climbCooldown = 20; }
              const kn = U.vec2.norm(p.vx || 1, p.vy || 0);
              k.vx = (kn.x * 7.2) / k.stats.weight;
              k.vy = (kn.y * 7.2) / k.stats.weight;
              k.state = 'knockdown';
              k.stateTick = 0;
              if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 8);
              if (p.propType === 'girder' || p.propType === 'lamp') Snd.sfx.clang();
              else Snd.sfx.heavyHit();
              addSpark(cctx, p.x, p.y, Math.max(20, p.z), '#ffd23f', 36);
              addPopup(cctx, k.x, k.y, k.z + 104, p.def.name.toUpperCase() + ' -' + actual + '!', '#ffd23f', 1.12);
              if (p.ownerIsPlayer && cctx) cctx.stylePoints += 50;

              p.usesLeft--;
              if (p.pierceLeft > 0) {
                p.pierceLeft--;
              } else if (p.usesLeft <= 0) {
                removePropFromList(cctx, p);
                removed = true;
                break;
              } else if (p.bouncesLeft > 0) {
                p.vx *= -0.35;
                p.vy *= -0.35;
                p.vz = 3.2;
                p.bouncesLeft--;
              } else {
                p.vx *= 0.25;
                p.vy *= 0.25;
              }
            }
          }
        }
        if (removed) continue;

        // 2. Building projectile collision
        if (city && city.buildings) {
          for (let j = 0; j < city.buildings.length; j++) {
            const b = city.buildings[j];
            if (b.state === 'rubble' || (p.hitSet && p.hitSet.has('b:' + b.id))) continue;
            const box = E.getBuildingCollBox(b);
            const cx = U.clamp(p.x, box.x0, box.x1);
            const cy = U.clamp(p.y, box.y0, box.y1);
            if (Math.hypot(p.x - cx, p.y - cy) <= p.r && p.z <= b.zTop + 14) {
              if (!p.hitSet) p.hitSet = new Set();
              p.hitSet.add('b:' + b.id);

              if (p.def.explodes) {
                detonateProp(p, p.x, p.y, city, cctx, playerRef, kaijus, cam);
                removed = true;
                break;
              }
              if (p.def.floods) {
                damageBuilding(b, p.def.throwDmg, city, cctx, playerRef, kaijus, cam);
                if (city.slowZones) city.slowZones.push({ x: p.x, y: p.y, r: p.def.radius || 1.8, age: 0 });
                Snd.sfx.splash();
                removePropFromList(cctx, p);
                removed = true;
                break;
              }

              const baseThrowDmg = p.hurlDmgOverride || p.def.throwDmg;
              const bMult = p.def.buildingMult || 1.0;
              damageBuilding(b, baseThrowDmg * bMult, city, cctx, playerRef, kaijus, cam);
              if (p.propType === 'girder' || p.propType === 'lamp') Snd.sfx.clang();
              p.usesLeft--;
              if (p.usesLeft <= 0) {
                removePropFromList(cctx, p);
                removed = true;
                break;
              }
              p.vx *= -0.35;
              p.vy *= -0.35;
              p.vz = 2.8;
              break;
            }
          }
        }
        if (removed) continue;

        // 3. Arena boundary bounce
        if (city) {
          if (p.x < 0.4) { p.x = 0.4; p.vx = Math.abs(p.vx) * 0.5; }
          else if (p.x > city.cols - 0.4) { p.x = city.cols - 0.4; p.vx = -Math.abs(p.vx) * 0.5; }
          if (p.y < 0.4) { p.y = 0.4; p.vy = Math.abs(p.vy) * 0.5; }
          else if (p.y > city.rows - 0.4) { p.y = city.rows - 0.4; p.vy = -Math.abs(p.vy) * 0.5; }
        }

        // 4. Ground impact / bounce
        if (p.z <= 0) {
          if (p.def.explodes) {
            detonateProp(p, p.x, p.y, city, cctx, playerRef, kaijus, cam);
            continue;
          }
          if (p.def.floods) {
            if (city && city.slowZones) city.slowZones.push({ x: p.x, y: p.y, r: p.def.radius || 1.8, age: 0 });
            Snd.sfx.splash();
            addSpark(cctx, p.x, p.y, 16, '#5ee6ff', 38);
            removePropFromList(cctx, p);
            continue;
          }
          if (p.bouncesLeft > 0 && Math.abs(p.vz) > 2.2) {
            p.z = 1;
            p.vz = Math.abs(p.vz) * 0.45;
            p.vx *= 0.52;
            p.vy *= 0.52;
            p.bouncesLeft--;
            if (p.propType === 'girder' || p.propType === 'lamp') Snd.sfx.clang();
          } else {
            p.z = 0;
            p.vx = 0;
            p.vy = 0;
            p.vz = 0;
            p.rot = 0;
            p.state = 'ground';
            p.ownerId = null;
            p.hitSet = null;
            p.hurlDmgOverride = 0;
            p.bouncesLeft = p.def.bounces;
            p.pierceLeft = p.def.pierce;
          }
        }
      }

      E.syncPropBounds(p);
    }

    updateProjectiles(cctx, city, kaijus, playerRef, cam, dt);
    updateClouds(cctx, kaijus);
  }

  function updateProjectiles(cctx, city, kaijus, playerRef, cam, dt) {
    if (!cctx || !cctx.projectiles) return;
    const E = KB.Entities;
    const list = cctx.projectiles;

    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life--;
      if (p.life <= 0) {
        if (p.kind === 'rocket_fist' && p.ownerRef) p.ownerRef.fistOut = false;
        list.splice(i, 1);
        continue;
      }

      if (p.kind === 'rocket_fist') {
        if (!p.returning) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (Math.hypot(p.x - p.startX, p.y - p.startY) >= (p.maxRange || 5.0)) {
            p.returning = true;
          }
        } else {
          const owner = p.ownerRef;
          if (!owner || owner.hp <= 0) {
            if (owner) owner.fistOut = false;
            list.splice(i, 1);
            continue;
          }
          const dx = owner.x - p.x;
          const dy = owner.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= owner.r + 0.35) {
            owner.fistOut = false;
            list.splice(i, 1);
            continue;
          }
          const retSpd = (p.speed || 18.0) * 1.15;
          p.vx = (dx / dist) * retSpd;
          p.vy = (dy / dist) * retSpd;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z = U.lerp(p.z, owner.z + 50, 0.25);
        }
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz;
        p.vz -= (p.gravity || 0);
      }

      let removed = false;
      if (kaijus) {
        for (let j = 0; j < kaijus.length; j++) {
          const k = kaijus[j];
          if (!k || k.hp <= 0 || k.id === p.ownerId || p.hitSet.has(k.id)) continue;
          if (isInvulnerable(k)) continue;
          if (p.z > k.z + k.height + 18) continue;
          if (Math.hypot(k.x - p.x, k.y - p.y) <= k.r + p.r) {
            p.hitSet.add(k.id);
            if (k.state === 'block') {
              const blkDmg = Math.max(1, Math.round(p.dmg * 0.2));
              k.hp = Math.max(0, k.hp - blkDmg);
              k.guard = Math.max(0, k.guard - 24);
              k.hitFlash = 4;
              addSpark(cctx, p.x, p.y, p.z, '#5ee6ff', 28);
              addPopup(cctx, k.x, k.y, k.z + 96, 'BLOCKED -' + blkDmg, '#5ee6ff', 0.95);
            } else {
              const actual = Math.max(1, Math.round(p.dmg * k.stats.defense));
              k.hp = Math.max(0, k.hp - actual);
              k.hitFlash = 6;
              if (p.ownerRef) {
                p.ownerRef.fuel = Math.min(p.ownerRef.fuelMax, p.ownerRef.fuel + 6);
              }
              const kn = U.vec2.norm(p.vx || 1, p.vy || 0);
              if (!hasArmor(k)) {
                dropCarriedProp(k, cctx, city);
                if (k.state === 'climb') { k.climb = null; k.climbCooldown = 20; }
                k.vx = (kn.x * (p.knockback || 7.5)) / k.stats.weight;
                k.vy = (kn.y * (p.knockback || 7.5)) / k.stats.weight;
                k.state = 'knockdown';
                k.stateTick = 0;
              }
              Snd.sfx.heavyHit();
              addSpark(cctx, p.x, p.y, p.z, p.color || '#ffd23f', 38);
              addPopup(cctx, k.x, k.y, k.z + 104, (p.kind === 'rocket_fist' ? 'ROCKET FIST! -' : 'HURL! -') + actual, p.color || '#ffd23f', 1.15);
              if (p.ownerIsPlayer && cctx) cctx.stylePoints += 30;
            }
            if (p.kind === 'rocket_fist') {
              p.returning = true;
            } else if (p.pierceLeft > 0) {
              p.pierceLeft--;
            } else {
              list.splice(i, 1);
              removed = true;
            }
            break;
          }
        }
      }
      if (removed) continue;

      if (city && city.buildings) {
        for (let j = 0; j < city.buildings.length; j++) {
          const b = city.buildings[j];
          if (b.state === 'rubble' || p.hitSet.has('b:' + b.id)) continue;
          const box = E.getBuildingCollBox(b);
          const cx = U.clamp(p.x, box.x0, box.x1);
          const cy = U.clamp(p.y, box.y0, box.y1);
          if (Math.hypot(p.x - cx, p.y - cy) <= p.r && p.z <= b.zTop + 14) {
            p.hitSet.add('b:' + b.id);
            damageBuilding(b, p.dmg * (p.buildingMult || 1.5), city, cctx, playerRef, kaijus, cam);
            if (p.kind === 'rocket_fist') {
              p.returning = true;
            } else {
              list.splice(i, 1);
              removed = true;
            }
            break;
          }
        }
      }
      if (removed) continue;

      if (p.kind !== 'rocket_fist' && p.z <= 0) {
        if (p.explodeRadius > 0 && kaijus) {
          addSpark(cctx, p.x, p.y, 14, p.color || '#ff9a2e', 44);
          Snd.sfx.buildingCrack();
          for (let j = 0; j < kaijus.length; j++) {
            const k = kaijus[j];
            if (!k || k.hp <= 0 || k.id === p.ownerId || p.hitSet.has(k.id) || isInvulnerable(k)) continue;
            if (Math.hypot(k.x - p.x, k.y - p.y) <= p.explodeRadius + k.r) {
              p.hitSet.add(k.id);
              const actual = Math.max(1, Math.round(p.dmg * k.stats.defense));
              k.hp = Math.max(0, k.hp - actual);
              k.hitFlash = 5;
              k.state = 'hitstun';
              k.stunTicks = 18;
              k.stateTick = 0;
              addPopup(cctx, k.x, k.y, k.z + 96, 'ROOF RIP! -' + actual, '#ff9a2e', 1.05);
              if (p.ownerIsPlayer && cctx && !p._styledHit) {
                p._styledHit = true;
                cctx.stylePoints += 30;
              }
            }
          }
        }
        list.splice(i, 1);
      }
    }
  }

  function updateClouds(cctx, kaijus) {
    if (!cctx || !cctx.clouds) return;
    for (let i = cctx.clouds.length - 1; i >= 0; i--) {
      const cl = cctx.clouds[i];
      cl.life--;
      if (cl.life <= 0) {
        cctx.clouds.splice(i, 1);
        continue;
      }
      cl.dotTick++;
      const doDot = (cl.dotTick % 15) === 0; // 4 ticks/sec * 1 dmg = 4 dmg/sec
      if (kaijus) {
        for (let j = 0; j < kaijus.length; j++) {
          const k = kaijus[j];
          if (!k || k.hp <= 0 || k.id === cl.ownerId) continue;
          if (Math.hypot(k.x - cl.x, k.y - cl.y) <= cl.radius + k.r * 0.5) {
            k.cloudSlowTicks = 6;
            k.blindedTicks = 8;
            if (doDot && !isInvulnerable(k)) {
              const dotDmg = Math.max(1, Math.round((cl.dmgPerSec / 4) * (cl.ownerPower || 1) * k.stats.defense));
              k.hp = Math.max(0, k.hp - dotDmg);
              addPopup(cctx, k.x, k.y, k.z + 92, '-' + dotDmg + ' DUST', '#d49eff', 0.85);
              if (cl.ownerIsPlayer && cctx && !cl._styledHit) {
                cl._styledHit = true;
                cctx.stylePoints += 30;
              }
            }
          }
        }
      }
    }
  }

  function triggerLandingStomp(k, city, cctx, playerRef, kaijus, cam) {
    if (!k || !k.justLanded || !city || !city.buildings) return;
    k.justLanded = false;
    Snd.sfx.stomp();
    addSpark(cctx, k.x, k.y, 12, '#ffd23f', 36);
    if (cam) cam.shakeAmp = Math.max(cam.shakeAmp, 6);

    const stompRadius = 1.25;
    const stompDmg = Math.round(14 * effectivePower(k));
    const E = KB.Entities;
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      if (b.state === 'rubble') continue;
      const box = E.getBuildingCollBox(b);
      const nx = U.clamp(k.x, box.x0, box.x1);
      const ny = U.clamp(k.y, box.y0, box.y1);
      if (Math.hypot(k.x - nx, k.y - ny) <= stompRadius) {
        damageBuilding(b, stompDmg, city, cctx, playerRef, kaijus, cam);
      }
    }
    if (kaijus) {
      for (let i = 0; i < kaijus.length; i++) {
        const t = kaijus[i];
        if (!t || t.id === k.id || t.hp <= 0 || isInvulnerable(t) || t.z > 40) continue;
        if (Math.hypot(t.x - k.x, t.y - k.y) <= stompRadius + t.r) {
          const sDmg = Math.max(1, Math.round(10 * effectivePower(k) * t.stats.defense));
          t.hp = Math.max(0, t.hp - sDmg);
          t.hitFlash = 5;
          if (!hasArmor(t)) {
            t.state = 'hitstun';
            t.stunTicks = 16;
            t.stateTick = 0;
          }
          addPopup(cctx, t.x, t.y, t.z + 94, 'STOMP! -' + sDmg, '#ffd23f', 0.95);
        }
      }
    }
  }

  KB.Combat = {
    MOVES: MOVES,
    DODGE_TOTAL: DODGE_TOTAL,
    DODGE_IFRAME_START: DODGE_IFRAME_START,
    DODGE_IFRAME_END: DODGE_IFRAME_END,
    GUARD_BREAK_TICKS: GUARD_BREAK_TICKS,
    createContext: createCombatContext,
    updateFighter: updateFighter,
    resolveMelee: resolveMelee,
    resolveBuildingMelee: resolveBuildingMelee,
    triggerLandingStomp: triggerLandingStomp,
    updateProps: updateProps,
    addPopup: addPopup,
    detonateProp: detonateProp,
    damageBuilding: damageBuilding,
    triggerExplosion: triggerExplosion,
    updateFx: updateFx,
    isInvulnerable: isInvulnerable,
    hasArmor: hasArmor,
    hitboxHitsTarget: hitboxHitsTarget,
    hitboxHitsBuilding: hitboxHitsBuilding
  };
})();
