// Scramble Library settings UI. It is intentionally separate from app.js rendering.
import * as L from './scrambleLibrary.js';
import { PUZZLES } from './puzzles.js';

const $ = id => document.getElementById(id);
const nf = n => Number(n).toLocaleString('en-US');
const MB = b => b < 52429 ? '< 0.1 MB' : (b / 1048576).toFixed(b < 10485760 ? 2 : 1) + ' MB';
const LABEL = { idle: 'Idle', generating: 'Generating', paused: 'Paused', offline: 'Offline', full: 'Full', error: 'Error' };

export function initLibraryUI() {
  const per = $('libPer');
  per.innerHTML = PUZZLES.map(p => `<li data-p="${p.id}"><span>${p.name}</span><small>0 unused · 0 used</small></li>`).join('');

  function paint(s) {
    $('libCount').textContent = `${nf(s.total)} / ${nf(s.cap)}`;
    const status = $('libStatus'); status.textContent = LABEL[s.status] || s.status; status.dataset.s = s.status;
    $('libBarFill').style.width = Math.min(100, s.total / s.cap * 100).toFixed(1) + '%';
    $('libBar').setAttribute('aria-valuenow', String(s.total));
    let unused = 0; for (const key in s.per) unused += s.per[key].u;
    const persist = s.persisted === true ? 'Persistent storage granted.' : s.persisted === false ? 'Persistent storage not granted: the browser may clear saved scrambles if device storage is low.' : 'Persistent storage status unknown.';
    $('libDetail').textContent = `${nf(unused)} unused · ${nf(s.total - unused)} used · Storage ≈ ${MB(s.bytes)} (estimate; browser database size is not exact). ${persist}`;
    const error = $('libError'), messages = [];
    if (s.error) messages.push(s.error);
    if (s.cleared) messages.push('The browser cleared the saved scrambles. They will be rebuilt if automatic building is on.');
    error.hidden = !messages.length; error.textContent = messages.join(' '); error.classList.toggle('err', !!s.error);
    const gen = $('libGen'), genMessages = [];
    if (s.unsupported.length) genMessages.push('Not supported by the scramble generator: ' + s.unsupported.map(x => x.name).join(', ') + '.');
    if (s.retrying.length) genMessages.push('Temporarily failing, will retry automatically: ' + s.retrying.map(x => `${x.name} (${x.reason})`).join(', ') + '.');
    gen.hidden = !genMessages.length; gen.textContent = genMessages.join(' ');
    $('libAuto').checked = s.auto; $('libPause').checked = s.paused;
    const manual = s.manual;
    $('libManual').hidden = !manual; $('libCancel').hidden = !manual;
    $('libBuild').disabled = !!manual || s.status === 'full' || (s.status === 'error' && !!s.error && /not available/.test(s.error));
    if (manual) { $('libManualFill').style.width = (manual.total ? Math.min(100, manual.done / manual.total * 100) : 0).toFixed(1) + '%'; $('libManualText').textContent = `Building ${nf(manual.done)} / ${nf(manual.total)}`; }
    $('libManualMsg').textContent = manual ? '' : s.manualNote || '';
    for (const li of per.children) { const counts = s.per[li.dataset.p] || { u: 0, s: 0 }; li.lastElementChild.textContent = `${nf(counts.u)} unused · ${nf(counts.s)} used`; }
  }
  L.onChange(paint); paint(L.getSnapshot());
  $('libAuto').addEventListener('change', e => { L.setAuto(e.target.checked); e.target.blur(); });
  $('libPause').addEventListener('change', e => { e.target.checked ? L.pause() : L.resume(); e.target.blur(); });
  $('libBuild').addEventListener('click', e => { L.startManual(); e.currentTarget.blur(); });
  $('libCancel').addEventListener('click', e => { L.cancelManual(); e.currentTarget.blur(); });
  $('libDelete').addEventListener('click', () => { $('libConfirm').hidden = false; $('libDeleteNo').focus({ preventScroll: true }); });
  $('libDeleteNo').addEventListener('click', e => { $('libConfirm').hidden = true; e.currentTarget.blur(); });
  $('libDeleteYes').addEventListener('click', async e => {
    const button = e.currentTarget; button.disabled = true;
    try {
      const deleted = await L.deleteAll();
      // Keep confirmation available after failure; the library snapshot displays the actionable error.
      if (deleted) $('libConfirm').hidden = true;
    } catch (error) {
      // Defensive fallback if a library implementation rejects rather than returning false.
      const message = $('libError'); message.hidden = false; message.classList.add('err');
      message.textContent = 'Could not delete the scramble library. Please try again.';
      $('libConfirm').hidden = false;
    } finally { button.disabled = false; button.blur(); }
  });
  document.querySelectorAll('[data-go="advLibrary"]').forEach(button => button.addEventListener('click', () => { $('libConfirm').hidden = true; L.refresh(); }));
}
