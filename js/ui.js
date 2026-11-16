/* Kaiju Brawl - menus, select flow, orientation/touch toggles, dual-mode leaderboard, game-over flow. */
(function () {
  'use strict';
  window.KB = window.KB || {};

  const CFG = KB.CONFIG;
  const Game = KB.Game;
  const Snd = KB.Audio;
  const In = KB.Input;
  const $ = function (id) { return document.getElementById(id); };
  const screens = ['menu', 'select', 'how', 'board', 'pause', 'over'];

  const TOUCH_KEY = 'kb_touch';
  const FILM_FX_KEY = 'kb_film_fx';
  const NAME_KEY = 'kb_name';
  const LOCAL_SCORES_KEY = 'kb_local_scores_v1';
  const NAME_REGEX = /^[A-Za-z0-9 _.\-!?]+$/;

  let current = 'menu';
  let boardReturn = 'menu';
  let howReturn = 'menu';
  let touchPref = 'auto'; // 'auto' | 'on' | 'off'
  let selectPreviewRaf = 0;
  let monsterPreviews = [];
  let cityPreviews = [];

  let serverAvailable = null; // null = untried, true = php ok, false = fallback local
  let lastResult = null;
  let submitted = false;
  let submitting = false;
  let highlightName = null;

  let boardView = 'overall'; // 'overall' | 'monster' | 'city'
  let boardMonsterFilter = null;
  let boardCityFilter = null;
  let overBoardScope = 'city'; // 'city' | 'overall'

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function fmtElapsed(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function monsterLabel(id) {
    const m = KB.MONSTERS && KB.MONSTERS[id];
    return m ? m.name : String(id || 'KAIJU').toUpperCase();
  }

  function cityLabel(id) {
    const c = KB.CITIES && KB.CITIES.DEFS && KB.CITIES.DEFS[id];
    return c ? c.name : String(id || 'PINEBROOK').toUpperCase();
  }

  function cityShortLabel(id) {
    if (id === 'pinebrook') return 'PINEBROOK';
    if (id === 'atom_city') return 'ATOM CITY';
    if (id === 'metro_heights') return 'METRO HEIGHTS';
    if (id === 'caldera_isle') return 'CALDERA ISLE';
    if (id === 'harbor_pier') return 'HARBOR PIER';
    return cityLabel(id);
  }

  const backBtn = $('backBtn');
  if (backBtn) backBtn.href = CFG.ARCADE_URL;

  /* ---------- Touch Device & Force-Touch Toggle ---------- */
  const savedTouch = lsGet(TOUCH_KEY);
  if (savedTouch === 'auto' || savedTouch === 'on' || savedTouch === 'off') {
    touchPref = savedTouch;
  }

  function syncTouchUi() {
    const coarse = In.isTouchDevice || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const active = touchPref === 'on' || (touchPref === 'auto' && coarse);
    document.body.classList.toggle('touch', coarse && touchPref !== 'off');
    document.body.classList.toggle('force-touch', touchPref === 'on');

    const btn = $('btnPauseTouch');
    if (btn) {
      const label = touchPref === 'auto'
        ? ('TOUCH OVERLAY: AUTO (' + (coarse ? 'ON' : 'OFF') + ')')
        : ('TOUCH OVERLAY: ' + touchPref.toUpperCase());
      btn.textContent = label;
      btn.classList.toggle('active', active);
    }
  }
  syncTouchUi();

  if ($('btnPauseTouch')) {
    $('btnPauseTouch').addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      const order = ['auto', 'on', 'off'];
      touchPref = order[(order.indexOf(touchPref) + 1) % order.length];
      lsSet(TOUCH_KEY, touchPref);
      syncTouchUi();
      this.blur();
    });
  }

  /* ---------- 1950s Film Projector FX Toggle ---------- */
  const savedFilmFx = lsGet(FILM_FX_KEY);
  if (savedFilmFx === '0') CFG.FILM_FX = false;
  else if (savedFilmFx === '1') CFG.FILM_FX = true;

  function syncFilmFxUi() {
    const btn = $('btnPauseFilmFx');
    if (btn) {
      btn.textContent = 'FILM FX: ' + (CFG.FILM_FX ? 'ON' : 'OFF');
      btn.classList.toggle('active', !!CFG.FILM_FX);
    }
  }
  syncFilmFxUi();

  if ($('btnPauseFilmFx')) {
    $('btnPauseFilmFx').addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      CFG.FILM_FX = !CFG.FILM_FX;
      lsSet(FILM_FX_KEY, CFG.FILM_FX ? '1' : '0');
      syncFilmFxUi();
      this.blur();
    });
  }

  /* ---------- Screen Switching ---------- */
  function stopSelectPreviewLoop() {
    if (selectPreviewRaf) {
      cancelAnimationFrame(selectPreviewRaf);
      selectPreviewRaf = 0;
    }
  }

  function stepSelectPreviews(ts) {
    if (current !== 'select') {
      selectPreviewRaf = 0;
      return;
    }
    const sec = (ts || 0) * 0.001;
    if (KB.Render && KB.Render.drawMonsterPreview) {
      for (let i = 0; i < monsterPreviews.length; i++) {
        const item = monsterPreviews[i];
        const ctx = item.canvas.getContext('2d');
        if (ctx) KB.Render.drawMonsterPreview(ctx, item.id, item.canvas.width, item.canvas.height, sec + i * 0.7);
      }
    }
    if (KB.Render && KB.Render.drawCityPreview) {
      for (let i = 0; i < cityPreviews.length; i++) {
        const item = cityPreviews[i];
        const ctx = item.canvas.getContext('2d');
        if (ctx) KB.Render.drawCityPreview(ctx, item.id, item.canvas.width, item.canvas.height, sec + i * 0.7);
      }
    }
    selectPreviewRaf = requestAnimationFrame(stepSelectPreviews);
  }

  function show(name) {
    current = name;
    screens.forEach(function (s) {
      const el = $('screen-' + s);
      if (el) el.classList.toggle('active', s === name);
    });
    if (name === 'menu' && $('menuHi')) {
      $('menuHi').textContent = Game.getHigh().toLocaleString();
    }
    if (name === 'select') {
      renderSelectCards();
      stopSelectPreviewLoop();
      if (typeof requestAnimationFrame === 'function') {
        selectPreviewRaf = requestAnimationFrame(stepSelectPreviews);
      }
    } else {
      stopSelectPreviewLoop();
    }
  }

  function hideAll() {
    current = 'none';
    stopSelectPreviewLoop();
    screens.forEach(function (s) {
      const el = $('screen-' + s);
      if (el) el.classList.remove('active');
    });
  }

  function openSelect() {
    Snd.resume();
    Snd.sfx.click();
    show('select');
  }

  function play() {
    Snd.resume();
    hideAll();
    Game.start();
  }

  /* ---------- Monster & City Select Builder (M7/M9) ---------- */
  function statPct(val, minV, maxV) {
    return Math.round(Math.max(12, Math.min(100, ((val - minV) / (maxV - minV)) * 88 + 12)));
  }

  function centerCard(cardEl) {
    if (cardEl && cardEl.scrollIntoView) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  function syncSelectHighlight(shouldCenter) {
    const selM = Game.getSelectedMonster ? Game.getSelectedMonster() : 'gorgantor';
    const selC = Game.getSelectedCity ? Game.getSelectedCity() : 'pinebrook';
    const mGrid = $('monsterSelectGrid');
    const cGrid = $('citySelectGrid');
    if (mGrid) {
      const cards = mGrid.querySelectorAll('.monster-card');
      for (let i = 0; i < cards.length; i++) {
        const isSel = cards[i].getAttribute('data-id') === selM;
        cards[i].classList.toggle('selected', isSel);
        if (isSel && shouldCenter) centerCard(cards[i]);
      }
    }
    if (cGrid) {
      const cards = cGrid.querySelectorAll('.city-card');
      for (let i = 0; i < cards.length; i++) {
        const isSel = cards[i].getAttribute('data-id') === selC;
        cards[i].classList.toggle('selected', isSel);
        if (isSel && shouldCenter) centerCard(cards[i]);
      }
    }
  }

  function buildSelectCards() {
    const mGrid = $('monsterSelectGrid');
    const cGrid = $('citySelectGrid');
    if (mGrid && mGrid.children.length === 0 && KB.MONSTERS) {
      monsterPreviews = [];
      const order = KB.MONSTER_ORDER || Object.keys(KB.MONSTERS);
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        const m = KB.MONSTERS[id];
        if (!m) continue;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'monster-card';
        card.setAttribute('data-id', id);

        const barsHtml = [
          ['HP', statPct(m.hp, 700, 1350)],
          ['SPD', statPct(m.speed, 1.6, 4.2)],
          ['PWR', statPct(m.power, 0.75, 1.25)],
          ['DEF', statPct(1.3 - m.defense, 0.05, 0.6)]
        ].map(function (row) {
          return '<span>' + row[0] + '</span><span class="stat-track"><span class="stat-fill" style="width:' + row[1] + '%"></span></span>';
        }).join('');

        card.innerHTML =
          '<div class="select-preview-wrap">' +
            '<canvas class="select-preview" width="160" height="106"></canvas>' +
            '<span class="select-badge">STARRING</span>' +
          '</div>' +
          '<div class="monster-title">' + m.name + '</div>' +
          '<div class="monster-sub">' + (m.title || m.archetype || '') + '</div>' +
          '<div class="monster-blurb">' + (m.blurb || '') + '</div>' +
          '<div class="stat-bars">' + barsHtml + '</div>' +
          '<div class="monster-kit"><b>SPC:</b> ' + (m.special ? m.special.name : '') + '<br><b>ULT:</b> ' + (m.ultimate ? m.ultimate.name : '') + '</div>';

        card.addEventListener('click', (function (mid, cardEl) {
          return function () {
            Snd.resume();
            Snd.sfx.click();
            if (Game.setSelectedMonster) Game.setSelectedMonster(mid);
            syncSelectHighlight(false);
            centerCard(cardEl);
          };
        })(id, card));

        mGrid.appendChild(card);
        const cv = card.querySelector('canvas');
        if (cv) monsterPreviews.push({ id: id, canvas: cv });
      }
    }

    if (cGrid && cGrid.children.length === 0 && KB.CITIES && KB.CITIES.DEFS) {
      cityPreviews = [];
      const cKeys = Object.keys(KB.CITIES.DEFS);
      for (let i = 0; i < cKeys.length; i++) {
        const cid = cKeys[i];
        const c = KB.CITIES.DEFS[cid];
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'city-card';
        card.setAttribute('data-id', cid);
        card.innerHTML =
          '<canvas class="city-preview" width="220" height="64"></canvas>' +
          '<span class="select-badge">ON SET</span>' +
          '<div class="city-name">' + c.name + '</div>' +
          '<div class="city-sub">' + c.subtitle + '</div>';
        card.addEventListener('click', (function (cityId, cardEl) {
          return function () {
            Snd.resume();
            Snd.sfx.click();
            if (Game.setSelectedCity) Game.setSelectedCity(cityId);
            syncSelectHighlight(false);
            centerCard(cardEl);
          };
        })(cid, card));
        cGrid.appendChild(card);
        const cv = card.querySelector('canvas');
        if (cv) {
          cityPreviews.push({ id: cid, canvas: cv });
          if (KB.Render && KB.Render.drawCityPreview) {
            const cctx = cv.getContext('2d');
            if (cctx) KB.Render.drawCityPreview(cctx, cid, cv.width, cv.height, i * 0.7);
          }
        }
      }
    }
  }

  function renderSelectCards() {
    buildSelectCards();
    syncSelectHighlight(true);
    if (KB.Render && KB.Render.drawMonsterPreview) {
      for (let i = 0; i < monsterPreviews.length; i++) {
        const item = monsterPreviews[i];
        const ctx = item.canvas.getContext('2d');
        if (ctx) KB.Render.drawMonsterPreview(ctx, item.id, item.canvas.width, item.canvas.height, i * 0.7);
      }
    }
    if (KB.Render && KB.Render.drawCityPreview) {
      for (let i = 0; i < cityPreviews.length; i++) {
        const item = cityPreviews[i];
        const ctx = item.canvas.getContext('2d');
        if (ctx) KB.Render.drawCityPreview(ctx, item.id, item.canvas.width, item.canvas.height, i * 0.7);
      }
    }
  }

  function stepMonsterChoice(dir) {
    const order = KB.MONSTER_ORDER || Object.keys(KB.MONSTERS || {});
    if (!order.length || !Game.getSelectedMonster || !Game.setSelectedMonster) return;
    const idx = Math.max(0, order.indexOf(Game.getSelectedMonster()));
    const next = order[(idx + dir + order.length) % order.length];
    Snd.sfx.click();
    Game.setSelectedMonster(next);
    syncSelectHighlight(true);
  }

  function bindCarouselControls(gridId, prevId, nextId) {
    const grid = $(gridId);
    if (!grid) return;
    const prev = $(prevId);
    const next = $(nextId);
    const stepScroll = function (dx) {
      Snd.resume();
      Snd.sfx.click();
      if (grid.scrollBy) {
        grid.scrollBy({ left: dx, behavior: 'smooth' });
      } else {
        grid.scrollLeft = (grid.scrollLeft || 0) + dx;
      }
    };
    if (prev) prev.addEventListener('click', function () { stepScroll(-240); });
    if (next) next.addEventListener('click', function () { stepScroll(240); });
    grid.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        grid.scrollLeft = (grid.scrollLeft || 0) + e.deltaY;
      }
    }, { passive: false });
  }
  bindCarouselControls('monsterSelectGrid', 'btnMonsterPrev', 'btnMonsterNext');
  bindCarouselControls('citySelectGrid', 'btnCityPrev', 'btnCityNext');

  /* ---------- Matinee Program Loot Legend Icons ---------- */
  function drawLegendIcons() {
    const TAU = Math.PI * 2;
    function ctxOf(id) {
      const el = $(id);
      if (!el || !el.getContext) return null;
      const c = el.getContext('2d');
      if (!c) return null;
      c.clearRect(0, 0, el.width, el.height);
      c.save();
      c.translate(el.width * 0.5, el.height * 0.5);
      return c;
    }

    // Health Orb (+15 HP, pulsing red cross)
    let c = ctxOf('icoHealth');
    if (c) {
      c.fillStyle = '#ff6b7a';
      c.strokeStyle = '#1b1209';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 14, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffffff';
      c.fillRect(-2.5, -7.5, 5, 15);
      c.fillRect(-7.5, -2.5, 15, 5);
      c.restore();
    }

    // Atomic Fuel Canister (+25 Fuel, green)
    c = ctxOf('icoFuel');
    if (c) {
      c.fillStyle = '#7dff4f';
      c.strokeStyle = '#1b1209';
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(-10, -13, 20, 26, 4);
      c.fill();
      c.stroke();
      c.fillStyle = '#1b1209';
      c.fillRect(-5, -5, 10, 10);
      c.fillStyle = '#d9ffcb';
      c.fillRect(-2, -3, 4, 6);
      c.restore();
    }

    // Steel Girder
    c = ctxOf('icoGirder');
    if (c) {
      c.rotate(-0.28);
      c.fillStyle = '#8b99a6';
      c.strokeStyle = '#1b1209';
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(-16, -5, 32, 10, 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#5c6975';
      c.fillRect(-13, -2, 26, 4);
      c.restore();
    }

    // Fuel Tanker
    c = ctxOf('icoTanker');
    if (c) {
      c.fillStyle = '#d93838';
      c.strokeStyle = '#1b1209';
      c.lineWidth = 2;
      c.beginPath();
      c.roundRect(-14, -9, 28, 18, 6);
      c.fill();
      c.stroke();
      c.fillStyle = '#ffd23f';
      c.fillRect(-5, -9, 10, 18);
      c.strokeRect(-5, -9, 10, 18);
      c.restore();
    }
  }
  drawLegendIcons();

  /* ---------- Sound Toggle ---------- */
  function syncSound() {
    if ($('btnSound')) $('btnSound').classList.toggle('off', !Snd.sfxOn);
  }
  function toggleSound() {
    Snd.resume();
    Snd.setSfx(!Snd.sfxOn);
    syncSound();
  }
  if ($('btnSound')) {
    $('btnSound').addEventListener('click', function () {
      toggleSound();
      this.blur();
    });
  }
  syncSound();

  /* ---------- Orientation Toggle (Auto / Portrait / Landscape) ---------- */
  function syncOrientationUi(pref, eff) {
    const labelMap = {
      auto: 'VIEW: AUTO',
      portrait: 'VIEW: 9:16',
      landscape: 'VIEW: 16:9'
    };
    if ($('btnView')) {
      $('btnView').textContent = labelMap[pref] || 'VIEW: AUTO';
      $('btnView').title = 'Orientation (' + eff + ') - Click to switch';
    }
    document.querySelectorAll('[data-orient]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-orient') === pref);
    });
  }

  Game.onOrientChange = syncOrientationUi;
  syncOrientationUi(Game.getOrientationMode(), Game.getEffectiveOrientation());

  if ($('btnView')) {
    $('btnView').addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      const order = ['auto', 'portrait', 'landscape'];
      const cur = Game.getOrientationMode();
      const next = order[(order.indexOf(cur) + 1) % order.length];
      Game.setOrientationMode(next);
      this.blur();
    });
  }

  document.querySelectorAll('[data-orient]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      Game.setOrientationMode(btn.getAttribute('data-orient'));
    });
  });

  /* ---------- Dual-Mode Leaderboard (PHP API + Local Mode Fallback) ---------- */
  function getLocalScores() {
    try {
      const raw = localStorage.getItem(LOCAL_SCORES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalScores(list) {
    try {
      localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(list));
    } catch (e) { }
  }

  function compareRuns(a, b) {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.kos || 0) !== (a.kos || 0)) return (b.kos || 0) - (a.kos || 0);
    if ((b.survival_time || 0) !== (a.survival_time || 0)) return (b.survival_time || 0) - (a.survival_time || 0);
    return (a.created_at || 0) - (b.created_at || 0);
  }

  /** Derive best-per-player leaderboard entries within an optional (monster_id, city_id) scope. */
  function bestPerPlayer(list, monsterId, cityId) {
    const byPlayer = Object.create(null);
    const items = Array.isArray(list) ? list : [];
    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      if (!row || !row.player_name) continue;
      if (monsterId && row.monster_id !== monsterId) continue;
      if (cityId && row.city_id !== cityId) continue;
      const nk = String(row.player_name).toLowerCase();
      if (!byPlayer[nk] || compareRuns(row, byPlayer[nk]) < 0) {
        byPlayer[nk] = row;
      }
    }
    const best = Object.keys(byPlayer).map(function (k) { return byPlayer[k]; });
    best.sort(compareRuns);
    return best.map(function (entry, idx) {
      return {
        rank: idx + 1,
        player_name: entry.player_name,
        monster_id: entry.monster_id,
        city_id: entry.city_id,
        score: Number(entry.score || 0),
        kos: Number(entry.kos || 0),
        buildings_wrecked: Number(entry.buildings_wrecked || 0),
        survival_time: Number(entry.survival_time || 0),
        created_at: Number(entry.created_at || 0)
      };
    });
  }

  function cleanName(s) {
    return String(s || '').replace(/[^A-Za-z0-9 _.\-!?]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  }

  function submitLocalScore(payload) {
    const playerName = cleanName(payload.player_name || payload.name);
    const nameKey = playerName.toLowerCase();
    const monsterId = payload.monster_id || 'gorgantor';
    const cityId = payload.city_id || 'pinebrook';
    const score = Math.max(0, Math.round(Number(payload.score || 0)));
    const kos = Math.max(0, Math.round(Number(payload.kos || 0)));
    const wrecked = Math.max(0, Math.round(Number(payload.buildings_wrecked || 0)));
    const survivalTime = Math.max(1, Math.round(Number(payload.survival_time || 1)));
    const now = Math.floor(Date.now() / 1000);

    let list = getLocalScores();
    const idx = list.findIndex(function (e) {
      return e && String(e.player_name || '').toLowerCase() === nameKey &&
        e.monster_id === monsterId && e.city_id === cityId;
    });

    let status = 'new';
    let record = {
      player_name: playerName,
      monster_id: monsterId,
      city_id: cityId,
      score: score,
      kos: kos,
      buildings_wrecked: wrecked,
      survival_time: survivalTime,
      created_at: now
    };

    if (idx >= 0) {
      const ex = list[idx];
      const better = score > (ex.score || 0) ||
        (score === (ex.score || 0) && kos > (ex.kos || 0)) ||
        (score === (ex.score || 0) && kos === (ex.kos || 0) && survivalTime > (ex.survival_time || 0));
      if (better) {
        list[idx] = record;
        status = 'improved';
      } else if (
        score === (ex.score || 0) &&
        kos === (ex.kos || 0) &&
        wrecked === (ex.buildings_wrecked || 0) &&
        survivalTime === (ex.survival_time || 0)
      ) {
        status = 'duplicate';
        record = ex;
      } else {
        status = 'not_improved';
        record = ex;
      }
    } else {
      list.push(record);
    }

    // Prune per (monster_id, city_id) combo to top 100
    const comboRows = list.filter(function (e) { return e.monster_id === monsterId && e.city_id === cityId; });
    if (comboRows.length > 100) {
      comboRows.sort(compareRuns);
      const keep = new Set(comboRows.slice(0, 100));
      list = list.filter(function (e) {
        return !(e.monster_id === monsterId && e.city_id === cityId) || keep.has(e);
      });
    }

    saveLocalScores(list);

    const findRank = function (m, c) {
      const ranked = bestPerPlayer(list, m, c);
      const pos = ranked.findIndex(function (e) { return e.player_name.toLowerCase() === nameKey; });
      return pos >= 0 ? pos + 1 : 1;
    };

    return {
      ok: true,
      status: status,
      rank_overall: findRank(null, null),
      rank_monster: findRank(monsterId, null),
      rank_city: findRank(null, cityId),
      best: record
    };
  }

  function fetchLeaderboardEntries(opts) {
    const limit = Math.max(1, Math.min(25, (opts && opts.limit) || CFG.LEADERBOARD_SIZE || 25));
    const monsterId = (opts && opts.monster_id) || null;
    const cityId = (opts && opts.city_id) || null;
    const view = (opts && opts.view) || 'overall';

    const params = ['limit=' + limit, 'view=' + encodeURIComponent(view), '_=' + Date.now()];
    if (monsterId) params.push('monster_id=' + encodeURIComponent(monsterId));
    if (cityId) params.push('city_id=' + encodeURIComponent(cityId));

    const localFallback = function () {
      serverAvailable = false;
      const entries = bestPerPlayer(getLocalScores(), monsterId, cityId).slice(0, limit);
      return { local: true, entries: entries };
    };

    if (typeof fetch !== 'function') {
      return Promise.resolve(localFallback());
    }

    return fetch(CFG.API_LEADERBOARD + '?' + params.join('&'), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (ct.indexOf('application/json') === -1) throw new Error('Not JSON');
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.error) || 'Bad response');
        serverAvailable = true;
        return { local: false, entries: d.entries || [] };
      })
      .catch(localFallback);
  }

  function renderTable(headEl, bodyEl, entries, opts) {
    const showMonster = !!(opts && opts.showMonster);
    const showCity = !!(opts && opts.showCity);
    const showDate = !!(opts && opts.showDate);

    if (headEl) {
      headEl.innerHTML = '<tr><th>#</th><th>PLAYER</th>' +
        (showMonster ? '<th>MONSTER</th>' : '') +
        (showCity ? '<th>CITY</th>' : '') +
        '<th>SCORE</th><th>KOs</th><th>TIME</th>' +
        (showDate ? '<th class="hide-sm">DATE</th>' : '') +
        '</tr>';
    }
    if (!bodyEl) return;

    bodyEl.innerHTML = entries.map(function (e) {
      const pname = e.player_name || e.name || 'KAIJU';
      const me = highlightName && pname.toLowerCase() === highlightName.toLowerCase();
      const cls = (me ? 'me ' : '') + (e.rank <= 3 ? 'top' + e.rank : '');
      const date = e.created_at ? new Date(e.created_at * 1000).toLocaleDateString() : '';
      return '<tr class="' + cls.trim() + '">' +
        '<td>' + e.rank + '</td>' +
        '<td>' + esc(pname) + '</td>' +
        (showMonster ? '<td>' + esc(monsterLabel(e.monster_id)) + '</td>' : '') +
        (showCity ? '<td>' + esc(cityShortLabel(e.city_id)) + '</td>' : '') +
        '<td>' + Number(e.score || 0).toLocaleString() + '</td>' +
        '<td>' + Number(e.kos || 0) + '</td>' +
        '<td>' + fmtElapsed(e.survival_time) + '</td>' +
        (showDate ? '<td class="hide-sm">' + esc(date) + '</td>' : '') +
        '</tr>';
    }).join('');
  }

  function renderBoardFilterChips() {
    const row = $('boardFilterRow');
    if (!row) return;
    if (boardView === 'overall') {
      row.classList.add('hidden');
      row.innerHTML = '';
      return;
    }
    row.classList.remove('hidden');
    row.innerHTML = '';

    const makeChip = function (label, active, onClick) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chip small' + (active ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      return btn;
    };

    if (boardView === 'monster') {
      row.appendChild(makeChip('ALL', !boardMonsterFilter, function () {
        Snd.sfx.click();
        boardMonsterFilter = null;
        renderBoardFilterChips();
        loadBoard();
      }));
      const order = KB.MONSTER_ORDER || Object.keys(KB.MONSTERS || {});
      for (let i = 0; i < order.length; i++) {
        const mid = order[i];
        row.appendChild(makeChip(monsterLabel(mid), boardMonsterFilter === mid, (function (id) {
          return function () {
            Snd.sfx.click();
            boardMonsterFilter = id;
            renderBoardFilterChips();
            loadBoard();
          };
        })(mid)));
      }
    } else if (boardView === 'city') {
      row.appendChild(makeChip('ALL', !boardCityFilter, function () {
        Snd.sfx.click();
        boardCityFilter = null;
        renderBoardFilterChips();
        loadBoard();
      }));
      const cKeys = KB.CITIES && KB.CITIES.DEFS ? Object.keys(KB.CITIES.DEFS) : ['pinebrook', 'atom_city', 'metro_heights'];
      for (let i = 0; i < cKeys.length; i++) {
        const cid = cKeys[i];
        row.appendChild(makeChip(cityShortLabel(cid), boardCityFilter === cid, (function (id) {
          return function () {
            Snd.sfx.click();
            boardCityFilter = id;
            renderBoardFilterChips();
            loadBoard();
          };
        })(cid)));
      }
    }
  }

  function syncBoardTabButtons() {
    document.querySelectorAll('[data-board-view]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-board-view') === boardView);
    });
  }

  function loadBoard() {
    const head = $('boardHead');
    const body = $('boardBody');
    const msg = $('boardMsg');
    const notice = $('boardModeNotice');
    if (msg) msg.textContent = 'Loading…';
    if (body) body.innerHTML = '';

    const mFilter = boardView === 'monster' ? boardMonsterFilter : null;
    const cFilter = boardView === 'city' ? boardCityFilter : null;
    const showMonster = boardView !== 'monster' || !mFilter;
    const showCity = boardView !== 'city' || !cFilter;

    return fetchLeaderboardEntries({
      monster_id: mFilter,
      city_id: cFilter,
      view: boardView,
      limit: CFG.LEADERBOARD_SIZE || 25
    }).then(function (res) {
      if (notice) {
        notice.textContent = res.local ? 'LOCAL MODE — NO SERVER' : 'GLOBAL';
        notice.classList.toggle('global', !res.local);
      }
      renderTable(head, body, res.entries, {
        showMonster: showMonster,
        showCity: showCity,
        showDate: true
      });
      if (msg) {
        msg.textContent = res.entries.length
          ? ''
          : (res.local
            ? 'No local scores yet for this filter. Smash a city to claim #1!'
            : 'No scores yet for this filter. Smash a city to claim #1!');
      }
      return res;
    });
  }

  function openBoard() {
    syncBoardTabButtons();
    renderBoardFilterChips();
    show('board');
    return loadBoard();
  }

  document.querySelectorAll('[data-board-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      boardView = btn.getAttribute('data-board-view') || 'overall';
      if (boardView === 'overall') {
        boardMonsterFilter = null;
        boardCityFilter = null;
      }
      syncBoardTabButtons();
      renderBoardFilterChips();
      loadBoard();
    });
  });

  function loadGameOverBoard() {
    const head = $('overBoardHead');
    const body = $('overBoardBody');
    const msg = $('overBoardMsg');
    const notice = $('overBoardNotice');
    const title = $('overBoardTitle');
    const sw = $('btnOverBoardSwitch');
    if (!body || !msg) return Promise.resolve();

    const runCity = (lastResult && lastResult.city_id) || (Game.getSelectedCity ? Game.getSelectedCity() : 'pinebrook');
    const isCity = overBoardScope === 'city';
    if (title) {
      title.textContent = isCity ? ('TOP 8 — ' + cityShortLabel(runCity)) : 'TOP 8 — OVERALL';
    }
    if (sw) {
      sw.textContent = isCity ? 'SWITCH: OVERALL' : ('SWITCH: ' + cityShortLabel(runCity));
    }

    msg.textContent = 'Loading top scores…';
    body.innerHTML = '';

    return fetchLeaderboardEntries({
      city_id: isCity ? runCity : null,
      view: isCity ? 'city' : 'overall',
      limit: CFG.GAMEOVER_BOARD_SIZE || 8
    }).then(function (res) {
      if (notice) notice.textContent = res.local ? 'LOCAL MODE' : 'GLOBAL';
      renderTable(head, body, res.entries, {
        showMonster: true,
        showCity: !isCity,
        showDate: false
      });
      msg.textContent = res.entries.length ? '' : 'No scores posted yet — claim #1!';
      return res;
    });
  }

  if ($('btnOverBoardSwitch')) {
    $('btnOverBoardSwitch').addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      overBoardScope = overBoardScope === 'city' ? 'overall' : 'city';
      loadGameOverBoard();
    });
  }

  /* ---------- Pause & Game Over ---------- */
  function pause() {
    if (Game.pause()) show('pause');
  }
  function resume() {
    if (Game.resume()) hideAll();
  }
  Game.onAutoPause = pause;

  function setNameValidityUi(isValid, showError) {
    const inp = $('nameInput');
    if (!inp) return;
    inp.classList.toggle('user-invalid-fallback', !!showError && !isValid);
    inp.classList.toggle('user-valid-fallback', isValid && !!inp.value);
    inp.setAttribute('aria-invalid', showError && !isValid ? 'true' : 'false');
  }

  Game.onGameOver = function (res) {
    const r = res || {};
    const monsterId = r.monster_id || (Game.getSelectedMonster ? Game.getSelectedMonster() : 'gorgantor');
    const cityId = r.city_id || (Game.getSelectedCity ? Game.getSelectedCity() : 'pinebrook');
    const survivalTime = Math.max(1, Math.round(r.survival_time !== undefined ? r.survival_time : (r.elapsed || 1)));
    const wreckedCount = r.buildings_wrecked !== undefined ? r.buildings_wrecked : (r.wrecked || 0);

    lastResult = {
      score: Math.max(0, Math.round(r.score || 0)),
      highScore: Math.max(0, Math.round(r.highScore || (Game.getHigh ? Game.getHigh() : 0))),
      isNewHigh: !!r.isNewHigh,
      kos: Math.max(0, Math.round(r.kos || 0)),
      wrecked: wreckedCount,
      buildings_wrecked: wreckedCount,
      elapsed: r.elapsed || survivalTime,
      survival_time: survivalTime,
      monster_id: monsterId,
      city_id: cityId
    };
    submitted = false;
    submitting = false;
    overBoardScope = 'city';

    if ($('goScore')) $('goScore').textContent = lastResult.score.toLocaleString();
    if ($('goKos')) $('goKos').textContent = String(lastResult.kos);
    if ($('goWrecked')) $('goWrecked').textContent = String(lastResult.buildings_wrecked);
    if ($('goTime')) $('goTime').textContent = fmtElapsed(lastResult.survival_time);
    if ($('goMeta')) {
      $('goMeta').textContent = monsterLabel(monsterId) + ' · ' + cityLabel(cityId) + ' · BEST: ' + lastResult.highScore.toLocaleString();
    }
    if ($('newHigh')) $('newHigh').classList.toggle('show', lastResult.isNewHigh);

    const msg = $('submitMsg');
    if (msg) {
      msg.textContent = '';
      msg.className = 'submit-msg';
    }
    if ($('btnSubmit')) {
      $('btnSubmit').disabled = false;
      $('btnSubmit').textContent = 'SUBMIT';
    }
    if ($('nameInput')) {
      $('nameInput').value = cleanName(lsGet(NAME_KEY) || '');
      $('nameInput').disabled = false;
      setNameValidityUi(true, false);
    }

    if (KB.Audio && KB.Audio.sfx && KB.Audio.sfx.gameOver) KB.Audio.sfx.gameOver();
    show('over');
    loadGameOverBoard();

    if ($('nameInput') && window.matchMedia && !window.matchMedia('(pointer: coarse)').matches) {
      setTimeout(function () {
        if (current === 'over' && $('nameInput').focus) $('nameInput').focus();
      }, 350);
    }
  };

  if ($('nameInput')) {
    $('nameInput').addEventListener('input', function () {
      const cleaned = this.value.replace(/[^A-Za-z0-9 _.\-!?]/g, '');
      if (cleaned !== this.value) {
        const pos = this.selectionStart || 0;
        this.value = cleaned;
        if (this.setSelectionRange) {
          this.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1));
        }
      }
      const trimmed = cleanName(this.value);
      setNameValidityUi(!!trimmed && NAME_REGEX.test(trimmed), false);
    });
    $('nameInput').addEventListener('blur', function () {
      const trimmed = cleanName(this.value);
      if (this.value.length > 0) {
        setNameValidityUi(!!trimmed && NAME_REGEX.test(trimmed), true);
      }
    });
  }

  function completeSubmissionSuccess(d, name, isLocal) {
    const msg = $('submitMsg');
    const btn = $('btnSubmit');
    highlightName = name;
    submitted = true;
    submitting = false;

    const rAll = d.rank_overall || d.rank || 1;
    const rMon = d.rank_monster || 1;
    const rCity = d.rank_city || 1;
    const mName = monsterLabel((d.best && d.best.monster_id) || (lastResult && lastResult.monster_id));
    const cName = cityShortLabel((d.best && d.best.city_id) || (lastResult && lastResult.city_id));
    const rankStr = '#' + rAll + ' OVERALL · #' + rMon + ' AS ' + mName + ' · #' + rCity + ' IN ' + cName;

    const prefix = {
      new: 'Score posted! ',
      improved: 'New personal record! ',
      not_improved: 'Higher score already on file: ',
      duplicate: 'Exact score already on file: '
    }[d.status] || 'Score posted! ';

    if (msg) {
      msg.className = 'submit-msg ok';
      msg.textContent = (isLocal ? '[Local Mode] ' : '') + prefix + rankStr;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'SUBMITTED';
    }
    if ($('nameInput')) $('nameInput').disabled = true;
    loadGameOverBoard();
  }

  function handleSubmitForm(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!lastResult || submitted || submitting) return Promise.resolve();
    const msg = $('submitMsg');
    const btn = $('btnSubmit');
    const inp = $('nameInput');
    const rawVal = inp ? inp.value : '';
    const name = cleanName(rawVal);

    if (!name || name.length > 12 || !NAME_REGEX.test(name)) {
      setNameValidityUi(false, true);
      if (msg) {
        msg.className = 'submit-msg err';
        msg.textContent = 'Enter 1-12 chars: letters, numbers, spaces and _ . - ! ?';
      }
      if (inp && inp.focus) inp.focus();
      return Promise.resolve();
    }

    setNameValidityUi(true, false);
    lsSet(NAME_KEY, name);
    submitting = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '…';
    }
    if (msg) {
      msg.className = 'submit-msg';
      msg.textContent = 'Saving score…';
    }

    const payload = {
      player_name: name,
      score: lastResult.score,
      monster_id: lastResult.monster_id,
      city_id: lastResult.city_id,
      kos: lastResult.kos,
      buildings_wrecked: lastResult.buildings_wrecked,
      survival_time: lastResult.survival_time
    };

    if (serverAvailable === false || typeof fetch !== 'function') {
      const localRes = submitLocalScore(payload);
      completeSubmissionSuccess(localRes, name, true);
      return Promise.resolve(localRes);
    }

    return fetch(CFG.API_SUBMIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        const ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (ct.indexOf('application/json') === -1) {
          throw new Error('NO_API');
        }
        return r.json().then(function (d) {
          return { status: r.status, ok: r.ok, data: d };
        });
      })
      .then(function (res) {
        serverAvailable = true;
        if (!res.ok || !res.data || !res.data.ok) {
          submitting = false;
          if (msg) {
            msg.className = 'submit-msg err';
            msg.textContent = (res.data && res.data.error) || 'Could not submit score.';
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'SUBMIT';
          }
          return res.data;
        }
        completeSubmissionSuccess(res.data, name, false);
        return res.data;
      })
      .catch(function () {
        serverAvailable = false;
        const localRes = submitLocalScore(payload);
        completeSubmissionSuccess(localRes, name, true);
        return localRes;
      });
  }

  if ($('submitForm')) {
    $('submitForm').addEventListener('submit', handleSubmitForm);
  }

  if ($('btnPause')) {
    $('btnPause').addEventListener('click', function () {
      this.blur();
      if (Game.getMode() === 'play') pause();
      else if (Game.getMode() === 'pause') resume();
    });
  }
  if ($('btnDummyMode')) {
    $('btnDummyMode').addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      if (Game.cycleDummyMode) Game.cycleDummyMode();
      this.blur();
    });
  }
  if ($('btnResume')) $('btnResume').addEventListener('click', resume);
  if ($('btnQuit')) {
    $('btnQuit').addEventListener('click', function () {
      Game.quit();
      show('menu');
    });
  }

  function openHow(retScreen) {
    howReturn = retScreen || (Game.getMode() === 'pause' ? 'pause' : 'menu');
    if ($('btnHowPlay')) {
      $('btnHowPlay').classList.toggle('hidden', Game.getMode() === 'pause');
    }
    show('how');
  }

  /* ---------- Menu Wiring ---------- */
  if ($('btnPlay')) $('btnPlay').addEventListener('click', openSelect);
  if ($('btnSelectFight')) $('btnSelectFight').addEventListener('click', function () { Snd.sfx.confirm(); play(); });
  if ($('btnSelectBack')) $('btnSelectBack').addEventListener('click', function () { Snd.sfx.click(); show('menu'); });
  if ($('btnHow')) $('btnHow').addEventListener('click', function () { Snd.sfx.click(); openHow('menu'); });
  if ($('btnPauseHow')) $('btnPauseHow').addEventListener('click', function () { Snd.sfx.click(); openHow('pause'); });
  if ($('btnHowPlay')) $('btnHowPlay').addEventListener('click', openSelect);
  if ($('btnHowBack')) {
    $('btnHowBack').addEventListener('click', function () {
      Snd.sfx.click();
      show(Game.getMode() === 'pause' ? 'pause' : howReturn);
    });
  }
  if ($('btnBoard')) $('btnBoard').addEventListener('click', function () { Snd.sfx.click(); boardReturn = 'menu'; openBoard(); });
  if ($('btnBoardPlay')) $('btnBoardPlay').addEventListener('click', openSelect);
  if ($('btnBoardRefresh')) $('btnBoardRefresh').addEventListener('click', function () { Snd.sfx.click(); loadBoard(); });
  if ($('btnBoardBack')) $('btnBoardBack').addEventListener('click', function () { Snd.sfx.click(); highlightName = null; show(boardReturn); });
  if ($('btnAgain')) $('btnAgain').addEventListener('click', function () { Game.quit(); openSelect(); });
  if ($('btnOverBoard')) $('btnOverBoard').addEventListener('click', function () { boardReturn = 'over'; openBoard(); });
  if ($('btnOverMenu')) $('btnOverMenu').addEventListener('click', function () { Game.quit(); show('menu'); });

  window.addEventListener('keydown', function (e) {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (e.code === 'KeyM' && !typing) {
      toggleSound();
    } else if (e.code === 'KeyT' && !typing && Game.getMode() === 'play') {
      Snd.sfx.click();
      if (Game.cycleDummyMode) Game.cycleDummyMode();
    } else if ((e.code === 'Escape' || e.code === 'KeyP') && !typing) {
      const m = Game.getMode();
      if (m === 'play') pause();
      else if (current === 'select' || current === 'how' || current === 'board') {
        if (current === 'select') show('menu');
        else $(current === 'how' ? 'btnHowBack' : 'btnBoardBack').click();
      } else if (m === 'pause') {
        resume();
      }
    } else if (e.code === 'ArrowLeft' && !typing && current === 'select') {
      stepMonsterChoice(-1);
    } else if (e.code === 'ArrowRight' && !typing && current === 'select') {
      stepMonsterChoice(1);
    } else if (e.code === 'Enter' && !typing && current === 'menu') {
      openSelect();
    } else if (e.code === 'Enter' && !typing && current === 'select') {
      Snd.sfx.confirm();
      play();
    }
  });

  show('menu');

  KB.UI = {
    show: show,
    hideAll: hideAll,
    openBoard: openBoard,
    loadBoard: loadBoard,
    bestPerPlayer: bestPerPlayer,
    submitLocalScore: submitLocalScore,
    handleSubmitForm: handleSubmitForm,
    getState: function () {
      return {
        current: current,
        boardView: boardView,
        boardMonsterFilter: boardMonsterFilter,
        boardCityFilter: boardCityFilter,
        overBoardScope: overBoardScope,
        serverAvailable: serverAvailable,
        submitted: submitted,
        touchPref: touchPref,
        filmFx: !!CFG.FILM_FX
      };
    }
  };
})();
