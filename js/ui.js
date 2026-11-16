/* Kaiju Brawl - menus, orientation/touch toggles, keyboard shortcuts (M0 shell). */
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

  let current = 'menu';
  let boardReturn = 'menu';
  let touchPref = 'auto'; // 'auto' | 'on' | 'off'
  let selectPreviewRaf = 0;
  let monsterPreviews = [];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

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

  /* ---------- Monster & City Select Builder (M7) ---------- */
  function statPct(val, minV, maxV) {
    return Math.round(Math.max(12, Math.min(100, ((val - minV) / (maxV - minV)) * 88 + 12)));
  }

  function syncSelectHighlight() {
    const selM = Game.getSelectedMonster ? Game.getSelectedMonster() : 'gorgantor';
    const selC = Game.getSelectedCity ? Game.getSelectedCity() : 'pinebrook';
    const mGrid = $('monsterSelectGrid');
    const cGrid = $('citySelectGrid');
    if (mGrid) {
      const cards = mGrid.querySelectorAll('.monster-card');
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.toggle('selected', cards[i].getAttribute('data-id') === selM);
      }
    }
    if (cGrid) {
      const cards = cGrid.querySelectorAll('.city-card');
      for (let i = 0; i < cards.length; i++) {
        cards[i].classList.toggle('selected', cards[i].getAttribute('data-id') === selC);
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
            syncSelectHighlight();
            if (cardEl.scrollIntoView) cardEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          };
        })(id, card));

        mGrid.appendChild(card);
        const cv = card.querySelector('canvas');
        if (cv) monsterPreviews.push({ id: id, canvas: cv });
      }
    }

    if (cGrid && cGrid.children.length === 0 && KB.CITIES && KB.CITIES.DEFS) {
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
        card.addEventListener('click', (function (cityId) {
          return function () {
            Snd.resume();
            Snd.sfx.click();
            if (Game.setSelectedCity) Game.setSelectedCity(cityId);
            syncSelectHighlight();
          };
        })(cid));
        cGrid.appendChild(card);
        const cv = card.querySelector('canvas');
        if (cv && KB.Render && KB.Render.drawCityPreview) {
          const cctx = cv.getContext('2d');
          if (cctx) KB.Render.drawCityPreview(cctx, cid, cv.width, cv.height);
        }
      }
    }
  }

  function renderSelectCards() {
    buildSelectCards();
    syncSelectHighlight();
    if (KB.Render && KB.Render.drawMonsterPreview) {
      for (let i = 0; i < monsterPreviews.length; i++) {
        const item = monsterPreviews[i];
        const ctx = item.canvas.getContext('2d');
        if (ctx) KB.Render.drawMonsterPreview(ctx, item.id, item.canvas.width, item.canvas.height, i * 0.7);
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
    syncSelectHighlight();
  }

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

  /* ---------- Board View Tabs (M0 visual toggle, full data in M11) ---------- */
  document.querySelectorAll('[data-board-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      Snd.resume();
      Snd.sfx.click();
      const view = btn.getAttribute('data-board-view');
      document.querySelectorAll('[data-board-view]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-board-view') === view);
      });
    });
  });

  /* ---------- Pause ---------- */
  function pause() {
    if (Game.pause()) show('pause');
  }
  function resume() {
    if (Game.resume()) hideAll();
  }
  function fmtElapsed(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  Game.onAutoPause = pause;
  Game.onGameOver = function (res) {
    const r = res || {};
    if ($('goScore')) $('goScore').textContent = (r.score || 0).toLocaleString();
    if ($('goKos')) $('goKos').textContent = String(r.kos || 0);
    if ($('goWrecked')) $('goWrecked').textContent = String(r.wrecked || 0);
    if ($('goTime')) $('goTime').textContent = fmtElapsed(r.elapsed || 0);
    if ($('newHigh')) $('newHigh').classList.toggle('hidden', !r.isNewHigh);
    if ($('submitMsg')) $('submitMsg').textContent = '';
    if (KB.Audio && KB.Audio.sfx && KB.Audio.sfx.gameOver) KB.Audio.sfx.gameOver();
    show('over');
  };

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

  /* ---------- Menu Wiring ---------- */
  if ($('btnPlay')) $('btnPlay').addEventListener('click', openSelect);
  if ($('btnSelectFight')) $('btnSelectFight').addEventListener('click', function () { Snd.sfx.confirm(); play(); });
  if ($('btnSelectBack')) $('btnSelectBack').addEventListener('click', function () { Snd.sfx.click(); show('menu'); });
  if ($('btnHow')) $('btnHow').addEventListener('click', function () { Snd.sfx.click(); show('how'); });
  if ($('btnHowPlay')) $('btnHowPlay').addEventListener('click', openSelect);
  if ($('btnHowBack')) $('btnHowBack').addEventListener('click', function () { Snd.sfx.click(); show('menu'); });
  if ($('btnBoard')) $('btnBoard').addEventListener('click', function () { Snd.sfx.click(); boardReturn = 'menu'; show('board'); });
  if ($('btnBoardPlay')) $('btnBoardPlay').addEventListener('click', openSelect);
  if ($('btnBoardRefresh')) $('btnBoardRefresh').addEventListener('click', function () { Snd.sfx.click(); });
  if ($('btnBoardBack')) $('btnBoardBack').addEventListener('click', function () { Snd.sfx.click(); show(boardReturn); });
  if ($('btnAgain')) $('btnAgain').addEventListener('click', function () { Game.quit(); openSelect(); });
  if ($('btnOverBoard')) $('btnOverBoard').addEventListener('click', function () { boardReturn = 'over'; show('board'); });
  if ($('btnOverMenu')) $('btnOverMenu').addEventListener('click', function () { Game.quit(); show('menu'); });

  if ($('submitForm')) {
    $('submitForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if ($('submitMsg')) $('submitMsg').textContent = 'Leaderboard submission activates in M10/M11.';
    });
  }

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
      else if (m === 'pause') resume();
      else if (current === 'select' || current === 'how' || current === 'board') {
        if (current === 'select') show('menu');
        else $(current === 'how' ? 'btnHowBack' : 'btnBoardBack').click();
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
    hideAll: hideAll
  };
})();
