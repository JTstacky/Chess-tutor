import {FAMILIES,BY_ID,TRAITS,recipe,compile,interpretLocal,validateTeam,starterTeam,VERSION} from './catalog.js';
import {newMatch,act,advance,project} from './match.js';
import {createRound,snapshot} from './engine.js';
import {draw,loadArt} from './render.js';
const $=id=>document.getElementById(id),localHost=['127.0.0.1','localhost'].includes(location.hostname);
const API=localHost?location.origin:(window.SPARK_API||'').replace(/\/$/,'');
let mode=null,match=null,view=null,room=null,team=starterTeam(),selected=0,preview=recipe('fox'),busy=false,pollBusy=false,offset=0,pausedAt=0,lastPhase='',lastRound=0,attempts=0,toastTimer,profile={kind:null,online:false,ai:false},audio=null,sound=false,lastBanks=0;
let phaseKey='',lastBoardUpdate=0,lastPoll=0;
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const write=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
const token=()=>read('evonline.session');
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function showError(error){toast(error.message||String(error));}
async function api(path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{const r=await fetch(API+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token()?{Authorization:'Bearer '+token()}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});const j=await r.json();if(!r.ok)throw Object.assign(Error(j.error||'The workshop could not connect.'),{status:r.status});return j;}finally{clearTimeout(timer);}
}
async function checkProfile(){
  if(!token()){if(localHost)$('account').textContent='Test sign-in';return;}
  try{profile=await api('/api/me');$('account').textContent=profile.kind==='kid'?'Kid profile':'Grown-up profile';}catch{$('account').textContent='Sign in';}
}
function beep(freq=660){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*1.25,audio.currentTime+.1);g.gain.setValueAtTime(.045*(window.TGSettings?.volume??1),audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.25);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.26);}catch{}}
function drawPreview(){
  const f=compile(preview);$('creation-preview').innerHTML=`<img src="./assets/${f.id}.svg" alt="${f.name}"><div><small>${f.role.toUpperCase()} · ${f.cost} INK</small><h3>${f.name}</h3><p>${f.verb}</p><p class="weak">${f.weak}</p></div>`;
  $('trait').value=preview.trait;
}
function renderTeam(){
  $('team-slots').replaceChildren();
  for(let slot=0;slot<3;slot++){
    const entry=team[slot],card=document.createElement('article');card.className='team-slot'+(slot===selected?' selected':'');
    if(!entry){card.classList.add('empty-slot');const b=document.createElement('button');b.className='quiet';b.textContent='＋ Slot '+(slot+1)+' · add an invention';b.onclick=()=>{selected=slot;renderTeam();};card.append(b);$('team-slots').append(card);continue;}
    const f=compile(entry);
    card.innerHTML=`<button class="select-slot" aria-label="Select team slot ${slot+1}: ${f.name}" aria-pressed="${slot===selected}"><img src="./assets/${f.id}.svg" alt=""></button><div><h3>${f.name}</h3><div class="slot-controls"><select aria-label="Slot ${slot+1} job"><option value="fetch">Fetch Sparks</option><option value="intercept">Intercept</option><option value="escort">Escort</option></select><select aria-label="Slot ${slot+1} lane"><option value="0">Top lane</option><option value="1">Middle lane</option><option value="2">Bottom lane</option></select></div></div><div class="slot-price">${f.cost} Ink<button aria-label="Remove slot ${slot+1}">×</button></div>`;
    card.querySelector('.select-slot').onclick=()=>{selected=slot;renderTeam();};
    const selects=card.querySelectorAll('select');selects[0].value=entry.job;selects[1].value=String(entry.lane);
    selects[0].onchange=e=>entry.job=e.target.value;selects[1].onchange=e=>entry.lane=Number(e.target.value);
    card.querySelector('.slot-price button').onclick=()=>{team[slot]=null;selected=slot;renderTeam();};$('team-slots').append(card);
  }
  const cost=team.filter(Boolean).reduce((s,r)=>s+compile(r).cost,0);$('ink').textContent=`${cost} / 6 Ink`;$('ink').style.color=cost>6?'#a6402f':'';
  let error='';try{validateTeam(team.filter(Boolean));}catch(e){error=e.message;}
  $('team-hint').textContent=error||'Ready? Lock your team to reveal together.';
  $('ready').disabled=!!error||busy||!!view?.ready[view.seat];
  if(view?.ready[view.seat])$('team-slots').querySelectorAll('button,select').forEach(el=>el.disabled=true);
}
function catalogue(){
  for(const f of FAMILIES){const b=document.createElement('button');b.dataset.family=f.id;b.innerHTML=`<span class="cost">${f.cost} Ink</span><img src="./assets/${f.id}.svg" alt=""><strong>${f.name}</strong><small>${f.role}</small>`;b.setAttribute('aria-label',`Choose ${f.name}, ${f.cost} Ink`);b.onclick=()=>{preview=recipe(f.id,$('trait').value);drawPreview();$('invent-status').textContent='Picked from the shelf. Use it in your selected slot.';};$('catalogue').append(b);}
}
function safeSaved(){try{const list=JSON.parse(read('sparkheist.notebook')||'[]');return Array.isArray(list)?list.slice(0,12).map(v=>recipe(v.family,v.trait)):[];}catch{return [];}}
function savedUI(){const list=safeSaved();$('saved-list').replaceChildren();$('saved-empty').hidden=!!list.length;for(const r of list){const f=compile(r),b=document.createElement('button');b.innerHTML=`<img src="./assets/${f.id}.svg" alt=""><span>${f.name}</span>`;b.onclick=()=>{startPractice();preview=r;drawPreview();toast('Your saved invention is on the bench.');};$('saved-list').append(b);}}
function enterGame(){
  $('home').hidden=true;$('game').hidden=false;$('connection').hidden=true;lastPhase='';lastRound=0;phaseKey='';lastBanks=0;pausedAt=0;$('pause').textContent='Pause';
  $('pause').hidden=mode!=='practice';$('mode-label').textContent=mode==='practice'?'PRACTICE · WORKSHOP BOT':'PRIVATE FRIEND DUEL · TENG GAMES';$('rival-label').textContent=mode==='practice'?'Workshop bot':'Your rival';window.scrollTo({top:0,behavior:'instant'});
}
function startPractice(){
  mode='practice';room=null;view=null;team=starterTeam();selected=0;match=newMatch('local',{solo:true,seed:Math.floor(Math.random()*100000),now:Date.now()});match.deadline=match.expires;enterGame();applyView(project(match,'local'));if(!read('sparkheist.learned'))$('help-dialog').showModal();
}
function applyView(next){
  const previous=view;view=next;offset=next.serverTime-Date.now();
  const roundChanged=next.round!==lastRound||next.epoch!==previous?.epoch;
  if(roundChanged){attempts=0;lastRound=next.round;team=next.ownTeam.map(r=>({...r}));renderTeam();}
  const key=`${next.epoch}:${next.round}:${next.phase}`;
  if(key===phaseKey){$('ready').disabled=busy||next.ready[next.seat]||(()=>{try{validateTeam(team.filter(Boolean));return false;}catch{return true;}})();return;}
  phaseKey=key;lastPhase=next.phase;
  $('garden-title').textContent=next.round%2?'The Meadow Market':'The Dewdrop Crossing';$('round-label').textContent=`ROUND ${next.round} OF 5`;
  $('score-you').textContent=next.score[next.seat];$('score-them').textContent=next.score[1-next.seat];
  $('lobby').hidden=next.phase!=='waiting';$('workshop').hidden=next.phase!=='planning';$('catalogue-panel').hidden=next.phase!=='planning';$('command-panel').hidden=next.phase!=='command';$('result-overlay').hidden=!['roundEnd','finished'].includes(next.phase);
  $('phase-label').textContent={waiting:'Waiting for a rival',planning:'Make your team',play1:'The heist is on!',command:'Your halfway move',play2:'Bring them home!',roundEnd:'Round complete',finished:'Heist complete',expired:'Invitation expired'}[next.phase]||next.phase;
  $('arena-caption').hidden=!['planning','waiting'].includes(next.phase);$('arena-caption').textContent=next.phase==='waiting'?'Your rival will appear here.':'Six Ink. Three creations. Make something wonderful.';
  if(next.phase==='planning'){$('ready').textContent='Ready to heist ↗';renderTeam();}
  if(next.phase==='command'){
    $('command-slot').replaceChildren();for(const u of next.snapshot.units.filter(u=>u.seat===next.seat&&!u.knocked)){const opt=document.createElement('option');opt.value=u.slot;opt.textContent=compile(u).name;$('command-slot').append(opt);}
    $('command-status').textContent='Choose one command before the timer runs out.';document.querySelectorAll('[data-command]').forEach(b=>b.disabled=false);beep(440);
    $('command-panel').scrollIntoView({block:'center',behavior:'smooth'});
  }
  if(['play1','play2'].includes(next.phase)){beep(550);document.querySelector('.arena-shell').scrollIntoView({block:'start',behavior:'smooth'});}
  if(['roundEnd','finished'].includes(next.phase)){
    const finished=next.phase==='finished',winner=finished?next.matchWinner:next.roundWinner,won=winner===next.seat;
    $('result-kicker').textContent=finished?'HEIST COMPLETE':'ROUND '+next.round+' COMPLETE';
    $('result-title').textContent=winner===null?'A perfectly peculiar draw.':won?'A spark of brilliance!':'Their little plan worked.';
    $('result-detail').textContent=finished?`${next.forfeited?'Your rival left the duel. ':''}Final score: ${next.score[next.seat]} — ${next.score[1-next.seat]}. ${won?'Fancy another little adventure?':'Try a new team and turn the tables.'}`:next.tip;
    $('continue').textContent=finished?'Play again ↗':'Next round ↗';$('continue').disabled=false;$('event-summary').textContent=next.tip;if(won)beep(880);
  }
  if(next.phase==='expired')toast('This invitation has expired. Create a fresh duel.');
}
async function send(type,extras={}){
  if(!view)return;const input={type,epoch:view.epoch,round:view.round,...extras};
  if(mode==='practice'){act(match,'local',input,pausedAt||Date.now());if(match.phase==='planning')match.deadline=match.expires;applyView(project(match,'local',pausedAt||Date.now()));}
  else {const r=await api('/api/rooms/'+room+'/action',input);applyView(r.view);}
}
async function createFriend(){
  if(!token()){location.href='/account/?next='+encodeURIComponent('/spark-heist/');return;}
  try{const r=await api('/api/rooms',{});mode='online';room=r.id;match=null;view=null;team=starterTeam();location.hash='duel='+room;enterGame();$('invite').value=location.origin+location.pathname+'#duel='+room;applyView(r.view);}catch(e){showError(e);}
}
async function joinFriend(id){
  if(!token()){location.href='/account/?next='+encodeURIComponent(location.pathname+location.hash);return;}
  try{const r=await api('/api/rooms/'+id+'/join',{});mode='online';room=id;match=null;view=null;team=starterTeam();enterGame();$('invite').value=location.origin+location.pathname+'#duel='+room;applyView(r.view);}catch(e){showError(e);history.replaceState(null,'',location.pathname);}
}
async function poll(){
  if(mode!=='online'||!room||pollBusy||document.hidden)return;pollBusy=true;
  try{const r=await api('/api/rooms/'+room+'?after='+(view?.revision??0));$('connection').hidden=true;if(r.view)applyView(r.view);else offset=r.serverTime-Date.now();}
  catch(e){$('connection').hidden=false;$('connection').textContent=e.status===401?'Your sign-in expired. Open Your profile to reconnect.':'Reconnecting… Your locked team keeps playing. Keep this tab open.';}
  finally{pollBusy=false;}
}
function render(now){
  requestAnimationFrame(render);if(!mode||!view)return;
  if(mode==='practice'&&!pausedAt){const prev=match.revision;advance(match,Date.now());if(match.phase==='planning')match.deadline=match.expires;if(prev!==match.revision)applyView(project(match,'local'));}
  if(mode==='online'&&now-lastPoll>850){lastPoll=now;poll();}
  const time=pausedAt||Date.now()+offset;
  let state=view.snapshot;
  if(['waiting','planning'].includes(view.phase)){
    try{state=createRound([view.seat?starterTeam():validateTeam(team.filter(Boolean)),view.seat?validateTeam(team.filter(Boolean)):starterTeam()],1,(view.round-1)%2);}catch{state=createRound([starterTeam(),starterTeam()],1,(view.round-1)%2);}
  } else if(['play1','play2'].includes(view.phase)&&view.frames.length){const index=Math.max(0,Math.min(view.frames.length-1,Math.floor((time-view.playAt)/(100*view.pace))));state=view.frames[index];}
  draw($('arena'),state,{seat:view.seat,privateSide:['waiting','planning'].includes(view.phase)?1-view.seat:null,planning:['waiting','planning'].includes(view.phase),paused:!!pausedAt,time:matchMedia('(prefers-reduced-motion: reduce)').matches?0:now});
  $('clock').textContent=pausedAt?'Paused':mode==='practice'&&view.phase==='planning'?'Take your time':['waiting','finished','expired'].includes(view.phase)?'':Math.max(0,Math.ceil((view.deadline-time)/1000))+'s';
  if(state){const sum=state.banked.reduce((a,b)=>a+b,0);if(sum>lastBanks&&['play1','play2'].includes(view.phase))beep(740);lastBanks=sum;$('spark-count').textContent=`◆ ${state.banked[view.seat]} banked · ◆ ${state.banked[1-view.seat]} rival`;
    if(now-lastBoardUpdate>1000){lastBoardUpdate=now;$('board-list').replaceChildren();for(const u of state.units){if(['waiting','planning'].includes(view.phase)&&u.seat!==view.seat)continue;const li=document.createElement('li');li.textContent=`${u.seat===view.seat?'Your':'Rival'} ${compile(u).name}: ${u.knocked?'knocked out':Math.ceil(u.hp)+' health'}, ${u.carrying!==null?'carrying a Spark':u.job}.`;$('board-list').append(li);}}
  }
}
$('practice').onclick=startPractice;$('friend').onclick=createFriend;
$('prompt').oninput=()=>{$('prompt-count').textContent=[...$('prompt').value].length+' / 160';};
$('invent').onclick=async()=>{
  if(busy||!view||view.phase!=='planning')return;
  try{
    const text=$('prompt').value;let result=interpretLocal(text);busy=true;$('invent').disabled=true;$('invent-status').classList.remove('error');$('invent-status').textContent='Shaping your idea…';
    if(profile.ai&&attempts<2){attempts++;try{result=await api('/api/invent',{text});}catch{result.note='Cloud workshop is unavailable. Your on-device recipe is ready.';}}
    preview=result.recipe;drawPreview();$('invent-status').textContent=(result.source==='ai'?'✦ AI creation. ':'')+result.note;$('prompt').value='';$('prompt-count').textContent='0 / 160';
  }catch(e){$('invent-status').classList.add('error');$('invent-status').textContent=e.message;}finally{busy=false;$('invent').disabled=false;renderTeam();}
};
$('trait').onchange=()=>{preview=recipe(preview.family,$('trait').value);drawPreview();};
$('add').onclick=()=>{if(view?.phase!=='planning'||view.ready[view.seat])return;const old=team[selected];team[selected]={...preview,job:old?.job??'fetch',lane:old?.lane??selected};renderTeam();beep(500);};
$('save').onclick=()=>{const list=safeSaved();if(!list.some(r=>r.family===preview.family&&r.trait===preview.trait)){list.unshift(preview);write('sparkheist.notebook',JSON.stringify(list.slice(0,12)));}savedUI();toast('Saved to your private invention notebook.');};
$('ready').onclick=async()=>{if(busy)return;try{const legal=validateTeam(team.filter(Boolean));busy=true;$('ready').disabled=true;await send('ready',{team:legal});if(view.phase==='planning'){$('ready').textContent='Sealed · waiting for rival';$('team-hint').textContent='Your team is locked. Their plan stays hidden until reveal.';}}catch(e){showError(e);}finally{busy=false;if(view?.phase==='planning')renderTeam();}};
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=async()=>{try{await send('command',{command:{slot:Number($('command-slot').value),job:b.dataset.command}});$('command-status').textContent='Command sealed. Watch what happens next!';document.querySelectorAll('[data-command]').forEach(x=>x.disabled=true);}catch(e){showError(e);}});
$('continue').onclick=async()=>{try{$('continue').disabled=true;await send(view.phase==='finished'?'rematch':'next');if(['finished','roundEnd'].includes(view.phase))$('continue').textContent='Waiting for your rival…';}catch(e){$('continue').disabled=false;showError(e);}};
$('leave').onclick=async()=>{if(mode==='online'&&view&&!['waiting','finished'].includes(view.phase)&&!confirm('Leave this duel? Your rival will win.'))return;try{if(mode==='online')await send('leave');}catch{}mode=null;match=null;view=null;room=null;history.replaceState(null,'',location.pathname);$('game').hidden=true;$('home').hidden=false;savedUI();};
$('pause').onclick=()=>{if(mode!=='practice')return;if(pausedAt){const delay=Date.now()-pausedAt;match.deadline+=delay;if(match.playAt)match.playAt+=delay;pausedAt=0;$('pause').textContent='Pause';applyView(project(match,'local'));}else{pausedAt=Date.now();$('pause').textContent='Resume';}};
$('help').onclick=()=>$('help-dialog').showModal();for(const id of ['close-help','got-it'])$(id).onclick=()=>{$('help-dialog').close();write('sparkheist.learned','1');};
$('sound').onclick=()=>{sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',sound);if(sound)beep();};
$('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText($('invite').value);$('copy-status').textContent='Copied. Send it to your friend.';}catch{$('invite').focus();$('invite').select();$('copy-status').textContent='Select and copy the link above.';}};
$('feedback').onclick=()=>{const data={game:'Spark Heist',version:VERSION,date:new Date().toISOString(),mode,round:view?.round,score:view?.score,history:view?.history,notes:'What was fun? What felt confusing? What invention would you like to make?'};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download='spark-heist-feedback.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Feedback notes saved. Add your thoughts and share them with the owner.');};
window.addEventListener('online',()=>{checkProfile();poll();});
window.addEventListener('storage',e=>{if(['evonline.session','tenggames.profileId'].includes(e.key)){mode=null;match=null;view=null;location.href='/account/?next='+encodeURIComponent('/spark-heist/');}});
catalogue();drawPreview();renderTeam();savedUI();checkProfile();loadArt();requestAnimationFrame(render);
function followInvite(){const invite=new URLSearchParams(location.hash.slice(1)).get('duel');if(invite&&/^[a-f0-9]{32}$/.test(invite)&&invite!==room)joinFriend(invite);}
window.addEventListener('hashchange',followInvite);followInvite();
if('serviceWorker' in navigator&&!localHost)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
