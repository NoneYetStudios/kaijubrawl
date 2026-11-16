# KAIJU BRAWL — STF Arcade · Master Plan

> **Domain:** `kaijubrawl.stabthefinger.com` · **Repo:** `kaijubrawl/` (sibling of `beachhamster/`)
> **Pitch:** A campy 1950s B-movie, isometric 2.5D kaiju arena brawler inspired by *War of the Monsters*. Pick a rubber-suit monster, stomp a miniature cardboard-looking city, hurl girders and fuel tankers, and survive an endless gauntlet of challengers while the "matinee" rolls.
> **Companion doc:** [ASSETS.md](ASSETS.md) (art/audio spec, sprite sheets, procedural fallbacks).
> **Audience for this doc:** Gemini 4 Hydrogen executing step-by-step. Section 12 is the roadmap; sections 1–11 are the spec it must obey.

---

## 0. What I found in `../beachhamster` (conventions we MUST match)

| Area | Beach Hamster convention | Kaiju Brawl adaptation |
|---|---|---|
| **Stack** | Zero build, zero npm. Plain HTML5 Canvas + Web Audio + native CSS. Scripts loaded via `<script>` tags in order. | Same. No bundler, no frameworks, no CDN. |
| **Backend** | **PHP 7.4+ with SQLite via PDO** (not Python). `api/db.php` (helpers + schema bootstrap), `api/leaderboard.php` (GET), `api/submit_score.php` (POST). DB at `data/leaderboard.sqlite`, auto-created on first request. | Same three-file shape, same helpers style, same JSON envelope (`{ok, error}`), same rate-limit table, extended schema (§8). |
| **Layout** | `.gitignore`, `.htaccess`, `index.html`, `README.md`, `api/`, `assets/` (only `favicon.svg`), `css/style.css`, `data/` (`.gitkeep` + deny-all `.htaccess`), `js/{config,audio,input,game,ui}.js`. | Same, plus extra `js/` modules (§2). |
| **Namespacing** | `window.BH = window.BH \|\| {}`; each file is an IIFE with `'use strict'`; config in `BH.CONFIG`; localStorage keys prefixed `bh_` (`bh_orient`, `bh_sfx`, `bh_high_v1`). | `window.KB`, `KB.CONFIG`, prefix `kb_` (`kb_orient`, `kb_sfx`, `kb_high_v1`, `kb_name`, `kb_monster`, `kb_city`, `kb_local_scores_v1`). |
| **Canvas** | Logical sizes `landscape 1280×720`, `portrait 720×1280`; CSS-fit into `#stage` (letterbox, keeps aspect) in `fitCanvasCss()`. Orientation pref `auto \| portrait \| landscape` persisted; auto = stage `height > width` → portrait. Listens to `resize` + `orientationchange` (80 ms delay). | Identical mechanism and keys (`kb_orient`). World state is rescaled/re-centered on switch (camera re-fit, no teleporting). |
| **Page shell** | `#app` flex column, `100dvh`; `<header id="hud">` (back button + stats + `.chip` toggles); `<main id="stage">` holds `<canvas id="game">` and `#screens` overlay of `.screen` sections with `.panel`. `body.playing { touch-action:none }`. `body.touch` added when `(pointer: coarse)`. | Identical shell. Add `#touchControls` overlay inside `#stage` (§3.3). |
| **Nav button** | `<a id="backBtn" class="btn-back" href="https://arcade.stabthefinger.com">← STF Arcade</a>` first child of `#hud`; amber 2 px border, `rgba(255,210,63,.1)` fill, bold 13 px mono, 5 px radius; hover/focus-visible → solid amber with `#061521` text. | **Copy the CSS rule and markup verbatim** (§9.1). `ARCADE_URL` also in `KB.CONFIG`. |
| **Tokens** | `--bg #081a28 --panel rgba(9,28,44,.94) --line #215273 --amber #ffd23f --cyan #5ee6ff --coral #ff6b57 --sand #f4d694 --text #eef6fc --dim #92b4cc`; fonts `--mono: "Courier New"…`, `--head: Impact, "Arial Black"…`. | Keep all tokens (so the arcade feels unified) and **add** a few B-movie tokens (§9.2). |
| **UI patterns** | `.btn / .btn.primary / .btn.small`, `.chip(.on/.off)`, `.seg-group/.seg-btn`, `.table-wrap` leaderboard table with `tr.me`, `top1..3`, `.board-mode-notice`, `.board-msg`; submit via `.name-badge-wrapper` "BEACH TAG" badge, max 12 chars. | Reuse the classes. "BEACH TAG" → "MONSTER TAG". |
| **Leaderboard UX** | Dual mode: global (PHP) with automatic **Local Mode** fallback to `localStorage` when API is unreachable; notice banner says which mode is active. Top 25 shown, top 8 on game-over screen. One row per player name (case-insensitive), improved only by better score. Name regex `^[A-Za-z0-9 _.\-!?]+$`, 1–12 chars. Server-side plausibility checks + 3 s per-IP rate limit (hashed IP). | Preserve all of it, extended with Monster/City filters (§8). |
| **Security** | Root `.htaccess` blocks dotfiles/db/log, disables indexes, sets nosniff/frame headers; `data/.htaccess` denies all; `.gitignore` ignores `data/*.sqlite*`. | Copy these three files unchanged. |
| **Misc UX** | Pause via `P`/`Esc`, sound via `M`, pause menu has orientation seg-buttons; `visibilitychange` auto-pauses; Web Audio synth (no audio files); all art drawn procedurally on canvas. | Same keys. Procedural art is the **baseline** that must always work; sprites are an optional upgrade (see ASSETS.md). |

> [!NOTE]
> The request mentioned "Python/SQLite", but `beachhamster` actually uses **PHP + SQLite (PDO)**. This plan follows what the repo really does so both games deploy identically on the same host. If a Python backend is wanted instead, only §8 (`api/`) changes; the JSON contract is backend-agnostic.

---

## 1. Game Concept & Core Loop

### 1.1 Mode: **RAMPAGE** (the only leaderboard mode in v1)
A single-player endless gauntlet played in a chosen **City** (arena) as a chosen **Monster**.

```
Title → Pick Monster → Pick City → "Reel 1" title card → FIGHT
  ┌──────────────────────────── per round ───────────────────────────┐
  │ Challenger kaiju drops in (AI)                                   │
  │ Brawl + wreck city (buildings → health orbs / fuel / weapons)    │
  │ KO challenger → +KO, bonus, partial heal, 6 s "intermission"     │
  │   (Civil Defense rebuilds city; next, tougher challenger)        │
  └──────────────────────────────────────────────────────────────────┘
Player HP hits 0 → "THE END?" card → results → submit score → leaderboard
```

- **One life, one HP bar.** Health persists between rounds (+25 % max HP on each KO, capped).
- **Escalation:** Round `n` challenger gets `hpMul = 1 + 0.12n`, `dmgMul = 1 + 0.06n`, faster AI reaction; every 4th round is a **Boss round** (bigger HP, adds a special that wrecks buildings).
- **Between rounds** buildings reset to *intact* (and `buildings_wrecked` keeps accumulating) so the run never runs out of destruction.
- **Score** (client calculates, server validates — §8.4):

  `score = kos×1000 + buildings_wrecked×100 + floor(survival_time)×2 + style_points`

  `style_points` = combo finishers (+25 per hit beyond 3-hit chain), thrown-object hits (+50), tanker explosions (+150 + 50 per enemy caught), dodge-counters (+40), special hits (+30), no-damage round bonus (+300). Capped client-side to 50 % of the total as a sanity bound.
- **Survival time** = whole seconds of un-paused match time.

### 1.2 Game feel pillars
1. **Chunky and readable** — big hit-stop (3–6 frames), screen shake, debris, a "BIFF! KRAK!" comic-sound-card pop on heavy hits.
2. **The city is a toy box** — everything crumbles, everything is throwable debris-in-waiting.
3. **Low execution barrier on mobile** — one thumb moves, one thumb mashes; specials are single taps.
4. **Camp** — rubber-suit wobble, miniature-set look, "Technicolor" posterization, film grain, scratchy narrator title cards, screaming extras that scatter on tap.

---

## 2. Project Structure (target)

```
kaijubrawl/
├── .gitignore                # copy of beachhamster's
├── .htaccess                 # copy of beachhamster's
├── index.html
├── README.md
├── PLAN.md  ASSETS.md
├── api/
│   ├── db.php                # KB_* constants, kb_json(), kb_db(), kb_rank(), whitelists
│   ├── leaderboard.php       # GET  ?view&monster_id&city_id&limit
│   └── submit_score.php      # POST
├── assets/
│   ├── favicon.svg
│   ├── og.png                # optional share card
│   ├── sprites/              # OPTIONAL sprite atlases (see ASSETS.md)
│   └── audio/                # OPTIONAL; baseline audio is synthesized
├── css/style.css
├── data/                     # .gitkeep + deny-all .htaccess; leaderboard.sqlite created at runtime
└── js/                       # load order == this order (script tags)
    ├── config.js             # KB.CONFIG constants, ARCADE_URL, endpoints, tuning knobs
    ├── util.js               # clamp, lerp, rng(seed), vec2 helpers, easing, pool
    ├── audio.js              # WebAudio synth SFX + music loop, sfx toggle (kb_sfx)
    ├── input.js              # keyboard + virtual joystick + action buttons → unified Intent
    ├── iso.js                # projection, camera, depth sort, picking
    ├── assets.js             # optional sprite loader w/ procedural fallback registry
    ├── data-monsters.js      # KB.MONSTERS stat/moveset tables
    ├── data-cities.js        # KB.CITIES layouts, building archetypes, palettes
    ├── entities.js           # Kaiju, Building, Pickup, Prop (throwable), Projectile, Particle
    ├── combat.js             # hit/hurt resolution, combo state machine, damage, knockback
    ├── ai.js                 # challenger behavior trees / state machine
    ├── render.js             # layered renderer, procedural kaiju/building drawing, FX
    ├── game.js               # fixed-timestep loop, round manager, orientation/fit, state
    └── ui.js                 # menus, HUD binding, select screens, leaderboard (dual mode), game over
```

All files: `(function(){ 'use strict'; window.KB = window.KB || {}; … })();` and expose a single `KB.<Module>` object.

---

## 3. Controls & Input

### 3.1 Unified intent layer (`input.js`)
Everything (keyboard, touch, future gamepad) writes into one `Intent` object read once per tick:

```js
Intent = {
  moveX, moveY,            // screen-space stick, each -1..1, magnitude clamped to 1
  light, heavy, grab,      // edge-triggered "pressed this tick" flags (+ buffered 6 ticks)
  jumpPressed, jumpHeld,
  blockHeld,
  dodgePressed,
  specialPressed,          // Atomic Special (costs fuel)
  ultimatePressed,         // Meltdown (requires full fuel)
  pausePressed
}
```

- **Input buffering:** pressed flags persist 6 ticks (100 ms) so combos feel forgiving.
- **Screen→world mapping for movement** (so "up" always means up on screen):
  `wx = (sx/ (TW/2) + sy/(TH/2)) / 2 · k`, `wy = (sy/(TH/2) − sx/(TW/2)) / 2 · k`, then normalize and multiply by speed. (Inverse of the iso projection in §4.1; `k` keeps screen-speed uniform in all directions.)

### 3.2 Desktop keyboard

| Action | Keys |
|---|---|
| Move | `W A S D` / Arrow keys (8-way, screen-relative) |
| Light attack (combo ×3) | `J` |
| Heavy attack | `K` |
| Grab / Pick up / Throw (context) | `L` |
| Jump (also: **climb** when pushing into a building) | `Space` |
| Block (hold) | `Shift` |
| Dodge roll | `C` |
| Atomic Special | `Q` |
| Meltdown (Ultimate) | `E` |
| Pause | `P` / `Esc` |
| Sound | `M` |

Ignore keys while typing in inputs (copy `isTyping()` from beachhamster `input.js`). `preventDefault` on Space/arrows only while `body.playing`.

### 3.3 Mobile (virtual joystick + action buttons)
- Detect with `matchMedia('(pointer: coarse)')` → `body.classList.add('touch')`, same as beachhamster.
- **DOM overlay** `#touchControls` inside `#stage` (not drawn on the canvas) so it stays crisp and un-letterboxed. `pointer-events: none` on the container; `auto` on the zones/buttons. `touch-action: none`. Use **Pointer Events with `pointerId` tracking** for true multitouch.
- **Floating joystick:** left 45 % of the stage = joystick zone. Touch-down spawns the base at the touch point (clamped away from edges); thumb knob radius 56 px, dead zone 12 %, output analog. Fades to 35 % opacity when idle and re-anchors to a default "resting" position.
- **Right-side button cluster** (min 64 px hit target, 72 px for primary):

  ```
  Landscape (bottom-right arc)            Portrait (stacked above bottom safe-area)
        [SPECIAL] [MELTDOWN]                  [SPECIAL][MELTDOWN]
     [GRAB]  [HEAVY]                       [JUMP] [GRAB] [HEAVY]
   [BLOCK] [LIGHT] [JUMP]                  [BLOCK][DODGE][LIGHT]
        [DODGE]
  ```
  - `LIGHT` is the largest, thumb-resting button. `BLOCK` is hold. `MELTDOWN` is hidden until fuel is full (pulses).
  - **Double-tap joystick direction = dodge** as a shortcut (`<250 ms` between flicks beyond 80 % deflection).
  - Haptics: `navigator.vibrate?.(10)` on hits taken/dealt, `(30)` on heavy; user toggle via existing SND chip (shared "FX" toggle) — never required.
  - `safe-area-inset-*` padding on the overlay (notches).
- **Layout handling:** buttons re-anchor via CSS grid/absolute classes `.orient-landscape` / `.orient-portrait` set on `#stage` whenever `applyOrientation()` runs. In portrait the arena camera adds a **bottom inset of ~26 % of H** so the action isn't hidden behind thumbs.
- **No page scroll/zoom:** viewport meta identical to beachhamster (`user-scalable=no, viewport-fit=cover`), `body.playing { touch-action:none }`.
- **Orientation toggle:** HUD chip `VIEW: AUTO` + Pause menu seg-buttons exactly like beachhamster. Tilt steering is **dropped** (not suited to brawling).
- **Auto-pause** on `visibilitychange` hidden and on context loss.

---

## 4. Isometric 2.5D Engine (`iso.js`, `render.js`)

### 4.1 Coordinates & projection
- **World space:** `x` = east, `y` = south (both in *tile units*, floats), `z` = height above ground in *pixels-equivalent* units. Arena is a rectangle `W_T × H_T` tiles (default **20 × 20**; Metro Heights **22 × 18**).
- **Tile (screen) size:** `TW = 96`, `TH = 48` (2:1 dimetric). Zoom `Z`: landscape `1.0`, portrait `0.80` (so the arena still fits narrow width).

```js
// world → screen (before camera)
sx = (x - y) * (TW / 2);
sy = (x + y) * (TH / 2) - z;

// screen → world on ground plane (z = 0) — used for aim/FX/picking
x =  (sx / (TW / 2) + sy / (TH / 2)) / 2;
y =  (sy / (TH / 2) - sx / (TW / 2)) / 2;

// canvas coords
cx = (sx - cam.x) * Z + W/2;   cy = (sy - cam.y) * Z + H/2 - bottomInset/2;
```

- **Camera:** follows the weighted midpoint of player (70 %) and nearest enemy (30 %), smoothed `cam += (target - cam) * (1 - exp(-8·dt))`, hard-clamped so the arena diamond never leaves a margin of 1 tile. Shake = decaying random offset added after the clamp.
- **Arena bounds in world space** are an AABB `[0,W_T]×[0,H_T]` with soft push-back at edges (entities slide along walls). On screen this renders as a diamond.

### 4.2 Render layers (back → front)
1. Sky/backdrop (parallax silhouettes: mountains, mushroom cloud, skyline), screen-space.
2. **Ground**: pre-rendered to an offscreen canvas once per arena/orientation (tiles, roads, grass, craters). Dynamic decals (scorch, footprints, rubble stains) drawn on a second offscreen *decal layer*.
3. **Shadows** (ellipse per entity, scaled by `1/(1+z/200)`), drawn before sorted objects.
4. **Depth-sorted layer:** buildings, rubble, props, pickups, kaiju, projectiles, civilians.
5. **Overhead FX:** beams, explosions, smoke columns, floating combat text, comic sound cards.
6. **Post:** film grain, vignette, 3-strip "Technicolor" posterize overlay (cheap: pre-rendered noise tile blitted with `globalAlpha`; optional), scratches flicker. Toggle `KB.CONFIG.FILM_FX`.
7. HUD is **DOM**, not canvas (same as beachhamster's `#hud`), except world-anchored items (damage numbers, off-screen enemy arrow).

### 4.3 Depth sorting (the tricky part)
Naive `sortKey = x + y` breaks for large footprints (a wide building vs. a kaiju standing beside it). Use the **footprint-separation comparator + topological sort**:

Each drawable exposes: `fx0, fx1, fy0, fy1` (world footprint AABB in tiles), `zBase`, `zTop`, `id`.

```js
// returns -1 if A must be drawn BEFORE (behind) B, 1 if after, 0 if no constraint
function behind(A, B) {
  if (A.fx1 <= B.fx0) return -1;       // A fully west of B  → A is farther
  if (B.fx1 <= A.fx0) return  1;
  if (A.fy1 <= B.fy0) return -1;       // A fully north of B → A is farther
  if (B.fy1 <= A.fy0) return  1;
  // footprints overlap in both axes (e.g., kaiju standing in/on a building, jumping)
  if (A.zTop <= B.zBase) return -1;    // A entirely below B
  if (B.zTop <= A.zBase) return  1;
  return ((A.fx0 + A.fx1 + A.fy0 + A.fy1) - (B.fx0 + B.fx1 + B.fy0 + B.fy1)) || (A.id - B.id);
}
```

Algorithm per frame:
1. Build the visible list (cull by projected screen AABB vs. canvas).
2. **Broad-phase:** only compare pairs whose *screen* AABBs overlap (sort by `sx` min, sweep). Typical visible count ≤ 80 → ≤ ~1k comparisons.
3. Build DAG edges `A→B` where `behind(A,B) = -1`; **topological sort** (Kahn). If a cycle exists (rare), break it by falling back to `x+y` of footprint centers for the cycle members.
4. **Optimization:** buildings are static between state changes → keep a pre-sorted `staticOrder`; dynamic entities (≤ 10) are merged in by insertion with the comparator. Re-sort statics only when a building changes state (rubble has a lower height; ordering doesn't change, so usually never).
5. Entities with `z > 0` (jumping/thrown): draw the **shadow at ground**, sort by ground footprint, then `zBase = z` — never re-sort by height only.
6. A kaiju *climbing* a building uses the building's footprint expanded by 0.3 tile on the climbed face, `zBase = building.zBase`, so it stays in front of that wall and behind buildings in front.

Debug overlay (`?debug=1` or `` ` `` key): draws footprints, sort order numbers, FPS, entity counts, hitboxes/hurtboxes. **Required** for acceptance testing.

### 4.4 Simulation
- **Fixed timestep** 60 Hz with accumulator (max 5 steps/frame), render interpolation optional. `requestAnimationFrame` loop, `visibilitychange` pause (as beachhamster).
- **Collision** is done in the ground plane (world x/y): kaiju = circle radius `r` (0.55–0.9 tile), buildings = AABB footprints, props = small circles. Height `z` only matters for: jump arcs, "can I hit this" (z-overlap check), climbing, and thrown-object flight.
- **Hit detection:** attack hitboxes are **ground-plane arcs/rects** in front of the attacker (`reach`, `arc°`, `zMin..zMax`). Hurtboxes = circle + z-range. Hits are keyed per attack instance (`hitSet`) to avoid multi-hits.

---

## 5. Combat System

### 5.1 Kaiju state machine
`idle → walk → [lightN | heavy | grab | jump | block | dodge | special | ultimate | climb | carry] → hitstun / knockdown → getup → KO`

Frame data at 60 fps (`startup / active / recovery`, in ticks):

| Move | Start/Active/Recov | Dmg (×monster.power) | Notes |
|---|---|---|---|
| Light 1 / 2 / 3 | 5/3/8 · 5/3/8 · 7/4/16 | 8 / 9 / 14 | Chain window 14 ticks after active. Hit 3 = launcher with small knockback. +4 fuel per hit |
| Heavy | 14/4/22 | 26 | Armor 1 hit during startup frames 6–14; breaks block (guard damage ×2); wrecks buildings ×1.5; +8 fuel |
| Jump attack (Light in air) | – | 12 | Diving stomp: ground shockwave radius 1.2 tiles, stuns small enemies |
| Grab | 8/3/20 | 0 | Success → *throw* (dmg 18, 1.5 tiles knockback, bounce) or *slam* (hold direction back, 24 dmg). Fails vs. active block unless heavy broke it |
| Block | instant | – | Holding drains **Guard** meter (100, regens 25/s idle). Reduces damage 80 %, no knockback chip; guard 0 → *Guard Break* stun 40 ticks |
| Dodge roll | 3 i-frames start, 18 total | – | Invulnerable 12 ticks, 60-tick cooldown. Successful dodge-through → **counter window** (next Light +damage ×1.5, +40 style) |
| Jump | – | – | Impulse `vz`, gravity `−0.55 px/tick²`; air-control 60 %; can attack once in air |
| Climb | – | – | See §5.3 |
| Special / Meltdown | see §6 and monster tables | | |

- **Hit-stop:** both parties freeze `hitStop = {light 3, heavy 6, special 8}` ticks. Screen shake amplitude by damage.
- **Knockdown:** when `stagger ≥ staggerMax` (builds per hit, decays 12/s) or by launcher/throw → knockdown 50 ticks + 30 getup (invulnerable last 10 ticks).
- **Combo scaling:** each hit in a string without being reset reduces damage by 6 % (min 60 %) to prevent infinite loops; hitstun decays to prevent lock-down.
- **Block/Dodge counters:** perfect block (press Block within 6 ticks before hit) = no guard drain + fuel +10 + enemy stagger.

### 5.2 Throwing & Grabbing
- `L` near a **Prop** (girder, tanker, car…) picks it up (`carry` state: speed ×0.65, disables jump/dodge/heavy). `L` again or `J` **throws** along facing (`vx = 0.5 tile/tick`, arc `vz`), `K` does an overhead *smash* (short range, high damage, prop loses durability).
- Props in flight deal damage on the first kaiju/building contacted (see table §6.3) then break or bounce (`bounces` count). Enemies can also pick up and throw props (AI uses it).

### 5.3 Jump & Climb
- **Jump** (`Space`): `vz = 9 px/tick` base × monster.jump.
- **Climb:** with Space pressed (or held ↑ + Space) while the kaiju circle is within 0.25 tile of a building face **and** building `tier ≤ monster.maxClimbTier`: attach to the wall (`climb` state). While climbing: `W/S` (stick up/down) changes `z` at `climbSpeed`; `J` punches the roof/wall (damages building, 10/hit); `K` → *Roof Smash*: area damage to building and 0.8 tile radius at base; `Space` or reaching top: **leap off** with a diving stomp (`Light` in air). Enemies adjacent to the building base can grab the climber's legs (`Grab` → pull down, 12 dmg). Building collapse while climbing → fall damage 8 and kaiju stunned briefly unless Mongo/Lepidora (agile).
- Climb tiers: `0` small house, `1` mid-rise, `2` skyscraper; Tin Colossus uses **Jet Hop** instead (short hover to roof, no wall climb).

---

## 6. Atomic Fuel, Specials & Destructible Environment

### 6.1 Atomic Fuel meter
- 0–100 (some monsters have `fuelMax` offsets). HUD: glowing green radioactive gauge (CSS gradient bar with animated bubble stripes) under the HP bar.
- **Gain:** +4 per light hit landed, +8 heavy, +2 per hit taken (comeback mechanic), +10 perfect block, **+25 fuel canister drop**, +40 **fuel tanker** pickup/explosion contact, passive +1.5/s.
- **Spend:** Special costs 35 (monster-specific), Meltdown requires 100 (consumes all), **Overcharge** at ≥ 80 grants +10 % move speed with green glow (visual feedback, no cost).
- Fuel carries between rounds (+15 bonus on KO).

### 6.2 Specials (see also roster §7)
Each monster has **Special** (`Q`, cost 35, ~1.5 s cooldown) and **Meltdown** (`E`, cost 100, 4–5 s of invulnerability-ish "cinematic" move with screen flash + comic text). Specials also *wreck buildings in their area*, so using them near the city feeds the destruction loop.

### 6.3 Destructible buildings (`Building` entity)
Multi-state with HP thresholds and visual swaps:

| State | HP range | Visual | Collision | Height (`zTop`) |
|---|---|---|---|---|
| `intact` | 100 – 61 % | Full sprite/procedural model, lit windows | Solid AABB | `h` |
| `damaged` | 60 – 1 % | Cracked, missing windows, leaning smoke plume, tilted roof; sheds small debris on every hit | Solid AABB | `0.85h` |
| `rubble` | 0 | Low pile, dust cloud, smoking | Non-solid, walkable slowly (speed ×0.7), tiny debris props | `0.12h` |

- **Transitions:** `intact → damaged` plays a *crack* animation (shake 12 ticks + debris burst + 1 loot roll). `damaged → rubble` plays a *collapse* animation (zTop eased down over 30 ticks, big dust puff, camera shake, civilians flee, **final loot roll**, `buildings_wrecked++` once).
- **Archetypes** (per-city palettes/skins in §7.3):

| Archetype | Footprint (tiles) | Max HP | Climb tier | Loot |
|---|---|---|---|---|
| `house` | 1.5×1.5 | 120 | 0 | 1 roll |
| `shop` / `diner` | 2×1.5 | 180 | 0 | 2 rolls |
| `office` | 2×2 | 300 | 1 | 2–3 rolls |
| `tower` / `skyscraper` | 2×2 | 480 | 2 | 3–4 rolls, guaranteed girder |
| `gas_station` | 1.5×1.5 | 160 | 0 | explodes at rubble: radius 1.5, 30 dmg; drops tanker |
| `water_tower` | 1×1 | 200 | 1 | rubble floods ground (slow zone) |
| `landmark` | 3×3 | 700 | 2 | city signature (see §7.3) — big rewards |

- **Damage sources:** melee (×1), heavy (×1.5), thrown props (per prop), jump-stomp shockwave, specials (AoE, ×2), explosions, enemy attacks (so enemies wreck stuff too — fights damage the city naturally). Dedupe building-hit per attack instance. Buildings have 3-tick hit flash.
- **Loot tables** (rolled on each state transition; weights sum to 100 per roll):

| Loot | `intact→damaged` roll | `damaged→rubble` roll |
|---|---|---|
| nothing | 45 | 20 |
| **Health orb** (+15 HP, pulsing red cross) | 20 | 25 |
| **Atomic Fuel canister** (+25 fuel, green) | 20 | 25 |
| **Throwable: steel girder** | 10 | 20 |
| **Throwable: fuel tanker** | 5 | 10 |

  Cap simultaneous pickups at 12 (oldest despawns). Orbs/canisters bob, vanish after 12 s (blink last 3 s), magnet toward kaiju within 1 tile. Throwables persist until used. Pity rule: if no health orb has dropped for 25 s while player HP < 40 %, next roll is forced to a health orb.

### 6.4 Throwable weapons (`Prop` entity)

| Prop | Weight / speed penalty | Throw dmg | Smash dmg | Special behavior |
|---|---|---|---|---|
| **Steel Girder** | medium (×0.8) | 35, pierces 1 target | 22 | Long hitbox when swung (`reach 2`); 3 uses; deals ×2 to buildings |
| **Fuel Tanker** | heavy (×0.55) | 40 impact, then **explodes** (radius 1.8 tiles, 45 dmg, burn 3 s) | 28 (also explodes) | Chain-explodes other tankers/gas stations; Atomic Special ignites it; +40 fuel to the holder if they throw it |
| Car / bus | medium (×0.75) | 25 | 15 | Common in streets (also spawns at start) |
| Lamp post | light (×0.95) | 15 | 12 | Cheap, 2 uses |
| Water tower tank | heavy (×0.5) | 50 | – | Only from `water_tower` rubble; splash slow |
| Boxcar (Atom City) / Ship container (Metro) | heavy | 45 | 25 | City-specific flavor |

At arena start spawn 3–5 props near streets so action starts immediately.

---

## 7. Roster & Arenas

### 7.1 Starter Roster (4 Kaiju)
Stats: `HP, speed (tiles/s), jump, power (dmg mult), defense (dmg taken mult), fuelMax, fuelRegen, guard, weight (knockback resist), maxClimbTier`.

| | **GORGANTOR** *"The Atomic Saurian"* | **MIGHTY MONGO** *"Eighth Wonder of the Wasteland"* | **LEPIDORA** *"Queen of the Night Skies"* | **TIN COLOSSUS** *"The Mechanical Menace"* |
|---|---|---|---|---|
| Archetype | All-rounder, projectile | Grappler / climber | Speedy glider / zoner | Slow tank / area control |
| HP | 1000 | 1100 | 780 | 1300 |
| Speed | 3.0 | 2.6 | **4.0** (glide boosts) | 2.0 |
| Jump | 1.0 | 1.2 | 1.0 + **glide** (hold Space in air, fall ×0.25, 1.5 s) | 0.7 (Jet Hop) |
| Power / Defense | 1.0 / 1.0 | 1.15 / 0.95 | 0.85 / 1.15 | 1.0 / **0.75** |
| Fuel max / regen | 100 / 1.5 | 100 / 1.2 | 100 / 2.2 | 100 / 1.0 (battery: dmg boost at ≥ 50) |
| Guard | 100 | 130 | 70 | 150 |
| Weight | 1.0 | 1.2 | 0.7 | 1.6 |
| Max climb tier | 1 | **2** (fast ×1.6) | 2 (flies up) | 0 (Jet Hop) |
| Theme color | swamp green `#5fbf6a` / fin orange | ape brown `#9a6a3f` / tattered loincloth | violet/gold `#9b6bd6` / `#f2c14e` | tin-gray `#aab4be` / riveted, red eyes |

**Movesets** (L = Light, H = Heavy, G = Grab, S = Special, M = Meltdown):

- **Gorgantor**
  - L: claw–claw–tail whip (hit 3 knocks back). H: *Atomic Chomp* (bite, lunges 1 tile, heals 4 on hit). G: shoulder-throw.
  - S – **Atomic Breath** (35): 1.2 s forward beam, length 6 tiles, continuous 6 dmg ticks, sweeps ±25° following the stick; ignites tankers; wrecks buildings along the line.
  - M – **Meltdown Nova**: charges 40 ticks (armored), omni-blast radius 4 tiles 90 dmg, flattens `house/shop` instantly.
- **Mighty Mongo**
  - L: left–right–double-fist hammer. H: *Chest-Pound Slam* (ground shockwave 1.5 tiles, small stun). G: bear-hug → **piledriver** (28 dmg). Can throw props 1.3× farther.
  - S – **Skyscraper Hurl** (35): pulls the nearest building chunk/prop in 2 tiles and hurls it (60 dmg); if climbing, becomes **Roof Rip** (drops a debris cluster).
  - M – **Wasteland Rampage**: 3 seconds of super-armored rolling stomps along facing; ×2 building damage.
- **Lepidora**
  - L: wing slash ×3 (fast, low dmg). H: *Dive Peck* (leap-dive 2 tiles). G: talon snatch → carry-and-drop (aerial throw). Glide-attack from air does +30 %.
  - S – **Scale Dust Cloud** (35): 3-tile radius poison/blind mist for 4 s, enemies' accuracy and AI aggro reduced, DoT 4/s; also slows enemies.
  - M – **Moonlit Tornado**: 3 s whirlwind pulling in props/orbs, shredding buildings in 3 tiles, final 70 dmg burst.
- **Tin Colossus**
  - L: piston punch ×3 (slow, heavy). H: *Rocket Fist* (fires fist projectile 5 tiles, 32 dmg, returns). G: crush-grip → **overhead hammer**. Immune to burn.
  - S – **Eye Ray** (35): twin beam sweep forward cone (like breath but 25 % wider & shorter, sets fires).
  - M – **Overload Rampage / Self-Destruct Lite**: 2 s charge → huge explosion radius 3.5 tiles, 85 dmg, costs 15 % own HP (does not kill).
  - **Passive:** “Battery” — at ≥ 50 fuel deals +10 % damage; immune to fire.

### 7.2 AI Challenger Pool
Challengers are drawn from the 4 monsters (never the player's monster) with archetype-flavored AI; later add rival-only "Boss" skins (e.g., **Octopulus Rex**, **Brain Fiend from Planet X**) as post-v1 stretch. AI uses the same state machine & frame data (no cheating beyond stat multipliers).

AI states: `approach → circle → attack-chain → retreat/reposition → pickup-prop → throw → block-reactive → recover`. Parameters by round: reaction delay (24 → 8 ticks), block probability (0.15 → 0.55), special usage frequency, prop-use probability. Telegraphed heavy attacks (flash + "!" icon) so they're fair.

### 7.3 Three Arenas ("Cities")
All use the same engine; each is a data object in `data-cities.js` with a seeded layout (hand-authored grids + seeded variation for props/NPC cars). IDs are whitelisted server-side.

| | **PINEBROOK, U.S.A.** `pinebrook` | **ATOM CITY, NEVADA** `atom_city` | **METRO HEIGHTS** `metro_heights` |
|---|---|---|---|
| Era vibe | Sunny suburban Main Street, drive-in theater, "Eat at Joe's" diner | Atomic test town: pastel tract houses, mannequin families, observation bunker, siren | Neon-lit big-city skyline at night, bridge, elevated train |
| Size (tiles) | 20×20 | 20×20 | 22×18 |
| Buildings | **18** (houses, shops, diner, gas station, water tower, theater **landmark: "Bijou Drive-In" screen**) | **16** (test-house pods, motel, bunker, radar dish, silo, **landmark: Observation Tower**) | **14** (skyscrapers, office towers, **landmark: "Empire Spire"**) |
| Palette | Warm Technicolor day: sky `#7fc8f8`, grass `#6fbf5a`, road `#555` | Desert dusk: sky `#ffb36b→#c1553a`, sand `#e5c07b`, mushroom-cloud silhouette | Night: sky `#0b1230`, neon pinks/cyans, wet asphalt |
| Hazards | Slow-zone puddles from a wrecked water tower; parked drive-in cars scatter (and become throwable) when the screen collapses | **Siren pulses**: every 25 s a shockwave of radiation boosts fuel gain ×1.5 for 8 s (nuke-test flash blinds screen 0.4 s warning-free) | **Elevated train** crosses every 30 s along one edge: telegraphed, damages anyone on the tracks (30) and buildings it clips |
| Props | cars, lamp posts, tankers at gas station, girders from construction site | boxcars on rail spur, tankers at silo, test-lab girders, jeeps | buses, taxis, girders from a building under construction, harbor containers at the pier |
| Unique reward | Landmark rubble: guaranteed Health orb ×2 | Landmark rubble: fuel ×2 and "OVERCHARGE" 10 s | Landmark rubble: extra Meltdown charge (+50 fuel) |
| Starting props | 4 | 5 | 4 |

Layout rules: leave **open fighting lanes** (roads 2 tiles wide) through the center; buildings cluster around the edges so the center is brawl space and the sides are destruction/loot space; no building footprints within 1.5 tiles of kaiju spawn points (SW corner for player, NE corner for challenger).

---

## 8. Backend: Extended SQLite Leaderboard (PHP, adapted from `beachhamster/api`)

### 8.1 Files
`api/db.php` (shared), `api/leaderboard.php` (GET), `api/submit_score.php` (POST). DB file `data/leaderboard.sqlite` (git-ignored, deny-all `.htaccess` in `data/`). Same `kb_json()` envelope (`Cache-Control: no-store`, `nosniff`), same `kb_db()` bootstrap pattern (`PRAGMA busy_timeout = 4000`, `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, `CREATE TABLE IF NOT EXISTS`).

### 8.2 Constants (`db.php`)

```php
const KB_DB_PATH = __DIR__ . '/../data/leaderboard.sqlite';
const KB_BOARD_SIZE = 25;            // rows shown
const KB_MAX_ROWS_PER_COMBO = 100;   // per (monster, city) combination kept
const KB_MIN_SUBMIT_GAP = 3;         // seconds between submissions per IP
const KB_MONSTERS = ['gorgantor','mongo','lepidora','tin_colossus'];
const KB_CITIES = [                  // id => number of buildings (used for plausibility)
  'pinebrook' => 18, 'atom_city' => 16, 'metro_heights' => 14,
];
```
Adding a monster/city later = append to these arrays (and the client data files).

### 8.3 Schema
One row = a player's **best run for one (monster, city) combo**. Overall and filtered boards are derived by "best run per player" over the filtered set.

```sql
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  name_key TEXT NOT NULL,                 -- lower(player_name)
  monster_id TEXT NOT NULL,
  city_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  kos INTEGER NOT NULL,
  buildings_wrecked INTEGER NOT NULL,
  survival_time INTEGER NOT NULL,         -- seconds
  created_at INTEGER NOT NULL,
  UNIQUE (name_key, monster_id, city_id)
);
CREATE INDEX IF NOT EXISTS idx_scores_rank
  ON scores (score DESC, kos DESC, survival_time DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_scores_monster ON scores (monster_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_city    ON scores (city_id, score DESC);
CREATE TABLE IF NOT EXISTS rate_limit (ip_hash TEXT PRIMARY KEY, last_submit INTEGER NOT NULL);
```
Ranking order everywhere: `score DESC, kos DESC, survival_time DESC, created_at ASC`.

### 8.4 `GET api/leaderboard.php`
Query params (all optional): `monster_id`, `city_id` (each validated against whitelists; unknown → 422), `limit` (1–25, default 25), optional `view=overall|monster|city` (informational/echo; behavior driven by the filter params). Combinations: no filter = **Overall**; `monster_id` only = **by Monster**; `city_id` only = **by City**; both = specific combo.

Best-per-player over the filtered set (SQLite ≥ 3.25 window functions; PHP 7.4 bundles it — if `sqlite_version()` is older, fall back to the `NOT EXISTS` form below):

```sql
WITH f AS (
  SELECT * FROM scores
  WHERE (:m IS NULL OR monster_id = :m) AND (:c IS NULL OR city_id = :c)
), best AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY name_key
    ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC, id ASC) AS rn
  FROM f
)
SELECT player_name, monster_id, city_id, score, kos, buildings_wrecked, survival_time, created_at
FROM best WHERE rn = 1
ORDER BY score DESC, kos DESC, survival_time DESC, created_at ASC
LIMIT :n;
```
(Fallback: `SELECT … FROM f a WHERE NOT EXISTS (SELECT 1 FROM f b WHERE b.name_key=a.name_key AND (b.score>a.score OR (b.score=a.score AND (b.kos>a.kos OR (b.kos=a.kos AND (b.survival_time>a.survival_time OR (b.survival_time=a.survival_time AND (b.created_at<a.created_at OR (b.created_at=a.created_at AND b.id<a.id))))))))))`.)

Response:
```json
{"ok":true,"filters":{"monster_id":null,"city_id":"pinebrook"},
 "entries":[{"rank":1,"player_name":"ATOMICAL","monster_id":"gorgantor","city_id":"pinebrook",
             "score":14250,"kos":9,"buildings_wrecked":41,"survival_time":412,"created_at":1731510000}]}
```
Overall/by-city boards show a **Monster** column (icon/name); overall/by-monster boards show a **City** column.

### 8.5 `POST api/submit_score.php`
Body JSON: `{"player_name","score","monster_id","city_id","kos","buildings_wrecked","survival_time"}`. (Also accept `$_POST` fallback and `name` alias, exactly as beachhamster.)

Validation (HTTP 422 on failure, same style of friendly error strings):
- `player_name`: trimmed/whitespace-collapsed, 1–12 chars, `^[A-Za-z0-9 _.\-!?]+$`.
- `monster_id ∈ KB_MONSTERS`, `city_id ∈ KB_CITIES`.
- Ranges: `0 ≤ score ≤ 5,000,000`, `0 ≤ kos ≤ 500`, `0 ≤ buildings_wrecked ≤ 20,000`, `1 ≤ survival_time ≤ 7200`.
- **Plausibility** (mirror of the scoring formula):
  - `kos ≤ floor(survival_time / 5) + 1` (a KO needs ≥ ~5 s).
  - `buildings_wrecked ≤ (kos + 1) × KB_CITIES[city_id]` (city resets each round).
  - `score ≤ kos×2000 + buildings_wrecked×200 + survival_time×8 + 500` (generous cap incl. style points).
  - No lower bound on `score` (clients may legitimately score less than the formula due to rounding/caps).
- Rate limit: SHA-256(`REMOTE_ADDR|kaijubrawl`), `KB_MIN_SUBMIT_GAP`, purge >1 h old, HTTP 429.

Persistence (transaction): `SELECT` the row for `(name_key, monster_id, city_id)`; INSERT if none; UPDATE only if `score` higher (or equal with higher `kos`, then higher `survival_time`); else status `not_improved`/`duplicate`. Then prune that combo to top `KB_MAX_ROWS_PER_COMBO`.

Response:
```json
{"ok":true,"status":"new|improved|not_improved|duplicate",
 "rank_overall":12,"rank_monster":3,"rank_city":5,
 "best":{"player_name":"…","monster_id":"…","city_id":"…","score":0,"kos":0,"buildings_wrecked":0,"survival_time":0}}
```
Ranks are computed with the same "best-per-player" CTE with `COUNT(*)+1` of rows beating the player's best in that filter scope.

### 8.6 Client side (dual mode — inherited behavior)
- `KB.CONFIG.API_LEADERBOARD = 'api/leaderboard.php'`, `API_SUBMIT = 'api/submit_score.php'`.
- On fetch failure/non-JSON (static server), fall back to **Local Mode**: scores in `localStorage['kb_local_scores_v1']` (array of the same shape; one best per `(name,monster,city)`), with the same filter logic implemented in JS (`bestPerPlayer(filter)`). Show `board-mode-notice` ("GLOBAL" / "LOCAL MODE — NO SERVER").
- Leaderboard screen has **three tabs** (reusing `.seg-group/.seg-btn`): **OVERALL | BY MONSTER | BY CITY**; the latter two show a second row of 4 monster chips or 3 city chips (`.chip`). A small "ALL" chip clears the filter. Game-over screen shows top 8 for **the run's own city** by default, with a `SWITCH: OVERALL` chip.
- Name persisted in `kb_name`. Submit button disabled during request; messages use `.submit-msg.ok/.err`; show returned ranks ("#12 OVERALL · #3 AS GORGANTOR · #5 IN PINEBROOK").

---

## 9. UI, Theming & Responsiveness

### 9.1 Nav button (verbatim from beachhamster)
```html
<header id="hud">
  <a id="backBtn" class="btn-back" href="https://arcade.stabthefinger.com">← STF Arcade</a>
  …
```
```css
.btn-back {
  flex: 0 0 auto; color: var(--amber); text-decoration: none; font-weight: bold;
  font-size: 13px; border: 2px solid var(--amber); padding: 6px 10px; border-radius: 5px;
  background: rgba(255, 210, 63, 0.1); white-space: nowrap;
}
.btn-back:hover, .btn-back:focus-visible { background: var(--amber); color: #061521; outline: none; }
@media (max-width: 780px) { .btn-back { font-size: 12px; padding: 5px 7px; } }
```

### 9.2 Theme additions (on top of the shared tokens)
`--film-red:#c1272d; --atomic:#7dff4f; --atomic-dim:#3d7f2a; --ink:#1b1209; --paper:#f1e3b9;` Title uses `--head` (Impact) with a B-movie look: amber fill, **thick red/black offset shadow**, slight rotation (`transform: rotate(-2deg)`), "STF ARCADE PRESENTS…" intro card, panel borders with filmstrip sprocket-hole pattern via CSS `repeating-linear-gradient`. Keep the shared dark navy shell so the arcade feels cohesive.

### 9.3 HUD (DOM, in `#hud` like beachhamster; wraps below the back button under 780 px)
`← STF Arcade` · stats: `SCORE · BEST · KOs · WRECKED · TIME` · chips `VIEW · SND · ❚❚`. In-stage overlay `#fighterHud` (top of `#stage`): **player HP bar + Atomic Fuel bar + Guard pip** (left), **challenger name + HP bar** (right), round banner ("ROUND 3"), combo counter. Portrait: stacks vertically, bars thinner.

### 9.4 Screens (`.screen` sections, same overlay system)
`menu` → `select` (monster carousel + stat bars + 3 city cards) → `how` → `board` → `pause` → `over`. Select screen: horizontal snap-scroll cards on mobile, 4-up grid on desktop; arrow keys/tap to select; remembers `kb_monster`, `kb_city`.

### 9.5 Responsive rules (checklist)
- `100dvh` app shell, safe-area insets, no scrolling.
- Canvas fit via `fitCanvasCss()` (copy from beachhamster) after `applyOrientation()`.
- Touch controls appear only under `body.touch` **or** when the user taps "TOUCH CONTROLS" toggle in Pause (for hybrid laptops).
- Test matrix: 1920×1080, 1366×768, iPad portrait/landscape, iPhone SE (375×667), iPhone 14 (390×844) + notch, Pixel 7, small Android (360×640).

---

## 10. Audio (`audio.js`, same architecture as beachhamster)
Pure Web Audio synthesis, `kb_sfx` toggle, `M` key, AudioContext resume on first gesture. SFX list in ASSETS.md §6. Music: a looping **campy theremin + brass stinger** synth loop (3 patterns, tempo ramps with round number). Keep SFX priority/voice-limit (max 12 concurrent).

---

## 11. Quality Bars (apply to every milestone)
- **Performance:** 60 fps on mid phones (Pixel 6a / iPhone 11) and integrated laptop GPUs. Budgets: ≤ 150 draw calls (canvas ops groups), ≤ 400 live particles (pooled), no per-frame allocations in hot loops, offscreen-cached ground/static layers, fixed logical canvas size like beachhamster (`1280×720` / `720×1280`), optional `KB.CONFIG.HIDPI` flag (default off) capping `devicePixelRatio` at 2.
- **Resilience:** all `localStorage` calls in try/catch; works fully offline with Local Mode; API errors never break the game.
- **Accessibility:** `kbd` hints, `prefers-reduced-motion` reduces shake/flash/grain, color-blind-safe HP/fuel (shape + label), all buttons ≥ 44 px, focus-visible outlines (copy beachhamster).
- **Determinism:** seeded RNG for layouts; combat uses its own seeded RNG so tests can replay.
- **Testing aids:** `?debug=1` overlay; `?seed=`; `?monster=&city=&round=` to jump into a scenario; `KB.test` console helpers (`spawnProp`, `wreckAll`, `setFuel`, `forceKO`).
- **No external network calls** other than own `api/`.

---

## 12. Phased Implementation Roadmap (for Gemini 4 Hydrogen)

**Execution rules for the agent**
1. Do milestones strictly in order; finish *and verify* one before starting the next. Commit (or checkpoint) after each.
2. After each milestone, run the listed **Verify** steps (serve with `php -S localhost:8000` — fall back to `python -m http.server 8000` for client-only milestones — and open in a browser at desktop and mobile viewport sizes).
3. Don't refactor earlier milestones' public APIs without updating this doc's module list.
4. Match beachhamster style: IIFE modules on `window.KB`, `'use strict'`, `const/let`, no libraries.
5. If a milestone's Verify fails, fix before moving on. Never leave the game unplayable.

### M0 — Scaffold, shell & STF Arcade chrome
**Goal:** Empty-but-correct project that looks and behaves like beachhamster's shell.
- Copy `.gitignore`, `.htaccess`, `data/.gitkeep`, `data/.htaccess` from `../beachhamster`. Create `assets/favicon.svg` (atomic-green radiation trefoil on dark circle).
- Write `index.html` mirroring beachhamster structure: viewport meta, `#app > #hud (btn-back, #stats, #toggles) + #stage (canvas#game, #touchControls, #fighterHud, #screens)`. Script tags in §2 order (stub files with module skeletons).
- `css/style.css`: copy beachhamster's tokens, `#app`, `#hud`, **`.btn-back` verbatim**, `.chip`, `.btn`, `.panel`, `.screen`, tables, responsive blocks; add B-movie tokens.
- `js/config.js`, `js/util.js`; `js/game.js` with **orientation + fitCanvasCss** (`kb_orient`, DIMS 1280×720 / 720×1280) rendering a placeholder checker + text; `ui.js` with menu/pause/orientation toggles and `body.touch`.
- `README.md` (run instructions Option A PHP / Option B static, controls, deploy notes to `kaijubrawl.stabthefinger.com`).
- **Verify:** nav button identical in look/hover to beachhamster; resizing/rotating switches AUTO orientation; VIEW chip and pause seg-buttons persist; no console errors; no scroll on mobile emulation.

### M1 — Isometric engine & static arena render
**Goal:** See Pinebrook as an iso diamond with correct depth sorting.
- `iso.js`: projection/unprojection, camera follow/clamp/zoom, culling, **depth-sorting comparator + topological sort** (§4.3), debug overlay.
- `data-cities.js` (Pinebrook only first): size, grid, building list with footprints/heights, road lanes.
- `render.js`: ground offscreen cache, shadows, procedural placeholder buildings (extruded boxes with roofs/windows, colors by archetype), sorted draw pass; backdrop.
- Dev camera: WASD pans a debug marker "kaiju" (a colored cylinder) to test sorting **walking around and behind buildings**.
- **Verify:** marker passes correctly in front of/behind every building from all 8 directions; no flicker; wide building + marker beside it sorts right; unit-ish test `KB.test.sortSelfCheck()` shuffles 200 random non-overlapping footprints and asserts no ordering violations.

### M2 — Player kaiju movement & unified input (desktop + mobile)
**Goal:** Control Gorgantor (procedural model) smoothly on both platforms.
- `input.js`: keyboard Intent, **floating joystick + action buttons** (DOM overlay, multitouch pointer events, orientation layouts), buffering, pause/sound keys.
- `entities.js`: `Kaiju` with position/velocity/facing (8-dir), circle-vs-AABB collision & wall sliding, arena bounds, jump with `z`/gravity, screen→world movement mapping.
- `render.js`: procedural rubber-suit kaiju drawing (body, head, tail wobble, shadow) with facing flip and walk bob.
- **Verify:** on mobile emulation joystick + buttons work simultaneously (move while tapping); no ghost touches; portrait/landscape layouts correct; keyboard 8-way works; kaiju can't enter buildings; jump arc shadow correct.

### M3 — Combat core: hit/hurt, combos, block, dodge, hit-stop
**Goal:** A training dummy you can fight convincingly.
- `combat.js`: frame-data driven state machine (§5.1), hitbox/hurtbox, combo chain (L1-L2-L3), heavy w/ armor, block + guard meter + guard break, dodge i-frames + counter window, knockback/knockdown, hit-stop, shake, damage scaling.
- A stationary/blocking **dummy kaiju** with HP bar; combo counter UI; debug hitbox overlay.
- HUD: `#fighterHud` HP/Guard bars bound to state.
- **Verify:** frame counts match table (log in debug); combo chains with buffering; block reduces 80 %; dodge i-frames avoid dummy attack (dummy "attack test" button); hit-stop and shake feel good; works with touch buttons.

### M4 — Destructible buildings & loot drops
**Goal:** Smash Pinebrook; buildings degrade intact → damaged → rubble and drop loot.
- `Building` entity with HP/state/thresholds, crack & collapse animations, debris particles, dust, solid→non-solid, rubble slow zone, `buildings_wrecked` counter, civilians scatter (cosmetic).
- Damage routing from melee/heavy/stomp. Loot tables (§6.3) → **Pickup** entities (health orb, fuel canister) with bob/magnet/expiry/pity rule.
- Gas station explosion, water tower flood.
- **Verify:** every archetype passes through all 3 states visibly; loot rates over 200 simulated wrecks within ±5 % of table (`KB.test.lootStats()`); pickups heal/fuel correctly; depth sorting still correct as buildings collapse; 60 fps with all 18 buildings crumbling.

### M5 — Props, grab/throw, climb & jump-stomp
**Goal:** Throwable girders & tankers; climb and roof smash.
- `Prop` entity (girder, tanker, car, lamp post), pickup/carry/throw/smash, flight arcs, bounce/break, damage to kaiju/buildings, tanker explosion + chain reactions, burn DoT.
- Girder/tanker drops from buildings; starting props.
- Grab/throw/slam on kaiju (vs dummy); **Climb** state (tiers, roof punch/smash, leap-off stomp).
- **Verify:** throwing a girder pierces one target and wrecks a building ×2; tanker chain-explodes a gas station; carry speed penalty; climbing a skyscraper and diving works on desktop and mobile controls; no sorting glitches while climbing.

### M6 — Atomic Fuel & special attacks
**Goal:** Fuel economy plus Gorgantor's Special and Meltdown.
- Fuel gain/spend/overcharge (§6.1), HUD gauge, comic sound cards, screen flash.
- Implement **Atomic Breath** (beam sweep, building line damage, tanker ignite) and **Meltdown Nova** end-to-end; generic special framework (`SpecialDef` table) so other monsters plug in.
- **Verify:** fuel values match table; special blocked when insufficient fuel (UI shake); Meltdown button only appears when full; beam wrecks buildings along its line; mobile buttons work.

### M7 — Full roster (Gorgantor, Mongo, Lepidora, Tin Colossus)
**Goal:** All four distinct monsters playable.
- `data-monsters.js` stat tables & move defs (§7.1); procedural models per monster (colors, silhouettes: tail, ape arms, wings, riveted robot).
- Mongo climb speed/Skyscraper Hurl/Rampage; Lepidora glide, Scale Dust, Tornado; Tin Colossus Rocket Fist, Eye Ray, Overload, Jet Hop, Battery passive.
- Select screen with stat bars, preview animation (idle), persistence (`kb_monster`).
- **Verify:** each monster's stats applied; every move reachable on keyboard + touch; balance smoke test: AI-vs-AI headless sim (`KB.test.simMatchups(200)`) shows no pairing > 65 % win rate (tune numbers if so).

### M8 — Challenger AI & Rampage round loop
**Goal:** The real game: endless rounds against escalating AI.
- `ai.js` state machine (§7.2) using same Intent-like controller interface; telegraphs; prop usage; reactive block/dodge.
- Round manager in `game.js`: challenger spawn drop-in, KO sequence, +25 % max-HP heal, intermission with city rebuild (+ "REEL n" title cards), boss every 4th, difficulty scaling, death → results.
- Score calculation incl. style points & caps; HUD (SCORE/KOs/WRECKED/TIME); pause/resume; auto-pause on hidden.
- **Verify:** can play 5+ rounds; difficulty visibly escalates; score/time accounting correct (matches the formula); stats persist to game-over screen; AI fair (telegraphed heavies).

### M9 — Arenas 2 & 3 (Atom City, Metro Heights) + hazards
**Goal:** All three cities with unique looks and mechanics.
- Layouts, palettes, building skins, landmarks and unique rewards (§7.3); siren radiation pulse; elevated train; backdrop silhouettes (mushroom cloud / skyline).
- City select cards with previews (rendered thumbnails from the live renderer).
- **Verify:** each city plays through 3 rounds; depth sorting holds with non-square arena (22×18); hazards telegraph and don't cheese-kill; performance holds at night-city neon.

### M10 — SQLite leaderboard backend
**Goal:** Extended PHP/SQLite API per §8.
- Port `db.php`, `leaderboard.php`, `submit_score.php` from beachhamster with the new schema, whitelists, validation, plausibility, rate limit, per-combo pruning, ranks (overall/monster/city), window-function query with `NOT EXISTS` fallback.
- Seed script (CLI-only `api/seed_dev.php` guarded by `php_sapi_name()==='cli'`) to insert 60 fake rows across all combos for testing.
- **Verify (curl):** valid submit → `new`; same payload → `duplicate`; lower score → `not_improved`; higher → `improved`; bad monster/city/name/ranges → 422; implausible score → 422; rapid repeat → 429; `GET` no filters returns best-per-player across combos; `?monster_id=` and `?city_id=` and both return correctly filtered, ordered, de-duplicated (one row per player) entries; `data/leaderboard.sqlite` not web-accessible (403).

### M11 — UI: select flow, game over, leaderboard views, Local Mode
**Goal:** Complete menu/results/leaderboard UX.
- Menu → select → play flow; HOW TO PLAY (controls for both platforms, loot legend, building states); Pause (orientation + touch toggle); Game Over ("THE END?") with results (score, KOs, buildings, time, monster, city), name badge ("MONSTER TAG"), submit, ranks message, top-8 view.
- Leaderboard screen with OVERALL | BY MONSTER | BY CITY tabs and filter chips; table columns per §8.4; `tr.me` highlight; Local Mode fallback + notice; personal best (`kb_high_v1`).
- **Verify:** with PHP server: submit & see all three views update; with `python -m http.server`: Local Mode works identically; mobile layout of tables (hide DATE under 780 px as `.hide-sm`); long names don't overflow.

### M12 — B-movie polish, juice & audio
**Goal:** It should *feel* like a 1950s monster flick.
- Film grain/vignette/scratches/“Technicolor” tint, title cards (“STF ARCADE PRESENTS”, “REEL n”, “THE END?”), comic sound cards (BIFF/KRAK/KA-BOOM), miniature-set look (slightly blurred backdrop, wire-hung effects), screaming extras and cars fleeing, rubber-suit wobble.
- `audio.js`: full SFX set + looping synth music with escalating tempo; audio unlock; `M` toggle.
- Settings: reduced motion; FILM FX toggle.
- **Verify:** 60 fps retained with FX; reduced-motion disables shake/flash/grain; audio never errors if AudioContext is blocked.

### M13 — Optional sprite upgrade pass (ASSETS.md Tier 1)
**Goal:** Swap procedural art for generated sprites without code changes elsewhere.
- Implement `assets.js` loader with manifest + automatic procedural fallback (draw function used if an image is missing). Add monster key-pose atlases, building state sprites, props, pickups, FX.
- **Verify:** removing any sprite file falls back gracefully; atlas load time ≤ 2 s on 4G; total payload budget met.

### M14 — QA, balance, performance & release
**Goal:** Ship at `kaijubrawl.stabthefinger.com`.
- Device matrix test (§9.5), 10-minute soak test (no memory growth beyond 50 MB), tuning pass on damage/fuel/loot, add link tile in the arcade (outside this repo), finalize `README.md`, `og.png`, `<meta description>`.
- Security pass: input validation, rate-limit, `.htaccess` in place, DB not downloadable, no PHP warnings leaking (`display_errors` off assumption: never echo errors).
- **Verify:** acceptance checklist below all green.

### Final Acceptance Checklist
- [ ] `← STF Arcade` button identical to beachhamster (markup, CSS, hover) and links to `https://arcade.stabthefinger.com`.
- [ ] Desktop keyboard and mobile joystick/buttons both fully playable; no scroll/zoom on mobile; AUTO/PORTRAIT/LANDSCAPE all correct.
- [ ] Four monsters with distinct stats/movesets; three arenas with unique hazards.
- [ ] Buildings degrade intact → damaged → rubble, drop health/fuel/girders/tankers per tables.
- [ ] Atomic Fuel meter, special, Meltdown work for every monster.
- [ ] Leaderboard: Overall + By Monster + By City, global (SQLite) and Local fallback.
- [ ] Zero build step; no external dependencies; 60 fps on target devices.
