import {interpretPrompt, FALLBACK} from './policy.js';
import {createMatch, step, setPolicy, setIntent, publicBot, DT, WIDTH, HEIGHT} from './engine.js';
import {expired} from './timeout.js';
import {MODES,gameTokens,validateIntent} from './intent-contract.js';
import {TACTIC_ART} from './tactic-art.js';
import {createLobby,canFight,sealPrompt} from './lobby.js';
const $=id=>document.getElementById(id);
const canvas=$('arena'),ctx=canvas.getContext('2d');
const API_BASE=typeof window.PROMPT_BOTS_API_BASE==='string'?window.PROMPT_BOTS_API_BASE.replace(/\/$/,''):'';
let intents=[null,null], match, worker, request=0, pending=null, accumulator=0, last=0, lastPlan=0;
let remoteMatchId=null, remaining=[1000,1000], epoch=0, promptSeq=[0,0];
let lobby,editor=0,connecting=null,aiOnline=false;
const tacticArt={};
for(const [kind,path] of Object.entries(TACTIC_ART)){
  const art=new Image();art.src=`./${path}`;tacticArt[kind]=art;
}
const colors=['#ed776a','#7fbeeb'];
function showBudget(){for(let i=0;i<2;i++)$(`budget${i}`).textContent=`${remaining[i].toLocaleString()} game tokens`;}
async function post(path,data,timeoutMs=6500){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const headers={'Content-Type':'application/json'};const token=localStorage.getItem('evonline.session');if(token)headers.Authorization=`Bearer ${token}`;const response=await fetch(API_BASE+'/'+path,{method:'POST',headers,body:JSON.stringify(data),signal:controller.signal});const body=await response.json();if(!response.ok)throw Error(body.error??'Server unavailable');return body;}finally{clearTimeout(timer);}}
function lobbyUI(){for(let i=0;i<2;i++){$('ready'+i).textContent=lobby.busy[i]?'Building invention…':lobby.ready[i]?'Prompt sealed · ready':'Waiting for a private prompt';$('apply'+i).disabled=lobby.busy[i]||(lobby.solo&&i===1);$('apply'+i).textContent=lobby.ready[i]?'New private invention':'Write private prompt';}$('start').disabled=!canFight(lobby)||match.phase!=='ready';}
function preview(){const p=$('privatePrompt').value,r=interpretPrompt(p);$('privateCount').textContent=gameTokens(p)+' prompt tokens · '+(lobby.ready[editor]?'retrofit':'opening limit '+MODES[$('budgetMode').value].opening);$('privatePreview').textContent='Rule preview: '+r.intent.chassis+' body, '+(r.intent.preferredWeapon??'adaptive weapon')+', '+(r.intent.preferredUtility??'adaptive module')+', '+r.intent.creation+' field. '+r.feedback.join(' ');}
function openEditor(i){editor=i;$('editorTitle').textContent='Player '+(i+1)+' · private invention';$('privatePrompt').value='';$('privateResult').textContent='Previous prompts are sealed and never shown here.';$('sendPrompt').disabled=false;$('sendPrompt').textContent=lobby.ready[i]?'Deploy invention':'Seal opening prompt';$('privateEditor').showModal();preview();$('privatePrompt').focus();}
function closeEditor(){if(lobby.busy[editor])return;$('privatePrompt').value='';$('privatePreview').textContent='';$('privateResult').textContent='';$('privateEditor').close();}
async function connect(){if(connecting)return connecting;const current=epoch;connecting=post('api/match',{mode:$('budgetMode').value}).then(r=>{if(current!==epoch)return;remoteMatchId=r.matchId;remaining=r.budgets;aiOnline=r.aiAvailable;showBudget();}).catch(()=>{if(current===epoch)aiOnline=false;}).finally(()=>{if(current===epoch)connecting=null;});return connecting;}
async function submitPrompt(){
 const i=editor,prompt=$('privatePrompt').value.trim(),current=epoch,opening=!lobby.ready[i];
 if(!prompt){$('privateResult').textContent='Invent something before sealing your prompt.';return;}
 if(opening&&gameTokens(prompt)>MODES[$('budgetMode').value].opening){$('privateResult').textContent='Shorten the opening prompt to the displayed limit.';return;}
 if(new TextEncoder().encode(prompt).length>3600){$('privateResult').textContent='Prompt is too large.';return;}
 lobby.busy[i]=true;lobbyUI();$('sendPrompt').disabled=true;$('privateResult').textContent='Building your invention. The opening fight waits for both players.';
 const fallback=interpretPrompt(prompt);let intent=fallback.intent,source='Rule fallback',message=fallback.feedback.join(' ');
 try{if(!remoteMatchId)await connect();if(current!==epoch)return;
  if(aiOnline&&remoteMatchId){const a=await post('api/intent',{matchId:remoteMatchId,player:i,prompt},16000);if(current!==epoch)return;if(Number.isInteger(a.remaining)){remaining[i]=a.remaining;showBudget();}const legal=a.intent?validateIntent({...a.intent,preferredWeapon:a.intent.preferredWeapon??'auto',preferredUtility:a.intent.preferredUtility??'auto'}):null;if(a.source==='ai'&&legal){intent=legal;source='AI';message=(intent.explanation??'Legal invention built.')+' Spent '+a.used+' game tokens.';}else message=(a.reason??'AI unavailable')+'. Rule interpretation used. '+message;}
  else message='Desktop AI offline. Rule interpretation used. '+message;
 }catch{message='AI connection failed. Rule interpretation used. '+message;}
 if(current!==epoch)return;intents[i]=intent;setIntent(match,i,intent);lobby.busy[i]=false;sealPrompt(lobby,i);lobbyUI();
 $('privatePrompt').value='';$('privatePreview').textContent='';$('privateResult').textContent=source+': '+(intent.chassis??'balanced')+' body · '+(intent.preferredWeapon??'adaptive weapon')+' · '+(intent.preferredUtility??'adaptive module')+' · '+(intent.creation??'none')+' field. '+message;
 $('sendPrompt').disabled=true;$('status').textContent=match.phase==='running'?'Fight in progress · invention deployed':canFight(lobby)?'Both prompts sealed · start the fight':'Opening prompt sealed · waiting for opponent';
}
function reset(){
 epoch++;remoteMatchId=null;promptSeq=[0,0];remaining=[MODES[$('budgetMode').value].tokens,MODES[$('budgetMode').value].tokens];showBudget();
 lobby=createLobby($('mode').value==='solo');intents=[interpretPrompt('').intent,interpretPrompt('dodge cool defend').intent];aiOnline=false;connecting=null;
 match=createMatch(intents,12345);accumulator=0;pending=null;lastPlan=0;worker?.terminate();worker=null;
 $('privateEditor').close();$('privatePrompt').value='';$('privateResult').textContent='';$('privatePreview').textContent='';
 $('start').textContent='Start fight';$('pause').disabled=true;$('pause').textContent='Pause';$('status').textContent='Write and seal both private opening prompts';lobbyUI();render();
}
function start(){if(match.phase!=='ready'||!canFight(lobby))return;match.phase='running';$('pause').disabled=false;$('start').disabled=true;$('status').textContent=aiOnline?'Fight in progress · AI online':'Fight in progress · rule fallback';}
function pause(){if(match.phase==='running'){match.phase='paused';$('pause').textContent='Resume';$('status').textContent='Paused';}else if(match.phase==='paused'){match.phase='running';$('pause').textContent='Pause';$('status').textContent='Fight in progress';}}
function spawnWorker(){try {worker=new Worker('./src/planner-worker.js',{type:'module'});worker.onmessage=e=>{if(!pending||e.data?.id!==pending.id)return;const ps=e.data.policies;if(Array.isArray(ps)&&ps.length===2)ps.forEach((p,i)=>setPolicy(match,i,p));pending=null;};worker.onerror=()=>{worker.terminate();worker=null;pending=null;match.bots.forEach((_,i)=>setPolicy(match,i,FALLBACK));};}catch{worker=null;}}
function requestPolicies(now){
  if(expired(pending,now)){worker?.terminate();worker=null;pending=null;match.bots.forEach((_,i)=>setPolicy(match,i,FALLBACK));$('status').textContent='Planner timed out; safe fallback active';}
  if(!worker)spawnWorker();
  if(!worker||pending||now-lastPlan<220)return;
  lastPlan=now;const id=++request;
  pending={id,at:now};
  worker.postMessage({id,intents,bots:match.bots.map(publicBot)});
}
function frame(now){const delta=Math.min((now-last)/1000,.1);last=now;if(match.phase==='running'){requestPolicies(now);accumulator+=delta;while(accumulator>=DT&&match.phase==='running'){step(match);accumulator-=DT;}if(match.phase==='finished'){$('pause').disabled=true;$('status').textContent=match.winner===null?'Draw!':`Bot ${match.winner+1} wins!`;}}render();requestAnimationFrame(frame);}
function robot(b){
  ctx.save();ctx.translate(b.x,b.y);const angle=Math.atan2(match.bots[1-b.id].y-b.y,match.bots[1-b.id].x-b.x);ctx.rotate(angle);
  ctx.scale(b.chassis==='heavy'?1.2:b.chassis==='light'?.8:1,b.chassis==='heavy'?1.15:b.chassis==='light'?.85:1);
  const c=colors[b.id];ctx.shadowColor=c;ctx.shadowBlur=16;ctx.fillStyle='#09191d';ctx.strokeStyle=c;ctx.lineWidth=4;
  ctx.fillRect(-22,-15,44,30);ctx.strokeRect(-22,-15,44,30);ctx.shadowBlur=0;
  ctx.fillStyle=c;ctx.fillRect(10,-8,18,16);ctx.fillStyle='#14242b';ctx.fillRect(-12,-10,14,20);
  ctx.strokeStyle='#a2c6c3';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-12,-20);ctx.lineTo(13,-20);ctx.moveTo(-12,20);ctx.lineTo(13,20);ctx.stroke();
  ctx.fillStyle='#f3d995';ctx.fillRect(22,-3,b.weapon==='beam'?16:b.weapon==='scatter'?11:13,6);
  if(b.utility==='shield'){ctx.strokeStyle='#b9f4d6';ctx.globalAlpha=b.shield?1:.38;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,31,-1.2,1.2);ctx.stroke();}
  if(b.utility==='booster'){ctx.fillStyle='#ffc279';ctx.fillRect(-32,-8,9,5);ctx.fillRect(-32,3,9,5);}
  if(b.utility==='cooler'){ctx.strokeStyle='#8fe5d7';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-18+i*7,-14);ctx.lineTo(-18+i*7,-23);ctx.stroke();}}
  if(tacticArt[b.utility]?.complete)ctx.drawImage(tacticArt[b.utility],-34,-38,25,25);
  ctx.restore();
  ctx.fillStyle='#0d1a1b';ctx.fillRect(b.x-24,b.y-39,48,5);ctx.fillStyle=c;ctx.fillRect(b.x-24,b.y-39,48*b.hp/100,5);
}
function render(){
  ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.fillStyle='#102328';ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.strokeStyle='#234249';ctx.lineWidth=1;for(let x=0;x<WIDTH;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,HEIGHT);ctx.stroke();}for(let y=0;y<HEIGHT;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(WIDTH,y);ctx.stroke();}
  ctx.strokeStyle='#467277';ctx.lineWidth=3;ctx.strokeRect(12,12,WIDTH-24,HEIGHT-24);ctx.setLineDash([10,12]);ctx.strokeStyle='#31555a';ctx.beginPath();ctx.moveTo(WIDTH/2,16);ctx.lineTo(WIDTH/2,HEIGHT-16);ctx.stroke();ctx.setLineDash([]);
  for(const f of match.fields){const c={wall:'#b8b2a3',ice:'#8de6ff',fire:'#ff9759',repair:'#9de8ac'}[f.kind];ctx.save();ctx.globalAlpha=Math.min(1,f.life);ctx.fillStyle=c+'30';ctx.strokeStyle=c;ctx.lineWidth=3;ctx.beginPath();if(f.kind==='wall')ctx.roundRect(f.x-f.radius,f.y-20,f.radius*2,40,7);else ctx.arc(f.x,f.y,f.radius,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=c;ctx.textAlign='center';ctx.font='bold 13px Segoe UI';ctx.fillText(f.kind.toUpperCase()+' '+Math.ceil(f.life)+'s',f.x,f.y+4);ctx.restore();}
  for(const e of match.effects){ctx.strokeStyle=e.hit?(e.kind==='beam'?'#bfffe8':'#ffe0a1'):'#7a8e92';ctx.lineWidth=e.kind==='beam'?6:3;ctx.globalAlpha=Math.max(.2,e.life/.17);ctx.beginPath();ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);ctx.stroke();if(tacticArt[e.kind]?.complete){ctx.save();ctx.translate(e.x1+(e.x2-e.x1)*.65,e.y1+(e.y2-e.y1)*.65);ctx.rotate(Math.atan2(e.y2-e.y1,e.x2-e.x1)+(e.kind==='beam'?Math.PI/4:0));ctx.drawImage(tacticArt[e.kind],-34,-34,68,68);ctx.restore();}ctx.globalAlpha=1;}
  match.bots.forEach(robot);
  if(match.phase==='ready'||match.phase==='paused'||match.phase==='finished'){ctx.fillStyle='#071518b9';ctx.fillRect(270,194,360,92);ctx.fillStyle='#f7dfac';ctx.textAlign='center';ctx.font='bold 29px Segoe UI';ctx.fillText(match.phase==='ready'?'READY TO DEPLOY':match.phase==='paused'?'MATCH PAUSED':match.winner===null?'DRAW':`BOT ${match.winner+1} WINS`,450,249);}
  $('timer').textContent=new Date(Math.max(0,120-match.tick*DT)*1000).toISOString().slice(14,19);
  match.bots.forEach((b,i)=>{const div=$(`meters${i}`);div.innerHTML=[['HP',b.hp,100,colors[i]],['ENERGY',b.energy,100,'#86d7ac'],['HEAT',b.heat,100,'#f2b665']].map(([name,v,max,color])=>`<div class="meter-title"><span>${name}</span><span>${Math.ceil(v)}</span></div><div class="bar"><i style="width:${Math.max(0,v/max*100)}%;background:${color}"></i></div>`).join('')+`<div class="meter-title"><span>LEGS ${Math.ceil(b.legs)} · GUN ${Math.ceil(b.gun)}</span><span>MOD ${Math.ceil(b.retrofit)}s · FIELD ${Math.ceil(b.creationCooldown)}s</span></div>`;$(`load${i}`).textContent=`${b.chassis.toUpperCase()} / ${b.weapon.toUpperCase()} / ${b.utility.toUpperCase()}`;});
  const eventText=match.events[0]??'Awaiting deployment.';if($('events').textContent!==eventText)$('events').textContent=eventText;
}
$('start').onclick=start;$('pause').onclick=pause;$('reset').onclick=reset;
for(let i=0;i<2;i++)$('apply'+i).onclick=()=>openEditor(i);
for(const button of document.querySelectorAll('[data-invention]'))button.onclick=()=>{$('privatePrompt').value=button.dataset.invention;preview();};
$('privatePrompt').oninput=preview;$('sendPrompt').onclick=submitPrompt;$('closeEditor').onclick=closeEditor;
$('privateEditor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
$('mode').onchange=()=>{$('player2').textContent=$('mode').value==='solo'?'SPARRING BOT':'PLAYER TWO';reset();};
$('budgetMode').onchange=reset;
reset();requestAnimationFrame(frame);
