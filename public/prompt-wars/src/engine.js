import {FALLBACK, validatePolicy} from './policy.js';
import {validateIntent} from './intent-contract.js';
export const WIDTH = 900, HEIGHT = 480, DT = 1/30;
const cap = (v,a,b) => Math.max(a,Math.min(b,v));
const specs = {
  bolt:{damage:4, energy:7, heat:11, cooldown:.52, range:340},
  scatter:{damage:8.5, energy:10, heat:14, cooldown:.62, range:205},
  beam:{damage:1.95, energy:5.5, heat:9, cooldown:.24, range:290}
};
function robot(id, intent) {return {id,x:id?710:190,y:240,hp:100,energy:100,heat:0,weapon:'bolt',utility:'shield',chassis:'balanced',creationCooldown:0,pendingCreation:intent?.creation??'none',cooldown:0,retrofit:0,shield:0,legs:100,gun:100,intent,policy:FALLBACK,shots:0,mods:0};}
export function createMatch(intents, seed=1) {
  return {seed:seed>>>0 || 1,tick:0,phase:'ready',bots:[robot(0,intents[0]),robot(1,intents[1])],fields:[],effects:[],winner:null,events:[]};
}
function rand(m) {m.seed = (Math.imul(m.seed,1664525)+1013904223)>>>0; return m.seed/4294967296;}
export function publicBot(b) {return {id:b.id,x:b.x,y:b.y,hp:b.hp,energy:b.energy,heat:b.heat,weapon:b.weapon,utility:b.utility,chassis:b.chassis,legs:b.legs,gun:b.gun};}
export function setPolicy(m,id,input) {if (id!==0 && id!==1) return false; const p=validatePolicy(input); if (!p) return false; m.bots[id].policy=p; return true;}
export function setIntent(m,id,intent) {if (id!==0 && id!==1) return false;const legal=validateIntent({...intent,preferredWeapon:intent?.preferredWeapon??'auto',preferredUtility:intent?.preferredUtility??'auto'});if(!legal)return false;m.bots[id].intent=legal;m.bots[id].pendingCreation=legal.creation??'none';return true;}
function log(m,text) {m.events.unshift(text); m.events.length=Math.min(m.events.length,5);}
export function step(m) {
  if (m.phase!=='running') return m;
  m.tick++;
  m.fields=m.fields.filter(f=>(f.life-=DT)>0);
  const old=m.bots.map(b=>({x:b.x,y:b.y}));
  // Resolve both players' creations before terrain affects either seat.
  for(const b of m.bots){
    b.creationCooldown=Math.max(0,b.creationCooldown-DT);
    const kind=b.pendingCreation;b.pendingCreation='none';
    if(kind==='none')continue;
    if(b.creationCooldown===0&&b.energy>=30&&m.fields.filter(f=>f.owner===b.id).length<2){const other=m.bots[1-b.id];b.energy-=30;b.heat=cap(b.heat+10,0,100);b.creationCooldown=8;m.fields.push({kind,owner:b.id,x:cap(kind==='repair'?b.x:(b.x+other.x)/2,90,WIDTH-90),y:cap(kind==='repair'?b.y:(b.y+other.y)/2+(b.id?35:-35),90,HEIGHT-90),radius:kind==='wall'?55:85,life:12});log(m,`Bot ${b.id+1} created ${kind} — affects both sides`);}
    else log(m,`Bot ${b.id+1} creation needs 30 energy, a free field slot and cooldown`);
  }
  for (const b of m.bots) {
    b.cooldown=Math.max(0,b.cooldown-DT); b.retrofit=Math.max(0,b.retrofit-DT);
    b.heat=cap(b.heat-(b.utility==='cooler'?29:17)*DT,0,100);
    b.energy=cap(b.energy+(b.utility==='cooler'?19:16)*DT,0,100);
    if (b.heat>=95) b.cooldown=Math.max(b.cooldown,.3);
    const p=b.policy;
    const chassis=b.intent.chassis??'balanced';
    if (b.retrofit===0 && b.energy>=25 && (b.weapon!==p.weapon || b.utility!==p.utility || b.chassis!==chassis)) {
      b.energy-=25; b.heat=cap(b.heat+7,0,100); b.retrofit=5;
      b.weapon=p.weapon; b.utility=p.utility;b.chassis=chassis; b.mods++; log(m,`Bot ${b.id+1} fitted ${b.chassis} body + ${b.weapon} + ${b.utility}`);
    }
    const other=m.bots[1-b.id];
    let terrainSpeed=1;
    for(const f of m.fields)if(Math.hypot(b.x-f.x,b.y-f.y)<f.radius){if(f.kind==='ice')terrainSpeed=.45;if(f.kind==='fire'){b.hp=cap(b.hp-5*DT,0,100);b.heat=cap(b.heat+12*DT,0,100);}if(f.kind==='repair')b.hp=cap(b.hp+4.5*DT,0,100);}
    const dx=old[1-b.id].x-old[b.id].x, dy=old[1-b.id].y-old[b.id].y;
    const dist=Math.max(1,Math.hypot(dx,dy));
    const speed=(b.utility==='booster'?160:135)*(b.legs<50?.72:1)*(b.chassis==='light'?1.2:b.chassis==='heavy'?.8:1)*terrainSpeed;
    const side=b.id===0?1:-1;
    const vx=(dx/dist*p.move - dy/dist*p.strafe*side*.72)*speed;
    const vy=(dy/dist*p.move + dx/dist*p.strafe*side*.72)*speed;
    b.x=cap(b.x+vx*DT,26,WIDTH-26); b.y=cap(b.y+vy*DT,35,HEIGHT-28);
  }
  const [a,b]=m.bots; const sep=Math.hypot(a.x-b.x,a.y-b.y);
  if (sep<48) {const nx=(b.x-a.x)/(sep||1),ny=(b.y-a.y)/(sep||1), push=(48-sep)/2; a.x=cap(a.x-nx*push,26,WIDTH-26);b.x=cap(b.x+nx*push,26,WIDTH-26);a.y=cap(a.y-ny*push,35,HEIGHT-28);b.y=cap(b.y+ny*push,35,HEIGHT-28);}
  const attacks=[];
  for (const shooter of m.bots) {
    const target=m.bots[1-shooter.id], p=shooter.policy, spec=specs[shooter.weapon];
    const range=Math.hypot(shooter.x-target.x,shooter.y-target.y);
    if (!p.fire || shooter.cooldown>0 || shooter.energy<spec.energy || shooter.heat+spec.heat>100 || range>spec.range || shooter.hp<=0) continue;
    shooter.energy-=spec.energy;shooter.heat+=spec.heat;shooter.cooldown=spec.cooldown*(shooter.gun<50?1.35:1);shooter.shots++;
    // Seeded spread gives reproducible misses; near scatter is stronger, shield weakens beam less.
    const accuracy=cap((shooter.weapon==='scatter'?.86:.93)-range/spec.range*(shooter.weapon==='scatter'?.35:.22),.35,.95);
    const hit=rand(m)<accuracy;
    const cover=m.fields.some(f=>f.kind==='wall'&&distanceToSegment(f,shooter,target)<f.radius);
    attacks.push({shooter,target,damage:hit?spec.damage*(cover?.35:1):0,aim:p.aim,weapon:shooter.weapon,hit});
    m.effects.push({x1:shooter.x,y1:shooter.y,x2:target.x,y2:target.y,kind:shooter.weapon,hit,life:.17});
  }
  // Apply simultaneous attacks so seat order cannot suppress a valid same-tick shot.
  for (const hit of attacks) {
    if (!hit.damage) continue;
    const t=hit.target;
    let damage=hit.damage*(t.chassis==='heavy'?.85:t.chassis==='light'?1.15:1);
    if (t.utility==='shield' && t.energy>=5 && t.heat<93) {damage*=hit.weapon==='beam'?.9:.78;t.energy-=5;t.heat=cap(t.heat+3,0,100);t.shield=.18;}
    t.hp=cap(t.hp-damage,0,100);
    if (hit.aim==='legs') t.legs=cap(t.legs-damage*.55,0,100);
    if (hit.aim==='weapon') t.gun=cap(t.gun-damage*.55,0,100);
  }
  m.effects=m.effects.filter(e=>(e.life-=DT)>0);
  for(const bot of m.bots) bot.shield=Math.max(0,bot.shield-DT);
  if (a.hp<=0 || b.hp<=0 || m.tick>=30*120) {
    m.phase='finished';m.winner=a.hp===b.hp?null:a.hp>b.hp?0:1;
    log(m,m.winner===null?'Draw':`Bot ${m.winner+1} wins`);
  }
  return m;
}
function distanceToSegment(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=cap(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function digest(m) {return JSON.stringify({tick:m.tick,seed:m.seed,phase:m.phase,winner:m.winner,fields:m.fields,bots:m.bots.map(b=>({x:+b.x.toFixed(4),y:+b.y.toFixed(4),hp:+b.hp.toFixed(4),energy:+b.energy.toFixed(4),heat:+b.heat.toFixed(4),weapon:b.weapon,utility:b.utility,chassis:b.chassis,shots:b.shots,mods:b.mods,legs:b.legs,gun:b.gun}))});}
