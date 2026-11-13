// LucentTimer left quick-access dock.
// Gear (top, opens the existing Settings drawer) + user-chosen shortcuts + "+" (bottom, customise shortcuts).
// A shortcut is just another way to reach an existing setting: it never owns a copy of the value. Changes go through
// `setSetting`, which drives the same inputs/handlers as the Settings pages, so everything stays in sync.
// Puzzle selection and scramble length are intentionally not dockable.
import { TYPES, STYLES } from './appearance.js';

const ic = inner => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const sm = inner => ic(inner).replace('width="18" height="18"', 'width="14" height="14"');
const txt = t => ic(`<text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui,sans-serif">${t}</text>`);

// id === the settings key it controls. kind: 'toggle' flips directly; 'select' opens a small option list.
const REG = {
  startMethod:       { label: 'Start method',       kind: 'select', icon: ic('<path d="M9 9l5.5 12 1.9-5.1L21.5 14 9 9z"/><path d="M5.2 5.2l1.6 1.6M3 11h2.2M11 3v2.2M17.8 5.2l-1.6 1.6"/>') },
  inspectionEnabled: { label: 'Inspection',         kind: 'toggle', icon: ic('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>') },
  inspectionLength:  { label: 'Inspection length',  kind: 'select', icon: ic('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>') },
  precision:         { label: 'Precision',          kind: 'select', icon: txt('0.0') },
  leadingZero:       { label: 'Leading zero',       kind: 'toggle', icon: txt('0.') },
  theme:             { label: 'Appearance',         kind: 'select', icon: ic('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>') },
  keepAwake:         { label: 'Keep screen awake',  kind: 'toggle', icon: ic('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>') },
  vibrationEnabled:  { label: 'Vibration cues',     kind: 'toggle', icon: ic('<rect x="9" y="5" width="6" height="14" rx="1.5"/><path d="M5.5 8v8M18.5 8v8M2.5 10v4M21.5 10v4"/>') },
  soundEnabled:      { label: 'Audio cues',         kind: 'toggle', icon: ic('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>') },
  timerFont:         { label: 'Timer font',         kind: 'select', icon: txt('Aa') },
  timerWeight:       { label: 'Font weight',        kind: 'select', icon: txt('B') },
  timerEffect:       { label: 'Timer Effect',       kind: 'select', icon: ic('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>') },
  uiType:            { label: 'Interface Type',     kind: 'select', icon: ic('<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 12.5l9 5 9-5"/>') },
  uiStyle:           { label: 'Interface Style',    kind: 'select', icon: ic('<rect x="3" y="3" width="8" height="8" rx="2"/><circle cx="17" cy="7" r="4"/><path d="M4 21l4-7 4 7z"/>') },
};
const KEYS = Object.keys(REG);
export const DOCK_DEFAULT = ['startMethod', 'inspectionEnabled'];
export const DOCK_MAX = 8;

const UP = sm('<path d="M6 15l6-6 6 6"/>'), DOWN = sm('<path d="M6 9l6 6 6-6"/>'), CLOSE = sm('<path d="M6 6l12 12M18 6 6 18"/>'), PLUS = sm('<path d="M12 5v14M5 12h14"/>');

export function sanitizeDock(s) {
  const src = Array.isArray(s.dockItems) ? s.dockItems : DOCK_DEFAULT;
  const seen = new Set();
  s.dockItems = src.filter(k => typeof k === 'string' && REG[k] && !seen.has(k) && seen.add(k)).slice(0, DOCK_MAX);
  return s;
}

export function initDock({ settings, save, setSetting, openSettings, beforeOpen }) {
  sanitizeDock(settings);
  const $ = id => document.getElementById(id);
  const dock = $('dock'), itemsHost = $('dockItems'), pop = $('dockPop'), addBtn = $('dockAdd');
  let popFor = null;   // null | 'customize' | a settings key

  const options = key => key === 'uiType' ? TYPES.map(t => [t.id, t.name])
    : key === 'uiStyle' ? STYLES.map(t => [t.id, t.name])
    : [...$(key).options].map(o => [o.value, o.textContent]);
  const value = key => REG[key].kind === 'toggle' ? !!settings[key] : String(settings[key]);
  const valueLabel = key => REG[key].kind === 'toggle' ? (settings[key] ? 'On' : 'Off') : ((options(key).find(o => o[0] === value(key)) || [])[1] || '');

  // ───── Dock buttons ─────
  function renderItems() {
    itemsHost.innerHTML = '';
    settings.dockItems.forEach(key => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dockBtn'; b.dataset.key = key; b.innerHTML = REG[key].icon;
      b.onclick = () => {
        if (REG[key].kind === 'toggle') { closePop(); setSetting(key, !settings[key]); }
        else popFor === key && !pop.hidden ? closePop() : openOptions(key, b);
        b.blur();
      };
      itemsHost.append(b);
    });
    dock.querySelectorAll('.dockSep').forEach(el => el.hidden = !settings.dockItems.length);
    sync();
  }
  function sync() {
    itemsHost.querySelectorAll('.dockBtn').forEach(b => {
      const key = b.dataset.key, def = REG[key], txt = `${def.label}: ${valueLabel(key)}`;
      b.title = txt; b.setAttribute('aria-label', txt);
      if (def.kind === 'toggle') { b.setAttribute('aria-pressed', String(!!settings[key])); b.removeAttribute('aria-expanded'); b.removeAttribute('aria-haspopup'); }
      else { b.removeAttribute('aria-pressed'); b.setAttribute('aria-haspopup', 'menu'); b.setAttribute('aria-expanded', String(popFor === key && !pop.hidden)); }
    });
    addBtn.setAttribute('aria-expanded', String(popFor === 'customize' && !pop.hidden));
    if (!pop.hidden && popFor && popFor !== 'customize') renderOptions(popFor);
  }

  // ───── Pop-up positioning / lifecycle ─────
  function place(anchor) {
    pop.hidden = false;
    pop.style.left = Math.round(dock.getBoundingClientRect().right + 8) + 'px';
    const r = anchor.getBoundingClientRect(), h = pop.offsetHeight;
    pop.style.top = Math.round(Math.max(12, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 12))) + 'px';
  }
  function closePop() { if (pop.hidden && popFor === null) return; pop.hidden = true; popFor = null; sync(); }

  // ───── Option list for a select-type shortcut ─────
  function renderOptions(key) {
    const cur = value(key);
    pop.innerHTML = `<div class="popHead">${REG[key].label}</div>` + options(key).map(([v, l]) => `<button type="button" class="popOpt" role="menuitemradio" aria-checked="${v === cur}" data-v="${v}">${l}</button>`).join('');
  }
  function openOptions(key, anchor) {
    beforeOpen && beforeOpen();
    popFor = key; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', REG[key].label);
    renderOptions(key); place(anchor); sync();
  }

  // ───── Shortcut customiser ─────
  function renderCustomize(focus) {
    const cur = settings.dockItems, avail = KEYS.filter(k => !cur.includes(k)), full = cur.length >= DOCK_MAX;
    const row = (k, ctl) => `<li><span style="display:contents">${REG[k].icon}</span><span>${REG[k].label}</span>${ctl}</li>`;
    pop.innerHTML = `<div class="popHead"><span>Dock shortcuts</span><button type="button" class="miniBtn" data-act="close" aria-label="Close">${CLOSE}</button></div>
<ul class="shortList" aria-label="In the dock">${cur.length ? cur.map((k, i) => row(k,
      `<button type="button" class="miniBtn" data-act="up" data-k="${k}" aria-label="Move ${REG[k].label} up"${i === 0 ? ' disabled' : ''}>${UP}</button><button type="button" class="miniBtn" data-act="down" data-k="${k}" aria-label="Move ${REG[k].label} down"${i === cur.length - 1 ? ' disabled' : ''}>${DOWN}</button><button type="button" class="miniBtn" data-act="remove" data-k="${k}" aria-label="Remove ${REG[k].label}">${CLOSE}</button>`)).join('') : '<li class="none">No shortcuts yet.</li>'}</ul>
<div class="popHead"><span>Add</span></div>
<ul class="shortList" aria-label="Available settings">${avail.length ? avail.map(k => row(k, `<button type="button" class="miniBtn" data-act="add" data-k="${k}" aria-label="Add ${REG[k].label}"${full ? ' disabled' : ''}>${PLUS}</button>`)).join('') : '<li class="none">Everything is already in the dock.</li>'}</ul>
<p class="popNote">${full ? `The dock holds up to ${DOCK_MAX} shortcuts.` : 'Settings and the + button are always in the dock.'}</p>`;
    if (focus) { const el = pop.querySelector(focus); if (el && !el.disabled) el.focus({ preventScroll: true }); }
  }
  function openCustomize() {
    beforeOpen && beforeOpen();
    popFor = 'customize'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Dock shortcuts');
    renderCustomize(); place(addBtn); sync();
  }
  const commit = focus => { sanitizeDock(settings); save(); renderItems(); renderCustomize(focus); };

  pop.addEventListener('click', e => {
    const opt = e.target.closest('.popOpt');
    if (opt && popFor && popFor !== 'customize') { const key = popFor; closePop(); setSetting(key, opt.dataset.v); return; }
    const b = e.target.closest('[data-act]');
    if (!b || popFor !== 'customize') return;
    const k = b.dataset.k, list = settings.dockItems, i = list.indexOf(k);
    if (b.dataset.act === 'close') { closePop(); return; }
    if (b.dataset.act === 'remove' && i > -1) { list.splice(i, 1); commit(); }
    else if (b.dataset.act === 'add' && i < 0 && list.length < DOCK_MAX) { list.push(k); commit(); }
    else if (b.dataset.act === 'up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; commit(`[data-act="up"][data-k="${k}"]`); }
    else if (b.dataset.act === 'down' && i > -1 && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; commit(`[data-act="down"][data-k="${k}"]`); }
    place(addBtn);
  });

  $('dockGear').onclick = () => { closePop(); $('dockGear').blur(); openSettings && openSettings(); };
  addBtn.onclick = () => { popFor === 'customize' && !pop.hidden ? closePop() : openCustomize(); addBtn.blur(); };

  // Tapping outside dismisses the pop-up (and, like the scramble pop-up, a tap on the bare timer area only dismisses).
  document.addEventListener('pointerdown', e => {
    if (pop.hidden || e.target.closest('#dockPop,#dock')) return;
    closePop();
    if (!e.target.closest('button,input,select,textarea,a,[data-ui-control]')) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); closePop(); if (document.activeElement) document.activeElement.blur(); } });
  window.addEventListener('resize', closePop);

  renderItems();
  return { sync, closePop };
}
