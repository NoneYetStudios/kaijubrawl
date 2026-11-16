/* Kaiju Brawl - 2:1 dimetric isometric projection, camera, culling, and topological depth sort. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const U = KB.Util;
  const TW = 96;
  const TH = 48;
  const HALF_W = TW * 0.5;
  const HALF_H = TH * 0.5;

  function zoomForOrient(effectiveOrient) {
    return effectiveOrient === 'portrait' ? 0.80 : 1.0;
  }

  function bottomInsetForOrient(effectiveOrient, H) {
    return effectiveOrient === 'portrait' ? H * 0.26 : 0;
  }

  /* World (x, y in tiles; z in px-equiv height) -> unscaled world-screen (sx, sy) */
  function worldToScreen(x, y, z) {
    return {
      sx: (x - y) * HALF_W,
      sy: (x + y) * HALF_H - (z || 0)
    };
  }

  /* Unscaled world-screen (sx, sy) -> world (x, y) on ground plane z = 0 */
  function screenToWorld(sx, sy) {
    return {
      x: (sx / HALF_W + sy / HALF_H) * 0.5,
      y: (sy / HALF_H - sx / HALF_W) * 0.5
    };
  }

  /* Screen-space movement vector (mx, my) -> normalized world-plane direction */
  function screenDirToWorld(mx, my) {
    if (mx === 0 && my === 0) return { x: 0, y: 0 };
    const wx = (mx / HALF_W + my / HALF_H) * 0.5;
    const wy = (my / HALF_H - mx / HALF_W) * 0.5;
    return U.vec2.norm(wx, wy);
  }

  /* Unscaled world-screen -> canvas pixel coords */
  function screenToCanvas(sx, sy, cam, view) {
    const z = view.zoom;
    return {
      cx: (sx - cam.x + cam.shakeX) * z + view.w * 0.5,
      cy: (sy - cam.y + cam.shakeY) * z + view.h * 0.5 - view.bottomInset * 0.5
    };
  }

  /* Canvas pixel coords -> unscaled world-screen */
  function canvasToScreen(cx, cy, cam, view) {
    const z = view.zoom;
    return {
      sx: (cx - view.w * 0.5) / z + cam.x,
      sy: (cy - (view.h * 0.5 - view.bottomInset * 0.5)) / z + cam.y
    };
  }

  function canvasToWorld(cx, cy, cam, view) {
    const s = canvasToScreen(cx, cy, cam, view);
    return screenToWorld(s.sx, s.sy);
  }

  function createCamera(cols, rows) {
    const center = worldToScreen(cols * 0.5, rows * 0.5, 0);
    return {
      x: center.sx,
      y: center.sy,
      targetX: center.sx,
      targetY: center.sy,
      shakeAmp: 0,
      shakeX: 0,
      shakeY: 0
    };
  }

  function clampCamera(cam, cols, rows, view) {
    const z = view.zoom;
    const visW = view.w / z;
    const visH = (view.h - view.bottomInset) / z;

    const minSx = -rows * HALF_W;
    const maxSx = cols * HALF_W;
    const minSy = 0;
    const maxSy = (cols + rows) * HALF_H;

    const padX = TW;
    const padTop = TH * 2.5;
    const padBot = TH * 1.25;

    const loX = minSx - padX + visW * 0.5;
    const hiX = maxSx + padX - visW * 0.5;
    if (loX <= hiX) {
      cam.x = U.clamp(cam.x, loX, hiX);
    } else {
      cam.x = (minSx + maxSx) * 0.5;
    }

    const loY = minSy - padTop + visH * 0.5;
    const hiY = maxSy + padBot - visH * 0.5;
    if (loY <= hiY) {
      cam.y = U.clamp(cam.y, loY, hiY);
    } else {
      cam.y = (minSy + maxSy) * 0.5;
    }
  }

  function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function updateCamera(cam, targetWorldX, targetWorldY, cols, rows, view, dt) {
    const p = worldToScreen(targetWorldX, targetWorldY, 0);
    cam.targetX = p.sx;
    cam.targetY = p.sy;
    const alpha = 1 - Math.exp(-8 * dt);
    cam.x += (cam.targetX - cam.x) * alpha;
    cam.y += (cam.targetY - cam.y) * alpha;
    clampCamera(cam, cols, rows, view);

    if (prefersReducedMotion()) {
      cam.shakeAmp = 0;
      cam.shakeX = 0;
      cam.shakeY = 0;
      return;
    }

    if (cam.shakeAmp > 0.05) {
      cam.shakeX = (Math.random() * 2 - 1) * cam.shakeAmp;
      cam.shakeY = (Math.random() * 2 - 1) * cam.shakeAmp;
      cam.shakeAmp *= Math.exp(-14 * dt);
    } else {
      cam.shakeAmp = 0;
      cam.shakeX = 0;
      cam.shakeY = 0;
    }
  }

  function computeScreenBounds(item) {
    const pad = item.screenPad || 8;
    item.sMinX = (item.fx0 - item.fy1) * HALF_W - pad;
    item.sMaxX = (item.fx1 - item.fy0) * HALF_W + pad;
    item.sMinY = (item.fx0 + item.fy0) * HALF_H - item.zTop - pad;
    item.sMaxY = (item.fx1 + item.fy1) * HALF_H - item.zBase + pad;
  }

  /*
   * Footprint-separation comparator (PLAN.md §4.3):
   * Returns -1 if A must be drawn BEFORE (behind) B,
   *          1 if A must be drawn AFTER (in front of) B,
   *          0 if no depth constraint (e.g. strictly NE/SW separated on screen X).
   */
  function behind(A, B) {
    const ac = A.collBox;
    const bc = B.collBox;
    const ax0 = ac ? ac.x0 : A.fx0;
    const ay0 = ac ? ac.y0 : A.fy0;
    const ax1 = ac ? ac.x1 : A.fx1;
    const ay1 = ac ? ac.y1 : A.fy1;
    const bx0 = bc ? bc.x0 : B.fx0;
    const by0 = bc ? bc.y0 : B.fy0;
    const bx1 = bc ? bc.x1 : B.fx1;
    const by1 = bc ? bc.y1 : B.fy1;

    const westOf = ax1 <= bx0;
    const eastOf = bx1 <= ax0;
    const northOf = ay1 <= by0;
    const southOf = by1 <= ay0;
    if ((westOf && southOf) || (eastOf && northOf)) return 0;
    if (westOf || northOf) return -1;
    if (eastOf || southOf) return 1;
    if (A.zTop <= B.zBase) return -1;
    if (B.zTop <= A.zBase) return 1;
    return ((ax0 + ax1 + ay0 + ay1) - (bx0 + bx1 + by0 + by1)) || (A.id - B.id);
  }

  function sortDrawables(items, useBroadPhase) {
    const n = items.length;
    if (n === 0) return [];
    if (n === 1) {
      items[0]._sortOrder = 0;
      return [items[0]];
    }

    for (let i = 0; i < n; i++) {
      computeScreenBounds(items[i]);
    }

    const sortedByX = items.slice().sort(function (a, b) {
      return (a.sMinX - b.sMinX) || (a.id - b.id);
    });

    const adj = new Array(n);
    const inDeg = new Int32Array(n);
    for (let i = 0; i < n; i++) adj[i] = [];

    const checkBroad = useBroadPhase !== false;
    for (let i = 0; i < n; i++) {
      const A = sortedByX[i];
      for (let j = i + 1; j < n; j++) {
        const B = sortedByX[j];
        if (checkBroad && B.sMinX >= A.sMaxX) break;
        if (checkBroad && (A.sMaxY <= B.sMinY || B.sMaxY <= A.sMinY)) continue;

        const cmp = behind(A, B);
        if (cmp < 0) {
          adj[i].push(j);
          inDeg[j]++;
        } else if (cmp > 0) {
          adj[j].push(i);
          inDeg[i]++;
        }
      }
    }

    const placed = new Uint8Array(n);
    const queue = [];
    for (let i = 0; i < n; i++) {
      if (inDeg[i] === 0) queue.push(i);
    }

    const result = [];
    let qHead = 0;

    function emit(idx) {
      placed[idx] = 1;
      const item = sortedByX[idx];
      item._sortOrder = result.length;
      result.push(item);
      const edges = adj[idx];
      for (let k = 0; k < edges.length; k++) {
        const nb = edges[k];
        if (!placed[nb]) {
          inDeg[nb]--;
          if (inDeg[nb] === 0) queue.push(nb);
        }
      }
    }

    while (result.length < n) {
      if (qHead < queue.length) {
        emit(queue[qHead++]);
      } else {
        let bestIdx = -1;
        let bestKey = Infinity;
        for (let i = 0; i < n; i++) {
          if (placed[i]) continue;
          const it = sortedByX[i];
          const c = it.collBox;
          const key = c ? (c.x0 + c.x1 + c.y0 + c.y1) : (it.fx0 + it.fx1 + it.fy0 + it.fy1);
          if (key < bestKey || (key === bestKey && it.id < sortedByX[bestIdx].id)) {
            bestKey = key;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) break;
        emit(bestIdx);
      }
    }

    return result;
  }

  function cullAndSort(items, cam, view) {
    const z = view.zoom;
    const halfW = (view.w * 0.5) / z + 48;
    const halfH = (view.h * 0.5) / z + 48;
    const centerOffsetY = (view.bottomInset * 0.5) / z;

    const visMinX = cam.x - halfW;
    const visMaxX = cam.x + halfW;
    const visMinY = cam.y + centerOffsetY - halfH;
    const visMaxY = cam.y + centerOffsetY + halfH;

    const visible = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      computeScreenBounds(it);
      if (it.sMaxX < visMinX || it.sMinX > visMaxX || it.sMaxY < visMinY || it.sMinY > visMaxY) {
        continue;
      }
      visible.push(it);
    }

    return sortDrawables(visible, true);
  }

  KB.Iso = {
    TW: TW,
    TH: TH,
    HALF_W: HALF_W,
    HALF_H: HALF_H,
    zoomForOrient: zoomForOrient,
    bottomInsetForOrient: bottomInsetForOrient,
    worldToScreen: worldToScreen,
    screenToWorld: screenToWorld,
    screenDirToWorld: screenDirToWorld,
    screenToCanvas: screenToCanvas,
    canvasToScreen: canvasToScreen,
    canvasToWorld: canvasToWorld,
    createCamera: createCamera,
    clampCamera: clampCamera,
    updateCamera: updateCamera,
    computeScreenBounds: computeScreenBounds,
    behind: behind,
    sortDrawables: sortDrawables,
    cullAndSort: cullAndSort
  };
})();
