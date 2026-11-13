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
- Swipe left shows the Solve Overview tab; swipe right opens Settings. Settings is a list of pages (Timer, Scramble, Display, Feedback, Data, About); tap one to open it, and use the back arrow or Esc to return.
- **Swipe up** (after a solve) toggles +2 on that solve, with a green line and "+2" label. **Swipe down** shows a soft red glow and asks before deleting it.
- **Desktop keys (when idle):** `Q` shows/hides the Solve Overview tab, `A` settings, `N` new scramble, `2` toggles +2 on the last solve, `Backspace`/`Delete` deletes it (Enter/Y confirms, Esc/N cancels), `Esc` closes a drawer.
- The layout adapts to portrait and landscape (no in-app orientation lock; it follows the phone's own rotation setting).
- Press feedback instantly changes the timer font to 90% of its configured size.

## Features

- Main-display inspection countdown with brief audio/haptic warnings.
- Optional vibration and audio cues.
- 3x3 random-state scrambles (or a custom length from 1 to 200 random moves, set in Settings; custom lengths work offline), manual refresh, and scramble saved with each solve.
- Recent solves, best, mean, dark/light appearance, precision, and screen wake lock (on by default).

## Appearance customisation (Settings → Display)

Five independent, collapsible sections. Changing one never changes another.

- **Interface Style:** Sharp, Soft, Rounded (default, the original look), Hybrid, Minimal. Shapes buttons, controls and settings only; timer digits, scramble and layout are unchanged.
- **GUI Colours:** presets Midnight, Arctic, Ember, Forest, or your own accent and surface colours (wheel, saturation, brightness, HEX). Colours are stored per dark/light mode; presets set both. Reset restores the defaults.
- **Borders:** off by default; independent of the interface style.
- **Visual Effects:** dark mode glow (Off/Subtle/Medium/Strong/Intense, follows the accent colour); light mode shadows (on/off + intensity). Off by default; both are remembered when you switch modes.
- **Timer Background:** default, solid colour, or an image from your device (fit, position, dark/light overlay and opacity). Independent of GUI colours.

Storage: all preferences are in the same `ct-settings` localStorage object (invalid values fall back to defaults). The background image is stored once in IndexedDB (`lucent-timer-media`), downscaled to at most 2560px, so it persists and works offline. Code: `appearance.js`, `appearance.css`.

## Scramble connectivity

The 3x3 scrambler uses `cubing.js` from `cdn.cubing.net` to generate random-state scrambles. The app shell remains service-worker cached, but generating fresh scrambles currently requires an internet connection. Offline scramble generation is a future improvement.

## Local development

Serve this folder over `http://localhost` (for example, `python -m http.server 8000`). The scramble generator will not work from a `file://` URL.

## Interface (v0.10)

- **Interface Type** (Settings > Display): Solid (default, bordered blocks), Soft (blocks, no borders), Glass (neutral translucent panels with backdrop blur, solid accent buttons), Minimal (no blocks or borders; the Solve Overview keeps the Soft look). The old Borders toggle was replaced by Solid/Soft.
- **Interface Style** controls shape only: Sharp, Soft, Rounded, Hybrid (circular icon-only controls, Soft rounded rectangles for text buttons), Minimal. Type, Style and GUI Colours are independent.
- GUI colour presets: Midnight (default) and Obsidian (pure black, white text), plus Arctic, Ember, Forest.
- **Timer Effect** (None / Glow / Shadow) applies to the timer digits only and is separate from the button Glow in Visual Effects.
- **Left dock**: gear (opens Settings), shortcuts (Start method and Inspection by default) and a + button to add, remove and reorder shortcuts (up to 8). Hidden while a solve is running.
- **Solve Overview** is a floating tab on the right edge (Ao5/Ao12, recent solves, Start method, Inspection). Tap its chevron, press Q or swipe left to open/collapse it. On narrow screens it starts collapsed.
- **Android PWA**: the manifest uses `display: fullscreen` (with a `standalone` fallback) so the installed app launches in immersive fullscreen. Reinstall the PWA, or wait for Chrome to update the WebAPK, for the manifest change to take effect. In the browser, use the browser's own fullscreen.
