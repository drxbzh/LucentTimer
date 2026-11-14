// LucentTimer appearance system (Display Settings customisation).
// Everything here is visual only: it sets CSS variables / data attributes, and wires the Display Settings accordions.
// It never touches timer logic, key handling or scrambles.
//
// Stored in the same `ct-settings` object as every other setting (see APPEARANCE_DEFAULTS). The one exception is the
// imported background image: the blob lives in IndexedDB (database "lucent-timer-media"), only small metadata is in settings.

// ───────────────────────── Data ─────────────────────────
export const STYLES = [
  { id: 'sharp',   name: 'Sharp',   desc: 'Square corners and crisp edges.' },
  { id: 'soft',    name: 'Soft',    desc: 'Slightly softened corners.' },
  { id: 'rounded', name: 'Rounded', desc: 'More pronounced rounded corners.' },
  { id: 'hybrid',  name: 'Hybrid',  desc: 'Round icon buttons, soft rounded rectangles elsewhere.' },
  { id: 'minimal', name: 'Minimal', desc: 'Compact, understated corners.' },
];
const STYLE_IDS = STYLES.map(s => s.id);

// Interface Types: how surfaces are drawn (fill, borders, blur). Independent of Styles (shape) and GUI Colours.
export const TYPES = [
  { id: 'solid',   name: 'Solid',   desc: 'Filled blocks with visible borders.' },
  { id: 'soft',    name: 'Soft',    desc: 'Filled blocks without borders.' },
  { id: 'glass',   name: 'Glass',   desc: 'Neutral translucent surfaces with a soft blur.' },
  { id: 'minimal', name: 'Minimal', desc: 'No blocks or borders. Solve Overview keeps its Soft look.' },
];
const TYPE_IDS = TYPES.map(t => t.id);

// Default GUI colours (must match the CSS defaults in styles.css).
const DEF = {
  dark:  { accent: '#b7f36b', surface: '#1a1c24', timerBg: '#101116' },
  light: { accent: '#477d0b', surface: '#ffffff', timerBg: '#f5f5f7' },
};

// Curated starting points (not locked themes). Each defines both modes; the user can edit any colour afterwards.
export const PRESETS = [
  { id: 'midnight', name: 'Midnight', dark: { accent: '#7aa2ff', surface: '#151a2e' }, light: { accent: '#3b5bdb', surface: '#f2f4fb' } },
  { id: 'obsidian', name: 'Obsidian', dark: { accent: '#ffffff', surface: '#000000', text: '#ffffff' }, light: { accent: '#000000', surface: '#ffffff', text: '#000000' } },
  { id: 'arctic',   name: 'Arctic',   dark: { accent: '#5cd6ff', surface: '#13232b' }, light: { accent: '#0a7ea4', surface: '#f0f8fb' } },
  { id: 'ember',    name: 'Ember',    dark: { accent: '#ff8a3d', surface: '#261813' }, light: { accent: '#c2410c', surface: '#fff5ef' } },
  { id: 'forest',   name: 'Forest',   dark: { accent: '#5fd68a', surface: '#14231a' }, light: { accent: '#1f7a3f', surface: '#f1f8f3' } },
];

const GLOW_LEVELS = [
  { label: 'Off', pct: 0 }, { label: 'Subtle', pct: 25 }, { label: 'Medium', pct: 50 }, { label: 'Strong', pct: 75 }, { label: 'Intense', pct: 100 },
];
const FITS = { cover: 'cover', contain: 'contain', stretch: '100% 100%', original: 'auto' };
const FIT_LABELS = { cover: 'Fill (crop to fit)', contain: 'Fit (show whole image)', stretch: 'Stretch', original: 'Original size' };
const POSITIONS = ['left top', 'center top', 'right top', 'left center', 'center', 'right center', 'left bottom', 'center bottom', 'right bottom'];
const POS_LABELS = ['Top left', 'Top', 'Top right', 'Left', 'Centre', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];

export const APPEARANCE_DEFAULTS = {
  uiType: 'solid',                          // Interface Type (Solid is the default)
  uiStyle: 'rounded',                       // Interface Style (shape only)
  guiColors: { dark: { ...PRESETS[0].dark }, light: { ...PRESETS[0].light } },   // Midnight is the default preset; {accent, surface, text?} per mode
  timerEffect: 'none',                      // none | glow | shadow (timer digits only)
  glowLevel: 0,                             // dark mode glow, 0..4 (Off..Intense)
  shadowEnabled: false,                     // light mode shadows
  shadowIntensity: 40,                      // 5..100
  timerBgMode: 'default',                   // default | color | image
  timerBgColor: '',                         // '' = start from the mode's default
  timerBgImage: null,                       // {name,w,h,bytes,avg} metadata of the image stored in IndexedDB
  bgFit: 'cover', bgPos: 'center', bgOverlay: 'off', bgOverlayOpacity: 35,
};

// ───────────────────────── Colour helpers ─────────────────────────
const normHex = v => {
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : null;
};
const toRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = toRgb(a), B = toRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = h => { const [r, g, b] = toRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const rgba = (h, a) => { const [r, g, b] = toRgb(h); return `rgba(${r},${g},${b},${a})`; };
// Text/icon colour for anything filled with the accent: whichever of near-black or white has the higher WCAG contrast.
// (The old fixed luminance cut-off gave white-on-light-blue, ~2.5:1, for the default Midnight accent.)
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const onColor = h => contrast(h, '#111218') >= contrast(h, '#ffffff') ? '#111218' : '#ffffff';
function rgb2hsv([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, mx ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

// GUI palette derived from an accent + surface colour.
function derivePalette(accent, surface, textOverride) {
  const darkSurface = lum(surface) < .4;
  const text = textOverride || (darkSurface ? '#f4f4f7' : '#18191f');
  return {
    '--panel': surface, '--text': text,
    '--muted': mix(surface, text, .55), '--line': mix(surface, text, .12),
    '--field': lum(surface) < .01 ? mix(surface, text, .08) : mix(surface, '#000000', darkSurface ? .35 : .04),   // pure black can't go darker, so lift it slightly
    '--field2': mix(surface, text, .14),
    '--accent': accent, '--accent-soft': rgba(accent, .2), '--on-accent': onColor(accent),
  };
}
// Timer-zone palette: text and controls sitting on the timer background. `fgBase` is what the text actually sits on.
function timerPalette(bg, fgBase = bg) {
  const dark = lum(fgBase) < .4, text = dark ? '#f4f4f7' : '#18191f';
  return {
    '--timer-bg': bg, '--t-text': text, '--t-muted': mix(fgBase, text, .55), '--t-line': mix(fgBase, text, .2),
    '--t-fill': rgba(text, .09), '--t-fill2': rgba(text, .17), '--t-shadow': rgba(dark ? '#000000' : '#ffffff', .45),
  };
}

// ───────────────────────── Settings validation ─────────────────────────
const clampInt = (v, lo, hi, d) => {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return d;
  const n = Math.round(+v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : d;   // out-of-range stored values are treated as corrupt -> default
};
const pick = (v, list, d) => list.includes(v) ? v : d;
// Coerce stored values into valid ones; anything missing or corrupt falls back to the defaults.
export function sanitize(s) {
  const D = APPEARANCE_DEFAULTS;
  s.uiType = pick(s.uiType, TYPE_IDS, D.uiType);   // the old Borders toggle is replaced by Interface Type (Solid = borders, Soft = none)
  delete s.borders;
  s.uiStyle = pick(s.uiStyle, STYLE_IDS, D.uiStyle);
  s.timerEffect = pick(s.timerEffect, ['none', 'glow', 'shadow'], D.timerEffect);
  const gc = s.guiColors && typeof s.guiColors === 'object' ? s.guiColors : {};
  // Never-customised (null/missing/corrupt) colours fall back to the default preset, Midnight.
  const clean = (o, d) => { if (!o || typeof o !== 'object') return { ...d }; const a = normHex(o.accent), b = normHex(o.surface), t = normHex(o.text); return a && b ? (t ? { accent: a, surface: b, text: t } : { accent: a, surface: b }) : { ...d }; };
  s.guiColors = { dark: clean(gc.dark, D.guiColors.dark), light: clean(gc.light, D.guiColors.light) };
  s.overviewOpen = typeof s.overviewOpen === 'boolean' ? s.overviewOpen : null;
  s.dockOpen = s.dockOpen === true;   // Tool Bar open/collapsed; collapsed by default
  s.glowLevel = clampInt(s.glowLevel, 0, 4, D.glowLevel);
  s.shadowEnabled = s.shadowEnabled === true;
  s.shadowIntensity = clampInt(s.shadowIntensity, 5, 100, D.shadowIntensity);
  s.timerBgMode = pick(s.timerBgMode, ['default', 'color', 'image'], D.timerBgMode);
  s.timerBgColor = normHex(s.timerBgColor) || '';
  const im = s.timerBgImage;
  s.timerBgImage = im && typeof im === 'object' && normHex(im.avg) && Number.isFinite(+im.w) && Number.isFinite(+im.h)
    ? { name: String(im.name || 'image').slice(0, 120), w: +im.w, h: +im.h, bytes: Math.max(0, +im.bytes || 0), avg: normHex(im.avg) } : null;
  if (s.timerBgMode === 'image' && !s.timerBgImage) s.timerBgMode = 'default';
  s.bgFit = pick(s.bgFit, Object.keys(FITS), D.bgFit);
  s.bgPos = pick(s.bgPos, POSITIONS, D.bgPos);
  s.bgOverlay = pick(s.bgOverlay, ['off', 'dark', 'light'], D.bgOverlay);
  s.bgOverlayOpacity = clampInt(s.bgOverlayOpacity, 0, 90, D.bgOverlayOpacity);
  return s;
}

// ───────────────────────── Image storage (IndexedDB) ─────────────────────────
const DB_NAME = 'lucent-timer-media', STORE = 'files', KEY = 'timer-bg';
const openDb = () => new Promise((res, rej) => {
  if (!window.indexedDB) return rej(new Error('IndexedDB unavailable'));
  const r = indexedDB.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    let out;
    const req = fn(tx.objectStore(STORE));
    if (req) req.onsuccess = () => { out = req.result; };
    tx.oncomplete = () => { db.close(); res(out); };
    tx.onerror = tx.onabort = () => { db.close(); rej(tx.error || new Error('Storage error')); };
  });
}
const idbGet = () => idb('readonly', st => st.get(KEY));
const idbPut = blob => idb('readwrite', st => st.put(blob, KEY));
const idbDel = () => idb('readwrite', st => st.delete(KEY));

const MAX_SIDE = 2560, MAX_INPUT_BYTES = 40 * 1024 * 1024;
// Decode, downscale (max 2560px on the long side) and re-encode so only ONE compact copy is ever stored.
async function processImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Please choose an image file.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That image is too large (limit 40 MB).');
  let src, w, h;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
  catch {
    src = await new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error('This image format can’t be read by your browser.')); }; i.src = u; });
    w = src.naturalWidth; h = src.naturalHeight;
  }
  if (!w || !h) throw new Error('This image format can’t be read by your browser.');
  const k = Math.min(1, MAX_SIDE / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, cw, ch); g.drawImage(src, 0, 0, cw, ch);
  const t = document.createElement('canvas'); t.width = t.height = 8;
  const tg = t.getContext('2d', { willReadFrequently: true }); tg.drawImage(c, 0, 0, 8, 8);
  const px = tg.getImageData(0, 0, 8, 8).data; let r = 0, gr = 0, b = 0;
  for (let i = 0; i < px.length; i += 4) { r += px[i]; gr += px[i + 1]; b += px[i + 2]; }
  const n = px.length / 4, avg = toHex([r / n, gr / n, b / n]);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', .86));
  if (!blob) throw new Error('Could not process this image.');
  if (src.close) src.close();
  return { blob, meta: { name: (file.name || 'image').replace(/\.[^.]+$/, ''), w: cw, h: ch, bytes: blob.size, avg } };
}
const fmtBytes = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

// ───────────────────────── Reusable colour picker ─────────────────────────
// Hue wheel + saturation + brightness sliders + HEX field + live preview (the wheel's centre).
// onInput fires continuously (live preview); onCommit fires when the user finishes (save).
export function createColorPicker(host, { onInput, onCommit }) {
  host.classList.add('cp');
  host.innerHTML = `<div class="cp-wheel" tabindex="0" role="slider" aria-label="Hue" aria-valuemin="0" aria-valuemax="359"><div class="cp-ring"></div><div class="cp-center"></div><div class="cp-thumb"></div></div>
<label class="cp-row"><span>Saturation</span><input class="slider cp-s" type="range" min="0" max="100" step="1" aria-label="Saturation"></label>
<label class="cp-row"><span>Brightness</span><input class="slider cp-v" type="range" min="0" max="100" step="1" aria-label="Brightness"></label>
<label class="cp-row"><span>HEX</span><input class="cp-hex" type="text" maxlength="7" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="HEX colour"></label>`;
  const wheel = host.querySelector('.cp-wheel'), thumb = host.querySelector('.cp-thumb'), center = host.querySelector('.cp-center');
  const sS = host.querySelector('.cp-s'), sV = host.querySelector('.cp-v'), hexIn = host.querySelector('.cp-hex');
  let h = 0, s = 0, v = 1, dragging = false;
  const current = () => toHex(hsv2rgb(h, s, v));
  function paint(skipHex) {
    const hex = current(), a = h * Math.PI / 180;
    center.style.background = hex;
    thumb.style.left = (50 + 39.5 * Math.sin(a)) + '%'; thumb.style.top = (50 - 39.5 * Math.cos(a)) + '%';
    thumb.style.background = toHex(hsv2rgb(h, 1, 1));
    sS.value = Math.round(s * 100); sV.value = Math.round(v * 100);
    host.style.setProperty('--cp-s0', toHex(hsv2rgb(h, 0, v))); host.style.setProperty('--cp-s1', toHex(hsv2rgb(h, 1, v)));
    host.style.setProperty('--cp-v1', toHex(hsv2rgb(h, s, 1)));
    wheel.setAttribute('aria-valuenow', Math.round(h)); wheel.setAttribute('aria-valuetext', `${Math.round(h)} degrees, ${hex}`);
    if (!skipHex) hexIn.value = hex;
  }
  const setFromHex = hex => { const [nh, ns, nv] = rgb2hsv(toRgb(hex)); s = ns; v = nv; if (ns > .002 && nv > .002) h = nh; };
  const emit = () => onInput && onInput(current());
  const commit = () => onCommit && onCommit(current());
  const fromPointer = e => {
    const r = wheel.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    h = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; paint(); emit();
  };
  wheel.addEventListener('pointerdown', e => { e.preventDefault(); dragging = true; try { wheel.setPointerCapture(e.pointerId); } catch {} wheel.focus({ preventScroll: true }); fromPointer(e); });
  wheel.addEventListener('pointermove', e => { if (dragging) fromPointer(e); });
  const end = () => { if (dragging) { dragging = false; commit(); } };
  wheel.addEventListener('pointerup', end); wheel.addEventListener('pointercancel', end);
  wheel.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault(); h = (h + d * (e.shiftKey ? 15 : 4) + 360) % 360; paint(); emit(); commit();
  });
  sS.addEventListener('input', () => { s = sS.value / 100; paint(); emit(); }); sS.addEventListener('change', commit);
  sV.addEventListener('input', () => { v = sV.value / 100; paint(); emit(); }); sV.addEventListener('change', commit);
  hexIn.addEventListener('input', () => { const n = normHex(hexIn.value); if (n) { setFromHex(n); paint(true); emit(); commit(); } });   // saved as typed, so nothing is lost if the drawer is closed mid-edit
  hexIn.addEventListener('change', () => { const n = normHex(hexIn.value); if (n) { setFromHex(n); commit(); } paint(); });
  hexIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); hexIn.blur(); } });
  paint();
  return { set(hex) { const n = normHex(hex); if (!n || dragging || n === current()) return; setFromHex(n); paint(document.activeElement === hexIn); }, get: current };
}

// ───────────────────────── Main ─────────────────────────
export function initAppearance({ settings, save }) {
  sanitize(settings);
  const $ = id => document.getElementById(id);
  const body = document.body, mode = () => settings.theme === 'light' ? 'light' : 'dark';
  let managed = new Set(), bgUrl = null, guiTarget = 'accent', ui = null, bgTab = settings.timerBgMode;  // bgTab = which Timer Background tab is shown

  const setVars = vars => {
    managed.forEach(k => { if (!(k in vars)) body.style.removeProperty(k); });
    for (const k in vars) body.style.setProperty(k, vars[k]);
    managed = new Set(Object.keys(vars));
  };
  const curGui = () => settings.guiColors[mode()] || { accent: DEF[mode()].accent, surface: DEF[mode()].surface };

  // Resolve the timer background into {kind, base (paint colour), fg (colour the text sits on), overlay}
  function bgModel() {
    const m = mode();
    const ov = settings.bgOverlay === 'off' || !settings.bgOverlayOpacity ? null : { color: settings.bgOverlay === 'dark' ? '#000000' : '#ffffff', a: settings.bgOverlayOpacity / 100 };
    if (settings.timerBgMode === 'color') { const c = settings.timerBgColor || DEF[m].timerBg; return { kind: 'color', base: c, fg: c }; }
    if (settings.timerBgMode === 'image' && settings.timerBgImage) {
      const avg = settings.timerBgImage.avg;
      return { kind: 'image', base: avg, fg: ov ? mix(avg, ov.color, ov.a) : avg, overlay: ov };
    }
    return { kind: 'default' };
  }
  function layerStyles(el, ov, imgEl) {
    if (imgEl) {
      imgEl.style.backgroundImage = bgUrl ? `url("${bgUrl}")` : 'none';
      imgEl.style.backgroundSize = FITS[settings.bgFit]; imgEl.style.backgroundPosition = settings.bgFit === 'stretch' ? 'center' : settings.bgPos;
    }
    el.style.display = ov ? 'block' : 'none';
    if (ov) { el.style.background = ov.color; el.style.opacity = String(ov.a); }
  }

  function fxVars(accent, surface) {
    if (mode() === 'dark') {
      const i = GLOW_LEVELS[settings.glowLevel].pct / 100;
      if (!i) return null;
      return `0 0 ${(6 + 16 * i).toFixed(1)}px ${(i * 1.5).toFixed(1)}px ${rgba(accent, +(.12 + .5 * i).toFixed(3))}`;
    }
    if (!settings.shadowEnabled) return null;
    const i = settings.shadowIntensity / 100, c = mix(accent, '#000000', .78);
    return `0 ${(1 + 2 * i).toFixed(1)}px ${(2 + 4 * i).toFixed(1)}px ${rgba(c, +(.06 + .14 * i).toFixed(3))},0 ${(2 + 8 * i).toFixed(1)}px ${(6 + 22 * i).toFixed(1)}px ${rgba(c, +(.05 + .2 * i).toFixed(3))}`;
  }

  // Apply every appearance setting to the page. Cheap and idempotent; called on any change and when the theme flips.
  function apply() {
    const m = mode(), vars = {};
    body.dataset.uiType = settings.uiType;
    body.dataset.uiStyle = settings.uiStyle;
    if (settings.timerEffect === 'none') delete body.dataset.timerFx; else body.dataset.timerFx = settings.timerEffect;
    const gc = settings.guiColors[m];
    if (gc) Object.assign(vars, derivePalette(gc.accent, gc.surface, gc.text));
    const bg = bgModel();
    if (bg.kind === 'color') Object.assign(vars, timerPalette(bg.base));
    else if (bg.kind === 'image') Object.assign(vars, timerPalette(bg.base, bg.fg));
    const accent = gc ? gc.accent : DEF[m].accent, surface = gc ? gc.surface : DEF[m].surface;
    // "Ready" colour of the timer digits: the accent, unless the accent is too close to the digit colour to be seen (e.g. a white accent).
    const tText = bg.kind === 'default' ? (m === 'dark' ? '#f4f4f7' : '#18191f') : (vars['--t-text'] || '#f4f4f7');
    vars['--ready'] = Math.abs(lum(accent) - lum(tText)) < .22 ? (lum(tText) > .4 ? '#b7f36b' : '#477d0b') : accent;
    const fx = fxVars(accent, surface);
    if (fx) { vars['--fx-shadow'] = fx; body.dataset.fx = m === 'dark' ? 'glow' : 'shadow'; } else delete body.dataset.fx;
    setVars(vars);
    const showImg = bg.kind === 'image' && !!bgUrl;
    body.dataset.tbg = showImg ? 'image' : bg.kind === 'color' ? 'color' : '';
    layerStyles($('timerBgOverlay'), showImg ? bg.overlay : null, null);
    if (showImg) layerStyles($('timerBgOverlay'), bg.overlay, $('timerBg'));
  }

  // ───── Settings UI ─────
  function build() {
    // Interface type + style tiles
    const makeTiles = (hostId, list, attr, key) => {
      const host = $(hostId);
      list.forEach(it => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'styleTile ' + (attr === 'uiType' ? 'typeTile' : ''); b.dataset[attr] = it.id; b.dataset.id = it.id; b.setAttribute('role', 'radio');
        b.innerHTML = `<span class="sample" aria-hidden="true"><i class="sb"></i><i class="si"></i><i class="sc"></i></span><span class="st-text"><b>${it.name}</b><small>${it.desc}</small></span>`;
        b.onclick = () => set(key, it.id);
        host.append(b);
      });
    };
    makeTiles('typeTiles', TYPES, 'uiType', 'uiType');
    makeTiles('styleTiles', STYLES, 'uiStyle', 'uiStyle');
    // Colour presets
    const chips = $('presetChips');
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id; b.setAttribute('role', 'radio');
      b.innerHTML = `<span class="sw" aria-hidden="true"></span><span>${p.name}</span>`;
      b.onclick = () => { settings.guiColors = { dark: { ...p.dark }, light: { ...p.light } }; save(); apply(); refresh(); };
      chips.append(b);
    });
    // GUI picker (Accent / Surface target switch)
    ui = {};
    ui.gui = createColorPicker($('guiPicker'), {
      onInput: hex => { const m = mode(), next = { ...curGui(), [guiTarget]: hex }; if (guiTarget === 'surface') delete next.text; settings.guiColors[m] = next; apply(); refreshChips(); },   // a new surface colour drops a preset's fixed text colour
      onCommit: () => save(),
    });
    $('guiTarget').querySelectorAll('button').forEach(b => b.onclick = () => { guiTarget = b.dataset.t; refresh(); });
    $('guiReset').onclick = () => { settings.guiColors = { dark: { ...APPEARANCE_DEFAULTS.guiColors.dark }, light: { ...APPEARANCE_DEFAULTS.guiColors.light } }; save(); apply(); refresh(); };
    // Timer Effect (timer digits only; independent of the button glow below)
    $('timerEffect').onchange = e => set('timerEffect', e.target.value);
    // Effects
    const gs = $('glowSeg');
    GLOW_LEVELS.forEach((g, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.level = i; b.setAttribute('role', 'radio'); b.textContent = g.label; b.title = g.pct + '%';
      b.onclick = () => { settings.glowLevel = i; save(); apply(); refresh(); };
      gs.append(b);
    });
    $('shadowToggle').onchange = e => { settings.shadowEnabled = e.target.checked; save(); apply(); refresh(); };
    $('shadowIntensity').addEventListener('input', e => { settings.shadowIntensity = +e.target.value; $('shadowIntensityValue').textContent = settings.shadowIntensity + '%'; apply(); });
    $('shadowIntensity').addEventListener('change', () => save());
    // Timer background: mode, colour, image
    $('bgModeSeg').querySelectorAll('button').forEach(b => b.onclick = () => {
      const m = b.dataset.mode; bgTab = m;
      if (m === 'image' && !settings.timerBgImage) { refresh(); return; }   // nothing to apply until an image is chosen
      settings.timerBgMode = m; save(); apply(); refresh();
    });
    ui.bg = createColorPicker($('bgPicker'), {
      onInput: hex => { bgTab = 'color'; settings.timerBgMode = 'color'; settings.timerBgColor = hex; apply(); renderPreview(); },
      onCommit: () => { save(); refresh(); },
    });
    $('bgReset').onclick = () => { bgTab = 'default'; settings.timerBgMode = 'default'; settings.timerBgColor = ''; save(); apply(); refresh(); };
    $('bgChoose').onclick = () => $('bgFile').click();
    $('bgFile').onchange = async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) await importImage(f); };
    $('bgFit').onchange = e => { settings.bgFit = e.target.value; save(); apply(); refresh(); };
    const grid = $('bgPos');
    POSITIONS.forEach((p, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.pos = p; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', POS_LABELS[i]); b.title = POS_LABELS[i];
      b.onclick = () => { settings.bgPos = p; save(); apply(); refresh(); };
      grid.append(b);
    });
    $('bgOverlaySeg').querySelectorAll('button').forEach(b => b.onclick = () => { settings.bgOverlay = b.dataset.o; save(); apply(); refresh(); });
    $('bgOpacity').addEventListener('input', e => { settings.bgOverlayOpacity = +e.target.value; $('bgOpacityValue').textContent = settings.bgOverlayOpacity + '%'; apply(); renderPreview(); });
    $('bgOpacity').addEventListener('change', () => save());
    $('bgRemove').onclick = removeImage;
  }

  const setMsg = (t, err) => { const m = $('bgMsg'); m.textContent = t || ''; m.classList.toggle('err', !!err); };
  function showPane(which) { $('bgColourPane').hidden = which !== 'color'; $('bgImagePane').hidden = which !== 'image'; }
  function renderPreview() {
    const p = $('bgPreview'), bg = bgModel();
    const ar = Math.min(1.8, Math.max(.5, window.innerWidth / Math.max(1, window.innerHeight)));
    p.style.setProperty('--ar', ar.toFixed(3));
    // The preview mirrors the real timer zone: same palette, same image layers.
    const pal = bg.kind === 'default' ? { '--timer-bg': DEF[mode()].timerBg, ...timerPalette(DEF[mode()].timerBg) } : bg.kind === 'color' ? timerPalette(bg.base) : { ...timerPalette(bg.base, bg.fg) };
    Object.keys(pal).forEach(k => p.style.setProperty(k, pal[k]));
    const img = p.querySelector('.bgp-img'), ov = p.querySelector('.bgp-ov');
    const live = settings.timerBgMode === 'image' && settings.timerBgImage && bgUrl;
    img.style.display = live ? 'block' : 'none';
    if (live) { img.style.backgroundImage = `url("${bgUrl}")`; img.style.backgroundSize = FITS[settings.bgFit]; img.style.backgroundPosition = settings.bgFit === 'stretch' ? 'center' : settings.bgPos; }
    ov.style.display = live && bg.overlay ? 'block' : 'none';
    if (live && bg.overlay) { ov.style.background = bg.overlay.color; ov.style.opacity = String(bg.overlay.a); }
  }

  function refreshChips() {
    const cur = settings.guiColors[mode()];
    $('presetChips').querySelectorAll('.chip').forEach(b => {
      const p = PRESETS.find(x => x.id === b.dataset.id), v = p[mode()];
      b.querySelector('.sw').style.background = `linear-gradient(135deg,${v.accent} 0 50%,${v.surface} 50% 100%)`;
      b.setAttribute('aria-checked', String(!!cur && cur.accent === v.accent && cur.surface === v.surface && (cur.text || '') === (v.text || '')));
    });
  }
  function refresh() {
    $('typeTiles').querySelectorAll('.styleTile').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === settings.uiType)));
    $('styleTiles').querySelectorAll('.styleTile').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === settings.uiStyle)));
    $('timerEffect').value = settings.timerEffect;
    refreshChips();
    $('guiTarget').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.t === guiTarget)));
    ui.gui.set(curGui()[guiTarget]);
    $('guiHint').textContent = `Editing ${mode()} mode colours. Switch Appearance to ${mode() === 'dark' ? 'Light' : 'Dark'} to edit those. Presets set both modes.`;
    const dark = mode() === 'dark';
    $('fxDark').hidden = !dark; $('fxLight').hidden = dark;
    $('glowSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.level === settings.glowLevel)));
    $('shadowToggle').checked = settings.shadowEnabled;
    $('shadowIntensity').value = settings.shadowIntensity; $('shadowIntensity').disabled = !settings.shadowEnabled; $('shadowIntensityValue').textContent = settings.shadowIntensity + '%';
    $('bgModeSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === bgTab)));
    showPane(bgTab);
    ui.bg.set(settings.timerBgColor || DEF[mode()].timerBg);
    $('bgFit').value = settings.bgFit;
    $('bgPos').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.pos === settings.bgPos)));
    $('bgPos').classList.toggle('off', settings.bgFit === 'stretch');
    $('bgOverlaySeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.o === settings.bgOverlay)));
    $('bgOpacity').value = settings.bgOverlayOpacity; $('bgOpacity').disabled = settings.bgOverlay === 'off'; $('bgOpacityValue').textContent = settings.bgOverlayOpacity + '%';
    const im = settings.timerBgImage;
    $('bgImageInfo').textContent = im ? `${im.name} · ${im.w}×${im.h} · ${fmtBytes(im.bytes)} · saved on this device` : 'No image selected.';
    $('bgRemove').hidden = !im; $('bgChoose').textContent = im ? 'Replace image…' : 'Choose image…';
    renderPreview();
  }

  async function importImage(file) {
    setMsg('Processing image…'); $('bgChoose').disabled = true;
    try {
      const { blob, meta } = await processImage(file);
      await idbPut(blob);   // overwrites the single stored copy: no duplicates
      if (bgUrl) URL.revokeObjectURL(bgUrl);
      bgUrl = URL.createObjectURL(blob);
      settings.timerBgImage = meta; settings.timerBgMode = 'image'; bgTab = 'image';
      save(); apply(); refresh(); setMsg('Image saved. It stays available offline.');
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
    } catch (err) {
      const quota = err && (err.name === 'QuotaExceededError' || /quota|storage/i.test(String(err.message)));
      setMsg(quota ? 'Not enough storage on this device to save the image.' : (err && err.message) || 'Could not import this image.', true);
    } finally { $('bgChoose').disabled = false; }
  }
  async function removeImage() {
    try { await idbDel(); } catch {}
    if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = null;
    settings.timerBgImage = null; if (settings.timerBgMode === 'image') settings.timerBgMode = 'default'; bgTab = 'default';
    save(); apply(); refresh(); setMsg('Image removed.');
  }
  // Restore a previously imported image from IndexedDB on start-up (works offline).
  async function loadStoredImage() {
    if (!settings.timerBgImage) return;
    try {
      const blob = await idbGet();
      if (!blob) throw new Error('missing');
      bgUrl = URL.createObjectURL(blob);
    } catch {
      settings.timerBgImage = null; if (settings.timerBgMode === 'image') settings.timerBgMode = 'default'; bgTab = settings.timerBgMode; save();
      setMsg('The saved background image is no longer available on this device.', true);
    }
    apply(); refresh();
  }

  // Programmatic setter used by the tiles and by the dock shortcuts. Same validation as stored values.
  function set(key, value) {
    if (key === 'uiType') settings.uiType = pick(value, TYPE_IDS, settings.uiType);
    else if (key === 'uiStyle') settings.uiStyle = pick(value, STYLE_IDS, settings.uiStyle);
    else if (key === 'timerEffect') settings.timerEffect = pick(value, ['none', 'glow', 'shadow'], settings.timerEffect);
    else return;
    save(); apply(); refresh();
  }

  build();
  apply(); refresh();
  loadStoredImage();
  window.addEventListener('resize', () => { if ($('advDisplay').classList.contains('open')) renderPreview(); });
  // Called by app.js after every render(): keeps appearance in sync with theme changes.
  return { sync() { apply(); refresh(); }, set };
}
