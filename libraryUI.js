// Scramble Library settings page. Deliberately separate from app.js render(): it only listens to the library's change events
// (already throttled) and only touches the #advLibrary page, so it can never slow down the timer's own rendering.
import * as L from './scrambleLibrary.js';
import { PUZZLES, puzzleName } from './puzzles.js';

const $ = id => document.getElementById(id);
const nf = n => Number(n).toLocaleString('en-US');
const MB = b => b < 52429 ? '< 0.1 MB' : (b / 1048576).toFixed(b < 10485760 ? 2 : 1) + ' MB';
const LABEL = { idle: 'Idle', generating: 'Generating', paused: 'Paused', offline: 'Offline', full: 'Full', error: 'Error' };

export function initLibraryUI() {
  const per = $('libPer');
  per.innerHTML = PUZZLES.map(p => `<li data-p="${p.id}"><span>${p.name}</span><small>0 unused · 0 used</small></li>`).join('');

  function paint(s) {
    $('libCount').textContent = `${nf(s.total)} / ${nf(s.cap)}`;
    const st = $('libStatus'); st.textContent = LABEL[s.status] || s.status; st.dataset.s = s.status;
    $('libBarFill').style.width = Math.min(100, s.total / s.cap * 100).toFixed(1) + '%';
    $('libBar').setAttribute('aria-valuenow', String(s.total));
    let unused = 0; for (const k in s.per) unused += s.per[k].u;
    const persist = s.persisted === true ? 'Persistent storage granted.' : s.persisted === false ? 'Persistent storage not granted: the browser may clear saved scrambles if the device runs low on space.' : '';
    $('libDetail').textContent = `${nf(unused)} unused · ${nf(s.total - unused)} used · Storage ≈ ${MB(s.bytes)} (estimate; browsers cannot report the exact size of a database). ${persist}`.trim();
    const err = $('libError'), msgs = [];
    if (s.error) msgs.push(s.error);
    if (s.cleared) msgs.push('The browser cleared the saved scrambles. They will be rebuilt if automatic building is on.');
    err.hidden = !msgs.length; err.textContent = msgs.join(' ');
    err.classList.toggle('err', !!s.error);
    // Generator problems, kept apart from storage errors: "unsupported" (the generator explicitly rejected the puzzle) versus temporary failures that retry on their own.
    const gp = $('libGen'), gm = [];
    if (s.unsupported.length) gm.push('Not supported by the scramble generator: ' + s.unsupported.map(u => u.name).join(', ') + '. These are skipped; the other puzzles are not affected. They are re-tested after 24 hours or when you start a manual build.');
    if (s.retrying.length) gm.push('Temporarily failing, will retry automatically: ' + s.retrying.map(r => `${r.name} (${r.reason})`).join(', ') + '.');
    gp.hidden = !gm.length; gp.textContent = gm.join(' ');
    $('libAuto').checked = s.auto; $('libPause').checked = s.paused;
    const m = s.manual;
    $('libManual').hidden = !m; $('libCancel').hidden = !m;
    $('libBuild').disabled = !!m || s.status === 'full' || s.status === 'error' && !!s.error && /not available/.test(s.error);
    if (m) { $('libManualFill').style.width = (m.total ? Math.min(100, m.done / m.total * 100) : 0).toFixed(1) + '%'; $('libManualText').textContent = `Building ${nf(m.done)} / ${nf(m.total)}${s.paused ? ' (paused)' : s.status === 'offline' ? ' (waiting for connection)' : ''}`; }
    $('libManualMsg').textContent = m ? '' : s.manualNote || '';
    for (const li of per.children) { const c = s.per[li.dataset.p] || { u: 0, s: 0 }, un = s.unsupported.some(u => u.id === li.dataset.p), rt = s.retrying.some(r => r.id === li.dataset.p); li.lastChild.textContent = `${nf(c.u)} unused · ${nf(c.s)} used${un ? ' · not supported' : rt ? ' · retrying' : ''}`; }
  }
  L.onChange(paint); paint(L.getSnapshot());

  $('libAuto').addEventListener('change', e => { L.setAuto(e.target.checked); e.target.blur(); });
  $('libPause').addEventListener('change', e => { e.target.checked ? L.pause() : L.resume(); e.target.blur(); });
  $('libBuild').addEventListener('click', e => { L.startManual(); e.currentTarget.blur(); });
  $('libCancel').addEventListener('click', e => { L.cancelManual(); e.currentTarget.blur(); });
  // Deletion: inline confirmation (not the timer's #confirm, which owns the keyboard while open).
  $('libDelete').addEventListener('click', () => { $('libConfirm').hidden = false; $('libDeleteNo').focus({ preventScroll: true }); });
  $('libDeleteNo').addEventListener('click', e => { $('libConfirm').hidden = true; e.currentTarget.blur(); });
  $('libDeleteYes').addEventListener('click', async e => { e.currentTarget.blur(); $('libConfirm').hidden = true; await L.deleteAll(); });
  document.querySelectorAll('[data-go="advLibrary"]').forEach(b => b.addEventListener('click', () => { $('libConfirm').hidden = true; L.refresh(); }));
}
