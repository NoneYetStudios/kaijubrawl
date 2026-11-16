/* Kaiju Brawl - Challenger AI behavior state machine (M8). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const U = KB.Util;

  const STATES = Object.freeze({
    APPROACH: 'approach',
    CIRCLE: 'circle',
    ATTACK_CHAIN: 'attack-chain',
    RETREAT: 'retreat',
    PICKUP_PROP: 'pickup-prop',
    THROW: 'throw',
    BLOCK_REACTIVE: 'block-reactive',
    RECOVER: 'recover'
  });

  function worldDirToScreen(wx, wy) {
    if (wx === 0 && wy === 0) return { x: 0, y: 0 };
    const sx = (wx - wy) * 48;
    const sy = (wx + wy) * 24;
    const len = Math.hypot(sx, sy) || 1;
    return { x: sx / len, y: sy / len };
  }

  function makeEmptyIntent() {
    return {
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
      ultimatePressed: false
    };
  }

  function getDifficultyParams(round, isBoss) {
    const r = Math.max(1, Math.floor(round || 1));
    const reactionDelay = Math.round(U.clamp(24 - (r - 1) * 2, 8, 24));
    const blockProb = +U.clamp(0.15 + (r - 1) * 0.05 + (isBoss ? 0.06 : 0), 0.15, 0.62).toFixed(3);
    const specialProb = +U.clamp(0.20 + (r - 1) * 0.052 + (isBoss ? 0.14 : 0), 0.20, 0.72).toFixed(3);
    const propProb = +U.clamp(0.22 + (r - 1) * 0.054, 0.22, 0.65).toFixed(3);
    const dodgeProb = +U.clamp(0.06 + (r - 1) * 0.032 + (isBoss ? 0.06 : 0), 0.06, 0.36).toFixed(3);
    const heavyProb = +U.clamp(0.26 + (r - 1) * 0.03, 0.26, 0.50).toFixed(3);
    const chainMax = r >= 5 ? 3 : (r >= 2 ? 2 : 2);
    return {
      round: r,
      isBoss: !!isBoss,
      reactionDelay: reactionDelay,
      blockProb: blockProb,
      specialProb: specialProb,
      propProb: propProb,
      dodgeProb: dodgeProb,
      heavyProb: heavyProb,
      chainMax: chainMax
    };
  }

  function makePrng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isTargetThreatening(t) {
    if (!t) return false;
    return t.state === 'light1' || t.state === 'light2' || t.state === 'light3' ||
      t.state === 'heavy' || t.state === 'grab' || t.state === 'prop_smash' ||
      t.state === 'special' || t.state === 'ultimate';
  }

  function isDownOrStunned(k) {
    return k.state === 'hitstun' || k.state === 'knockdown' || k.state === 'guard_break' ||
      k.state === 'thrown_kaiju' || k.state === 'grabbed' || k.state === 'ko';
  }

  function findNearestProp(self, cctx, maxDist) {
    if (!cctx || !cctx.props) return null;
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < cctx.props.length; i++) {
      const p = cctx.props[i];
      if (!p || p._detonated || p.state !== 'ground') continue;
      const d = Math.hypot(p.x - self.x, p.y - self.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  function findNearestPickup(self, cctx, wantType, maxDist) {
    if (!cctx || !cctx.pickups) return null;
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < cctx.pickups.length; i++) {
      const pk = cctx.pickups[i];
      if (!pk || pk.pickupType !== wantType) continue;
      const d = Math.hypot(pk.x - self.x, pk.y - self.y);
      if (d < bestD) {
        bestD = d;
        best = pk;
      }
    }
    return best;
  }

  function findNearestBuilding(self, city, maxDist) {
    if (!city || !city.buildings) return null;
    const E = KB.Entities;
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      if (!b || b.state === 'rubble') continue;
      const box = E.getBuildingCollBox(b);
      const cx = (box.x0 + box.x1) * 0.5;
      const cy = (box.y0 + box.y1) * 0.5;
      const d = Math.hypot(cx - self.x, cy - self.y);
      if (d < bestD) {
        bestD = d;
        best = { b: b, cx: cx, cy: cy, d: d };
      }
    }
    return best;
  }

  function rotateVec(vx, vy, rad) {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return { x: vx * c - vy * s, y: vx * s + vy * c };
  }

  function steerAroundBuildings(self, wx, wy, city) {
    if (!city || !city.buildings) return { x: wx, y: wy };
    const E = KB.Entities;
    const look = self.r + 0.65;
    const tx = self.x + wx * look;
    const ty = self.y + wy * look;
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      if (!b || b.state === 'rubble') continue;
      const box = E.getBuildingCollBox(b);
      if (tx >= box.x0 - self.r && tx <= box.x1 + self.r &&
          ty >= box.y0 - self.r && ty <= box.y1 + self.r) {
        const cx = (box.x0 + box.x1) * 0.5;
        const cy = (box.y0 + box.y1) * 0.5;
        const rx = self.x - cx;
        const ry = self.y - cy;
        const cross = wx * ry - wy * rx;
        const side = cross >= 0 ? 1 : -1;
        return U.vec2.norm(wx - wy * side * 0.95, wy + wx * side * 0.95);
      }
    }
    return { x: wx, y: wy };
  }

  function createController(opts) {
    const o = opts || {};
    const params = getDifficultyParams(o.round || 1, !!o.isBoss);
    const rand = typeof o.rand === 'function' ? o.rand : makePrng(o.seed || (params.round * 7919 + (params.isBoss ? 131 : 17)));

    let state = STATES.APPROACH;
    let stateTicks = 0;
    let strafeSign = rand() < 0.5 ? 1 : -1;
    let circleDuration = 34;
    let blockTimer = 0;
    let retreatTimer = 0;
    let actionCooldown = 16;
    let chainStep = 0;
    let chainTargetLen = 2;
    let targetPropId = null;

    // Delayed perception buffer (enforces fair reactionDelay)
    let threatDetectedTick = -999;
    let threatWasActive = false;
    let threatEvalAt = -999;
    let tick = 0;

    // Telegraph state for heavy/special windup cues
    let telegraphAction = null; // 'heavy' | 'special' | 'ultimate'
    let telegraphLeft = 0;
    let bossWreckTimer = params.isBoss ? 120 : 999999;
    let bossDemolishLeft = 0;

    function setState(next) {
      if (state !== next) {
        state = next;
        stateTicks = 0;
      }
    }

    function clearTelegraph(self) {
      telegraphAction = null;
      telegraphLeft = 0;
      if (self) self.telegraphTicks = 0;
    }

    function startTelegraph(self, actionKind, ticks) {
      telegraphAction = actionKind;
      telegraphLeft = ticks;
      if (self) self.telegraphTicks = ticks;
    }

    function applyAimMove(intent, self, wx, wy, blinded, wobbleScale) {
      let vx = wx;
      let vy = wy;
      if (blinded && (vx !== 0 || vy !== 0)) {
        const err = Math.sin(tick * 0.27) * (wobbleScale || 0.65);
        const r = rotateVec(vx, vy, err);
        vx = r.x;
        vy = r.y;
      }
      const scr = worldDirToScreen(vx, vy);
      intent.moveX = scr.x;
      intent.moveY = scr.y;
    }

    function decide(self, target, city, cctx) {
      tick++;
      stateTicks++;
      const intent = makeEmptyIntent();
      if (!self || !target || self.hp <= 0) {
        clearTelegraph(self);
        return intent;
      }

      const blinded = (self.blindedTicks || 0) > 0;
      const dx = target.x - self.x;
      const dy = target.y - self.y;
      const dist = Math.hypot(dx, dy);
      const dirToTarget = U.vec2.norm(dx || 1, dy || 0);
      const aggroScale = blinded ? 0.32 : 1.0;

      if (actionCooldown > 0) actionCooldown--;
      if (params.isBoss && bossWreckTimer > 0) bossWreckTimer--;

      // Update delayed threat observation
      const tThreat = isTargetThreatening(target);
      if (tThreat && !threatWasActive) {
        threatDetectedTick = tick;
        threatEvalAt = tick + params.reactionDelay;
      }
      threatWasActive = tThreat;

      // 1. Knocked down / hitstun / stunned -> RECOVER
      if (isDownOrStunned(self)) {
        clearTelegraph(self);
        chainStep = 0;
        setState(STATES.RECOVER);
        return intent;
      }
      if (state === STATES.RECOVER) {
        if (self.state === 'getup') {
          return intent;
        }
        if ((self.hp / self.maxHp) < 0.30 && dist < 3.0) {
          retreatTimer = 28;
          setState(STATES.RETREAT);
        } else {
          setState(STATES.APPROACH);
        }
      }

      // 2. Carrying a prop -> THROW state
      if (self.carrying) {
        setState(STATES.THROW);
        clearTelegraph(self);
        if (dist > 4.4) {
          const st = steerAroundBuildings(self, dirToTarget.x, dirToTarget.y, city);
          applyAimMove(intent, self, st.x, st.y, blinded, 0.5);
        } else if (dist <= 1.65 && stateTicks >= 10) {
          applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.85);
          intent.heavy = true;
          actionCooldown = 22;
        } else if (stateTicks >= 12) {
          applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.85);
          intent.grab = true;
          actionCooldown = 22;
        } else {
          applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.6);
        }
        return intent;
      }

      // 3. Active mid-attack / special / dodge
      const midSwing = self.state === 'light1' || self.state === 'light2' ||
        self.state === 'light3' || self.state === 'heavy' || self.state === 'grab' ||
        self.state === 'special' || self.state === 'ultimate' || self.state === 'dodge';
      if (midSwing) {
        if (self.state === 'heavy' || self.state === 'special' || self.state === 'ultimate') {
          self.telegraphTicks = 0;
        }
        if ((self.state === 'light1' || self.state === 'light2') &&
            chainStep < chainTargetLen && dist <= 1.85 &&
            self.attack && self.stateTick >= self.attack.def.startup + 2) {
          chainStep++;
          applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.7);
          intent.light = true;
        } else if (self.state === 'special' || self.state === 'ultimate') {
          applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.45);
        }
        return intent;
      }

      // 4. Executing telegraphed Heavy / Special / Ultimate windup
      if (telegraphAction) {
        telegraphLeft--;
        self.telegraphTicks = Math.max(0, telegraphLeft);
        if (telegraphAction === 'heavy' && dist > 2.8 && (!self.stats.heavyMove || self.stats.heavyMove.kind !== 'rocket_fist')) {
          clearTelegraph(self);
        } else if (telegraphLeft <= 0) {
          const act = telegraphAction;
          clearTelegraph(self);
          applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.85);
          if (act === 'heavy') intent.heavy = true;
          else if (act === 'special') intent.specialPressed = true;
          else if (act === 'ultimate') intent.ultimatePressed = true;
          actionCooldown = 26;
          return intent;
        } else {
          // Hold stance briefly while telegraphing ("!" warning visible)
          applyAimMove(intent, self, dirToTarget.x * 0.25, dirToTarget.y * 0.25, blinded, 0.25);
          return intent;
        }
      }

      // 4b. Respect wake-up spacing: back off if player is knocked down, getting up, or in post-getup grace
      if (target.state === 'knockdown' || target.state === 'getup' || (target.wakeupGraceTicks || 0) > 0) {
        clearTelegraph(self);
        if (dist < 1.8) {
          const away = steerAroundBuildings(self, -dirToTarget.x, -dirToTarget.y, city);
          applyAimMove(intent, self, away.x, away.y, blinded, 0.35);
          return intent;
        }
        const tang = rotateVec(dirToTarget.x, dirToTarget.y, strafeSign * 1.25);
        const radial = dist < 2.15 ? -0.35 : (dist > 3.2 ? 0.25 : 0);
        const moveVec = steerAroundBuildings(self, tang.x + dirToTarget.x * radial, tang.y + dirToTarget.y * radial, city);
        applyAimMove(intent, self, moveVec.x, moveVec.y, blinded, 0.3);
        return intent;
      }

      // 5. Delayed reactive block / dodge check
      if (state === STATES.BLOCK_REACTIVE) {
        blockTimer--;
        intent.blockHeld = true;
        if (blockTimer <= 0 || self.guard < 14 || dist > 3.2) {
          setState(STATES.CIRCLE);
          circleDuration = 22 + Math.floor(rand() * 18);
          strafeSign = -strafeSign;
        }
        return intent;
      }

      if (tThreat && tick >= threatEvalAt && threatEvalAt > 0 && dist <= 2.7 && !blinded) {
        threatEvalAt = -999; // consume this threat reaction once
        const roll = rand();
        if (roll < params.dodgeProb && (self.dodgeCooldown || 0) <= 0 && self.grounded) {
          const perp = rotateVec(dirToTarget.x, dirToTarget.y, strafeSign * Math.PI * 0.5);
          applyAimMove(intent, self, perp.x, perp.y, false, 0);
          intent.dodgePressed = true;
          actionCooldown = 14;
          return intent;
        }
        if (roll < params.dodgeProb + params.blockProb && self.guard > 22) {
          blockTimer = 16 + Math.floor(rand() * 12);
          setState(STATES.BLOCK_REACTIVE);
          intent.blockHeld = true;
          return intent;
        }
      }

      // 6. Retreat when hurt / low guard / after heavy exchange
      if (state === STATES.RETREAT) {
        retreatTimer--;
        const healOrb = (self.hp / self.maxHp) < 0.7 ? findNearestPickup(self, cctx, 'health', 5.5) : null;
        if (healOrb) {
          const toOrb = U.vec2.norm(healOrb.x - self.x, healOrb.y - self.y);
          const st = steerAroundBuildings(self, toOrb.x, toOrb.y, city);
          applyAimMove(intent, self, st.x, st.y, blinded, 0.3);
        } else {
          const away = steerAroundBuildings(self, -dirToTarget.x, -dirToTarget.y, city);
          applyAimMove(intent, self, away.x, away.y, blinded, 0.35);
        }
        if (retreatTimer <= 0 || dist >= 4.2) {
          setState(STATES.CIRCLE);
          circleDuration = 24;
        }
        return intent;
      }

      // Trigger low-health retreat / health-orb seek occasionally
      if (actionCooldown <= 0 && (self.hp / self.maxHp) < 0.28 && dist < 2.2 && rand() < 0.45) {
        retreatTimer = 26 + Math.floor(rand() * 16);
        setState(STATES.RETREAT);
        return intent;
      }

      // 7. Boss round building-wrecking urge
      if (params.isBoss && bossWreckTimer <= 0 && !blinded) {
        bossWreckTimer = 240 + Math.floor(rand() * 120);
        bossDemolishLeft = 95;
      }
      if (params.isBoss && bossDemolishLeft > 0) {
        bossDemolishLeft--;
        const nb = findNearestBuilding(self, city, 5.2);
        if (nb) {
          const toB = U.vec2.norm(nb.cx - self.x, nb.cy - self.y);
          applyAimMove(intent, self, toB.x, toB.y, blinded, 0.25);
          if (nb.d <= 2.0 && actionCooldown <= 0) {
            if (self.fuel >= 35 && rand() < 0.35) {
              startTelegraph(self, 'special', 12);
            } else {
              startTelegraph(self, 'heavy', 11);
            }
          }
          return intent;
        }
        bossDemolishLeft = 0;
      }

      // 8. Prop pickup opportunity
      if (state === STATES.PICKUP_PROP) {
        const prop = findNearestProp(self, cctx, 5.5);
        if (!prop || stateTicks > 110 || (targetPropId !== null && prop.id !== targetPropId && dist < 2.0)) {
          targetPropId = null;
          setState(STATES.APPROACH);
        } else {
          const pd = Math.hypot(prop.x - self.x, prop.y - self.y);
          const toP = U.vec2.norm(prop.x - self.x, prop.y - self.y);
          const st = steerAroundBuildings(self, toP.x, toP.y, city);
          applyAimMove(intent, self, st.x, st.y, blinded, 0.45);
          if (pd <= 1.25) {
            intent.grab = true;
            targetPropId = null;
          }
          return intent;
        }
      }

      const richProps = !!(cctx && cctx.props && cctx.props.length >= 4);
      const minPropDist = richProps ? 1.7 : 2.2;
      if (!blinded && actionCooldown <= 0 && dist >= minPropDist && dist <= 5.8 && stateTicks > (richProps ? 10 : 20)) {
        const candProp = findNearestProp(self, cctx, 4.8);
        const pChance = richProps ? Math.max(0.35, params.propProb * 0.28) : (params.propProb * 0.08);
        if (candProp && rand() < pChance) {
          targetPropId = candProp.id;
          setState(STATES.PICKUP_PROP);
          return intent;
        }
      }

      // Fuel/health orb opportunism when near
      const wantOrb = (self.hp < self.maxHp * 0.72) ? 'health' : (self.fuel < 70 ? 'fuel' : null);
      if (wantOrb && dist > 2.3) {
        const orb = findNearestPickup(self, cctx, wantOrb, 3.0);
        if (orb) {
          const toO = U.vec2.norm(orb.x - self.x, orb.y - self.y);
          applyAimMove(intent, self, toO.x, toO.y, blinded, 0.3);
          return intent;
        }
      }

      // 9. Special / Meltdown evaluation when ready
      const specDef = self.stats.specials && self.stats.specials.special;
      const specCost = (specDef && specDef.cost) || 35;
      if (actionCooldown <= 0 && !blinded) {
        if (self.fuel >= self.fuelMax && dist <= 3.6 && rand() < (params.specialProb * 0.35 + 0.20)) {
          startTelegraph(self, 'ultimate', 14);
          return intent;
        }
        if (self.fuel >= specCost && (self.specialCooldown || 0) <= 0 && dist >= 1.6 && dist <= 5.0 &&
            rand() < params.specialProb * 0.12) {
          startTelegraph(self, 'special', 13);
          return intent;
        }
      }

      // 10. Tin Colossus Rocket Fist ranged heavy probe
      if (!blinded && actionCooldown <= 0 && self.stats.heavyMove && self.stats.heavyMove.kind === 'rocket_fist' &&
          !self.fistOut && dist >= 2.2 && dist <= 4.8 && rand() < 0.06 * aggroScale) {
        startTelegraph(self, 'heavy', 12);
        return intent;
      }

      // 11. Close combat ATTACK_CHAIN vs CIRCLE vs APPROACH
      const strikeRange = 1.68;
      if (dist <= strikeRange) {
        if (state === STATES.APPROACH) {
          if (blinded || rand() < 0.32) {
            circleDuration = blinded ? 38 : (18 + Math.floor(rand() * 20));
            strafeSign = rand() < 0.5 ? 1 : -1;
            setState(STATES.CIRCLE);
          } else {
            setState(STATES.ATTACK_CHAIN);
          }
        }
        if (state === STATES.ATTACK_CHAIN && actionCooldown <= 0) {
          if (blinded && rand() > 0.32) {
            circleDuration = 30;
            setState(STATES.CIRCLE);
          } else {
            applyAimMove(intent, self, dirToTarget.x, dirToTarget.y, blinded, 0.75);
            // Break turtles with grab!
            if (target.state === 'block' && rand() < 0.45 * aggroScale) {
              intent.grab = true;
              actionCooldown = 26;
            } else if (rand() < params.heavyProb * aggroScale) {
              startTelegraph(self, 'heavy', 13);
            } else {
              chainStep = 1;
              chainTargetLen = params.chainMax;
              intent.light = true;
              actionCooldown = Math.max(12, 24 - params.round * 2);
            }
            return intent;
          }
        }
      }

      if (state === STATES.CIRCLE) {
        const tang = rotateVec(dirToTarget.x, dirToTarget.y, strafeSign * 1.15);
        const radial = dist > 2.4 ? 0.35 : (dist < 1.35 ? -0.35 : 0);
        const moveVec = steerAroundBuildings(self, tang.x + dirToTarget.x * radial, tang.y + dirToTarget.y * radial, city);
        applyAimMove(intent, self, moveVec.x, moveVec.y, blinded, 0.4);
        if (stateTicks >= circleDuration) {
          if (dist <= strikeRange + 0.2 && (!blinded || rand() < 0.35)) {
            setState(STATES.ATTACK_CHAIN);
          } else {
            setState(STATES.APPROACH);
          }
        }
        return intent;
      }

      // Default: APPROACH
      setState(STATES.APPROACH);
      const st = steerAroundBuildings(self, dirToTarget.x, dirToTarget.y, city);
      applyAimMove(intent, self, st.x, st.y, blinded, 0.55);
      // Lepidora / Tin Colossus occasional aerial approach
      if (dist > 3.6 && self.grounded && rand() < 0.012 * aggroScale) {
        if (self.monsterId === 'lepidora' || self.monsterId === 'tin_colossus') {
          intent.jumpPressed = true;
        }
      }
      return intent;
    }

    return {
      decide: decide,
      getState: function () {
        return {
          state: state,
          round: params.round,
          isBoss: params.isBoss,
          reactionDelay: params.reactionDelay,
          blockProb: params.blockProb,
          specialProb: params.specialProb,
          propProb: params.propProb,
          telegraphing: !!telegraphAction
        };
      }
    };
  }

  KB.AI = {
    STATES: STATES,
    getDifficultyParams: getDifficultyParams,
    createController: createController
  };
})();
