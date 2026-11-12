# LucentTimer

A lightweight speedcubing timer PWA. Timer settings and solve history stay in local browser storage.

## Update / deploy

Upload the project folder to your existing HTTPS static host. For an existing Netlify site, deploy the updated folder to that same site rather than creating a new one.

## Controls

- **Hold and release (touch):** Hold for 300 ms until the short ready vibration and the timer turns green, then release to start.
- **Tap (touch):** Press and release to start.
- **Keyboard:** Space works like hold and release in every mode (hold until green, release to start). While solving, any non-modifier key stops. `Esc` cancels inspection, `N` generates a new scramble.
- **Inspection:** Counts down in whole seconds. Start the solve with the same gesture as above. Starting after the countdown gives +2 (up to 2 s over) or DNF.
- While the timer is running, a screen press also stops immediately.
- The scramble disappears the moment you press to start the solve and returns when the timer stops.
- Swipe left for Quick Settings; swipe right for Settings. Settings is a list of pages (Timer, Scramble, Display, Feedback, Data, About); tap one to open it, and use the back arrow or Esc to return.
- **Swipe up** (after a solve) toggles +2 on that solve, with a green line and "+2" label. **Swipe down** shows a soft red glow and asks before deleting it.
- **Desktop keys (when idle):** `Q` quick settings, `A` settings, `N` new scramble, `2` toggles +2 on the last solve, `Backspace`/`Delete` deletes it (Enter/Y confirms, Esc/N cancels), `Esc` closes a drawer.
- The layout adapts to portrait and landscape (no in-app orientation lock; it follows the phone's own rotation setting).
- Press feedback instantly changes the timer font to 90% of its configured size.

## Features

- Main-display inspection countdown with brief audio/haptic warnings.
- Optional vibration and audio cues.
- 3x3 random-state scrambles (or a custom length from 1 to 200 random moves, set in Settings; custom lengths work offline), manual refresh, and scramble saved with each solve.
- Recent solves, best, mean, dark/light appearance, precision, and screen wake lock (on by default).

## Scramble connectivity

The 3x3 scrambler uses `cubing.js` from `cdn.cubing.net` to generate random-state scrambles. The app shell remains service-worker cached, but generating fresh scrambles currently requires an internet connection. Offline scramble generation is a future improvement.

## Local development

Serve this folder over `http://localhost` (for example, `python -m http.server 8000`). The scramble generator will not work from a `file://` URL.
