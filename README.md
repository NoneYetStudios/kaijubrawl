# Kaiju Brawl — STF Arcade

A campy 1950s B-movie isometric 2.5D kaiju arena brawler built for **STF Arcade** (`kaijubrawl.stabthefinger.com`). Pick one of four rubber-suit monsters, stomp a destructible miniature city, hurl steel girders and fuel tankers, and survive an endless gauntlet of escalating challengers.

Zero build steps. Zero npm/Node dependencies. Pure HTML5 Canvas, Web Audio API, and native CSS on the client, paired with a lightweight PHP + SQLite global leaderboard (plus automatic browser Local Mode fallback when no PHP backend is present).

---

## Running Locally

### Option A: PHP Server (Global SQLite Leaderboard)
```bash
php -S localhost:8000
```
Open `http://localhost:8000/`. Requires PHP 7.4+ with `pdo_sqlite` enabled and write permissions on `data/`.

### Option B: Static HTTP Server (Local Development Mode)
```bash
python -m http.server 8000
```
If the PHP API endpoints are unavailable, the leaderboard falls back to `localStorage` without errors.

---

## Controls & Orientation

- **Desktop:** `W` `A` `S` `D` or Arrow keys to move · `J` Light combo · `K` Heavy · `L` Grab / Throw prop · `Space` Jump / Climb · `Shift` Block · `C` Dodge · `Q` Atomic Special · `E` Meltdown · `P` / `Esc` Pause · `M` Toggle audio
- **Mobile:** Floating left-side virtual joystick (double-flick to dodge) + right-side action buttons
- **Orientation:** Auto-detects Portrait (`720x1280`, 9:16) on portrait/mobile screens and Landscape (`1280x720`, 16:9) on desktop, with manual **Auto / Portrait / Landscape** switching in both the HUD (`VIEW`) and Pause menu

---

## Starter Roster & Arenas (v1)

- **Kaiju:** **Gorgantor** (*The Atomic Saurian*), **Mighty Mongo** (*Eighth Wonder of the Wasteland*), **Lepidora** (*Queen of the Night Skies*), **Tin Colossus** (*The Mechanical Menace*)
- **Arenas:** **Pinebrook, U.S.A.**, **Atom City, Nevada**, **Metro Heights**

---

## Deployment (`kaijubrawl.stabthefinger.com`)

Upload the repository contents to the web root for `kaijubrawl.stabthefinger.com`. Ensure `data/` is writable (`755` or `775`) so `data/leaderboard.sqlite` can be created automatically on first request. Both `.htaccess` and `data/.htaccess` block direct HTTP access to SQLite databases and dotfiles. Configure `ARCADE_URL` in `js/config.js` if needed.
