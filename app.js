(()=>{
const $=id=>document.getElementById(id);
const defaults={startMethod:'hold',inspectionEnabled:false,inspectionLength:15,precision:2,theme:'dark',leadingZero:true,keepAwake:true,vibrationEnabled:true,soundEnabled:true,scrambleLength:0,platformMode:'auto',timerSize:100,timerFont:'roboto',timerWeight:'light'};
let storedSettings={};
try{storedSettings=JSON.parse(localStorage.getItem('ct-settings')||'{}')||{}}catch{}
let settings={...defaults,...storedSettings};
let storedSolves=[];
try{storedSolves=JSON.parse(localStorage.getItem('ct-solves')||'[]')||[]}catch{}
// Solve model: {ms, scramble, penalty: 0 | 2 | 'dnf'}
let solves=storedSolves.map(v=>typeof v==='number'?{ms:v,scramble:'',penalty:0}:{penalty:0,...v}).filter(v=>v&&Number.isFinite(v.ms));
// state: idle | inspection | running. Finger/key contact is tracked separately in `press`.
let state='idle',resultShown=false,start=0,inspectionStart=0,raf=0,press=null,wake=null,pendingPenalty=0;
let currentScramble='',scrambleModule=null,scrambleBusy=false,audioContext=null,inspectionCues=new Set();
const HOLD_MS=300,SWIPE=65;
const detectPlatformMode=()=>{
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const touchCapable = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  return coarse || touchCapable ? 'mobile' : 'desktop';
};
const effectivePlatformMode=()=> settings.platformMode === 'auto' ? detectPlatformMode() : settings.platformMode;
const fmt=ms=>{let s=(Math.max(0,ms)/1000).toFixed(+settings.precision);return !settings.leadingZero&&s.startsWith('0')?s.slice(1):s};
const show=ms=>$('time').textContent=fmt(ms);
const save=()=>localStorage.setItem('ct-settings',JSON.stringify(settings));
const saveSolves=()=>localStorage.setItem('ct-solves',JSON.stringify(solves));
const isDnf=v=>v.penalty==='dnf';
const effective=v=>v.ms+(v.penalty===2?2000:0);
const label=v=>isDnf(v)?'DNF':fmt(effective(v))+(v.penalty===2?'+':'');
function render(){
  document.body.classList.toggle('light',settings.theme==='light');
  $('platformMode').value=settings.platformMode;document.body.dataset.platform=effectivePlatformMode();
  $('timerSize').value=settings.timerSize;$('timerSizeValue').textContent=settings.timerSize+'%';document.documentElement.style.setProperty('--timer-scale',settings.timerSize/100);
  $('timerFont').value=settings.timerFont;$('timerWeight').value=settings.timerWeight;$('time').dataset.font=settings.timerFont;$('time').dataset.weight=settings.timerWeight;
  $('startMethod').value=settings.startMethod;$('inspectionEnabled').checked=settings.inspectionEnabled;$('inspectionLength').value=settings.inspectionLength;$('precision').value=settings.precision;
  $('leadingZero').checked=settings.leadingZero;$('theme').value=settings.theme;$('keepAwake').checked=settings.keepAwake;$('soundEnabled').checked=settings.soundEnabled;$('vibrationEnabled').checked=settings.vibrationEnabled;$('scrambleLength').value=settings.scrambleLength||'';
  const h=$('history');h.innerHTML='';solves.slice(0,30).forEach((v,i)=>{const li=document.createElement('li');const number=document.createElement('span');number.textContent=`${solves.length-i}.`;const val=document.createElement('span');val.textContent=label(v);li.append(number,val);if(v.scramble)li.classList.add('has-scramble');li.onclick=()=>{if(v.scramble)alert(v.scramble)};h.append(li)});
  if(!solves.length)h.innerHTML='<li class="empty">Your solves will appear here.</li>';
  const valid=solves.filter(v=>!isDnf(v)).map(effective);
  $('count').textContent=solves.length;$('best').textContent=valid.length?fmt(Math.min(...valid)):'—';$('mean').textContent=valid.length?fmt(valid.reduce((a,b)=>a+b,0)/valid.length):'—';
}
function close(){document.querySelectorAll('.drawer').forEach(x=>x.classList.remove('open'));$('scrim').classList.remove('open');setTimeout(()=>{if(!drawersOpen())resetAdvanced()},300);if(document.activeElement&&document.activeElement.matches('button,input,select,textarea'))document.activeElement.blur();}
function open(which){close();resetAdvanced();$(which).classList.add('open');$('scrim').classList.add('open')}
function resetAdvanced(){document.querySelectorAll('#advanced .sub').forEach(x=>x.classList.remove('open'));$('lucentAdvMain').classList.remove('pushed')}
function goBack(){const s=document.querySelector('#advanced .sub.open');if(!s)return false;s.classList.remove('open');$('lucentAdvMain').classList.remove('pushed');return true}
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{$(b.dataset.go).classList.add('open');$('lucentAdvMain').classList.add('pushed')});
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=goBack);
const drawersOpen=()=>$('quick').classList.contains('open')||$('advanced').classList.contains('open');
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);$('scrim').onclick=close;
function vibrate(pattern=12){if(!settings.vibrationEnabled||!navigator.vibrate)return;try{navigator.vibrate(pattern)}catch{}}
function unlockAudio(){if(!settings.soundEnabled)return;try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;audioContext ||= new AudioCtx();if(audioContext.state==='suspended')audioContext.resume()}catch{}}
function beep(freq=880,duration=.075){if(!settings.soundEnabled)return;try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;audioContext ||= new AudioCtx();if(audioContext.state==='suspended')audioContext.resume();const osc=audioContext.createOscillator();const gain=audioContext.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.value=.0001;osc.connect(gain);gain.connect(audioContext.destination);const now=audioContext.currentTime;gain.gain.exponentialRampToValueAtTime(.18,now+.01);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.start(now);osc.stop(now+duration)}catch{}}
function cue(which){if(inspectionCues.has(which))return;inspectionCues.add(which);if(which==='first'){beep(880,.07);vibrate(12)}else if(which==='second'){beep(660,.12);vibrate([12,35,12])}else{beep(330,.14);vibrate(18)}}
function setPressed(on){$('time').classList.toggle('pressed',!!on)}
function setScrambleHidden(on){$('scramblePanel').classList.toggle('away',!!on)}
function setReady(on){$('time').classList.toggle('ready',!!on)}
function setStatus(text){const s=$('status');s.textContent=text;s.classList.toggle('visible',!!text)}

function run(){
  if(state==='inspection'){
    const left=settings.inspectionLength-(performance.now()-inspectionStart)/1000;
    pendingPenalty=left>0?0:left>-2?2:'dnf';
  }else pendingPenalty=0;
  state='running';resultShown=false;setScrambleHidden(true);setStatus('');start=performance.now();show(0);cancelAnimationFrame(raf);
  const loop=()=>{if(state==='running'){show(performance.now()-start);raf=requestAnimationFrame(loop)}};raf=requestAnimationFrame(loop);
}
function updateInspection(){
  if(state!=='inspection')return;
  const elapsed=(performance.now()-inspectionStart)/1000,left=settings.inspectionLength-elapsed;
  if(elapsed>=8)cue('first');if(elapsed>=12)cue('second');
  if(left>0)$('time').textContent=Math.ceil(left);
  else{cue('end');$('time').textContent=left>-2?'+2':'DNF'}
  raf=requestAnimationFrame(updateInspection);
}
function beginInspection(){state='inspection';resultShown=false;inspectionStart=performance.now();inspectionCues.clear();setStatus('INSPECTION');cancelAnimationFrame(raf);updateInspection()}
function cancelInspection(){if(state!=='inspection')return;cancelAnimationFrame(raf);state='idle';resultShown=false;setScrambleHidden(false);setStatus('');show(0)}
function begin(){if(state!=='idle')return;unlockAudio();if(settings.inspectionEnabled)beginInspection();else run()}
function stop(){
  if(state!=='running')return;
  const result=performance.now()-start,solve={ms:result,scramble:currentScramble,penalty:pendingPenalty};
  state='idle';resultShown=true;setScrambleHidden(false);cancelAnimationFrame(raf);setPressed(false);
  if(isDnf(solve)){$('time').textContent='DNF';setStatus(fmt(result))}else $('time').textContent=label(solve);
  solves.unshift(solve);solves=solves.slice(0,500);saveSolves();render();generateScramble();
}

const line=$('swipeLine'),lineLabel=$('swipeLabel'),glow=$('glow');
let lineTimer=0,flashToken=0;
const confirmOpen=()=>!$('confirm').hidden;
function flash(text,ms=1400){setStatus(text);const t=++flashToken;setTimeout(()=>{if(t===flashToken&&state==='idle')setStatus('')},ms)}
function togglePlus2(fromKey){
  const s=solves[0];if(!s)return;
  s.penalty=s.penalty===2?0:2;saveSolves();render();
  $('time').textContent=label(s);setStatus('');
  if(fromKey)flash(s.penalty===2?'+2':'−2');
}
function askDelete(){if(!solves.length)return;$('confirm').hidden=false}
function cancelDelete(){$('confirm').hidden=true;glow.style.opacity='0'}
function confirmDelete(){
  cancelDelete();solves.shift();saveSolves();render();setStatus('');
  if(solves.length)$('time').textContent=label(solves[0]);else{resultShown=false;show(0)}
}
$('confirmYes').onclick=()=>{confirmDelete();$('confirmYes').blur()};
$('confirmNo').onclick=()=>{cancelDelete();$('confirmNo').blur()};

function resetLine(){clearTimeout(lineTimer);line.classList.remove('release','commit','armed');line.style.opacity='0';line.style.height='0px'}
function swipeMove(p,dx,dy){
  const vertical=Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*1.25;
  if(!vertical){if(p.vertical){p.vertical=false;p.ticked=false;hideSwipe(p,true)}return}
  if(!p.vertical){p.vertical=true;clearTimeout(p.timer);p.armed=false;setReady(false);setPressed(false)}
  const progress=Math.min(Math.abs(dy)/SWIPE,1);
  if(progress>=1){if(!p.ticked){p.ticked=true;vibrate(8)}}else p.ticked=false;
  if(dy<0){
    glow.style.opacity='0';clearTimeout(lineTimer);line.classList.remove('release','commit');
    lineLabel.textContent=solves[0]&&solves[0].penalty===2?'−2':'+2';
    line.style.left=p.x+'px';line.style.top=(p.y+dy)+'px';line.style.height=(-dy)+'px';line.style.opacity=String(.3+.7*progress);
    line.classList.toggle('armed',progress>=1);
  }else{resetLine();glow.style.opacity=String(.08+.92*progress)}
}
function hideSwipe(p,keepVertical){
  glow.style.opacity='0';
  if(p&&p.vertical&&line.style.opacity!=='0'){line.classList.remove('armed');line.classList.add('release');line.style.top=p.y+'px';line.style.height='0px';line.style.opacity='0';clearTimeout(lineTimer);lineTimer=setTimeout(resetLine,200)}
  if(p){p.vertical=!!keepVertical;p.armed=false;p.ticked=false}
}
function commitSwipe(p,dir){
  p.committed=true;
  if(dir==='up'){togglePlus2(false);line.classList.remove('release');line.classList.add('commit');clearTimeout(lineTimer);lineTimer=setTimeout(resetLine,540)}
  else{askDelete();glow.style.opacity='.42'}
}

function pressStart(source,e){
  if(press)return;
  const allowed=source==='key'||settings.startMethod!=='keyboard';
  const holdMode=source==='key' ? true : settings.startMethod==='hold';
  press={source,id:e?.pointerId,x:e?.clientX,y:e?.clientY,moved:false,armed:false,allowed,holdMode,timer:0,vertical:false,ticked:false,committed:false};
  setPressed(true);
  if(allowed&&(state==='inspection'||!settings.inspectionEnabled))setScrambleHidden(true);
  if(allowed&&holdMode)press.timer=setTimeout(()=>{if(press){press.armed=true;setReady(true);vibrate(12)}},HOLD_MS);
}
function pressEnd(cancel){
  const p=press;if(!p)return;
  // Decide whether this release starts the timer BEFORE hideSwipe(), which resets p.armed.
  const go=!cancel&&p.allowed&&(p.holdMode?p.armed:!p.moved);
  press=null;clearTimeout(p.timer);setPressed(false);setReady(false);if(!p.committed)hideSwipe(p);setScrambleHidden(false);
  if(go){if(state==='inspection'){cancelAnimationFrame(raf);run()}else begin()}
}

document.addEventListener('pointerdown',e=>{
  if(effectivePlatformMode()!=='desktop'||e.pointerType==='touch'||e.button!==0)return;
  // Mouse clicks only open the drawers when idle: never while solving, over a button, or during delete confirmation.
  if(!drawersOpen()&&(state!=='idle'||confirmOpen()||interactiveTarget(e.target)))return;
  const inDrawer=!!e.target.closest('.drawer');
  if(drawersOpen()){
    if(inDrawer)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
    return;
  }
  e.preventDefault();
  e.stopImmediatePropagation();
  open(e.clientX<window.innerWidth/2?'advanced':'quick');
},true);

document.addEventListener('pointerdown',e=>{
  if(e.button===2)return;
  if(drawersOpen())return;
  if(confirmOpen()){if(e.target.closest('#confirm'))return;e.preventDefault();e.stopImmediatePropagation();cancelDelete();return}
  if(interactiveTarget(e.target))return;
  if(state==='running'){e.preventDefault();e.stopImmediatePropagation();stop();return}
  pressStart('pointer',e);
},true);
document.addEventListener('pointermove',e=>{
  if(!press||press.source!=='pointer'||press.id!==e.pointerId)return;
  const dx=e.clientX-press.x,dy=e.clientY-press.y;
  if(Math.abs(dx)>12||Math.abs(dy)>12)press.moved=true;
  if(Math.hypot(dx,dy)>30)setScrambleHidden(false);
  if(state==='idle'&&resultShown)swipeMove(press,dx,dy);
},true);
document.addEventListener('pointerup',e=>{
  if(!press||press.source!=='pointer'||press.id!==e.pointerId)return;
  const p=press,dx=e.clientX-p.x,dy=e.clientY-p.y;
  if((effectivePlatformMode()==='mobile'||e.pointerType==='touch')&&Math.abs(dx)>SWIPE&&Math.abs(dx)>Math.abs(dy)*1.25){pressEnd(true);open(dx<0?'quick':'advanced');return}
  if(Math.abs(dy)>SWIPE&&Math.abs(dy)>Math.abs(dx)*1.25){if(state==='idle'&&resultShown)commitSwipe(p,dy<0?'up':'down');pressEnd(true);return}
  pressEnd(false);
},true);
document.addEventListener('pointercancel',()=>{if(press&&press.source==='pointer')pressEnd(true)},true);
function interactiveTarget(target){return !!target.closest('button,input,select,textarea,a,[data-ui-control]')}

const modifierKeys=new Set(['Shift','Control','Alt','Meta','CapsLock','Fn','OS']);
const typing=t=>t.matches('input,select,textarea,[contenteditable="true"]');
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&drawersOpen()&&!confirmOpen()){e.preventDefault();if(document.activeElement)document.activeElement.blur();if(!goBack())close();return}
  if(typing(e.target)||modifierKeys.has(e.key)||e.repeat)return;
  const k=e.key.length===1?e.key.toLowerCase():e.key,plain=!(e.ctrlKey||e.metaKey||e.altKey);
  if(confirmOpen()){e.preventDefault();if(k==='Enter'||k==='y')confirmDelete();else if(k==='Escape'||k==='n')cancelDelete();return}
  if(drawersOpen()){
    if(plain&&(k==='q'||k==='a')){e.preventDefault();const which=k==='q'?'quick':'advanced';$(which).classList.contains('open')?close():open(which)}
    return;
  }
  if(state==='running'){e.preventDefault();stop();return}
  if(e.code==='Space'){e.preventDefault();pressStart('key');return}
  if(state==='inspection'){if(k==='Escape'){e.preventDefault();pressEnd(true);cancelInspection()}return}
  if(state!=='idle'||press||!plain)return;
  if(k==='q')open('quick');
  else if(k==='a')open('advanced');
  else if(k==='n')generateScramble();
  else if(resultShown&&k==='2')togglePlus2(true);
  else if(resultShown&&(k==='Backspace'||k==='Delete')){e.preventDefault();askDelete()}
});
document.addEventListener('keyup',e=>{
  if(e.code!=='Space'||drawersOpen()||typing(e.target))return;
  e.preventDefault();
  if(press&&press.source==='key')pressEnd(false);
});
addEventListener('blur',()=>pressEnd(true));

function randomMoveScramble(n){
  const faces=['U','D','L','R','F','B'],axis={U:0,D:0,L:1,R:1,F:2,B:2},suffix=['',"'",'2'],out=[];
  let last='',prev='';
  while(out.length<n){
    const f=faces[Math.floor(Math.random()*6)];
    if(f===last)continue;
    if(prev&&axis[prev]===axis[last]&&axis[f]===axis[last])continue;
    out.push(f+suffix[Math.floor(Math.random()*3)]);prev=last;last=f;
  }
  return out.join(' ');
}
function showScramble(text){currentScramble=text;$('scramble').textContent=text;$('scramble').classList.remove('scramble-error')}
async function generateScramble(){
  const custom=Math.floor(+settings.scrambleLength)||0;
  if(custom>0){showScramble(randomMoveScramble(Math.min(custom,200)));return}
  if(scrambleBusy)return;scrambleBusy=true;$('newScramble').disabled=true;$('scramble').textContent='Generating scramble…';
  try{scrambleModule ||= await import('https://cdn.cubing.net/v0/js/cubing/scramble');const alg=await scrambleModule.randomScrambleForEvent('333');showScramble(alg.toString())}
  catch(err){$('scramble').textContent='Could not generate a scramble. Check your connection and try again.';$('scramble').classList.add('scramble-error');currentScramble=''}
  finally{scrambleBusy=false;$('newScramble').disabled=false}
}
$('newScramble').addEventListener('click',()=>{generateScramble();$('newScramble').blur()});
function bind(id,key,conv=v=>v){$(id).addEventListener('change',e=>{settings[key]=conv(e.target.type==='checkbox'?e.target.checked:e.target.value);save();render();if(state==='idle'){if(resultShown&&solves.length){$('time').textContent=label(solves[0])}else show(0)}})}
$('platformMode').addEventListener('change',e=>{settings.platformMode=e.target.value;save();render();});
$('timerSize').addEventListener('input',e=>{settings.timerSize=+e.target.value;$('timerSizeValue').textContent=settings.timerSize+'%';document.documentElement.style.setProperty('--timer-scale',settings.timerSize/100);save();});
$('timerFont').addEventListener('change',e=>{settings.timerFont=e.target.value;save();render();});
$('timerWeight').addEventListener('change',e=>{settings.timerWeight=e.target.value;save();render();});
bind('startMethod','startMethod');bind('inspectionEnabled','inspectionEnabled',Boolean);bind('precision','precision',Number);bind('theme','theme');bind('leadingZero','leadingZero',Boolean);bind('soundEnabled','soundEnabled',Boolean);bind('vibrationEnabled','vibrationEnabled',Boolean);bind('keepAwake','keepAwake',Boolean);
$('scrambleLength').addEventListener('change',e=>{const n=Math.floor(+e.target.value);settings.scrambleLength=Number.isFinite(n)&&n>=1?Math.min(n,200):0;save();render();generateScramble()});
$('inspectionLength').onchange=e=>{settings.inspectionLength=+e.target.value;save();render()};
$('clear').onclick=()=>{if(confirm('Clear all saved solves?')){solves=[];saveSolves();resultShown=false;show(0);setStatus('');render()}};
async function applyWake(){
  try{
    if(settings.keepAwake&&navigator.wakeLock&&document.visibilityState==='visible'){if(!wake||wake.released)wake=await navigator.wakeLock.request('screen')}
    else if(wake){await wake.release();wake=null}
  }catch{}
}
$('keepAwake').addEventListener('change',e=>{settings.keepAwake=e.target.checked;save();applyWake()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')applyWake()});
render();show(0);generateScramble();applyWake();
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
