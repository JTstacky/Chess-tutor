import {compile,validateTeam} from './catalog.js';
export const W=1000,H=560,DT=.05,HALF_TICKS=160;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=n=>Math.sign(n)*Math.round(Math.abs(n)*1000+1e-8)/1000;
const roundX=n=>500+round(n-500);
const dist=(a,b)=>round(Math.hypot(a.x-b.x,a.y-b.y));
export function createRound(teams,seed=1,map=0){
  const units=[];
  teams.forEach((team,seat)=>validateTeam(team).forEach((r,slot)=>{
    const spec=compile(r),device=spec.speed===0;
    units.push({id:seat*3+slot,seat,slot,...r,x:seat?W-(device?355:220):(device?355:220),y:140+r.lane*140,hp:spec.hp,maxHp:spec.hp,carrying:null,claim:0,cooldown:.2+slot*.13,boost:0,stun:0,flash:0,knocked:false});
  }));
  return {seed:seed>>>0,tick:0,map:map%2,units,sparks:[0,1,2].map(i=>({id:i,x:500,y:140+i*140,carrier:null,banked:null,lock:0})),banked:[0,0],events:[],effects:[],stats:{hits:0,pushes:0,pickups:0,banks:0,knockouts:0,meaningfulTicks:0},winner:null};
}
function event(s,type,u,target){s.events.push({tick:s.tick,type,seat:u?.seat??null,family:u?.family??null,target:target?.family??null});if(s.events.length>100)s.events.shift();}
function drop(s,u){if(u.carrying===null)return;const p=s.sparks[u.carrying];p.carrier=null;p.x=u.x;p.y=u.y;p.lock=10;u.carrying=null;}
function targetFor(s,u,spec){
  const alive=s.units.filter(v=>!v.knocked),enemy=alive.filter(v=>v.seat!==u.seat);
  if(u.carrying!==null)return {x:u.seat?945:55,y:u.y};
  if(u.job==='escort'){
    const carriers=alive.filter(v=>v.seat===u.seat&&v.carrying!==null);
    if(carriers.length){const c=carriers.sort((a,b)=>dist(u,a)-dist(u,b))[0];return {x:c.x+(u.seat?-1:1)*50,y:c.y+35};}
  }
  if(u.job==='intercept'){
    const carrier=enemy.filter(v=>v.carrying!==null).sort((a,b)=>dist(u,a)-dist(u,b))[0];
    if(carrier)return carrier;
    if(s.tick<70&&enemy.length)return enemy.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
  }
  const loose=s.sparks.filter(p=>p.carrier===null&&p.banked===null);
  if(loose.length)return loose.slice().sort((a,b)=>{
    const allies=alive.filter(v=>v.seat===u.seat&&v.id!==u.id&&v.carrying===null&&compile(v).speed>0);
    const score=p=>dist(u,p)+allies.filter(v=>dist(v,p)<dist(u,p)-10).length*175;
    return score(a)-score(b)||a.id-b.id;
  })[0];
  return enemy.filter(v=>v.carrying!==null).sort((a,b)=>dist(u,a)-dist(u,b))[0]||{x:500,y:140+u.lane*140};
}
export function command(s,seat,input){
  if(!input||!Number.isInteger(input.slot)||input.slot<0||input.slot>2||!['fetch','intercept','escort'].includes(input.job))throw Error('Choose a legal command.');
  const u=s.units.find(v=>v.seat===seat&&v.slot===input.slot);
  if(u&&!u.knocked){u.job=input.job;u.boost=Math.max(u.boost,35);u.flash=8;event(s,'command',u);}
}
export function step(s){
  s.tick++;s.effects=s.effects.filter(e=>--e.life>0);
  for(const p of s.sparks)if(p.lock>0)p.lock--;
  const alive=s.units.filter(u=>!u.knocked),specs=new Map(alive.map(u=>[u.id,compile(u)]));
  const before=alive.map(u=>({...u}));
  const decisions={...s,units:s.units.map(u=>({...u}))};
  let meaningful=false;
  for(const u of alive){
    const f=specs.get(u.id);u.cooldown-=DT;u.boost=Math.max(0,u.boost-1);u.stun=Math.max(0,u.stun-1);u.flash=Math.max(0,u.flash-1);
    if(!f.speed||u.stun)continue;
    const old=before.find(v=>v.id===u.id),target=targetFor(decisions,old,f),d=dist(old,target);if(d<3)continue;
    let speed=f.speed*(u.carrying!==null?.62:1)*(u.boost?1.45:1);
    if(s.map===1&&!['float','glow'].includes(f.ability)&&Math.abs(u.x-500)>65&&Math.abs(u.x-500)<135&&u.y>215&&u.y<345)speed*=.55;
    if(before.some(v=>v.seat!==u.seat&&v.family==='cloud'&&dist(v,old)<130))speed*=.8;
    if(before.some(v=>v.seat!==u.seat&&dist(v,old)<66&&(v.job==='intercept'||u.job==='intercept')))speed*=f.ability==='feint'?.8:.35;
    u.x=roundX(clamp(u.x+(target.x-u.x)/d*Math.min(d,speed*DT),40,960));
    u.y=round(clamp(u.y+(target.y-u.y)/d*Math.min(d,speed*DT),55,505));meaningful=true;
  }
  const damage=new Map(),pushes=[],magnetMoves=new Map();
  for(const u of alive){
    const f=specs.get(u.id);
    if(f.ability==='rain')for(const v of alive)if(v.seat===u.seat&&dist(u,v)<130)v.hp=Math.min(v.maxHp,v.hp+.08);
    if(f.ability==='spring'&&u.cooldown<=0){
      const users=alive.filter(v=>v.id!==u.id&&dist(u,v)<125&&specs.get(v.id).speed>0);
      if(users.length){for(const v of users)v.boost=Math.max(v.boost,35);u.cooldown=2;s.effects.push({kind:'spring',x:u.x,y:u.y,r:125,life:12});event(s,'bounce',u);meaningful=true;}
    }
    if(f.ability==='magnet'){
      for(const p of s.sparks)if(p.carrier===null&&p.banked===null&&dist(u,p)<200&&dist(u,p)>30){const d=dist(u,p),m=magnetMoves.get(p.id)||{x:0,y:0};m.x+=(u.x-p.x)/d*1.2;m.y+=(u.y-p.y)/d*1.2;magnetMoves.set(p.id,m);}
    }
    if(u.cooldown>0)continue;
    const enemy=before.filter(v=>v.seat!==u.seat&&dist(u,v)<=f.range).sort((a,b)=>(b.carrying!==null)-(a.carrying!==null)||dist(u,a)-dist(u,b))[0];
    if(!enemy)continue;
    const v=alive.find(v=>v.id===enemy.id),vf=specs.get(v.id);
    let hit=f.damage*1.8;
    if(vf.ability==='armor')hit*=.72;
    if(alive.some(c=>c.seat===v.seat&&c.family==='crab'&&dist(c,v)<135))hit*=.55;
    if(vf.ability==='feint'&&(s.tick+v.slot*3)%4===0)hit*=.3;
    damage.set(v.id,(damage.get(v.id)||0)+hit);
    if(f.ability==='gust'&&vf.speed>0)pushes.push({u,v,kind:'gust'});
    if(f.ability==='ram'&&vf.speed>0)pushes.push({u,v,kind:'ram'});
    if(f.ability==='magnet'&&vf.metal&&vf.speed>0)pushes.push({u,v,kind:'pull'});
    u.cooldown=f.ability==='seed'?1.1:f.ability==='gust'?2.7:1.2;
    s.effects.push({kind:f.ability,x:u.x,y:u.y,tx:v.x,ty:v.y,seat:u.seat,life:8});s.stats.hits++;meaningful=true;
  }
  for(const [id,m] of magnetMoves){s.sparks[id].x=roundX(s.sparks[id].x+m.x);s.sparks[id].y=round(s.sparks[id].y+m.y);}
  const displacement=new Map();
  for(const {u,v,kind} of pushes){
    if(before.find(p=>p.id===v.id).stun>0)continue;
    const f=specs.get(v.id);let x=0,y=0;
    if(kind==='gust'){y=(v.y>=280?1:-1)*(f.light?90:65);}
    else if(kind==='ram'){x=(u.seat?-1:1)*38;y=(v.y>=u.y?1:-1)*25;}
    else {const d=Math.max(1,dist(u,v));x=(u.x-v.x)/d*38;y=(u.y-v.y)/d*38;}
    const change=displacement.get(v.id)||{x:0,y:0};change.x+=x;change.y+=y;displacement.set(v.id,change);s.stats.pushes++;event(s,kind,u,v);
  }
  for(const [id,change] of displacement){const v=alive.find(p=>p.id===id);v.x=roundX(clamp(v.x+change.x,40,960));v.y=round(clamp(v.y+change.y,55,505));v.stun=12;drop(s,v);}
  for(const u of alive){
    u.hp=round(Math.max(0,u.hp-(damage.get(u.id)||0)));
    if(damage.has(u.id))u.flash=5;
    if(u.hp<=0){drop(s,u);u.knocked=true;s.stats.knockouts++;event(s,'knockout',u);}
  }
  for(const u of alive){
    if(damage.has(u.id)||u.knocked)u.claim=0;
    else if(u.carrying===null&&s.sparks.some(p=>p.carrier===null&&p.banked===null&&dist(u,p)<34))u.claim=(u.claim||0)+1;
    else u.claim=0;
  }
  for(const p of s.sparks){
    if(p.banked!==null)continue;
    if(p.carrier!==null){const u=s.units.find(v=>v.id===p.carrier);p.x=u.x;p.y=u.y;
      if(!u.knocked&&((u.seat===0&&u.x<85)||(u.seat===1&&u.x>915))){p.banked=u.seat;p.carrier=null;u.carrying=null;s.banked[u.seat]++;s.stats.banks++;event(s,'bank',u);meaningful=true;}
    } else if(!p.lock){
      const candidates=s.units.filter(u=>!u.knocked&&u.carrying===null&&u.claim>=16&&compile(u).speed>0&&dist(u,p)<34).sort((a,b)=>dist(a,p)-dist(b,p));
      if(candidates.length&&!(candidates[1]&&candidates[0].seat!==candidates[1].seat&&Math.abs(dist(candidates[0],p)-dist(candidates[1],p))<.25)){
        const u=candidates[0];u.carrying=p.id;p.carrier=u.id;s.stats.pickups++;event(s,'pickup',u);meaningful=true;
      }
    }
  }
  if(meaningful)s.stats.meaningfulTicks++;
  if(s.tick>=HALF_TICKS*2)s.winner=s.banked[0]===s.banked[1]?null:s.banked[0]>s.banked[1]?0:1;
  return s;
}
export function resolveSegment(state,ticks=HALF_TICKS){
  const s=structuredClone(state),frames=[];
  for(let n=0;n<ticks;n++){step(s);if(n%2===1)frames.push(snapshot(s));}
  return {state:s,frames};
}
export function snapshot(s){return {tick:s.tick,map:s.map,units:s.units.map(u=>({...u})),sparks:s.sparks.map(p=>({...p})),banked:[...s.banked],effects:s.effects.map(e=>({...e}))};}
export function digest(s){return JSON.stringify({tick:s.tick,units:s.units,sparks:s.sparks,banked:s.banked,winner:s.winner});}
export function lesson(s){
  const key=[...s.events].reverse().find(e=>['gust','pull','bounce','bank','knockout'].includes(e.type));
  if(!key)return 'Try splitting your runners across different lanes next round.';
  return {gust:'A fan gust knocked a carrier off course. Rooted devices can hold their position.',pull:'A magnetic mushroom pulled a metal rival. A leafy runner can slip past.',bounce:'A spring gave nearby creatures a burst of speed. Both teams can use it!',bank:'A carrier brought a Spark home. An escort can help the next one get through.',knockout:'A creation was knocked out. A canopy crab can protect fragile runners.'}[key.type];
}
