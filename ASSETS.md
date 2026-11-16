# KAIJU BRAWL — ASSETS.md

Companion to [PLAN.md](PLAN.md). Defines the art direction, every asset the game needs, file formats/naming, the **procedural fallback rule**, and ready-to-use generation briefs.

> [!IMPORTANT]
> **Tiering rule (inherited from Beach Hamster):** Beach Hamster ships *no* image/audio files except `favicon.svg` — all art is drawn on canvas and all audio is Web Audio synthesis. Kaiju Brawl keeps that as the **baseline (Tier 0)** so the game is always playable with zero downloads. **Tier 1** sprite atlases are an optional upgrade (milestone M13); every sprite has a procedural draw function used as fallback when the image is absent or fails to load.

---

## 1. Art Direction — "1950s B-Movie Matinee"

- **Look:** miniature-set kaiju film. Rubber-suit monsters with visible zipper-seam charm, cardboard-and-balsa buildings, painted backdrops, wire-hung props, cheap-but-loving explosions.
- **Color:** "3-strip Technicolor" — saturated primaries, slightly posterized, warm highlights, teal-ish shadows. Night city uses limited neon (magenta/cyan/yellow) on deep navy.
- **Linework:** bold 2–3 px dark-ink outlines (`#1b1209`) on kaiju and props; buildings have softer outlines. Flat cel shading, 2 tone steps + 1 highlight; a *single* hard drop-shadow ellipse on the ground.
- **FX language:** comic sound cards (BIFF! KRAK! KA-BOOM!) on starburst shapes, hand-drawn smoke puffs (cotton-ball look), animated film grain, vertical scratches, dust-and-hair flicker, "cigarette burn" corner marks on round transitions.
- **UI language:** theater marquee bulbs, filmstrip borders, title cards on aged paper (`--paper #f1e3b9`) with ink text. Shared arcade tokens stay (`--bg --amber --cyan …`) so the **STF Arcade** shell is consistent.
- **Palette (core):**

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#081a28` | page background (shared) |
| `--amber` | `#ffd23f` | titles, STF Arcade button (shared) |
| `--cyan` | `#5ee6ff` | secondary UI (shared) |
| `--coral` | `#ff6b57` | danger/KO |
| `--film-red` | `#c1272d` | title shadows, curtains |
| `--atomic` | `#7dff4f` | Atomic Fuel, radiation glow |
| `--ink` | `#1b1209` | outlines |
| `--paper` | `#f1e3b9` | title cards |
| Health | `#ff4d5a` | health orbs/bar |

---

## 2. Tier 0 — Procedural Art Spec (ships first; always the fallback)

All drawn in `render.js` with canvas paths; deterministic from `(id, seed)`. Each function signature: `draw(ctx, x, y, scale, state, t)` where `x,y` is the projected screen anchor (feet center / building base center).

| Asset | Procedural recipe |
|---|---|
| **Kaiju (×4)** | Layered shapes: shadow ellipse → legs (2 rounded rects, walk-bob) → tail (3-segment chain with phase-lagged sine wobble) → torso (rounded blob, belly lighter) → arms (rotate for attacks) → head (jaw angle for bite/breath) → color accents (fins, wings, rivets). Facing: 2 authored poses (front-SE / back-NE) mirrored for SW/NW. State poses by `state`: idle, walk, atk1–3, heavy, grab, carry, jump, glide, climb, block, dodge, hit, down, ko, special, ultimate, victory. ~1.25 tile footprint, ~2.2 tile tall. |
| **Buildings** | Extruded iso box: left wall (darker), right wall (mid), roof (lightest) polygons from footprint corners + height; windows as grid of quads (lit/unlit by seed), per-archetype roof (flat/gabled/spire/sign). `damaged`: random crack polylines, missing window quads, tilted roof wedge, smoke plume particles. `rubble`: 6–10 jagged polygons + dust sprite, height ×0.12. |
| **Props** | Girder: 3 stacked beams with rivet dots (orange-red). Tanker: capsule body, silver w/ red "FLAMMABLE" stripe, wheels. Car/bus: boxy 1950s sedan silhouettes with fins. Lamp post, boxcar, container. |
| **Pickups** | Health orb: red glowing sphere with white cross; Fuel canister: green glowing barrel with trefoil; rings pulse; bob ±3 px. |
| **FX** | Beam (layered additive strokes + noise wobble), explosion (expanding rings + cotton smoke + starburst card), dust puffs, debris shards, shock rings, sparks, flames, hit-spark star, sound cards (text on starburst). |
| **Ground** | Offscreen canvas per city: diamond tile fills, road lanes, sidewalks, grass noise, painted markings; decal layer for scorch/footprints. |
| **Backdrop** | Parallax silhouettes via gradient + polygons (hills / mushroom cloud / skyline with lit windows). |
| **Civilians** | 3 px stick-figure extras with arms-up "scream" pose; flee from kaiju. |

---

## 3. Tier 1 — Sprite Atlases (optional upgrade, M13)

### 3.1 Folder & naming
```
assets/sprites/
  monsters/<monster_id>.png        + <monster_id>.json     (key-pose atlas)
  buildings/<city_id>.png          + <city_id>.json        (building state sprites)
  props.png        + props.json
  pickups.png      + pickups.json
  fx.png           + fx.json
  ui/               (title logo, select portraits, marquee bulbs)
assets/audio/       (optional; see §6)
```
- Format **PNG-8/PNG-24 with alpha**, or **WebP** (provide PNG fallback). Atlas max **2048×2048**. Power-of-two sizes. `image-rendering: auto` (smooth), premultiplied alpha safe.
- **JSON atlas format** (hand-rolled, tiny):
```json
{ "image": "gorgantor.png",
  "frames": { "idle_se_0": {"x":0,"y":0,"w":256,"h":256,"ax":128,"ay":236}, "...": {} } }
```
`ax, ay` = anchor (feet center) in the frame; the renderer places the anchor on the projected ground position. Frame names: `<pose>_<facing>_<index>` where facing ∈ `se`, `ne` (authored); `sw`, `nw` are horizontal mirrors drawn by code.

### 3.2 Loader contract (`assets.js`)
```js
KB.Assets.load(manifest) -> Promise (never rejects; missing files are logged + fallback flagged)
KB.Assets.frame(atlasId, frameName) -> {img,x,y,w,h,ax,ay} | null
// renderer: const f = Assets.frame(...); if (f) blit(f) else proceduralDraw(...)
```
Preload only the player's chosen monster + selected city first; lazy-load others in idle time. Show a filmstrip loading bar on the `.panel`. Total Tier 1 budget: **≤ 3.5 MB** transferred for a first match (≤ 8 MB entire game).

---

## 4. Monster Sprites (4 monsters)

**Frame size:** 256×256 px (kaiju ≈ 2.2 tiles tall at `TW=96`; render scale ~0.85). **Authored facings:** `se` (front-right), `ne` (back-right). **Key-pose animation:** the engine tweens between poses (offset, rotation, squash/stretch, hit-flash) — we don't need full-frame animation.

Per monster, per facing, these poses (index count in parentheses) = **~22 poses × 2 facings = 44 frames**:

`idle(2)` · `walk(4)` · `light1(2)` `light2(2)` `light3(2)` (windup, strike) · `heavy(3)` · `grab(2)` · `carry_idle(1)` `carry_walk(2)` · `throw(2)` · `jump(2)` (rise, fall) · `block(1)` · `dodge(1)` · `hit(1)` · `down(1)` · `getup(1)` · `climb(2)` · `special(3)` · `ultimate(3)` · `ko(1)` · `victory(1)`

Plus per monster: `portrait.png` 512×512 (select screen, 3/4 bust, campy), `icon.png` 64×64 (leaderboard chip).

### Monster design briefs

| ID | Name | Silhouette & details | Palette | Signature poses |
|---|---|---|---|---|
| `gorgantor` | **Gorgantor** | Bipedal rubber-suit dinosaur, dorsal plates, thick tail, small arms with three claws, toothy grin; faint visible zipper seam | Swamp green `#5fbf6a`, belly `#cfe8a8`, plates `#ff9a2e`, ink outline | Breath: head back, mouth glow `#7dff4f`; Nova: crouched, glowing seams |
| `mongo` | **Mighty Mongo** | Giant ape, wide shoulders, long arms (knuckle-walk when moving), shaggy fur tufts, tattered loincloth, scarred chest | Brown `#9a6a3f`, tan face `#d9b383`, loincloth `#a33` | Chest-pound (both fists), climb pose (hands up on wall), rampage roll |
| `lepidora` | **Lepidora** | Giant moth/butterfly queen, bulbous furry body, huge patterned wings (eyespots), feathery antennae, tiny legs | Violet `#9b6bd6`, gold `#f2c14e`, fur `#f6e8ff` | Wings spread (glide), wing-slash, dust cloud release, tornado spin |
| `tin_colossus` | **Tin Colossus** | Retro tin-toy robot: boxy torso, riveted panels, pipe arms, dome head with antenna, glowing slit eyes, wind-up key on back | Tin gray `#aab4be`, panel shade `#7e8a96`, eyes `#ff3b3b`, rust accents | Rocket-fist extended, eye-ray stance, jet hop (flame under feet), overload (cracks glowing) |

### Generation brief template (for the `image-generator` agent)
> *"Isometric 2.5D game sprite sheet, 1950s B-movie rubber-suit kaiju **<NAME>**: <silhouette notes>. Bold dark-ink outlines, flat cel shading with two tone steps, saturated 3-strip Technicolor palette (<palette>), transparent background, consistent proportions across all poses. View from front-right three-quarter (`se`) [then: back-right (`ne`)]. Full body, feet centered at the bottom with ~20 px padding, 256×256 px frames laid out in a grid, poses in this order: <pose list>. No text, no shadow baked in."*

Consistency rules: generate **one hero reference image per monster first**, then pass it as the style/character reference for all pose sheets. Reject sheets where proportions/palette drift. Post-process: remove background, pack into atlas (a small throwaway script is fine — keep it out of the web root, e.g. `tools/` ignored by deploy, or in `scratch/`).

---

## 5. Environment Sprites

### 5.1 Buildings (per city atlas; each archetype × 3 states)
Sprite size depends on footprint; anchor = base center of the footprint diamond. Frame sizes: house 192×192, shop 224×200, office 256×320, tower 256×512, gas_station 192×176, water_tower 128×288, landmark 384×448. States: `intact`, `damaged`, `rubble` (+ optional `crack_0..2` overlay frames for shake animation, and `collapse_0..3` frames).

| City | Archetypes / skins | Landmark |
|---|---|---|
| **Pinebrook** (`pinebrook`) | `house_a/b/c` (pastel suburban, picket fences, shutters), `shop_a` (barber/hardware), `diner` (chrome with neon "EAT" sign), `gas_station` (Mobil-style pumps, canopy), `water_tower`, `theater` (marquee) | **Bijou Drive-In screen** (giant white screen on stilts, showing a movie still) |
| **Atom City** (`atom_city`) | `testhouse_a/b` (identical tract homes, pastel), `motel` ("Mushroom Motel" sign), `bunker`, `radar_dish`, `silo`, `water_tower`, `lab` | **Observation Tower** (concrete cab on tall legs, siren horns) |
| **Metro Heights** (`metro_heights`) | `office_a/b`, `tower_a/b/c` (art deco setbacks, lit windows), `hotel`, `bank`, `construction` (girders & crane), `warehouse` | **Empire Spire** (art-deco needle with antenna & searchlights) |

Ground tiles: 96×48 diamond tiles (several variants per type) for grass/asphalt/sidewalk/sand/wet asphalt; **road overlays** (straight, turn, intersection), crater and scorch decals (192×96 diamonds).

Backdrops: 2048×512 painted panoramas per city (tileable horizontally), 2 parallax layers each (far/near): Pinebrook = rolling hills + blue sky + puffy clouds; Atom City = desert mesas + distant mushroom cloud, dusk gradient; Metro Heights = skyline silhouettes with lit windows, bridge, searchlights.

### 5.2 Props, pickups, FX

| Atlas | Contents (sizes) |
|---|---|
| `props.png` | `girder` (128×48, plus `girder_carry`), `tanker` (192×96; `tanker_burning`), `car_a/b/c` (1950s sedans/wagon/taxi, 128×80), `bus` (192×96), `lamp` (48×160), `boxcar` (224×110), `container_a/b` (160×90), `water_tank` (128×128) — each with `se`/`ne` as needed |
| `pickups.png` | `orb_health` (48 px, glow ring), `canister_fuel` (48 px), trefoil glow ring, spawn sparkle (4 frames) |
| `fx.png` | `puff_0..3` (cotton smoke), `dust_0..3`, `explosion_0..7` (96–256 px), `shock_ring`, `spark_0..2`, `flame_0..3`, `beam_head/body/tail` (tileable, additive), `hit_star_0..2`, `starburst_a/b/c` (backing for comic sound cards), `debris_0..5` |
| `ui/` | `logo.png` (title lettering "KAIJU BRAWL", 1024×384), `marquee_bulb_on/off.png`, `filmstrip_border.png` (9-slice), `portrait_<monster>.png`, `city_card_<city>.png` (512×288), `og.png` (1200×630 share image), `favicon.svg` |

Comic sound cards are **text rendered in code** (Impact) on `starburst_*` sprites (or procedural starbursts), so the word list is localizable/cheap: `BIFF! BAM! KRAK! WHAM! KA-BOOM! CRUNCH! ZZAP! ROAAAR!`.

---

## 6. Audio Assets

**Baseline (Tier 0):** all synthesized with Web Audio in `audio.js` (no files), like Beach Hamster — oscillators, filtered noise, envelopes. Recipes:

| SFX id | Recipe |
|---|---|
| `step` | Low sine thump 60→40 Hz, 120 ms, light screen shake sync |
| `light_hit` / `heavy_hit` | Noise burst (bandpass 900/400 Hz) + sine thud; heavy adds sub 50 Hz + longer decay |
| `whoosh` | Highpassed noise sweep 400→1600 Hz, 150 ms |
| `block` | Metallic ping (square 880 Hz, fast decay) + noise tick |
| `dodge` | Quick noise sweep down + soft pop |
| `crack` / `collapse` | Layered noise rumble (lowpass 300 Hz, 0.8 s) + crunch bursts; collapse longer with pitch fall |
| `pickup_health` / `pickup_fuel` | Arpeggio up (C-E-G / G-B-D), triangle wave; fuel adds bubbly LFO |
| `throw` / `prop_hit` | Whoosh + clang (detuned squares) |
| `explosion` | Noise (lowpass sweep 2000→80 Hz) + sub boom; tanker version bigger |
| `breath` | Looped filtered noise + sawtooth growl 90 Hz with tremolo; Eye Ray = saw + FM whine |
| `meltdown_charge` / `meltdown_blast` | Rising sine+saw sweep with LFO → massive noise burst + sub |
| `roar` | Sawtooth 120→60 Hz with formant bandpass wobble (per-monster pitch/timbre) |
| `ko_bell` / `round_start` | Boxing-ring-style bell (stacked sines 880/1320 Hz, long decay) + brass stinger |
| `siren` (Atom City) | Triangle 440↔660 Hz sweep, 2 s |
| `train` (Metro) | Rhythmic noise clacks + horn (two detuned sawtooths) |
| UI | `click` (square blip), `confirm`, `deny` |

**Music (synth):** campy B-movie score — theremin lead (sine + vibrato + portamento), staccato brass stabs, low string tremolo; 3 loops (menu / fight / boss) at 100/120/140 BPM; layers added with round number. Duck music −8 dB under big SFX. Voice cap 12.

**Optional Tier 1 audio:** `assets/audio/*.ogg` + `.mp3` fallback (mono, 44.1 kHz, ≤ 80 KB per SFX, music ≤ 700 KB per loop). If present, `audio.js` prefers files; otherwise synth.

Licensing: only original/synthesized or CC0 audio and generated art owned by the project — no sampled movie audio or trademarked monster likenesses (keep names/designs original: avoid Godzilla/King Kong/Mothra/Gigantor specifics).

---

## 7. Fonts & Icons
- **No webfonts** (zero-dependency like Beach Hamster): `--head: Impact, "Arial Black", "Trebuchet MS", sans-serif`; `--mono: "Courier New", ui-monospace, Menlo, Consolas, monospace`.
- Icons are inline SVG/CSS or Unicode (`←`, `❚❚`, `♥`, `☢` for fuel). `assets/favicon.svg` = radioactive trefoil (`--atomic` on `#081a28`) with tiny kaiju claw silhouette.

---

## 8. Asset Manifest (single source of truth)

`assets/manifest.json` is **optional**; if missing, the game stays on Tier 0. Shape:

```json
{
  "version": 1,
  "atlases": {
    "monsters/gorgantor": {"image": "assets/sprites/monsters/gorgantor.png", "data": "assets/sprites/monsters/gorgantor.json"},
    "buildings/pinebrook": {"image": "assets/sprites/buildings/pinebrook.png", "data": "assets/sprites/buildings/pinebrook.json"},
    "props": {"image": "assets/sprites/props.png", "data": "assets/sprites/props.json"}
  },
  "backdrops": {"pinebrook": ["assets/sprites/bg/pinebrook_far.png", "assets/sprites/bg/pinebrook_near.png"]},
  "audio": {}
}
```

---

## 9. Production Checklist

| # | Asset group | Tier | Count | Done |
|---|---|---|---|---|
| 1 | favicon.svg | 0 | 1 | ☐ |
| 2 | Procedural kaiju ×4 (all poses) | 0 | 4 | ☐ |
| 3 | Procedural buildings (archetypes × 3 states × 3 cities) | 0 | ~24 | ☐ |
| 4 | Procedural props/pickups/FX/ground/backdrops/civilians | 0 | ~30 | ☐ |
| 5 | Synth SFX set + 3 music loops | 0 | ~30 | ☐ |
| 6 | Monster hero reference art | 1 | 4 | ☐ |
| 7 | Monster pose atlases (44 frames each) + portrait + icon | 1 | 4 | ☐ |
| 8 | Building atlases (3 cities × archetypes × 3 states + landmarks) | 1 | 3 | ☐ |
| 9 | Props/pickups/FX atlases | 1 | 3 | ☐ |
| 10 | City backdrops, city cards | 1 | 3+3 | ☐ |
| 11 | Logo, filmstrip border, marquee bulbs, og.png | 1 | ~5 | ☐ |
| 12 | Optional audio files | 1 | optional | ☐ |

**Rule for contributors/agents:** never block gameplay milestones on Tier 1 art. Ship Tier 0 for M0–M12; run M13 once the game is fun.
