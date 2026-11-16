# Kaiju Brawl — STF Arcade

A campy 1950s B-movie isometric 2.5D kaiju arena brawler built for **STF Arcade** (`kaijubrawl.stabthefinger.com`). Pick one of six rubber-suit monsters, stomp a destructible miniature city, hurl steel girders, magma boulders, and explosive fuel tankers, and survive an endless Rampage gauntlet of escalating challengers.

Zero build steps. Zero npm/Node dependencies. Pure HTML5 Canvas, Web Audio API synthesis, and native CSS on the client, paired with a lightweight PHP 7.4+ / SQLite global leaderboard (plus automatic browser `localStorage` Local Mode fallback when served statically).

---

## Running Locally

### Option A: PHP Server (Global SQLite Leaderboard)
```bash
php -S localhost:8000
```
Open `http://localhost:8000/`. Requires PHP 7.4+ with `pdo_sqlite` enabled and write permissions on `data/`.

To seed sample development scores across all `(monster, city)` combinations (CLI only):
```bash
php api/seed_dev.php
```

### Option B: Static HTTP Server (Local Mode Fallback)
```bash
python3 -m http.server 8000
```
If the PHP API endpoints are unavailable or return non-JSON, the leaderboard and score submission automatically fall back to `localStorage` (`kb_local_scores_v1`) with identical best-per-player filtering and rank calculation.

---

## Controls & Orientation

### Desktop Keyboard (Two-Hand Arcade Cluster)
- **Move (8-way screen-relative):** `W` `A` `S` `D` or `Arrow` keys
- **Light Attack (3-hit combo):** `J`
- **Heavy Attack:** `K`
- **Grab / Pick Up / Throw Prop:** `L`
- **Dodge Roll (i-frames & phase-through):** `;` or `C`
- **Block (hold; Perfect Block within 6 ticks):** `U` or `Shift`
- **Atomic Special (35 Fuel):** `I` or `Q`
- **Meltdown Ultimate (100 Fuel):** `O` or `E`
- **Jump / Climb Building / Glide / Jet Hop:** `Space`
- **Face Enemy:** `H` (attacks & specials also soft auto-face opponents within `4.5` tiles)
- **Pause / Sound:** `P` or `Esc` to pause · `M` to mute/unmute audio

### Mobile & Hybrid Touch
- **Left Side:** Floating virtual joystick (double-flick beyond 80% deflection within 250 ms to dodge roll)
- **Right Side:** Multitouch action button cluster (`HIT`, `HVY`, `GRAB`, `JMP`, `BLK`, `ROLL`, `SPEC`, `MELT`)
- **Orientation & Touch Override:** Auto-detects Portrait (`720x1280`, 9:16) or Landscape (`1280x720`, 16:9); toggle **VIEW** (`AUTO / 9:16 / 16:9`), **TOUCH OVERLAY** (`AUTO / ON / OFF`), or **FILM FX** (`ON / OFF`) in the Pause menu

---

## Roster & Arenas

### Kaiju (`6`)
- **Gorgantor** (*"The Atomic Saurian"*) — All-rounder; *Atomic Chomp* heals on hit, *Atomic Breath* sweeps a 6-tile beam, *Meltdown Nova* flattens nearby low buildings.
- **Mighty Mongo** (*"Eighth Wonder of the Wasteland"*) — Fast Tier-2 climber & grappler (`1.3x` throw distance); *Skyscraper Hurl* / *Roof Rip*, *Wasteland Rampage*.
- **Lepidora** (*"Queen of the Night Skies"*) — High-speed aerial glider; *Scale Dust Cloud* poisons/blinds & slows, *Moonlit Tornado* pulls in props and shreds buildings.
- **Tin Colossus** (*"The Mechanical Menace"*) — Heavy armored tank with *Jet Hop*, *Battery* passive (`+10%` damage at `>= 50` fuel, fire-immune), *Rocket Fist*, *Eye Ray*, and *Overload*.
- **Octopulus Rex** (*"Terror from the Mariana Trench"*) — Long-reach tentacle whip (`+0.35` reach); *Ink Jet* blinds & slows (`0.7x` speed), *Tidal Surge* knockback wave, *Kraken Maelstrom* vortex.
- **Brain Fiend** (*"Invader from Planet X"*) — Telekinetic zoner (`1.4x` prop throw speed); *Psychic Slam*, *Gravity Well* lifts & hurls nearby props, *Cerebral Overload* chain-detonates hazards.

### Cities & Hazards (`5`)
- **Pinebrook, U.S.A. (`20x20`, 18 buildings):** Sunny suburban Main Street; *Bijou Drive-In* landmark drops `2` guaranteed Health Orbs and scatters throwable parked cars.
- **Atom City, Nevada (`20x20`, 16 buildings):** Desert test-range boomtown at dusk; *Siren Pulse* every `25s` boosts fuel gain `1.5x` for `8s`; *Observation Tower* landmark drops `2` Fuel Canisters and grants `10s` `OVERCHARGE`.
- **Metro Heights (`22x18`, 14 buildings):** Neon midnight skyline; *Elevated Train* crosses every `30s` (`30` dmg + knockback on tracks); *Empire Spire* landmark grants `+50` Meltdown fuel.
- **Caldera Island (`22x22` octagonal arena, 14 buildings):** Volcanic research base; *Magma Fissure* erupts every `28s` and launches throwable *Magma Boulders*; *Volcano Seismograph Lab* landmark drops `2` Fuel Canisters + `1` Health Orb.
- **Harbor Pier 54 (`24x16`, 15 buildings):** Waterfront docks & gantry cranes; *Destroyer Broadside* shells the south pier every `30s`; *Harbor Lighthouse* landmark drops `2` Health Orbs + `10s` `OVERCHARGE`.

---

## Deployment Checklist (`kaijubrawl.stabthefinger.com`)

1. Upload repository contents (`index.html`, `css/`, `js/`, `assets/`, `api/`, `data/.htaccess`, `.htaccess`) to the document root of `kaijubrawl.stabthefinger.com`.
2. Ensure `data/` is writable by the PHP web server process (`chmod 775 data`) so `data/leaderboard.sqlite` is created automatically on first request.
3. Verify Apache `.htaccess` rules are active:
   - Root `.htaccess` blocks dotfiles and `.sqlite`/`.db`/`.md` files and sets `X-Content-Type-Options: nosniff` and `X-Frame-Options: SAMEORIGIN`.
   - `data/.htaccess` denies all direct HTTP requests to `data/`.
   - `api/.htaccess` blocks direct web access to `api/db.php` and `api/seed_dev.php`.
4. Confirm `KB.CONFIG.ARCADE_URL` in `js/config.js` points to `https://arcade.stabthefinger.com` and Open Graph tags in `index.html` reference `https://kaijubrawl.stabthefinger.com/assets/og.png`.

---

## License

MIT License © 2026 Anthony Moore / None Yet Studios
