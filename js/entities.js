/* Kaiju Brawl - entity models, Kaiju physics, and circle-vs-AABB building wall sliding. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const U = KB.Util;
  const Iso = KB.Iso;
  const In = KB.Input;
  const Snd = KB.Audio;
  const Monsters = KB.MONSTERS;

  const GRAVITY = 0.55;      // px/tick^2 (PLAN.md §5.1)
  const JUMP_IMPULSE = 9.0;  // px/tick base
  const AIR_CONTROL = 0.60;  // 60% control while airborne

  const MAX_PICKUPS = 12;
  const PICKUP_LIFE = 12.0;  // seconds
  const PICKUP_MAGNET_R = 1.0;
  const RUBBLE_SLOW_MULT = 0.7;
  const MAX_PROPS = 16;

  /* Throwable / Smashable street props (PLAN.md §6.4) */
  const PROP_DEFS = {
    girder: {
      id: 'girder',
      name: 'Steel Girder',
      speedMult: 0.80,
      throwDmg: 35,
      smashDmg: 22,
      uses: 3,
      pierce: 1,
      bounces: 1,
      buildingMult: 2.0,
      reach: 2.0,
      r: 0.34,
      height: 18
    },
    tanker: {
      id: 'tanker',
      name: 'Fuel Tanker',
      speedMult: 0.55,
      throwDmg: 40,
      smashDmg: 28,
      uses: 1,
      pierce: 0,
      bounces: 0,
      explodes: true,
      radius: 1.8,
      blastDmg: 45,
      burnSec: 3,
      fuelOnThrow: 40,
      reach: 1.6,
      r: 0.40,
      height: 28
    },
    car: {
      id: 'car',
      name: 'Parked Car',
      speedMult: 0.75,
      throwDmg: 25,
      smashDmg: 15,
      uses: 1,
      pierce: 0,
      bounces: 1,
      reach: 1.55,
      r: 0.36,
      height: 22
    },
    lamp: {
      id: 'lamp',
      name: 'Streetlamp',
      speedMult: 0.95,
      throwDmg: 15,
      smashDmg: 12,
      uses: 2,
      pierce: 0,
      bounces: 1,
      reach: 1.85,
      r: 0.25,
      height: 26
    },
    water_tank: {
      id: 'water_tank',
      name: 'Water Tank',
      speedMult: 0.50,
      throwDmg: 50,
      smashDmg: 26,
      uses: 1,
      pierce: 0,
      bounces: 0,
      floods: true,
      radius: 1.8,
      reach: 1.65,
      r: 0.42,
      height: 30
    }
  };

  const LOOT_TABLES = {
    damaged: [
      { type: 'nothing', w: 45 },
      { type: 'health',  w: 20 },
      { type: 'fuel',    w: 20 },
      { type: 'girder',  w: 10 },
      { type: 'tanker',  w: 5 }
    ],
    rubble: [
      { type: 'nothing', w: 20 },
      { type: 'health',  w: 25 },
      { type: 'fuel',    w: 25 },
      { type: 'girder',  w: 20 },
      { type: 'tanker',  w: 10 }
    ]
  };

  let nextEntityId = 1000;

  function createKaiju(opts) {
    const mDef = Monsters[opts.monsterId] || Monsters.gorgantor;
    const k = {
      id: opts.id || nextEntityId++,
      kind: 'kaiju',
      isPlayer: !!opts.isPlayer,
      monsterId: mDef.id,
      stats: mDef,
      x: opts.x || 2.2,
      y: opts.y || 17.8,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      r: mDef.radius || 0.62,
      height: mDef.height || 110,
      dirX: opts.dirX !== undefined ? opts.dirX : 0.707,
      dirY: opts.dirY !== undefined ? opts.dirY : -0.707,
      state: 'idle',
      stateTick: 0,
      grounded: true,
      animT: 0,
      walkPhase: 0,
      landSquash: 0,
      hp: Math.round(mDef.hp * (opts.hpMul || 1)),
      maxHp: Math.round(mDef.hp * (opts.hpMul || 1)),
      hpMul: opts.hpMul || 1,
      dmgMul: opts.dmgMul || 1,
      isBoss: !!opts.isBoss,
      telegraphTicks: 0,
      fuel: 0,
      fuelMax: mDef.fuelMax,
      guard: mDef.guard,
      guardMax: mDef.guard,
      hitStop: 0,
      hitFlash: 0,
      stagger: 0,
      comboReceived: 0,
      stunTicks: 0,
      blockTicks: 0,
      dodgeCooldown: 0,
      counterWindow: 0,
      armorCharges: 0,
      chainQueued: false,
      airAttackUsed: false,
      attack: null,
      special: null,
      specialCooldown: 0,
      overcharged: false,
      carrying: null,
      climb: null,
      grabTargetId: null,
      burnTicks: 0,
      burnTimer: 0,
      regenTimer: 0,
      gliding: false,
      glideTicksLeft: mDef.glideMaxTicks || 0,
      wasGliding: false,
      jetHopTicks: 0,
      jetHopUsed: false,
      blindedTicks: 0,
      cloudSlowTicks: 0,
      fistOut: false,
      batteryActive: false,
      fx0: 0,
      fx1: 0,
      fy0: 0,
      fy1: 0,
      zBase: 0,
      zTop: mDef.height || 110,
      screenPad: 48
    };
    syncKaijuBounds(k);
    return k;
  }

  function syncKaijuBounds(k) {
    if (k.state === 'climb' && k.climb && k.climb.building) {
      const box = getBuildingCollBox(k.climb.building);
      const pad = 0.3;
      k.fx0 = k.climb.face === 'x0' ? box.x0 - pad : box.x0;
      k.fx1 = k.climb.face === 'x1' ? box.x1 + pad : box.x1;
      k.fy0 = k.climb.face === 'y0' ? box.y0 - pad : box.y0;
      k.fy1 = k.climb.face === 'y1' ? box.y1 + pad : box.y1;
      k.zBase = k.climb.building.zBase;
      k.zTop = Math.max(k.climb.building.zTop, k.z + k.height);
      return;
    }
    k.fx0 = k.x - k.r;
    k.fx1 = k.x + k.r;
    k.fy0 = k.y - k.r;
    k.fy1 = k.y + k.r;
    k.zBase = k.z;
    k.zTop = k.z + k.height;
  }

  function getBuildingCollBox(b) {
    return b.collBox || { x0: b.fx0, y0: b.fy0, x1: b.fx1, y1: b.fy1 };
  }

  function resolveBuildingCollisions(k, buildings) {
    const r = k.r;
    const rSq = r * r;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (b.state === 'rubble') continue;
        if (k.z >= b.zTop - 10) continue;

        const box = getBuildingCollBox(b);
        const cx = U.clamp(k.x, box.x0, box.x1);
        const cy = U.clamp(k.y, box.y0, box.y1);
        const dx = k.x - cx;
        const dy = k.y - cy;
        const distSq = dx * dx + dy * dy;

        if (distSq >= rSq) continue;

        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = r - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          k.x += nx * overlap;
          k.y += ny * overlap;

          const vn = k.vx * nx + k.vy * ny;
          if (vn < 0) {
            k.vx -= vn * nx;
            k.vy -= vn * ny;
          }
        } else {
          const penL = Math.abs(k.x - box.x0);
          const penR = Math.abs(box.x1 - k.x);
          const penT = Math.abs(k.y - box.y0);
          const penB = Math.abs(box.y1 - k.y);
          const minP = Math.min(penL, penR, penT, penB);
          if (minP === penL) k.x = box.x0 - r;
          else if (minP === penR) k.x = box.x1 + r;
          else if (minP === penT) k.y = box.y0 - r;
          else k.y = box.y1 + r;
        }
      }
    }
  }

  function resolveKaijuSeparation(a, b, city) {
    if (Math.abs(a.z - b.z) > 65) return;
    const minDist = (a.r + b.r) * 0.85;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= minDist) return;

    const nx = dist > 1e-5 ? dx / dist : 1;
    const ny = dist > 1e-5 ? dy / dist : 0;
    const push = (minDist - dist) * 0.5;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;

    if (city) {
      a.x = U.clamp(a.x, a.r, city.cols - a.r);
      a.y = U.clamp(a.y, a.r, city.rows - a.r);
      b.x = U.clamp(b.x, b.r, city.cols - b.r);
      b.y = U.clamp(b.y, b.r, city.rows - b.r);
      resolveBuildingCollisions(a, city.buildings);
      resolveBuildingCollisions(b, city.buildings);
    }
    syncKaijuBounds(a);
    syncKaijuBounds(b);
  }

  function getRoofFloorZ(k, buildings) {
    if (!buildings) return 0;
    let floorZ = 0;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (b.state === 'rubble') continue;
      if (k.z < b.zTop - 10) continue;
      const box = getBuildingCollBox(b);
      if (k.x >= box.x0 - k.r * 0.4 && k.x <= box.x1 + k.r * 0.4 &&
          k.y >= box.y0 - k.r * 0.4 && k.y <= box.y1 + k.r * 0.4) {
        if (b.zTop > floorZ) floorZ = b.zTop;
      }
    }
    return floorZ;
  }

  function getMoveSpeedMult(k, city) {
    let mult = 1.0;
    if (k.fuel >= 80) {
      mult *= 1.10; // Overcharge (+10% move speed, PLAN.md §6.1)
    }
    if (k.gliding && k.stats.glideSpeedMult) {
      mult *= k.stats.glideSpeedMult;
    }
    if (k.cloudSlowTicks > 0) {
      mult *= 0.65;
    }
    if (k.carrying && k.carrying.def) {
      mult *= k.carrying.def.speedMult;
    }
    if (!k.grounded || !city) return mult;
    const x = k.x;
    const y = k.y;
    const zones = city.slowZones;
    if (zones) {
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const dx = x - z.x;
        const dy = y - z.y;
        if (dx * dx + dy * dy <= z.r * z.r) return mult * RUBBLE_SLOW_MULT;
      }
    }
    const blds = city.buildings;
    if (blds) {
      for (let i = 0; i < blds.length; i++) {
        const b = blds[i];
        if (b.state !== 'rubble') continue;
        const box = getBuildingCollBox(b);
        if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) {
          return mult * RUBBLE_SLOW_MULT;
        }
      }
    }
    return mult;
  }

  function updateKaiju(k, intent, city, dt, combatControlled) {
    k.justLanded = false;
    if (k.jetHopTicks > 0) k.jetHopTicks--;
    if (combatControlled && k.state === 'climb') {
      k.animT += dt;
      syncKaijuBounds(k);
      return;
    }
    const stickMag = U.clamp(Math.hypot(intent.moveX, intent.moveY), 0, 1);
    const wDir = stickMag > 0.01 ? Iso.screenDirToWorld(intent.moveX, intent.moveY) : { x: 0, y: 0 };

    const freeState = !combatControlled || k.state === 'idle' || k.state === 'walk' || k.state === 'jump' || k.state === 'jump_atk' || k.state === 'carry';
    if (freeState) {
      const ctrl = k.grounded ? 1.0 : AIR_CONTROL;
      const slowMult = getMoveSpeedMult(k, city);
      const maxSpd = k.stats.speed * slowMult;
      const targetVx = wDir.x * maxSpd * stickMag;
      const targetVy = wDir.y * maxSpd * stickMag;

      const accelRate = k.grounded ? 18 : 7.5 * ctrl;
      const blend = 1 - Math.exp(-accelRate * dt);
      k.vx = U.lerp(k.vx, targetVx, blend);
      k.vy = U.lerp(k.vy, targetVy, blend);

      if (stickMag > 0.05) {
        k.dirX = wDir.x;
        k.dirY = wDir.y;
      }

      if (k.grounded && intent.jumpPressed && k.state !== 'jump_atk' && !k.carrying) {
        k.vz = JUMP_IMPULSE * k.stats.jump;
        k.grounded = false;
        k.airAttackUsed = false;
        k.gliding = false;
        k.wasGliding = false;
        k.jetHopUsed = false;
        k.glideTicksLeft = k.stats.glideMaxTicks || 0;
        k.landSquash = 0;
        if (k.isPlayer) In.consume('jumpPressed');
      } else if (!k.grounded && k.stats.jetHop && !k.jetHopUsed && !k.carrying && intent.jumpPressed && k.state === 'jump') {
        // Tin Colossus Jet Hop: short hover boost onto rooftops
        k.jetHopUsed = true;
        k.jetHopTicks = 24;
        k.vz = Math.max(k.vz + 4.5, 6.4);
        Snd.sfx.dodge();
        if (k.isPlayer) In.consume('jumpPressed');
      }
    }

    k.x += k.vx * dt;
    k.y += k.vy * dt;

    k.x = U.clamp(k.x, k.r, city.cols - k.r);
    k.y = U.clamp(k.y, k.r, city.rows - k.r);
    resolveBuildingCollisions(k, city.buildings);
    k.x = U.clamp(k.x, k.r, city.cols - k.r);
    k.y = U.clamp(k.y, k.r, city.rows - k.r);

    const floorZ = getRoofFloorZ(k, city.buildings);
    if (k.grounded && k.z > floorZ + 2) {
      k.grounded = false;
    }

    if (!k.grounded || k.z > floorZ || k.vz !== 0) {
      const prevAirAtk = k.state === 'jump_atk' || k.airAttackUsed;
      const canGlideNow = !k.grounded && k.stats.canGlide && intent.jumpHeld && k.vz <= 0 && (k.z - floorZ) > 4 && k.glideTicksLeft > 0 && k.state === 'jump';
      if (canGlideNow) {
        k.gliding = true;
        k.wasGliding = true;
        k.glideTicksLeft--;
      } else {
        k.gliding = false;
      }

      const grav = k.gliding ? GRAVITY * (k.stats.glideFallMult || 0.25) : GRAVITY;
      k.z += k.vz;
      k.vz -= grav;
      if (k.gliding) {
        k.vz = Math.max(k.vz, -1.6);
      }

      if (k.z <= floorZ) {
        k.z = floorZ;
        k.vz = 0;
        k.grounded = true;
        k.gliding = false;
        k.jetHopUsed = false;
        k.glideTicksLeft = k.stats.glideMaxTicks || 0;
        k.justLanded = prevAirAtk;
        k.airAttackUsed = false;
        if (!prevAirAtk) k.wasGliding = false;
        k.landSquash = 1.0;
      }
    } else {
      k.gliding = false;
      k.jetHopUsed = false;
      k.glideTicksLeft = k.stats.glideMaxTicks || 0;
    }

    k.animT += dt;
    const speedMag = Math.hypot(k.vx, k.vy);
    if (!combatControlled || k.state === 'idle' || k.state === 'walk' || k.state === 'jump') {
      if (!k.grounded) {
        k.state = 'jump';
      } else if (speedMag > 0.25) {
        k.state = 'walk';
        k.walkPhase += speedMag * dt * 3.4;
      } else {
        k.state = 'idle';
      }
    } else if (k.state === 'carry' && speedMag > 0.25) {
      k.walkPhase += speedMag * dt * 3.1;
    }

    if (k.landSquash > 0) {
      k.landSquash = Math.max(0, k.landSquash - dt * 6.5);
    }

    syncKaijuBounds(k);
  }

  /* ---- Pickups, Prop Stubs, Debris & Civilians (M4) ---- */
  function rollLootItem(stage, randFn) {
    const tbl = LOOT_TABLES[stage] || LOOT_TABLES.rubble;
    const r = (randFn ? randFn() : Math.random()) * 100;
    let acc = 0;
    for (let i = 0; i < tbl.length; i++) {
      acc += tbl[i].w;
      if (r < acc) return tbl[i].type;
    }
    return tbl[tbl.length - 1].type;
  }

  function spawnPickup(cctx, type, x, y, city) {
    if (!cctx) return null;
    if (cctx.pickups.length >= MAX_PICKUPS) {
      cctx.pickups.shift();
    }
    const px = city ? U.clamp(x, 0.6, city.cols - 0.6) : x;
    const py = city ? U.clamp(y, 0.6, city.rows - 0.6) : y;
    const p = {
      id: nextEntityId++,
      kind: 'pickup',
      pickupType: type, // 'health' | 'fuel'
      x: px,
      y: py,
      z: 6,
      vx: (Math.random() - 0.5) * 1.4,
      vy: (Math.random() - 0.5) * 1.4,
      vz: 4.5,
      r: 0.28,
      life: PICKUP_LIFE,
      maxLife: PICKUP_LIFE,
      bobPhase: Math.random() * Math.PI * 2,
      fx0: px - 0.28,
      fx1: px + 0.28,
      fy0: py - 0.28,
      fy1: py + 0.28,
      zBase: 0,
      zTop: 32,
      screenPad: 18
    };
    cctx.pickups.push(p);
    if (type === 'health') cctx.noHealthOrbSec = 0;
    return p;
  }

  function syncPropBounds(p) {
    const r = p.r || 0.34;
    const h = p.def ? p.def.height : 22;
    p.fx0 = p.x - r;
    p.fx1 = p.x + r;
    p.fy0 = p.y - r;
    p.fy1 = p.y + r;
    p.zBase = p.z;
    p.zTop = p.z + h;
  }

  function spawnProp(cctx, propType, x, y, city) {
    if (!cctx) return null;
    const props = cctx.props || cctx.propDrops;
    const def = PROP_DEFS[propType] || PROP_DEFS.girder;
    if (props.length >= MAX_PROPS) {
      for (let i = 0; i < props.length; i++) {
        if (props[i].state === 'ground') {
          props.splice(i, 1);
          break;
        }
      }
    }
    const px = city ? U.clamp(x, 0.6, city.cols - 0.6) : x;
    const py = city ? U.clamp(y, 0.6, city.rows - 0.6) : y;
    const prop = {
      id: nextEntityId++,
      kind: 'prop',
      propType: def.id,
      def: def,
      state: 'ground', // 'ground' | 'carried' | 'thrown' | 'fusing'
      x: px,
      y: py,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rot: 0,
      r: def.r,
      usesLeft: def.uses,
      bouncesLeft: def.bounces,
      pierceLeft: def.pierce,
      ownerId: null,
      hitSet: null,
      fuseTicks: 0,
      fx0: 0,
      fx1: 0,
      fy0: 0,
      fy1: 0,
      zBase: 0,
      zTop: def.height,
      screenPad: 24
    };
    syncPropBounds(prop);
    props.push(prop);
    return prop;
  }

  function spawnPropDrop(cctx, propType, x, y, city) {
    return spawnProp(cctx, propType, x, y, city);
  }

  function spawnBuildingDebris(cctx, b, count, dustCount) {
    if (!cctx || cctx.headless) return;
    const box = getBuildingCollBox(b);
    const cx = (box.x0 + box.x1) * 0.5;
    const cy = (box.y0 + box.y1) * 0.5;
    const zMid = Math.max(18, b.zTop * 0.6);

    for (let i = 0; i < count; i++) {
      if (cctx.debris.length >= 220) cctx.debris.shift();
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 2.8;
      cctx.debris.push({
        x: cx + (Math.random() - 0.5) * (box.x1 - box.x0) * 0.7,
        y: cy + (Math.random() - 0.5) * (box.y1 - box.y0) * 0.7,
        z: Math.random() * zMid,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        vz: 3.5 + Math.random() * 4.5,
        size: 5 + Math.random() * 6,
        color: i % 3 === 0 ? b.roof : (i % 2 === 0 ? b.color : '#6e6558'),
        life: 0.7 + Math.random() * 0.65,
        maxLife: 1.35
      });
    }

    for (let i = 0; i < dustCount; i++) {
      if (cctx.dust.length >= 120) cctx.dust.shift();
      cctx.dust.push({
        x: cx + (Math.random() - 0.5) * (box.x1 - box.x0) * 0.9,
        y: cy + (Math.random() - 0.5) * (box.y1 - box.y0) * 0.9,
        z: 6 + Math.random() * 24,
        vx: (Math.random() - 0.5) * 0.9,
        vy: (Math.random() - 0.5) * 0.9,
        vz: 0.6 + Math.random() * 1.1,
        r: 12 + Math.random() * 16,
        color: '#c7bfb1',
        life: 0.65 + Math.random() * 0.55,
        maxLife: 1.2
      });
    }
  }

  function spawnCivilians(cctx, b, count, city) {
    if (!cctx || cctx.headless) return;
    const box = getBuildingCollBox(b);
    const cx = (box.x0 + box.x1) * 0.5;
    const cy = (box.y0 + box.y1) * 0.5;
    const coatColors = ['#d9534f', '#3b7dd8', '#f0ad4e', '#e8e0cc', '#5cb85c'];
    for (let i = 0; i < count; i++) {
      if (cctx.civilians.length >= 40) cctx.civilians.shift();
      const ang = Math.random() * Math.PI * 2;
      const spd = 2.0 + Math.random() * 1.3;
      const x = cx + Math.cos(ang) * 0.65;
      const y = cy + Math.sin(ang) * 0.65;
      cctx.civilians.push({
        id: nextEntityId++,
        kind: 'civilian',
        x: city ? U.clamp(x, 0.3, city.cols - 0.3) : x,
        y: city ? U.clamp(y, 0.3, city.rows - 0.3) : y,
        z: 0,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: coatColors[i % coatColors.length],
        phase: Math.random() * Math.PI * 2,
        life: 1.6 + Math.random() * 0.7,
        maxLife: 2.3,
        fx0: x - 0.12,
        fx1: x + 0.12,
        fy0: y - 0.12,
        fy1: y + 0.12,
        zBase: 0,
        zTop: 18,
        screenPad: 10
      });
    }
  }

  function updatePickups(cctx, kaijus, city, dt) {
    if (!cctx) return;
    cctx.noHealthOrbSec += dt;

    for (let i = cctx.pickups.length - 1; i >= 0; i--) {
      const p = cctx.pickups[i];
      p.life -= dt;
      if (p.life <= 0) {
        cctx.pickups.splice(i, 1);
        continue;
      }

      p.bobPhase += dt * 4.5;
      if (p.z > 0 || p.vz !== 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz;
        p.vz -= GRAVITY * 0.8;
        if (p.z <= 0) {
          p.z = 0;
          p.vz = 0;
          p.vx = 0;
          p.vy = 0;
        }
      }

      // 1-tile magnet pull & pickup check
      let collected = false;
      for (let j = 0; j < kaijus.length; j++) {
        const k = kaijus[j];
        if (!k || k.hp <= 0 || k.z > 48) continue;
        const dx = k.x - p.x;
        const dy = k.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= k.r + 0.28) {
          if (p.pickupType === 'health') {
            k.hp = Math.min(k.maxHp, k.hp + 15);
            if (!cctx.headless) cctx.popups.push({ x: k.x, y: k.y, z: k.z + 92, text: '+15 HP', color: '#ff6b7a', scale: 1.05, life: 42, maxLife: 42 });
          } else if (p.pickupType === 'fuel') {
            k.fuel = Math.min(k.fuelMax, k.fuel + 25);
            if (!cctx.headless) cctx.popups.push({ x: k.x, y: k.y, z: k.z + 92, text: '+25 FUEL', color: '#7dff4f', scale: 1.05, life: 42, maxLife: 42 });
          }
          Snd.sfx.pickup();
          collected = true;
          break;
        } else if (dist <= PICKUP_MAGNET_R) {
          const pull = (5.8 * dt) / Math.max(0.1, dist);
          p.x += dx * pull;
          p.y += dy * pull;
        }
      }

      if (collected) {
        cctx.pickups.splice(i, 1);
        continue;
      }

      if (city) {
        p.x = U.clamp(p.x, 0.35, city.cols - 0.35);
        p.y = U.clamp(p.y, 0.35, city.rows - 0.35);
      }
      p.fx0 = p.x - p.r;
      p.fx1 = p.x + p.r;
      p.fy0 = p.y - p.r;
      p.fy1 = p.y + p.r;
      p.zTop = 30 + Math.sin(p.bobPhase) * 4;
    }
  }

  function updateBuildings(city, cctx, dt) {
    if (!city) return;
    const blds = city.buildings;
    for (let i = 0; i < blds.length; i++) {
      const b = blds[i];
      if (b.hitFlash > 0) b.hitFlash--;
      if (b.shakeT > 0) b.shakeT--;
      if (b.crackTicks > 0) b.crackTicks--;

      if (b.collapseTick > 0) {
        b.collapseTick--;
        const t = 1 - b.collapseTick / 30;
        b.zTop = U.lerp(b.collapseStartZ, b.maxZTop * 0.12, t * t);
      }

      if (cctx && !cctx.headless && b.state === 'damaged' && Math.random() < dt * 2.2 && cctx.dust.length < 110) {
        const box = getBuildingCollBox(b);
        cctx.dust.push({
          x: U.lerp(box.x0, box.x1, 0.3 + Math.random() * 0.4),
          y: U.lerp(box.y0, box.y1, 0.3 + Math.random() * 0.4),
          z: b.zTop * 0.72,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          vz: 0.9 + Math.random() * 0.6,
          r: 8 + Math.random() * 7,
          color: '#636870',
          life: 0.9,
          maxLife: 0.9
        });
      }
    }

    if (city.slowZones) {
      for (let i = 0; i < city.slowZones.length; i++) {
        city.slowZones[i].age += dt;
      }
    }
  }

  function rebuildCity(city) {
    if (!city || !city.buildings) return;
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      b.state = 'intact';
      b.hp = b.maxHp;
      b.zTop = b.maxZTop;
      b.crackTicks = 0;
      b.hitFlash = 0;
      b.shakeT = 0;
      b.collapseTick = 0;
      b.exploded = false;
    }
    if (city.slowZones) city.slowZones.length = 0;
  }

  function updateDebrisAndCivilians(cctx, city, dt) {
    if (!cctx) return;
    for (let i = cctx.debris.length - 1; i >= 0; i--) {
      const d = cctx.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        cctx.debris.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz;
      d.vz -= GRAVITY;
      if (d.z < 0) {
        d.z = 0;
        d.vz = Math.abs(d.vz) * 0.35;
        d.vx *= 0.6;
        d.vy *= 0.6;
      }
    }

    for (let i = cctx.dust.length - 1; i >= 0; i--) {
      const p = cctx.dust[i];
      p.life -= dt;
      if (p.life <= 0) {
        cctx.dust.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * 18 * dt;
      p.r += 10 * dt;
    }

    for (let i = cctx.civilians.length - 1; i >= 0; i--) {
      const c = cctx.civilians[i];
      c.life -= dt;
      if (c.life <= 0) {
        cctx.civilians.splice(i, 1);
        continue;
      }
      c.phase += dt * 14;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (city) {
        c.x = U.clamp(c.x, 0.2, city.cols - 0.2);
        c.y = U.clamp(c.y, 0.2, city.rows - 0.2);
      }
      c.fx0 = c.x - 0.12;
      c.fx1 = c.x + 0.12;
      c.fy0 = c.y - 0.12;
      c.fy1 = c.y + 0.12;
    }
  }

  function simLootStats(wrecks, seed) {
    const count = wrecks || 200;
    const rand = U.rng(seed || 2026);
    const stages = ['damaged', 'rubble'];
    const keys = ['nothing', 'health', 'fuel', 'girder', 'tanker'];
    const expected = {
      damaged: { nothing: 45, health: 20, fuel: 20, girder: 10, tanker: 5 },
      rubble:  { nothing: 20, health: 25, fuel: 25, girder: 20, tanker: 10 }
    };
    const report = { wrecks: count, ok: true, maxDiffPct: 0, damaged: {}, rubble: {} };

    for (let s = 0; s < stages.length; s++) {
      const st = stages[s];
      const counts = { nothing: 0, health: 0, fuel: 0, girder: 0, tanker: 0 };
      for (let i = 0; i < count; i++) {
        const drop = rollLootItem(st, rand);
        counts[drop]++;
      }
      for (let k = 0; k < keys.length; k++) {
        const key = keys[k];
        const pct = +(counts[key] * 100 / count).toFixed(1);
        const diff = +Math.abs(pct - expected[st][key]).toFixed(1);
        if (diff > report.maxDiffPct) report.maxDiffPct = diff;
        if (diff > 5.0) report.ok = false;
        report[st][key] = { count: counts[key], pct: pct, expected: expected[st][key], diff: diff };
      }
    }
    return report;
  }

  KB.Entities = {
    PROP_DEFS: PROP_DEFS,
    createKaiju: createKaiju,
    getBuildingCollBox: getBuildingCollBox,
    getMoveSpeedMult: getMoveSpeedMult,
    syncKaijuBounds: syncKaijuBounds,
    syncPropBounds: syncPropBounds,
    resolveBuildingCollisions: resolveBuildingCollisions,
    resolveKaijuSeparation: resolveKaijuSeparation,
    updateKaiju: updateKaiju,
    LOOT_TABLES: LOOT_TABLES,
    rollLootItem: rollLootItem,
    spawnPickup: spawnPickup,
    spawnProp: spawnProp,
    spawnPropDrop: spawnPropDrop,
    spawnBuildingDebris: spawnBuildingDebris,
    spawnCivilians: spawnCivilians,
    updatePickups: updatePickups,
    updateBuildings: updateBuildings,
    rebuildCity: rebuildCity,
    updateDebrisAndCivilians: updateDebrisAndCivilians,
    simLootStats: simLootStats
  };
})();
