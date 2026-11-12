import {interpretPrompt, FALLBACK} from './policy.js';
import {createMatch, step, setPolicy, setIntent, publicBot, DT, WIDTH, HEIGHT} from './engine.js';
import {expired} from './timeout.js';
import {MODES,gameTokens} from './intent-contract.js';
import {TACTIC_ART} from './tactic-art.js';
const $=id=>document.getElementById(id);
const canvas=$('arena'),ctx=canvas.getContext('2d');
const API_BASE=typeof window.PROMPT_BOTS_API_BASE==='string'?window.PROMPT_BOTS_API_BASE.replace(/\/$/,''):'';
let intents=[null,null], match, worker, request=0, pending=null, accumulator=0, last=0, lastPlan=0;
let remoteMatchId=null, remaining=[1000,1000], epoch=0, promptSeq=[0,0];
const tacticArt={};
for(const [kind,path] of Object.entries(TACTIC_ART)){
  const art=new Image();art.src=`./${path}`;tacticArt[kind]=art;
}
const colors=['#ed776a','#7fbeeb'];
function showBudget(){for(let i=0;i<2;i++)$(`budget${i}`).textContent=`${remaining[i].toLocaleString()} game tokens`;}
function showIntent(i,v,source,feedback=''){
  const words=[v.aggression>.7?'aggressive':v.aggression<.45?'cautious':'balanced',v.distance>.65?'long range':v.distance<.35?'close range':'mid range',v.mobility>.7?'high mobility':'steady movement',v.defense>.65?'defensive':'standard defense',v.cooling>.65?'heat conscious':'standard cooling',`aim ${v.aim}`,`${v.preferredWeapon??'adaptive weapon'} + ${v.preferredUtility??'adaptive utility'}`];
  $(`interpret${i}`).textContent=`${source}: `+words.join(' · ');
  $(`feedback${i}`).textContent=feedback;
}
async function post(path,data,timeoutMs=6500){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const headers={'Content-Type':'application/json'};const token=localStorage.getItem('evonline.session');if(token)headers.Authorization=`Bearer ${token}`;const response=await fetch(API_BASE+'/'+path,{method:'POST',headers,body:JSON.stringify(data),signal:controller.signal});const body=await response.json();if(!response.ok)throw Error(body.error??'Server unavailable');return body;}finally{clearTimeout(timer);}}
function updatePrompt(i,send=true) {
  const result=interpretPrompt($(`prompt${i}`).value);
  intents[i]=result.intent;
  if (match) setIntent(match,i,result.intent);
  showIntent(i,result.intent,'Rule fallback',result.feedback.join(' '));
  $(`count${i}`).textContent=gameTokens($(`prompt${i}`).value)+' prompt tokens';
  if(!send||!remoteMatchId||match.phase!=='running'||($('mode').value==='solo'&&i===1))return;
  const id=remoteMatchId,serial=++promptSeq[i],current=epoch;
  $(`feedback${i}`).textContent='Checking AI tactics…';
  post('api/intent',{matchId:id,player:i,prompt:$(`prompt${i}`).value},14000).then(answer=>{
    if(current!==epoch||serial!==promptSeq[i])return;
    if(Number.isInteger(answer.remaining)){remaining[i]=answer.remaining;showBudget();}
    if(answer.source==='ai'&&answer.intent){intents[i]=answer.intent;setIntent(match,i,answer.intent);showIntent(i,answer.intent,'AI',`Spent ${answer.used} game tokens. Rules and module limits still apply.`);}
    else showIntent(i,result.intent,'Rule fallback',answer.reason??'AI unavailable');
  }).catch(error=>{if(current===epoch&&serial===promptSeq[i])showIntent(i,result.intent,'Rule fallback',error.message);});
}
function reset() {
  epoch++;remoteMatchId=null;promptSeq=[0,0];
  remaining=[MODES[$('budgetMode').value].tokens,MODES[$('budgetMode').value].tokens];showBudget();
  updatePrompt(0,false);updatePrompt(1,false);
  match=createMatch(intents,12345);
  accumulator=0;pending=null;lastPlan=0;
  $('start').textContent='Start match';$('pause').disabled=true;$('pause').textContent='Pause';$('status').textContent='Ready to fight';
  render();
}
async function start(){reset();match.phase='running';$('start').textContent='Restart';$('pause').disabled=false;$('status').textContent='Fight in progress · connecting to AI';const current=epoch;try{const result=await post('api/match',{mode:$('budgetMode').value});if(current!==epoch)return;remoteMatchId=result.matchId;remaining=result.budgets;showBudget();$('status').textContent=result.aiAvailable?'Fight in progress · AI online':'Fight in progress · rule fallback';if(result.aiAvailable){updatePrompt(0);if($('mode').value!=='solo')updatePrompt(1);}}catch{if(current===epoch)$('status').textContent='Fight in progress · rule fallback';}}
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
  for(const e of match.effects){ctx.strokeStyle=e.hit?(e.kind==='beam'?'#bfffe8':'#ffe0a1'):'#7a8e92';ctx.lineWidth=e.kind==='beam'?6:3;ctx.globalAlpha=Math.max(.2,e.life/.17);ctx.beginPath();ctx.moveTo(e.x1,e.y1);ctx.lineTo(e.x2,e.y2);ctx.stroke();if(tacticArt[e.kind]?.complete){ctx.save();ctx.translate(e.x1+(e.x2-e.x1)*.65,e.y1+(e.y2-e.y1)*.65);ctx.rotate(Math.atan2(e.y2-e.y1,e.x2-e.x1)+(e.kind==='beam'?Math.PI/4:0));ctx.drawImage(tacticArt[e.kind],-34,-34,68,68);ctx.restore();}ctx.globalAlpha=1;}
  match.bots.forEach(robot);
  if(match.phase==='ready'||match.phase==='paused'||match.phase==='finished'){ctx.fillStyle='#071518b9';ctx.fillRect(270,194,360,92);ctx.fillStyle='#f7dfac';ctx.textAlign='center';ctx.font='bold 29px Segoe UI';ctx.fillText(match.phase==='ready'?'READY TO DEPLOY':match.phase==='paused'?'MATCH PAUSED':match.winner===null?'DRAW':`BOT ${match.winner+1} WINS`,450,249);}
  $('timer').textContent=new Date(Math.max(0,120-match.tick*DT)*1000).toISOString().slice(14,19);
  match.bots.forEach((b,i)=>{const div=$(`meters${i}`);div.innerHTML=[['HP',b.hp,100,colors[i]],['ENERGY',b.energy,100,'#86d7ac'],['HEAT',b.heat,100,'#f2b665']].map(([name,v,max,color])=>`<div class="meter-title"><span>${name}</span><span>${Math.ceil(v)}</span></div><div class="bar"><i style="width:${Math.max(0,v/max*100)}%;background:${color}"></i></div>`).join('')+`<div class="meter-title"><span>LEGS ${Math.ceil(b.legs)} · GUN ${Math.ceil(b.gun)}</span><span>MOD ${Math.ceil(b.retrofit)}s</span></div>`;$(`load${i}`).textContent=`${b.weapon.toUpperCase()} / ${b.utility.toUpperCase()}`;});
  const eventText=match.events[0]??'Awaiting deployment.';if($('events').textContent!==eventText)$('events').textContent=eventText;
}
$('start').onclick=start;$('pause').onclick=pause;$('reset').onclick=reset;
for(let i=0;i<2;i++){$(`apply${i}`).onclick=()=>updatePrompt(i);$(`prompt${i}`).oninput=()=>{$(`count${i}`).textContent=gameTokens($(`prompt${i}`).value)+' prompt tokens';};}
$('mode').onchange=()=>{const solo=$('mode').value==='solo';$('prompt1').disabled=solo;$('apply1').disabled=solo;$('player2').textContent=solo?'SPARRING BOT':'PLAYER TWO';if(solo)$('prompt1').value='Adapt to the opponent, dodge, cool and defend.';else $('prompt1').value='Keep distance, dodge, use a beam and cooler. Target the weapon.';reset();};
$('budgetMode').onchange=reset;
reset();requestAnimationFrame(frame);
