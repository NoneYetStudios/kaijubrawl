/* Kaiju Brawl - layered isometric renderer (ground cache, backdrop, shadows, 2.5D buildings, debug). */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const Iso = KB.Iso;
  const U = KB.Util;
  const INK = '#1b1209';

  let groundCache = {
    cityId: null,
    canvas: null,
    originX: 0,
    originY: 0
  };

  function shadeHex(col, amt) {
    let r, g, b;
    if (col && col.indexOf('rgb') === 0) {
      const m = col.match(/\d+/g);
      r = m ? parseInt(m[0], 10) : 128;
      g = m ? parseInt(m[1], 10) : 128;
      b = m ? parseInt(m[2], 10) : 128;
    } else {
      let h = String(col || '#888888').replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const num = parseInt(h, 16) || 0;
      r = (num >> 16) & 255;
      g = (num >> 8) & 255;
      b = num & 255;
    }
    r = U.clamp(r + amt, 0, 255);
    g = U.clamp(g + amt, 0, 255);
    b = U.clamp(b + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function traceTile(ctx, x0, y0, x1, y1, ox, oy) {
    const pN = Iso.worldToScreen(x0, y0, 0);
    const pE = Iso.worldToScreen(x1, y0, 0);
    const pS = Iso.worldToScreen(x1, y1, 0);
    const pW = Iso.worldToScreen(x0, y1, 0);
    ctx.beginPath();
    ctx.moveTo(pN.sx + ox, pN.sy + oy);
    ctx.lineTo(pE.sx + ox, pE.sy + oy);
    ctx.lineTo(pS.sx + ox, pS.sy + oy);
    ctx.lineTo(pW.sx + ox, pW.sy + oy);
    ctx.closePath();
  }

  function ensureGroundCache(city) {
    if (groundCache.cityId === city.id && groundCache.canvas) return groundCache;

    const cols = city.cols;
    const rows = city.rows;
    const minSx = -rows * Iso.HALF_W;
    const maxSx = cols * Iso.HALF_W;
    const minSy = 0;
    const maxSy = (cols + rows) * Iso.HALF_H;
    const pad = 32;

    const w = Math.ceil(maxSx - minSx + pad * 2);
    const h = Math.ceil(maxSy - minSy + pad * 2);
    const ox = -minSx + pad;
    const oy = -minSy + pad;

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const g = off.getContext('2d');
    const pal = city.palette;
    const rand = U.rng(1954);

    // Arena foundation / slab rim
    const pE = Iso.worldToScreen(cols, 0, 0);
    const pS = Iso.worldToScreen(cols, rows, 0);
    const pW = Iso.worldToScreen(0, rows, 0);
    const rim = 16;

    g.fillStyle = shadeHex(pal.curb, -18);
    g.beginPath();
    g.moveTo(pW.sx + ox, pW.sy + oy);
    g.lineTo(pS.sx + ox, pS.sy + oy);
    g.lineTo(pS.sx + ox, pS.sy + oy + rim);
    g.lineTo(pW.sx + ox, pW.sy + oy + rim);
    g.closePath();
    g.fill();

    g.fillStyle = shadeHex(pal.curb, -32);
    g.beginPath();
    g.moveTo(pS.sx + ox, pS.sy + oy);
    g.lineTo(pE.sx + ox, pE.sy + oy);
    g.lineTo(pE.sx + ox, pE.sy + oy + rim);
    g.lineTo(pS.sx + ox, pS.sy + oy + rim);
    g.closePath();
    g.fill();

    function isRoadTile(x, y) {
      for (let i = 0; i < city.roads.vertical.length; i++) {
        const r = city.roads.vertical[i];
        if (x >= r.x0 && x < r.x1) return true;
      }
      for (let i = 0; i < city.roads.horizontal.length; i++) {
        const r = city.roads.horizontal[i];
        if (y >= r.y0 && y < r.y1) return true;
      }
      return false;
    }

    function isSidewalkTile(x, y) {
      if (isRoadTile(x, y)) return false;
      return isRoadTile(x - 1, y) || isRoadTile(x + 1, y) || isRoadTile(x, y - 1) || isRoadTile(x, y + 1);
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const road = isRoadTile(x, y);
        const walk = !road && isSidewalkTile(x, y);
        traceTile(g, x, y, x + 1, y + 1, ox, oy);

        if (road) {
          g.fillStyle = pal.road;
        } else if (walk) {
          g.fillStyle = pal.sidewalk;
        } else {
          g.fillStyle = ((x + y) % 2 === 0) ? pal.grassA : pal.grassB;
        }
        g.fill();

        g.strokeStyle = road ? 'rgba(255,255,255,0.04)' : 'rgba(27,18,9,0.09)';
        g.lineWidth = 1;
        g.stroke();

        if (!road && !walk && rand() < 0.35) {
          const c = Iso.worldToScreen(x + 0.3 + rand() * 0.4, y + 0.3 + rand() * 0.4, 0);
          g.fillStyle = 'rgba(25, 70, 30, 0.22)';
          g.beginPath();
          g.ellipse(c.sx + ox, c.sy + oy, 5, 2.5, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    // Road centerlines (dashed yellow)
    g.strokeStyle = pal.lane;
    g.lineWidth = 2.5;
    g.setLineDash([12, 12]);
    city.roads.vertical.forEach(function (r) {
      const mx = (r.x0 + r.x1) * 0.5;
      const a = Iso.worldToScreen(mx, 0.3, 0);
      const b = Iso.worldToScreen(mx, rows - 0.3, 0);
      g.beginPath();
      g.moveTo(a.sx + ox, a.sy + oy);
      g.lineTo(b.sx + ox, b.sy + oy);
      g.stroke();
    });
    city.roads.horizontal.forEach(function (r) {
      const my = (r.y0 + r.y1) * 0.5;
      const a = Iso.worldToScreen(0.3, my, 0);
      const b = Iso.worldToScreen(cols - 0.3, my, 0);
      g.beginPath();
      g.moveTo(a.sx + ox, a.sy + oy);
      g.lineTo(b.sx + ox, b.sy + oy);
      g.stroke();
    });
    g.setLineDash([]);

    // Concrete foundation pads under buildings
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      traceTile(g, b.fx0 - 0.06, b.fy0 - 0.06, b.fx1 + 0.06, b.fy1 + 0.06, ox, oy);
      g.fillStyle = 'rgba(40, 36, 30, 0.32)';
      g.fill();
    }

    traceTile(g, 0, 0, cols, rows, ox, oy);
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.stroke();

    groundCache = {
      cityId: city.id,
      canvas: off,
      originX: ox,
      originY: oy
    };
    return groundCache;
  }

  function drawBackdrop(ctx, city, cam, view, timeSec) {
    const pal = city.palette;
    const W = view.w;
    const H = view.h;

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(0.55, pal.skyMid);
    grad.addColorStop(1, pal.skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const cloudDrift = (timeSec * 12) % (W + 400);
    const parallaxX = -cam.x * 0.06;
    ctx.fillStyle = 'rgba(255, 252, 240, 0.55)';
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 290 + cloudDrift + parallaxX) % (W + 320)) - 160;
      const by = H * (0.1 + (i % 3) * 0.07);
      ctx.beginPath();
      ctx.ellipse(bx, by, 58, 22, 0, 0, Math.PI * 2);
      ctx.ellipse(bx - 30, by + 6, 36, 16, 0, 0, Math.PI * 2);
      ctx.ellipse(bx + 32, by + 8, 40, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const horizon = H * 0.42 - cam.y * 0.05;
    ctx.fillStyle = pal.hillFar;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 80; x += 80) {
      const hOff = Math.sin((x - cam.x * 0.08) * 0.006) * 34 + Math.cos((x - cam.x * 0.08) * 0.015) * 16;
      ctx.lineTo(x, horizon - hOff);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.hillNear;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 60; x += 60) {
      const hOff = Math.cos((x - cam.x * 0.14) * 0.008 + 1.2) * 26 + Math.sin((x - cam.x * 0.14) * 0.02) * 10;
      ctx.lineTo(x, horizon + 26 - hOff);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawIsoBox(ctx, fx0, fy0, fx1, fy1, z0, z1, leftCol, rightCol, topCol, strokeCol) {
    const bW = Iso.worldToScreen(fx0, fy1, z0);
    const bS = Iso.worldToScreen(fx1, fy1, z0);
    const bE = Iso.worldToScreen(fx1, fy0, z0);

    const tN = Iso.worldToScreen(fx0, fy0, z1);
    const tE = Iso.worldToScreen(fx1, fy0, z1);
    const tS = Iso.worldToScreen(fx1, fy1, z1);
    const tW = Iso.worldToScreen(fx0, fy1, z1);

    ctx.fillStyle = leftCol;
    ctx.beginPath();
    ctx.moveTo(bW.sx, bW.sy);
    ctx.lineTo(bS.sx, bS.sy);
    ctx.lineTo(tS.sx, tS.sy);
    ctx.lineTo(tW.sx, tW.sy);
    ctx.closePath();
    ctx.fill();
    if (strokeCol) {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = rightCol;
    ctx.beginPath();
    ctx.moveTo(bS.sx, bS.sy);
    ctx.lineTo(bE.sx, bE.sy);
    ctx.lineTo(tE.sx, tE.sy);
    ctx.lineTo(tS.sx, tS.sy);
    ctx.closePath();
    ctx.fill();
    if (strokeCol) {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = topCol;
    ctx.beginPath();
    ctx.moveTo(tN.sx, tN.sy);
    ctx.lineTo(tE.sx, tE.sy);
    ctx.lineTo(tS.sx, tS.sy);
    ctx.lineTo(tW.sx, tW.sy);
    ctx.closePath();
    ctx.fill();
    if (strokeCol) {
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawWallWindows(ctx, xA, yA, xB, yB, zLow, zHigh, cols, rows, seed, damaged) {
    const rand = U.rng(seed);
    for (let r = 0; r < rows; r++) {
      const z0 = U.lerp(zLow, zHigh, (r + 0.25) / rows);
      const z1 = U.lerp(zLow, zHigh, (r + 0.72) / rows);
      for (let c = 0; c < cols; c++) {
        const roll = rand();
        if (damaged && roll < 0.44) {
          // Broken/missing black window cavity
          const t0 = (c + 0.22) / cols;
          const t1 = (c + 0.78) / cols;
          const wx0 = U.lerp(xA, xB, t0);
          const wy0 = U.lerp(yA, yB, t0);
          const wx1 = U.lerp(xA, xB, t1);
          const wy1 = U.lerp(yA, yB, t1);
          const p00 = Iso.worldToScreen(wx0, wy0, z0);
          const p10 = Iso.worldToScreen(wx1, wy1, z0);
          const p11 = Iso.worldToScreen(wx1, wy1, z1);
          const p01 = Iso.worldToScreen(wx0, wy0, z1);
          ctx.fillStyle = '#15191e';
          ctx.beginPath();
          ctx.moveTo(p00.sx, p00.sy);
          ctx.lineTo(p10.sx, p10.sy);
          ctx.lineTo(p11.sx, p11.sy);
          ctx.lineTo(p01.sx, p01.sy);
          ctx.closePath();
          ctx.fill();
          continue;
        }
        const t0 = (c + 0.22) / cols;
        const t1 = (c + 0.78) / cols;
        const wx0 = U.lerp(xA, xB, t0);
        const wy0 = U.lerp(yA, yB, t0);
        const wx1 = U.lerp(xA, xB, t1);
        const wy1 = U.lerp(yA, yB, t1);

        const p00 = Iso.worldToScreen(wx0, wy0, z0);
        const p10 = Iso.worldToScreen(wx1, wy1, z0);
        const p11 = Iso.worldToScreen(wx1, wy1, z1);
        const p01 = Iso.worldToScreen(wx0, wy0, z1);

        ctx.fillStyle = (!damaged && roll < 0.38) ? '#ffe794' : '#2c465e';
        ctx.beginPath();
        ctx.moveTo(p00.sx, p00.sy);
        ctx.lineTo(p10.sx, p10.sy);
        ctx.lineTo(p11.sx, p11.sy);
        ctx.lineTo(p01.sx, p01.sy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawWallCracks(ctx, xA, yA, xB, yB, zLow, zHigh, seed) {
    const rand = U.rng(seed + 77);
    ctx.save();
    ctx.strokeStyle = '#1b1209';
    ctx.lineWidth = 2.2;
    for (let k = 0; k < 2; k++) {
      const tStart = 0.22 + rand() * 0.55;
      const zStart = U.lerp(zLow + 6, zHigh - 6, 0.3 + rand() * 0.6);
      const p0 = Iso.worldToScreen(U.lerp(xA, xB, tStart), U.lerp(yA, yB, tStart), zStart);
      const p1 = Iso.worldToScreen(U.lerp(xA, xB, tStart + 0.08), U.lerp(yA, yB, tStart + 0.08), zStart - 10);
      const p2 = Iso.worldToScreen(U.lerp(xA, xB, tStart - 0.04), U.lerp(yA, yB, tStart - 0.04), zStart - 20);
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRubblePile(ctx, b) {
    const box = KB.Entities ? KB.Entities.getBuildingCollBox(b) : { x0: b.fx0, y0: b.fy0, x1: b.fx1, y1: b.fy1 };
    const cx = (box.x0 + box.x1) * 0.5;
    const cy = (box.y0 + box.y1) * 0.5;
    const h = Math.max(7, b.zTop);
    const leftCol = shadeHex(b.color, -48);
    const rightCol = shadeHex(b.color, -32);
    const topCol = '#7a7368';

    ctx.save();
    if (b.type === 'gas_station') {
      const gp = Iso.worldToScreen(cx, cy, 0);
      ctx.fillStyle = 'rgba(20, 18, 16, 0.52)';
      ctx.beginPath();
      ctx.ellipse(gp.sx, gp.sy, 68, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main low concrete rubble core + fractured slabs
    drawIsoBox(ctx, box.x0 + 0.1, box.y0 + 0.1, box.x1 - 0.1, box.y1 - 0.1, 0, h * 0.65, leftCol, rightCol, topCol, INK);
    drawIsoBox(ctx, box.x0 + 0.25, box.y0 + 0.2, box.x1 - 0.3, box.y1 - 0.25, h * 0.55, h, shadeHex(b.roof, -35), shadeHex(b.roof, -20), shadeHex(b.roof, -10), INK);

    // Jagged rebar / beam shards sticking out
    const rand = U.rng(b.seed || b.id * 41);
    ctx.strokeStyle = '#3b4248';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      const rx = U.lerp(box.x0 + 0.2, box.x1 - 0.2, rand());
      const ry = U.lerp(box.y0 + 0.2, box.y1 - 0.2, rand());
      const p0 = Iso.worldToScreen(rx, ry, h * 0.5);
      const p1 = Iso.worldToScreen(rx + (rand() - 0.5) * 0.25, ry + (rand() - 0.5) * 0.25, h + 8 + rand() * 8);
      ctx.beginPath();
      ctx.moveTo(p0.sx, p0.sy);
      ctx.lineTo(p1.sx, p1.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBuilding(ctx, b) {
    if (b.state === 'rubble' && b.collapseTick <= 0) {
      drawRubblePile(ctx, b);
      return;
    }

    const shakePx = (b.crackTicks > 0 || b.shakeT > 0) ? Math.sin((b.crackTicks + b.shakeT) * 2.3) * 3.8 : 0;
    const h = b.zTop;
    const damaged = b.state === 'damaged';
    const collapsing = b.state === 'rubble';
    const flash = b.hitFlash > 0;
    const baseCol = flash ? '#fff6dc' : (damaged || collapsing ? shadeHex(b.color, -18) : b.color);
    const leftWall = flash ? '#fffdf4' : shadeHex(baseCol, -28);
    const rightWall = flash ? '#ffffff' : shadeHex(baseCol, -8);
    const roofCol = flash ? '#ffe8a3' : (damaged ? shadeHex(b.roof, -18) : b.roof);

    ctx.save();
    if (shakePx !== 0) ctx.translate(shakePx, 0);

    if (collapsing) {
      drawRubblePile(ctx, b);
      ctx.restore();
      return;
    }

    if (b.type === 'water_tower') {
      const cx0 = b.fx0 + 0.15, cx1 = b.fx1 - 0.15;
      const cy0 = b.fy0 + 0.15, cy1 = b.fy1 - 0.15;
      const legZ = h * 0.56;
      const corners = [[cx0, cy0], [cx1, cy0], [cx1, cy1], [cx0, cy1]];
      ctx.strokeStyle = flash ? '#ffffff' : '#3f4b56';
      ctx.lineWidth = 4;
      for (let i = 0; i < corners.length; i++) {
        const bot = Iso.worldToScreen(corners[i][0], corners[i][1], 0);
        const top = Iso.worldToScreen(corners[i][0] + (damaged ? 0.04 : 0), corners[i][1], legZ);
        ctx.beginPath();
        ctx.moveTo(bot.sx, bot.sy);
        ctx.lineTo(top.sx, top.sy);
        ctx.stroke();
      }
      drawIsoBox(ctx, b.fx0 + 0.08, b.fy0 + 0.08, b.fx1 - 0.08, b.fy1 - 0.08, legZ, h * 0.88, leftWall, rightWall, roofCol, INK);
      const rMid = Iso.worldToScreen((b.fx0 + b.fx1) * 0.5 + (damaged ? 0.08 : 0), (b.fy0 + b.fy1) * 0.5, h);
      const tE = Iso.worldToScreen(b.fx1 - 0.08, b.fy0 + 0.08, h * 0.88);
      const tS = Iso.worldToScreen(b.fx1 - 0.08, b.fy1 - 0.08, h * 0.88);
      const tW = Iso.worldToScreen(b.fx0 + 0.08, b.fy1 - 0.08, h * 0.88);
      ctx.fillStyle = shadeHex(roofCol, 12);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tW.sx, tW.sy);
      ctx.lineTo(tS.sx, tS.sy);
      ctx.lineTo(rMid.sx, rMid.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shadeHex(roofCol, -12);
      ctx.beginPath();
      ctx.moveTo(tS.sx, tS.sy);
      ctx.lineTo(tE.sx, tE.sy);
      ctx.lineTo(rMid.sx, rMid.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (damaged) drawWallCracks(ctx, b.fx0 + 0.08, b.fy1 - 0.08, b.fx1 - 0.08, b.fy1 - 0.08, legZ, h * 0.88, b.seed);
      ctx.restore();
      return;
    }

    if (b.type === 'landmark') {
      drawIsoBox(ctx, b.fx0, b.fy0, b.fx0 + 1.0, b.fy0 + 1.0, 0, Math.min(34, h * 0.35), '#8c8370', '#a39984', roofCol, INK);
      drawIsoBox(ctx, b.fx0 + 0.25, b.fy0 + 0.15, b.fx1 - 0.15, b.fy0 + 0.6, 22, h, leftWall, rightWall, roofCol, INK);
      const sBL = Iso.worldToScreen(b.fx0 + 0.35, b.fy0 + 0.62, 30);
      const sBR = Iso.worldToScreen(b.fx1 - 0.25, b.fy0 + 0.62, 30);
      const sTR = Iso.worldToScreen(b.fx1 - 0.25, b.fy0 + 0.62, h - (damaged ? 16 : 10));
      const sTL = Iso.worldToScreen(b.fx0 + 0.35, b.fy0 + 0.62, h - 10);
      ctx.fillStyle = flash ? '#ffffff' : (damaged ? '#d4c9a8' : '#f1e3b9');
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sBL.sx, sBL.sy);
      ctx.lineTo(sBR.sx, sBR.sy);
      ctx.lineTo(sTR.sx, sTR.sy);
      ctx.lineTo(sTL.sx, sTL.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      const midX = (sBL.sx + sTR.sx) * 0.5;
      const midY = (sBL.sy + sTR.sy) * 0.5;
      ctx.fillStyle = '#c1272d';
      ctx.beginPath();
      ctx.arc(midX, midY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1b1209';
      ctx.font = 'bold 10px Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BIJOU', midX, midY - 22);
      if (damaged) drawWallCracks(ctx, b.fx0 + 0.35, b.fy0 + 0.62, b.fx1 - 0.25, b.fy0 + 0.62, 30, h - 12, b.seed);
      ctx.restore();
      return;
    }

    const wallTop = (b.type === 'house') ? h * 0.74 : h;
    drawIsoBox(ctx, b.fx0, b.fy0, b.fx1, b.fy1, 0, wallTop, leftWall, rightWall, roofCol, INK);

    if (b.type === 'house') {
      const ridgeY = (b.fy0 + b.fy1) * 0.5;
      const tiltOff = damaged ? -6 : 0;
      const rA = Iso.worldToScreen(b.fx0 + 0.1, ridgeY, h);
      const rB = Iso.worldToScreen(b.fx1 - 0.1, ridgeY, h + tiltOff);
      const cNW = Iso.worldToScreen(b.fx0, b.fy0, wallTop);
      const cNE = Iso.worldToScreen(b.fx1, b.fy0, wallTop + tiltOff);
      const cSE = Iso.worldToScreen(b.fx1, b.fy1, wallTop + tiltOff);
      const cSW = Iso.worldToScreen(b.fx0, b.fy1, wallTop);

      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      ctx.moveTo(cSW.sx, cSW.sy);
      ctx.lineTo(cSE.sx, cSE.sy);
      ctx.lineTo(rB.sx, rB.sy);
      ctx.lineTo(rA.sx, rA.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = shadeHex(roofCol, -25);
      ctx.beginPath();
      ctx.moveTo(cSE.sx, cSE.sy);
      ctx.lineTo(cNE.sx, cNE.sy);
      ctx.lineTo(rB.sx, rB.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = shadeHex(roofCol, 14);
      ctx.beginPath();
      ctx.moveTo(cNW.sx, cNW.sy);
      ctx.lineTo(cNE.sx, cNE.sy);
      ctx.lineTo(rB.sx, rB.sy);
      ctx.lineTo(rA.sx, rA.sy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      drawWallWindows(ctx, b.fx0, b.fy1, b.fx1, b.fy1, 8, wallTop - 6, 2, 1, b.id * 17, damaged);
      drawWallWindows(ctx, b.fx1, b.fy0, b.fx1, b.fy1, 8, wallTop - 6, 2, 1, b.id * 31, damaged);
    } else if (b.type === 'office' || b.type === 'theater') {
      const stories = b.type === 'office' ? 4 : 3;
      drawWallWindows(ctx, b.fx0, b.fy1, b.fx1, b.fy1, 10, wallTop - 8, 3, stories, b.id * 23, damaged);
      drawWallWindows(ctx, b.fx1, b.fy0, b.fx1, b.fy1, 10, wallTop - 8, 3, stories, b.id * 41, damaged);

      if (b.type === 'theater') {
        drawIsoBox(ctx, b.fx0 + 0.2, b.fy1 - 0.05, b.fx1 - 0.2, b.fy1 + 0.25, 22, 34, '#c1272d', '#9e1c22', '#ffd23f', INK);
      }
    } else if (b.type === 'shop' || b.type === 'diner') {
      drawWallWindows(ctx, b.fx0, b.fy1, b.fx1, b.fy1, 10, wallTop - 10, 3, 1, b.id * 19, damaged);
      drawWallWindows(ctx, b.fx1, b.fy0, b.fx1, b.fy1, 10, wallTop - 10, 2, 1, b.id * 29, damaged);
      const stripeCol = b.type === 'diner' ? '#ffd23f' : '#c1272d';
      drawIsoBox(ctx, b.fx0 + 0.1, b.fy1 - 0.05, b.fx1 - 0.1, b.fy1 + 0.18, 20, 28, stripeCol, shadeHex(stripeCol, -20), '#f1e3b9', INK);
    } else if (b.type === 'gas_station') {
      drawIsoBox(ctx, b.fx0 + 0.15, b.fy1 - 0.25, b.fx0 + 0.45, b.fy1 - 0.05, 0, 22, '#c1272d', '#e8e0cc', '#ffd23f', INK);
      drawIsoBox(ctx, b.fx0 + 0.85, b.fy1 - 0.25, b.fx0 + 1.15, b.fy1 - 0.05, 0, 22, '#c1272d', '#e8e0cc', '#ffd23f', INK);
    }

    if (damaged) {
      drawWallCracks(ctx, b.fx0, b.fy1, b.fx1, b.fy1, 6, wallTop - 4, b.seed);
      drawWallCracks(ctx, b.fx1, b.fy0, b.fx1, b.fy1, 6, wallTop - 4, b.seed + 19);
    }

    ctx.restore();
  }

  function drawSimpleLimb(ctx, x, y, rot, w, h, r, fillCol, clawCol, clawCount) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = fillCol;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-w * 0.5, 0, w, h, r);
    ctx.fill();
    ctx.stroke();
    if (clawCol && clawCount > 0) {
      ctx.fillStyle = clawCol;
      for (let i = 0; i < clawCount; i++) {
        const cx = -w * 0.25 + i * (w * 0.25);
        ctx.beginPath();
        ctx.moveTo(cx - 2, h - 1);
        ctx.lineTo(cx, h + 6);
        ctx.lineTo(cx + 2, h - 1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGorgantorBody(ctx, k, p) {
    const cols = k.stats.colors;
    const hit = k.hitFlash > 0;
    const bodyCol = hit ? '#ffffff' : cols.body;
    const tBase = k.animT * 4.2 + (p.walking ? k.walkPhase * 0.55 : 0);
    const s1y = -18 + Math.sin(tBase - 0.6) * 4;
    const s2y = -13 + Math.sin(tBase - 1.5) * 7;
    const s3y = -17 + Math.sin(tBase - 2.4) * 10;

    // 1. Tail + dorsal spikes
    ctx.fillStyle = cols.shade;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-10, -14);
    ctx.quadraticCurveTo(-28, s1y - 10, -44, s2y - 5);
    ctx.quadraticCurveTo(-56, s3y - 2, -62, s3y);
    ctx.quadraticCurveTo(-50, s3y + 7, -40, s2y + 8);
    ctx.quadraticCurveTo(-24, s1y + 12, -8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = cols.accent;
    for (let i = 0; i < 3; i++) {
      const tx = -22 - i * 14;
      const ty = i === 0 ? s1y - 6 : (i === 1 ? s2y - 4 : s3y - 2);
      ctx.beginPath();
      ctx.moveTo(tx - 4, ty + 2);
      ctx.lineTo(tx - 1, ty - 7);
      ctx.lineTo(tx + 4, ty + 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 2. Back leg & arm
    drawSimpleLimb(ctx, -9, -22, -p.stride * 0.35, 16, 23, 6, cols.shade, null, 0);
    ctx.save();
    ctx.translate(-9, -22);
    ctx.rotate(-p.stride * 0.35);
    ctx.fillStyle = '#f1e3b9';
    ctx.beginPath();
    ctx.ellipse(2, 22, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawSimpleLimb(ctx, 10, -56, -p.stride * 0.45 - 0.2 + p.armAngle * 0.55, 11, 20 + p.armExtend * 0.4, 5, cols.shade, null, 0);

    // 3. Rubber-suit torso & ribbed belly
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-22, -22);
    ctx.quadraticCurveTo(-27, -48, -16, -72);
    ctx.quadraticCurveTo(0, -82, 18, -70);
    ctx.quadraticCurveTo(26, -46, 20, -22);
    ctx.quadraticCurveTo(0, -14, -22, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!p.backFacing) {
      ctx.fillStyle = hit ? '#fff6d6' : cols.belly;
      ctx.beginPath();
      ctx.ellipse(4, -44, 13, 22, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = cols.shade;
      ctx.lineWidth = 1.6;
      for (let ry = -56; ry <= -32; ry += 8) {
        ctx.beginPath();
        ctx.moveTo(-6, ry);
        ctx.quadraticCurveTo(5, ry + 3, 14, ry);
        ctx.stroke();
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(-4, -70);
      ctx.lineTo(-6, -24);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5;
    }

    // 4. Dorsal plates
    const spineX = p.backFacing ? -4 : -18;
    ctx.fillStyle = cols.accent;
    for (let i = 0; i < 4; i++) {
      const py = -72 + i * 13;
      const px = spineX - i * 1.5;
      ctx.beginPath();
      ctx.moveTo(px + 2, py - 5);
      ctx.lineTo(px - 11, py);
      ctx.lineTo(px + 2, py + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 5. Front leg
    drawSimpleLimb(ctx, 8, -22, p.stride * 0.38, 17, 23, 6, bodyCol, null, 0);
    ctx.save();
    ctx.translate(8, -22);
    ctx.rotate(p.stride * 0.38);
    ctx.fillStyle = '#f1e3b9';
    ctx.beginPath();
    ctx.ellipse(3, 22, 10, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 6. Head & chomping jaw
    const chompOpen = ((k.attack && k.attack.name === 'heavy' && k.attack.active) || k.state === 'special');
    ctx.save();
    ctx.translate(4, -82);
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.moveTo(-14, 6);
    ctx.quadraticCurveTo(-16, -16, 2, -18);
    ctx.lineTo(24, -12);
    ctx.quadraticCurveTo(28, chompOpen ? -4 : -4, 22, chompOpen ? -1 : 2);
    ctx.lineTo(chompOpen ? 10 : 8, chompOpen ? 2 : 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (chompOpen && !p.backFacing) {
      ctx.fillStyle = cols.shade;
      ctx.beginPath();
      ctx.moveTo(4, 3);
      ctx.lineTo(23, 7);
      ctx.lineTo(18, 12);
      ctx.lineTo(2, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = cols.accent;
    ctx.beginPath();
    ctx.moveTo(-8, -14);
    ctx.lineTo(-14, -24);
    ctx.lineTo(0, -17);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!p.backFacing) {
      ctx.fillStyle = '#f1e3b9';
      for (let tx = 10; tx <= 20; tx += 5) {
        ctx.beginPath();
        ctx.moveTo(tx - 2, chompOpen ? -1 : 1);
        ctx.lineTo(tx, chompOpen ? 4 : 6);
        ctx.lineTo(tx + 2, chompOpen ? -1 : 1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = cols.eye;
      ctx.beginPath();
      ctx.ellipse(9, -8, 4, 3, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // 7. Front arm
    drawSimpleLimb(ctx, -4, -54, p.stride * 0.45 + 0.15 + p.armAngle, 12, 20 + p.armExtend, 5, bodyCol, '#f1e3b9', 3);
  }

  function drawMongoBody(ctx, k, p) {
    const cols = k.stats.colors;
    const hit = k.hitFlash > 0;
    const bodyCol = hit ? '#ffffff' : cols.body;
    const rageSpin = k.state === 'ultimate' ? Math.sin(k.animT * 24) * 0.25 : 0;

    if (k.state === 'ultimate') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 130, 62, 0.72)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, -42, 42, 46, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Back leg (stocky ape stance)
    drawSimpleLimb(ctx, -12, -23, -p.stride * 0.34, 18, 24, 6, cols.shade, null, 0);
    // Long knuckle-walker back arm
    drawSimpleLimb(ctx, 14, -64, -p.stride * 0.4 - 0.15 + p.armAngle * 0.65 + rageSpin, 14, 32 + p.armExtend * 0.5, 6, cols.shade, cols.accent, 2);

    // Broad muscular hunched shoulders & torso
    ctx.fillStyle = bodyCol;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-26, -24);
    ctx.quadraticCurveTo(-34, -52, -22, -76);
    ctx.quadraticCurveTo(0, -88, 24, -74);
    ctx.quadraticCurveTo(32, -52, 22, -24);
    ctx.quadraticCurveTo(0, -16, -26, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Shaggy shoulder fur tufts
    ctx.fillStyle = cols.shade;
    ctx.beginPath();
    ctx.moveTo(-26, -68);
    ctx.lineTo(-33, -62);
    ctx.lineTo(-27, -56);
    ctx.lineTo(-32, -49);
    ctx.lineTo(-24, -46);
    ctx.fill();
    ctx.stroke();

    // Scarred tan chest
    if (!p.backFacing) {
      ctx.fillStyle = hit ? '#fff6d6' : cols.belly;
      ctx.beginPath();
      ctx.ellipse(4, -52, 16, 15, -0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = cols.shade;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-4, -59);
      ctx.lineTo(12, -47);
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
    }

    // Tattered B-movie loincloth
    ctx.fillStyle = cols.loincloth || '#c84b31';
    ctx.beginPath();
    ctx.moveTo(-21, -28);
    ctx.lineTo(20, -28);
    ctx.lineTo(18, -14);
    ctx.lineTo(9, -19);
    ctx.lineTo(2, -11);
    ctx.lineTo(-7, -18);
    ctx.lineTo(-17, -13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front leg
    drawSimpleLimb(ctx, 9, -23, p.stride * 0.36, 19, 24, 6, bodyCol, null, 0);

    // Heavy brow ape head
    ctx.save();
    ctx.translate(4, -84);
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(0, -4, 17, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!p.backFacing) {
      ctx.fillStyle = hit ? '#fff6d6' : cols.belly;
      ctx.beginPath();
      ctx.ellipse(7, 1, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Heavy brow ridge & snarling mouth
      ctx.fillStyle = cols.shade;
      ctx.beginPath();
      ctx.roundRect(-2, -11, 19, 6, 3);
      ctx.fill();
      ctx.fillStyle = cols.eye;
      ctx.beginPath();
      ctx.arc(6, -6, 2.6, 0, Math.PI * 2);
      ctx.arc(14, -6, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1e3b9';
      ctx.fillRect(5, 4, 3, 4);
      ctx.fillRect(12, 4, 3, 4);
    }
    ctx.restore();

    // Huge front arm + fist
    drawSimpleLimb(ctx, -9, -62, p.stride * 0.42 + 0.12 + p.armAngle - rageSpin, 15, 34 + p.armExtend, 6, bodyCol, cols.accent, 3);
  }

  function drawLepidoraBody(ctx, k, p) {
    const cols = k.stats.colors;
    const hit = k.hitFlash > 0;
    const bodyCol = hit ? '#ffffff' : cols.body;
    const flap = k.gliding
      ? 0.08 + Math.sin(k.animT * 7) * 0.06
      : Math.sin(k.animT * (k.grounded ? 6.5 : 15)) * 0.38;

    // 1. Pair of patterned moth wings behind torso
    ctx.save();
    ctx.translate(-8, -60);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;

    // Upper wing (wide spread when gliding)
    ctx.save();
    ctx.rotate(-0.45 + flap);
    ctx.fillStyle = hit ? '#ffffff' : cols.wing;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-46, -42, -56, -8);
    ctx.quadraticCurveTo(-42, 16, 0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Gold wing stripes & eyespot
    ctx.fillStyle = cols.accent;
    ctx.beginPath();
    ctx.ellipse(-34, -12, 9, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cols.eye;
    ctx.beginPath();
    ctx.arc(-34, -12, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Lower forewing angled forward slightly
    ctx.save();
    ctx.rotate(0.2 - flap * 0.7);
    ctx.fillStyle = hit ? '#ffffff' : cols.shade;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.quadraticCurveTo(-36, 12, -32, 34);
    ctx.quadraticCurveTo(-12, 32, 2, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cols.accent;
    ctx.beginPath();
    ctx.arc(-20, 21, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // 2. Back legs
    drawSimpleLimb(ctx, -6, -26, -p.stride * 0.3, 9, 20, 4, cols.shade, cols.accent, 2);
    drawSimpleLimb(ctx, 10, -54, -p.stride * 0.35 + p.armAngle * 0.5, 9, 18 + p.armExtend * 0.4, 4, cols.shade, null, 0);

    // 3. Furry segmented moth thorax & cream belly
    ctx.fillStyle = bodyCol;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, -45, 19, 29, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!p.backFacing) {
      ctx.fillStyle = hit ? '#fff6d6' : cols.belly;
      ctx.beginPath();
      ctx.ellipse(4, -44, 12, 22, 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = cols.shade;
      ctx.lineWidth = 1.6;
      for (let ry = -56; ry <= -30; ry += 7) {
        ctx.beginPath();
        ctx.moveTo(-6, ry);
        ctx.quadraticCurveTo(4, ry + 3, 13, ry);
        ctx.stroke();
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
    }

    // Furry neck ruff
    ctx.fillStyle = cols.belly;
    ctx.beginPath();
    ctx.ellipse(2, -70, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Front leg & talon
    drawSimpleLimb(ctx, 7, -26, p.stride * 0.32, 9, 20, 4, bodyCol, cols.accent, 2);

    // 4. Head, feathered gold antennae & cyan compound eyes
    ctx.save();
    ctx.translate(4, -81);
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Feathered antennae
    ctx.strokeStyle = cols.accent;
    ctx.lineWidth = 2.6;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(s * 5, -9);
      ctx.quadraticCurveTo(s * 12, -23, s * 17, -26);
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;

    if (!p.backFacing) {
      ctx.fillStyle = cols.eye;
      ctx.beginPath();
      ctx.ellipse(6, -1, 5.5, 4.5, 0.2, 0, Math.PI * 2);
      ctx.ellipse(-2, -1, 4, 3.8, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Front wing-arm
    drawSimpleLimb(ctx, -3, -53, p.stride * 0.35 + 0.1 + p.armAngle, 9, 19 + p.armExtend, 4, bodyCol, cols.accent, 2);
  }

  function drawTinColossusBody(ctx, k, p) {
    const cols = k.stats.colors;
    const hit = k.hitFlash > 0;
    const bodyCol = hit ? '#ffffff' : cols.body;
    const jetting = (k.jetHopTicks > 0) || (!k.grounded && k.vz > 0);
    const windRot = k.animT * (k.fuel >= 50 ? 6 : 2.5);

    // Jet Hop twin flames underneath torso
    if (jetting) {
      ctx.save();
      for (let sx = -10; sx <= 10; sx += 20) {
        const fl = 16 + Math.sin(k.animT * 36 + sx) * 5;
        ctx.fillStyle = '#ff6b57';
        ctx.beginPath();
        ctx.moveTo(sx - 6, -20);
        ctx.lineTo(sx, -16 + fl);
        ctx.lineTo(sx + 6, -20);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(sx - 3, -20);
        ctx.lineTo(sx, -18 + fl * 0.65);
        ctx.lineTo(sx + 3, -20);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Wind-up key protruding from back
    ctx.save();
    ctx.translate(-22, -52);
    ctx.strokeStyle = INK;
    ctx.fillStyle = cols.accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-10, 0);
    ctx.stroke();
    const keyH = Math.max(3, Math.abs(Math.cos(windRot)) * 11);
    ctx.beginPath();
    ctx.ellipse(-15, -keyH * 0.55, 5, keyH * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(-15, keyH * 0.55, 5, keyH * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Back leg & back piston arm
    drawSimpleLimb(ctx, -10, -23, -p.stride * 0.35, 16, 24, 2, cols.shade, null, 0);
    ctx.save();
    ctx.translate(-10, -23);
    ctx.rotate(-p.stride * 0.35);
    ctx.fillStyle = cols.accent;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(-8, 19, 18, 7, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    drawSimpleLimb(ctx, 11, -56, -p.stride * 0.45 - 0.15 + p.armAngle * 0.55, 11, 22 + p.armExtend * 0.4, 2, cols.shade, cols.accent, 2);

    // Boxy riveted tin torso
    ctx.fillStyle = bodyCol;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(-24, -77, 48, 56, 5);
    ctx.fill();
    ctx.stroke();

    // Corner rivets
    ctx.fillStyle = cols.shade;
    const rivets = [[-19, -72], [19, -72], [-19, -26], [19, -26]];
    for (let i = 0; i < rivets.length; i++) {
      ctx.beginPath();
      ctx.arc(rivets[i][0], rivets[i][1], 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Overload charge glow cracks
    if (k.state === 'ultimate' && k.special && k.special.phase === 'charge') {
      ctx.strokeStyle = '#ff6b57';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-14, -68);
      ctx.lineTo(-2, -52);
      ctx.lineTo(14, -36);
      ctx.stroke();
    }

    if (!p.backFacing) {
      // Atomic battery meter
      ctx.fillStyle = cols.belly;
      ctx.beginPath();
      ctx.roundRect(-13, -64, 28, 22, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = k.batteryActive ? '#7dff4f' : cols.accent;
      ctx.beginPath();
      ctx.arc(1, -53, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // Twin thruster vents on back
      ctx.fillStyle = cols.shade;
      ctx.fillRect(-13, -64, 9, 18);
      ctx.fillRect(4, -64, 9, 18);
      ctx.strokeRect(-13, -64, 9, 18);
      ctx.strokeRect(4, -64, 9, 18);
    }

    // Front leg
    drawSimpleLimb(ctx, 8, -23, p.stride * 0.38, 17, 24, 2, bodyCol, null, 0);
    ctx.save();
    ctx.translate(8, -23);
    ctx.rotate(p.stride * 0.38);
    ctx.fillStyle = cols.accent;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(-8, 19, 19, 7, 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Box head + antenna + red slit visor
    ctx.save();
    ctx.translate(3, -84);
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.roundRect(-15, -18, 30, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -31);
    ctx.stroke();
    ctx.fillStyle = Math.sin(k.animT * 8) > 0 ? cols.eye : cols.accent;
    ctx.beginPath();
    ctx.arc(0, -32, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!p.backFacing) {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.roundRect(-7, -12, 20, 7, 2);
      ctx.fill();
      ctx.fillStyle = cols.eye;
      ctx.beginPath();
      ctx.roundRect(-5, -10, 7, 3, 1);
      ctx.roundRect(4, -10, 7, 3, 1);
      ctx.fill();
    }
    ctx.restore();

    // Front arm (hide forearm/claw while Rocket Fist projectile is airborne)
    if (!k.fistOut) {
      drawSimpleLimb(ctx, -5, -55, p.stride * 0.45 + 0.15 + p.armAngle, 12, 22 + p.armExtend, 2, bodyCol, cols.accent, 2);
    } else {
      drawSimpleLimb(ctx, -5, -55, p.armAngle, 11, 10, 2, cols.shade, null, 0);
    }
  }

  function drawMonsterBody(ctx, k, pose) {
    const mid = k.monsterId || 'gorgantor';
    if (mid === 'mongo') drawMongoBody(ctx, k, pose);
    else if (mid === 'lepidora') drawLepidoraBody(ctx, k, pose);
    else if (mid === 'tin_colossus') drawTinColossusBody(ctx, k, pose);
    else drawGorgantorBody(ctx, k, pose);
  }


  function drawKaiju(ctx, k) {
    const p = Iso.worldToScreen(k.x, k.y, k.z);
    const fVec = Iso.worldToScreen(k.dirX, k.dirY, 0);
    const flip = fVec.sx < -0.05 ? -1 : 1;
    const backFacing = fVec.sy < -2;

    const cols = k.stats.colors;
    const mid = k.monsterId || 'gorgantor';
    const walking = k.state === 'walk' || (k.state === 'carry' && Math.hypot(k.vx, k.vy) > 0.25);
    const climbing = k.state === 'climb';
    const bob = climbing
      ? Math.sin(k.walkPhase) * 2.5
      : (walking ? Math.abs(Math.sin(k.walkPhase)) * 5.5 : Math.sin(k.animT * 3.0) * 1.5);
    let wobble = walking ? Math.sin(k.walkPhase) * 0.055 : Math.sin(k.animT * 2.2) * 0.018;

    let syScale = 1;
    let sxScale = 1;
    if (!k.grounded && !climbing) {
      syScale = 1 + U.clamp(k.vz * 0.016, -0.08, 0.14);
      sxScale = 1 / syScale;
    } else if (k.landSquash > 0) {
      syScale = 1 - k.landSquash * 0.15;
      sxScale = 1 + k.landSquash * 0.12;
    }

    // Combat pose offsets
    let bodyShiftX = 0;
    let bodyShiftY = 0;
    let armAngle = 0;
    let armExtend = 0;
    let slashArc = null;
    const atk = k.attack;

    if (k.state === 'knockdown' || k.state === 'thrown_kaiju') {
      wobble = k.state === 'thrown_kaiju' ? (-Math.PI * 0.38 - k.stateTick * 0.12) : -Math.PI * 0.46;
      bodyShiftY = 14;
    } else if (k.state === 'climb') {
      wobble = 0.08;
      armAngle = -2.1 + Math.sin(k.walkPhase * 1.3) * 0.45;
      armExtend = 6;
    } else if (k.state === 'carry') {
      armAngle = -2.65;
      armExtend = 6;
    } else if (k.state === 'throw_anim') {
      wobble = 0.28;
      armAngle = -0.35;
      armExtend = 12;
    } else if (k.state === 'getup') {
      const t = 1 - U.clamp(k.stateTick / 30, 0, 1);
      wobble = -Math.PI * 0.42 * t;
      bodyShiftY = 12 * t;
    } else if (k.state === 'hitstun') {
      wobble = -0.26;
      bodyShiftX = -5;
    } else if (k.state === 'guard_break') {
      wobble = Math.sin(k.stateTick * 0.45) * 0.22;
    } else if (k.state === 'dodge') {
      wobble = 0.28;
      bodyShiftX = 8;
    } else if (k.state === 'block') {
      wobble = -0.08;
      armAngle = -1.25;
      armExtend = 5;
    } else if (atk) {
      const def = atk.def;
      if (atk.name === 'heavy') {
        if (k.stateTick <= def.startup) {
          wobble = -0.22;
          armAngle = -2.35;
        } else if (atk.active) {
          wobble = 0.32;
          bodyShiftX = 12;
          armAngle = 0.25;
          armExtend = 14;
          slashArc = { r: 62, start: -0.9, end: 0.9, col: '#ff6b57', w: 9 };
        } else {
          wobble = 0.18;
          armAngle = 0.35;
        }
      } else if (atk.name === 'jump_atk') {
        armAngle = -0.8;
        if (atk.active) {
          slashArc = { r: 54, start: 0, end: Math.PI * 2, col: '#ffd23f', w: 6, fullRing: true };
        }
      } else if (atk.name === 'grab') {
        if (k.stateTick <= def.startup) {
          wobble = -0.1;
          armAngle = -0.8;
        } else if (atk.active) {
          wobble = 0.25;
          bodyShiftX = 11;
          armAngle = -1.35;
          armExtend = 18;
          slashArc = { r: 44, start: -0.5, end: 0.5, col: '#7dff4f', w: 7 };
        }
      } else if (atk.name === 'prop_smash') {
        if (k.stateTick <= def.startup) {
          wobble = -0.22;
          armAngle = -2.7;
        } else if (atk.active) {
          wobble = 0.34;
          bodyShiftX = 12;
          armAngle = -0.1;
          armExtend = 12;
          slashArc = { r: 64, start: -0.85, end: 0.85, col: '#ffd23f', w: 9 };
        } else {
          armAngle = 0.1;
        }
      } else {
        // Light 1 / 2 / 3
        if (k.stateTick <= def.startup) {
          wobble = -0.14;
          armAngle = -1.1;
        } else if (atk.active) {
          wobble = atk.name === 'light3' ? -0.15 : 0.22;
          bodyShiftX = atk.name === 'light3' ? 10 : 8;
          armAngle = atk.name === 'light3' ? -1.85 : -0.35;
          armExtend = atk.name === 'light3' ? 14 : 11;
          slashArc = {
            r: atk.name === 'light3' ? 58 : 48,
            start: atk.name === 'light3' ? -1.45 : -0.75,
            end: atk.name === 'light3' ? 0.35 : 0.75,
            col: atk.name === 'light3' ? '#5ee6ff' : '#ffd23f',
            w: atk.name === 'light3' ? 8 : 6
          };
        } else {
          wobble = 0.08;
          armAngle = -0.15;
        }
      }
    } else if (k.state === 'special') {
      wobble = k.special && k.special.phase === 'startup' ? -0.22 : 0.14;
      armAngle = k.special && k.special.phase === 'startup' ? -1.4 : -0.6;
      armExtend = 8;
    } else if (k.state === 'ultimate') {
      if (k.special && k.special.phase === 'charge') {
        wobble = Math.sin(k.animT * 38) * 0.09;
        bodyShiftY = 6;
        armAngle = -2.2;
      } else {
        wobble = -0.16;
        armAngle = -2.6;
        armExtend = 14;
      }
    }

    const stride = walking ? Math.sin(k.walkPhase) : 0;
    const dodgeIframe = k.state === 'dodge' && k.stateTick >= 3 && k.stateTick <= 14;
    const hasArmor = KB.Combat && KB.Combat.hasArmor(k);

    ctx.save();
    ctx.translate(p.sx, p.sy - bob + bodyShiftY);
    if (k.state === 'dodge') ctx.globalAlpha = dodgeIframe ? 0.45 : 0.72;
    ctx.scale(flip * sxScale, syScale);
    ctx.translate(bodyShiftX, 0);
    ctx.rotate(wobble);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Overcharge (>= 80 fuel) atomic-green glow aura
    if (k.fuel >= 80) {
      ctx.save();
      const pulse = 1 + Math.sin(k.animT * 9) * 0.08;
      ctx.strokeStyle = 'rgba(125, 255, 79, 0.85)';
      ctx.fillStyle = 'rgba(125, 255, 79, 0.18)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(0, -48, 36 * pulse, 52 * pulse, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Meltdown charge sphere
    if (k.state === 'ultimate' && k.special && k.special.phase === 'charge') {
      const tCharge = U.clamp(k.stateTick / (k.special.def.chargeTicks || 40), 0, 1);
      const orbR = 54 - 22 * tCharge + Math.sin(k.animT * 28) * 4;
      ctx.save();
      ctx.fillStyle = 'rgba(125, 255, 79, ' + (0.24 + tCharge * 0.35).toFixed(2) + ')';
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, -52, Math.max(12, orbR), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Hyper-armor golden pulse behind torso during Heavy armor frames
    if (hasArmor) {
      ctx.save();
      ctx.strokeStyle = '#ffd23f';
      ctx.fillStyle = 'rgba(255, 210, 63, 0.22)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(0, -48, 34, 48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Counter-ready cyan rim glow
    if (k.counterWindow > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(94, 230, 255, 0.78)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(2, -48, 30, 44, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawMonsterBody(ctx, k, {
      walking: walking,
      backFacing: backFacing,
      stride: stride,
      armAngle: armAngle,
      armExtend: armExtend
    });

    if (k.burnTicks > 0) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ff6b57';
      const fl = Math.sin(k.animT * 26) * 5;
      ctx.beginPath();
      ctx.arc(-8 + fl * 0.4, -36 - Math.abs(fl), 6, 0, Math.PI * 2);
      ctx.arc(10 - fl * 0.4, -52 - Math.abs(fl), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (k.cloudSlowTicks > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#f2d974';
      ctx.beginPath();
      ctx.ellipse(0, -45, 26, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Attack slash smear
    if (slashArc) {
      ctx.save();
      ctx.translate(16, -46);
      ctx.strokeStyle = slashArc.col;
      ctx.lineWidth = slashArc.w;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      if (slashArc.fullRing) {
        ctx.ellipse(-16, 40, slashArc.r, slashArc.r * 0.48, 0, 0, Math.PI * 2);
      } else {
        ctx.arc(0, 0, slashArc.r, slashArc.start, slashArc.end);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Block translucent cyan shield arc
    if (k.state === 'block') {
      const perfectWin = k.blockTicks <= 6;
      ctx.save();
      ctx.translate(22, -48);
      ctx.fillStyle = perfectWin ? 'rgba(255, 255, 255, 0.34)' : 'rgba(94, 230, 255, 0.24)';
      ctx.strokeStyle = perfectWin ? '#ffffff' : '#5ee6ff';
      ctx.lineWidth = perfectWin ? 4.5 : 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 38, 0, -Math.PI * 0.55, Math.PI * 0.55);
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }

    // Guard Break orbiting dizzy stars
    if (k.state === 'guard_break') {
      ctx.save();
      ctx.translate(0, -108);
      for (let s = 0; s < 3; s++) {
        const ang = k.animT * 6 + s * (Math.PI * 2 / 3);
        const sx = Math.cos(ang) * 18;
        const sy = Math.sin(ang) * 6;
        ctx.fillStyle = s % 2 === 0 ? '#ffd23f' : '#ff6b57';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Carried prop held overhead (or mid-smash)
    if (k.carrying) {
      ctx.save();
      const smashing = k.state === 'prop_smash' && k.attack && k.attack.active;
      ctx.translate(smashing ? 28 : 2, smashing ? -62 : -108);
      if (smashing) ctx.rotate(0.75);
      drawPropGraphic(ctx, k.carrying.propType, 0.92, false);
      ctx.restore();
    }

    // Burn DoT flames on torso
    if (k.burnTicks > 0) {
      ctx.save();
      for (let f = 0; f < 3; f++) {
        const fx = -12 + f * 12 + Math.sin(k.animT * 18 + f * 2.1) * 3;
        const fy = -34 - (f % 2) * 16;
        const fh = 15 + Math.sin(k.animT * 22 + f) * 4;
        ctx.fillStyle = f === 1 ? '#ffd23f' : '#ff6b2b';
        ctx.beginPath();
        ctx.moveTo(fx - 6, fy);
        ctx.quadraticCurveTo(fx - 2, fy - fh, fx, fy - fh - 3);
        ctx.quadraticCurveTo(fx + 3, fy - fh, fx + 6, fy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Boss indicator + telegraphed attack warning cue (!)
    if (k.isBoss) {
      ctx.save();
      ctx.fillStyle = '#ff3b30';
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.font = '900 11px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillRect(-26, -138, 52, 16);
      ctx.strokeRect(-26, -138, 52, 16);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('BOSS', 0, -126);
      ctx.restore();
    }

    const telegraphing = !k.isPlayer && ((k.telegraphTicks || 0) > 0 ||
      (k.state === 'heavy' && k.attack && k.stateTick <= k.attack.def.startup));
    if (telegraphing) {
      const pulse = 0.5 + 0.5 * Math.sin((k.animT || 0) * 38);
      ctx.save();
      ctx.globalAlpha = 0.55 + pulse * 0.45;
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, -56, 36 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();

      const wy = k.isBoss ? -156 : -134;
      ctx.globalAlpha = 1;
      ctx.fillStyle = pulse > 0.5 ? '#ff3b30' : '#ffd23f';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, wy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = '900 16px "Arial Black", Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, wy + 1);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawEntityShadow(ctx, item) {
    if (item.kind === 'building' && item.state === 'rubble' && item.collapseTick <= 0) return;
    const cx = (item.fx0 + item.fx1) * 0.5;
    const cy = (item.fy0 + item.fy1) * 0.5;
    const p = Iso.worldToScreen(cx, cy, 0);
    if (item.kind === 'building') {
      const rx = ((item.fx1 - item.fx0) + (item.fy1 - item.fy0)) * 22;
      const ry = rx * 0.48;
      ctx.fillStyle = 'rgba(10, 14, 22, 0.25)';
      ctx.beginPath();
      ctx.ellipse(p.sx + 6, p.sy + 3, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'civilian') {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.30)';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const scale = 1 / (1 + (item.z || 0) / 200);
      const baseRx = item.kind === 'kaiju' ? 28 : (item.kind === 'pickup' ? 14 : 20);
      const baseRy = item.kind === 'kaiju' ? 14 : (item.kind === 'pickup' ? 7 : 10);
      ctx.fillStyle = 'rgba(10, 14, 22, 0.42)';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, baseRx * scale, baseRy * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawSlowZones(ctx, city, timeSec) {
    if (!city || !city.slowZones || !city.slowZones.length) return;
    for (let i = 0; i < city.slowZones.length; i++) {
      const sz = city.slowZones[i];
      const p = Iso.worldToScreen(sz.x, sz.y, 0);
      const rx = sz.r * 58;
      const ry = sz.r * 29;
      ctx.save();
      ctx.fillStyle = 'rgba(63, 169, 245, 0.42)';
      ctx.strokeStyle = 'rgba(155, 228, 255, 0.78)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const rip = ((timeSec * 0.7 + i * 0.35) % 1);
      ctx.strokeStyle = 'rgba(220, 248, 255, ' + (0.65 * (1 - rip)).toFixed(2) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, rx * (0.35 + rip * 0.55), ry * (0.35 + rip * 0.55), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPickup(ctx, p, timeSec) {
    if (p.life <= 3.0 && Math.floor(p.life * 8) % 2 === 1) return;
    const zBob = p.z + 10 + Math.sin(p.bobPhase || timeSec * 4.5) * 5;
    const sc = Iso.worldToScreen(p.x, p.y, zBob);

    ctx.save();
    ctx.translate(sc.sx, sc.sy);
    if (p.pickupType === 'health') {
      const pulse = 1 + Math.sin(timeSec * 8) * 0.08;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = 'rgba(255, 70, 90, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fff5f5';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pulsing red cross
      ctx.fillStyle = '#e52b3d';
      ctx.fillRect(-2.5, -7.5, 5, 15);
      ctx.fillRect(-7.5, -2.5, 15, 5);
    } else {
      // Atomic fuel canister
      ctx.fillStyle = 'rgba(125, 255, 79, 0.26)';
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#244f2c';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.roundRect(-8, -11, 16, 22, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#7dff4f';
      ctx.fillRect(-6, -5, 12, 10);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-4, -14, 8, 4);
      ctx.strokeRect(-4, -14, 8, 4);
    }
    ctx.restore();
  }

  function drawPropGraphic(ctx, propType, scale, flashHot) {
    ctx.save();
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    if (propType === 'girder') {
      ctx.rotate(-0.22);
      ctx.fillStyle = '#8b99a6';
      ctx.beginPath();
      ctx.roundRect(-24, -6, 48, 12, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5c6975';
      ctx.fillRect(-21, -2.5, 42, 5);
    } else if (propType === 'tanker') {
      ctx.fillStyle = flashHot ? '#ff9a2e' : '#d93838';
      ctx.beginPath();
      ctx.roundRect(-18, -10, 36, 20, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-6, -10, 12, 20);
      ctx.strokeRect(-6, -10, 12, 20);
    } else if (propType === 'car') {
      ctx.fillStyle = '#5390d9';
      ctx.beginPath();
      ctx.roundRect(-16, -6, 32, 13, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#a9d6e5';
      ctx.beginPath();
      ctx.roundRect(-9, -13, 18, 8, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1b242c';
      ctx.beginPath();
      ctx.arc(-9, 7, 4, 0, Math.PI * 2);
      ctx.arc(9, 7, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (propType === 'lamp') {
      ctx.fillStyle = '#5d6b75';
      ctx.beginPath();
      ctx.roundRect(-22, -3, 44, 6, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(20, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      // water_tank
      ctx.fillStyle = '#6da6c4';
      ctx.beginPath();
      ctx.roundRect(-16, -12, 32, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3b6a87';
      ctx.fillRect(-16, -3, 32, 6);
      ctx.strokeRect(-16, -3, 32, 6);
    }
    ctx.restore();
  }

  function drawProp(ctx, d, timeSec) {
    const zLift = (d.z || 0) + (d.state === 'ground' ? 6 : 10);
    const p = Iso.worldToScreen(d.x, d.y, zLift);
    const flashHot = d.state === 'fusing' && Math.floor(timeSec * 24) % 2 === 0;
    ctx.save();
    ctx.translate(p.sx, p.sy);
    if (d.rot) ctx.rotate(d.rot);
    drawPropGraphic(ctx, d.propType, 1, flashHot);
    ctx.restore();
  }

  function drawCivilian(ctx, c) {
    const p = Iso.worldToScreen(c.x, c.y, 0);
    const wave = Math.sin(c.phase);
    ctx.save();
    ctx.translate(p.sx, p.sy);
    ctx.globalAlpha = U.clamp(c.life / 0.45, 0, 1);
    // Tiny legs
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -4);
    ctx.lineTo(-3 + wave * 3, 1);
    ctx.moveTo(2, -4);
    ctx.lineTo(3 - wave * 3, 1);
    ctx.stroke();
    // Coat torso + waving arms
    ctx.fillStyle = c.color;
    ctx.fillRect(-3, -11, 6, 8);
    ctx.strokeRect(-3, -11, 6, 8);
    ctx.beginPath();
    ctx.moveTo(-3, -10);
    ctx.lineTo(-6, -14 + wave * 2);
    ctx.moveTo(3, -10);
    ctx.lineTo(6, -14 - wave * 2);
    ctx.stroke();
    // Head
    ctx.fillStyle = '#f2d3b1';
    ctx.beginPath();
    ctx.arc(0, -14, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawM4Particles(ctx, cctx) {
    if (!cctx) return;
    if (cctx.dust) {
      for (let i = 0; i < cctx.dust.length; i++) {
        const d = cctx.dust[i];
        const p = Iso.worldToScreen(d.x, d.y, d.z);
        const alpha = U.clamp((d.life / d.maxLife) * 0.55, 0, 0.55);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (cctx.debris) {
      for (let i = 0; i < cctx.debris.length; i++) {
        const b = cctx.debris[i];
        const p = Iso.worldToScreen(b.x, b.y, b.z);
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.rotate(b.life * 8 + i);
        ctx.globalAlpha = U.clamp(b.life / 0.25, 0, 1);
        ctx.fillStyle = b.color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.fillRect(-b.size * 0.5, -b.size * 0.5, b.size, b.size * 0.75);
        ctx.strokeRect(-b.size * 0.5, -b.size * 0.5, b.size, b.size * 0.75);
        ctx.restore();
      }
    }
  }

  function drawCombatFx(ctx, cctx) {
    if (!cctx) return;

    // Hit-spark starbursts & Nova shockwaves
    if (cctx.novaWaves) {
      for (let i = 0; i < cctx.novaWaves.length; i++) {
        const w = cctx.novaWaves[i];
        const t = 1 - w.life / w.maxLife;
        const p = Iso.worldToScreen(w.x, w.y, 6);
        const radPx = w.radius * 56 * U.clamp(t * 1.2, 0.08, 1);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = U.clamp((1 - t) * 0.9, 0, 0.9);
        ctx.fillStyle = 'rgba(125, 255, 79, 0.32)';
        ctx.strokeStyle = w.color || '#7dff4f';
        ctx.lineWidth = 8 * (1 - t * 0.65);
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, radPx, radPx * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, radPx * 0.76, radPx * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (let i = 0; i < cctx.sparks.length; i++) {
      const s = cctx.sparks[i];
      const p = Iso.worldToScreen(s.x, s.y, s.z);
      const t = s.life / s.maxLife;
      const rad = s.size * (1.25 - 0.55 * t);
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.globalAlpha = U.clamp(t * 1.4, 0, 1);
      ctx.fillStyle = s.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const spikes = 8;
      for (let k = 0; k < spikes * 2; k++) {
        const ang = (k * Math.PI) / spikes;
        const r = k % 2 === 0 ? rad : rad * 0.42;
        const px = Math.cos(ang) * r;
        const py = Math.sin(ang) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Floating damage / status popups
    for (let i = 0; i < cctx.popups.length; i++) {
      const pop = cctx.popups[i];
      const age = pop.maxLife - pop.life;
      const p = Iso.worldToScreen(pop.x, pop.y, pop.z + age * 0.85);
      const alpha = U.clamp(pop.life / 12, 0, 1);
      const pxSize = Math.round(17 * pop.scale);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 ' + pxSize + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4.5;
      ctx.strokeText(pop.text, p.sx, p.sy);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, p.sx, p.sy);
      ctx.restore();
    }

    // Comic sound cards (ROAAAR!, ZZAP!, KA-BOOM!)
    if (cctx.comicCards) {
      for (let i = 0; i < cctx.comicCards.length; i++) {
        const card = cctx.comicCards[i];
        const p = Iso.worldToScreen(card.x, card.y, card.z);
        const age = 1 - card.life / card.maxLife;
        const popScale = age < 0.18 ? U.lerp(0.55, 1.15, age / 0.18) : U.lerp(1.15, 0.95, age);
        const alpha = U.clamp(card.life / 12, 0, 1);
        ctx.save();
        ctx.translate(p.sx, p.sy);
        ctx.rotate(card.tilt);
        ctx.scale(popScale, popScale);
        ctx.globalAlpha = alpha;
        // Starburst backing badge
        ctx.fillStyle = '#081a28';
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const pts = 14;
        for (let k = 0; k < pts; k++) {
          const ang = (k * Math.PI * 2) / pts;
          const rx = k % 2 === 0 ? 58 : 44;
          const ry = k % 2 === 0 ? 28 : 20;
          const x = Math.cos(ang) * rx;
          const y = Math.sin(ang) * ry;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.font = '900 22px Impact, "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.strokeText(card.text, 0, 1);
        ctx.fillStyle = card.color || '#7dff4f';
        ctx.fillText(card.text, 0, 1);
        ctx.restore();
      }
    }
  }

  function drawClouds(ctx, cctx, timeSec) {
    if (!cctx || !cctx.clouds) return;
    for (let i = 0; i < cctx.clouds.length; i++) {
      const c = cctx.clouds[i];
      const p = Iso.worldToScreen(c.x, c.y, 12);
      const rx = c.radius * Iso.HALF_W * 1.15;
      const ry = c.radius * Iso.HALF_H * 1.25;
      const fade = U.clamp(c.life / 30, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.34 * fade;
      ctx.fillStyle = c.color || '#f2d974';
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.52 * fade;
      ctx.stroke();

      // Swirl dust motes
      for (let m = 0; m < 6; m++) {
        const ang = timeSec * 2.2 + m * 1.05;
        const mx = p.sx + Math.cos(ang) * rx * 0.62;
        const my = p.sy + Math.sin(ang) * ry * 0.55 - 8 + Math.sin(timeSec * 5 + m) * 4;
        ctx.fillStyle = m % 2 === 0 ? '#ffd23f' : '#c09bff';
        ctx.beginPath();
        ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawProjectiles(ctx, cctx, timeSec) {
    if (!cctx || !cctx.projectiles) return;
    for (let i = 0; i < cctx.projectiles.length; i++) {
      const pr = cctx.projectiles[i];
      const p = Iso.worldToScreen(pr.x, pr.y, pr.z || 40);
      ctx.save();
      ctx.translate(p.sx, p.sy);
      if (pr.kind === 'rocket_fist') {
        const ang = Math.atan2(pr.vy, pr.vx);
        const fVec = Iso.worldToScreen(Math.cos(ang), Math.sin(ang), 0);
        ctx.rotate(Math.atan2(fVec.sy, fVec.sx));
        // Exhaust jet
        ctx.fillStyle = '#ff6b57';
        ctx.beginPath();
        ctx.moveTo(-12, -5);
        ctx.lineTo(-26 - Math.sin(timeSec * 40) * 4, 0);
        ctx.lineTo(-12, 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#9aa8b4';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.roundRect(-12, -9, 24, 18, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e05038';
        ctx.fillRect(6, -7, 6, 14);
      } else {
        // Skyscraper Hurl masonry chunk / Roof Rip debris
        ctx.rotate(timeSec * 8 + i);
        const r = pr.kind === 'chunk' ? 16 : 11;
        ctx.fillStyle = '#a89f91';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.6);
        ctx.lineTo(r * 0.4, -r);
        ctx.lineTo(r, r * 0.3);
        ctx.lineTo(-r * 0.3, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#7b8a99';
        ctx.fillRect(-r * 0.4, -r * 0.35, r * 0.45, r * 0.45);
      }
      ctx.restore();
    }
  }

  function drawVortexes(ctx, scene, timeSec) {
    const fighters = [scene.player, scene.dummy];
    for (let i = 0; i < fighters.length; i++) {
      const k = fighters[i];
      if (!k || k.state !== 'ultimate' || !k.special || !k.special.def || k.special.def.kind !== 'vortex') continue;
      const p = Iso.worldToScreen(k.x, k.y, k.z + 20);
      const rad = k.special.def.radius || 3.0;
      ctx.save();
      for (let r = 0; r < 3; r++) {
        const lift = r * 26 + ((timeSec * 90) % 24);
        const rx = rad * Iso.HALF_W * (0.45 + r * 0.25);
        const ry = rx * 0.44;
        ctx.strokeStyle = r % 2 === 0 ? '#5ee6ff' : '#f2d974';
        ctx.lineWidth = 4 - r * 0.7;
        ctx.globalAlpha = 0.68 - r * 0.14;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy - lift, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSpecialBeams(ctx, scene, timeSec) {
    const fighters = [scene.player, scene.dummy];
    for (let i = 0; i < fighters.length; i++) {
      const k = fighters[i];
      if (!k || k.state !== 'special' || !k.special || k.special.phase !== 'active') continue;
      const def = k.special.def;
      if (!def || def.kind !== 'beam') continue;
      const ux = Math.cos(k.special.beamAngle);
      const uy = Math.sin(k.special.beamAngle);
      const px = -uy;
      const py = ux;
      const len = def.length || 6.0;
      const offsets = def.twinBeam ? [-0.18, 0.18] : [0];
      const pulse = 1 + Math.sin(timeSec * 36) * 0.18;

      for (let b = 0; b < offsets.length; b++) {
        const off = offsets[b];
        const start = Iso.worldToScreen(k.x + ux * 0.45 + px * off, k.y + uy * 0.45 + py * off, k.z + 80);
        const end = Iso.worldToScreen(k.x + ux * len + px * off, k.y + uy * len + py * off, k.z + 44);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.strokeStyle = def.color || '#7dff4f';
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = (def.twinBeam ? 28 : 42) * pulse;
        ctx.beginPath();
        ctx.moveTo(start.sx, start.sy);
        ctx.lineTo(end.sx, end.sy);
        ctx.stroke();

        ctx.globalAlpha = 0.85;
        ctx.lineWidth = (def.twinBeam ? 14 : 22) * pulse;
        ctx.beginPath();
        ctx.moveTo(start.sx, start.sy);
        ctx.lineTo(end.sx, end.sy);
        ctx.stroke();

        ctx.strokeStyle = def.coreColor || '#eaffdc';
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = def.twinBeam ? 6 : 9;
        ctx.beginPath();
        ctx.moveTo(start.sx, start.sy);
        ctx.lineTo(end.sx, end.sy);
        ctx.stroke();

        ctx.fillStyle = def.coreColor || '#eaffdc';
        ctx.beginPath();
        ctx.arc(end.sx, end.sy, (def.twinBeam ? 11 : 16) * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function traceWorldArc(ctx, k, reach, arcRad, radial) {
    const steps = radial ? 20 : 12;
    const baseAng = Math.atan2(k.dirY, k.dirX);
    const startAng = radial ? 0 : baseAng - arcRad * 0.5;
    const endAng = radial ? Math.PI * 2 : baseAng + arcRad * 0.5;
    ctx.beginPath();
    if (!radial) {
      const center = Iso.worldToScreen(k.x, k.y, 2);
      ctx.moveTo(center.sx, center.sy);
    }
    for (let i = 0; i <= steps; i++) {
      const a = startAng + ((endAng - startAng) * i) / steps;
      const wx = k.x + Math.cos(a) * reach;
      const wy = k.y + Math.sin(a) * reach;
      const sp = Iso.worldToScreen(wx, wy, 2);
      if (i === 0 && radial) ctx.moveTo(sp.sx, sp.sy);
      else ctx.lineTo(sp.sx, sp.sy);
    }
    ctx.closePath();
  }

  function drawDebugOverlay(ctx, sorted, scene, view) {
    const city = scene.city;
    const cam = scene.cam;
    const player = scene.player;
    const dummy = scene.dummy;
    const stats = scene.stats;

    ctx.save();
    ctx.translate(view.w * 0.5, view.h * 0.5 - view.bottomInset * 0.5);
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);

    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      traceTile(ctx, it.fx0, it.fy0, it.fx1, it.fy1, 0, 0);
      ctx.strokeStyle = it.kind === 'kaiju' ? '#7dff4f' : '#5ee6ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (it.collBox) {
        traceTile(ctx, it.collBox.x0, it.collBox.y0, it.collBox.x1, it.collBox.y1, 0, 0);
        ctx.save();
        ctx.strokeStyle = '#ff6b57';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.restore();
      }

      if (it.kind === 'kaiju') {
        // True projected world-space ground-plane collision / hurtbox circle
        traceWorldArc(ctx, it, it.r, Math.PI * 2, true);
        ctx.strokeStyle = '#ffd23f';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Active attack hitbox cone/ring
        if (it.attack) {
          traceWorldArc(ctx, it, it.attack.def.reach, it.attack.def.arc || Math.PI * 2, !!it.attack.def.radial);
          ctx.fillStyle = it.attack.active ? 'rgba(255, 62, 62, 0.28)' : 'rgba(255, 210, 63, 0.14)';
          ctx.strokeStyle = it.attack.active ? '#ff4444' : '#ffd23f';
          ctx.lineWidth = it.attack.active ? 2.4 : 1.4;
          ctx.fill();
          ctx.stroke();
        }

        // Combat state + tick label
        const head = Iso.worldToScreen(it.x, it.y, it.z + it.height + 16);
        const tag = it.state + '[' + it.stateTick + ']' + (KB.Combat && KB.Combat.isInvulnerable(it) ? ' INV' : '');
        ctx.fillStyle = 'rgba(6, 21, 33, 0.85)';
        ctx.fillRect(head.sx - 48, head.sy - 9, 96, 17);
        ctx.fillStyle = '#5ee6ff';
        ctx.font = 'bold 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, head.sx, head.sy);
      }

      const c = Iso.worldToScreen((it.fx0 + it.fx1) * 0.5, (it.fy0 + it.fy1) * 0.5, it.zTop * 0.5);
      ctx.fillStyle = 'rgba(6, 21, 33, 0.82)';
      ctx.fillRect(c.sx - 16, c.sy - 9, 32, 18);
      ctx.fillStyle = it.kind === 'kaiju' ? '#7dff4f' : '#ffd23f';
      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('#' + it._sortOrder, c.sx, c.sy);
    }

    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(6, 21, 33, 0.86)';
    ctx.strokeStyle = '#5ee6ff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(10, 10, 396, 108);
    ctx.strokeRect(10, 10, 396, 108);
    ctx.fillStyle = '#7dff4f';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('DEBUG [`] FPS: ' + stats.fps + '  SORTED: ' + sorted.length + '/' + stats.total + '  HITBOX: RED/YEL', 18, 18);
    ctx.fillStyle = '#eef6fc';
    ctx.fillText('CAM: (' + Math.round(cam.x) + ', ' + Math.round(cam.y) + ')  Z: ' + view.zoom.toFixed(2), 18, 36);
    ctx.fillText(
      'P1 [' + player.state + ':' + player.stateTick + '] HP:' + Math.ceil(player.hp) + ' G:' + Math.round(player.guard) + ' Z:' + Math.round(player.z),
      18,
      54
    );
    if (dummy) {
      ctx.fillStyle = '#ff9f5a';
      ctx.fillText(
        'DUMMY(' + (scene.dummyMode || 'idle') + ') [' + dummy.state + ':' + dummy.stateTick + '] HP:' + Math.ceil(dummy.hp) + ' G:' + Math.round(dummy.guard),
        18,
        72
      );
    }
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(
      'CITY: ' + city.id + ' (' + city.cols + 'x' + city.rows + ') · WRECKED: ' + (scene.cctx ? scene.cctx.buildingsWrecked : 0) + ' · DROPS: ' + (scene.cctx ? scene.cctx.pickups.length : 0),
      18,
      90
    );
    ctx.restore();
  }

  function drawTitleCard(ctx, tc, view) {
    if (!tc || tc.ticks <= 0) return;
    const maxT = tc.maxTicks || 120;
    const fadeIn = U.clamp((maxT - tc.ticks) / 14, 0, 1);
    const fadeOut = U.clamp(tc.ticks / 22, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    if (alpha <= 0.02) return;

    const w = Math.min(view.w - 40, 440);
    const h = tc.sub ? 84 : 58;
    const x = (view.w - w) * 0.5;
    const y = Math.max(76, view.h * 0.18);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(13, 18, 28, 0.92)';
    ctx.strokeStyle = tc.boss ? '#ff3b30' : '#ffd23f';
    ctx.lineWidth = 4;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#0d121c';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = tc.boss ? '#ff6b57' : '#ffd23f';
    ctx.font = '900 24px "Arial Black", Impact, sans-serif';
    ctx.fillText(tc.title || 'REEL 1', view.w * 0.5, y + (tc.sub ? 30 : h * 0.5));
    if (tc.sub) {
      ctx.fillStyle = '#fff3d6';
      ctx.font = '700 13px "Trebuchet MS", sans-serif';
      ctx.fillText(tc.sub, view.w * 0.5, y + 58);
    }
    ctx.restore();
  }

  function renderScene(ctx, scene, view, timeSec) {
    const city = scene.city;
    const cam = scene.cam;
    const drawables = scene.drawables;
    const cctx = scene.cctx;

    drawBackdrop(ctx, city, cam, view, timeSec);

    ctx.save();
    ctx.translate(view.w * 0.5, view.h * 0.5 - view.bottomInset * 0.5);
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-cam.x + cam.shakeX, -cam.y + cam.shakeY);

    const gc = ensureGroundCache(city);
    ctx.drawImage(gc.canvas, -gc.originX, -gc.originY);

    // Flooded slow zones and settled ground-level rubble draw below standing geometry
    drawSlowZones(ctx, city, timeSec);
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      if (b.state === 'rubble' && b.collapseTick <= 0) {
        drawRubblePile(ctx, b);
      }
    }

    const activeDrawables = [];
    for (let i = 0; i < drawables.length; i++) {
      const it = drawables[i];
      if (it.kind === 'building' && it.state === 'rubble' && it.collapseTick <= 0) continue;
      if (it.kind === 'prop' && it.state === 'carried') continue;
      activeDrawables.push(it);
    }
    const sorted = Iso.cullAndSort(activeDrawables, cam, view);

    for (let i = 0; i < sorted.length; i++) {
      drawEntityShadow(ctx, sorted[i]);
    }

    for (let i = 0; i < sorted.length; i++) {
      const it = sorted[i];
      if (it.kind === 'building') drawBuilding(ctx, it);
      else if (it.kind === 'kaiju') drawKaiju(ctx, it);
      else if (it.kind === 'pickup') drawPickup(ctx, it, timeSec);
      else if (it.kind === 'prop' || it.kind === 'prop_stub') drawProp(ctx, it, timeSec);
      else if (it.kind === 'civilian') drawCivilian(ctx, it);
    }

    drawClouds(ctx, cctx, timeSec);
    drawM4Particles(ctx, cctx);
    drawProjectiles(ctx, cctx, timeSec);
    drawVortexes(ctx, scene, timeSec);
    drawSpecialBeams(ctx, scene, timeSec);
    drawCombatFx(ctx, cctx);

    ctx.restore();

    if (cctx && cctx.screenFlash) {
      const sf = cctx.screenFlash;
      const a = U.clamp((sf.life / sf.maxLife) * sf.alpha, 0, 0.9);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = sf.color || '#eaffdc';
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }

    if (scene.titleCard && scene.titleCard.ticks > 0) {
      drawTitleCard(ctx, scene.titleCard, view);
    }

    if (scene.debug) {
      drawDebugOverlay(ctx, sorted, scene, view);
    }
  }

  function drawMonsterPreview(ctx, monsterId, w, h, timeSec) {
    const stats = KB.MONSTERS[monsterId] || KB.MONSTERS.gorgantor;
    if (!ctx || !stats) return;
    ctx.clearRect(0, 0, w, h);

    // Subtle 1950s halftone spotlight backdrop
    const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 6, w * 0.5, h * 0.52, w * 0.62);
    grad.addColorStop(0, stats.colors.accent + '33');
    grad.addColorStop(1, 'rgba(13, 18, 28, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Ground disc
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.86, 36, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const mockKaiju = {
      monsterId: monsterId,
      stats: stats,
      animT: timeSec || 0,
      walkPhase: (timeSec || 0) * 3.5,
      hitFlash: 0,
      grounded: true,
      vz: 0,
      fuel: monsterId === 'tin_colossus' ? 60 : 40,
      batteryActive: monsterId === 'tin_colossus',
      gliding: false,
      jetHopTicks: 0,
      fistOut: false,
      state: 'idle',
      stateTick: 0
    };
    const scale = Math.min(w / 118, h / 118) * (stats.scale || 1) * 0.94;
    const bob = Math.sin((timeSec || 0) * 3.2) * 2.2;
    ctx.save();
    ctx.translate(w * 0.5, h * 0.85 - bob);
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawMonsterBody(ctx, mockKaiju, {
      walking: false,
      backFacing: false,
      stride: 0,
      armAngle: Math.sin((timeSec || 0) * 2.4) * 0.08 - 0.12,
      armExtend: 0
    });
    ctx.restore();
  }

  function drawCityPreview(ctx, cityId, w, h) {
    const cityDef = (KB.CITIES && KB.CITIES.DEFS && (KB.CITIES.DEFS[cityId] || KB.CITIES.DEFS.pinebrook));
    if (!ctx || !cityDef) return;
    const pal = cityDef.palette;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Distant stylized skyline matching city palette
    const blds = cityDef.buildings || [];
    const rand = U.rng(blds.length * 97 + 17);
    const count = Math.min(8, Math.max(4, blds.length));
    for (let i = 0; i < count; i++) {
      const b = blds[i % blds.length];
      const bw = Math.max(18, Math.round(w / (count + 1.5)));
      const bh = Math.round(h * (0.28 + (b.h || 2) * 0.095));
      const bx = Math.round((w / (count + 0.5)) * (i + 0.35));
      const by = h - 14 - bh;
      ctx.fillStyle = i % 2 === 0 ? (pal.brick || '#9d7657') : (pal.steel || '#627993');
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = pal.roof || '#4c5b6e';
      ctx.fillRect(bx - 1, by - 3, bw + 2, 4);
      ctx.fillStyle = '#ffe599';
      for (let wy = by + 6; wy < by + bh - 8; wy += 9) {
        for (let wx = bx + 4; wx < bx + bw - 5; wx += 7) {
          if (rand() > 0.35) ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
    ctx.fillStyle = pal.asphalt || '#2d3138';
    ctx.fillRect(0, h - 14, w, 14);
    ctx.fillStyle = pal.curb || '#6e737b';
    ctx.fillRect(0, h - 14, w, 2);
  }

  KB.Render = {
    renderScene: renderScene,
    drawMonsterPreview: drawMonsterPreview,
    drawCityPreview: drawCityPreview,
    invalidateGroundCache: function () { groundCache.cityId = null; }
  };
})();
