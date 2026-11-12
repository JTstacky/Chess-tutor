import {FALLBACK, validatePolicy} from './policy.js';
export const WIDTH = 900, HEIGHT = 480, DT = 1/30;
const cap = (v,a,b) => Math.max(a,Math.min(b,v));
const specs = {
  bolt:{damage:4, energy:7, heat:11, cooldown:.52, range:340},
  scatter:{damage:8.5, energy:10, heat:14, cooldown:.62, range:205},
  beam:{damage:1.7, energy:6, heat:9, cooldown:.24, range:270}
};
function robot(id, intent) {return {id,x:id?710:190,y:240,hp:100,energy:100,heat:0,weapon:'bolt',utility:'shield',cooldown:0,retrofit:0,shield:0,legs:100,gun:100,intent,policy:FALLBACK,shots:0,mods:0};}
export function createMatch(intents, seed=1) {
  return {seed:seed>>>0 || 1,tick:0,phase:'ready',bots:[robot(0,intents[0]),robot(1,intents[1])],effects:[],winner:null,events:[]};
}
function rand(m) {m.seed = (Math.imul(m.seed,1664525)+1013904223)>>>0; return m.seed/4294967296;}
export function publicBot(b) {return {id:b.id,x:b.x,y:b.y,hp:b.hp,energy:b.energy,heat:b.heat,weapon:b.weapon,utility:b.utility,legs:b.legs,gun:b.gun,intent:b.intent};}
export function setPolicy(m,id,input) {if (id!==0 && id!==1) return false; const p=validatePolicy(input); if (!p) return false; m.bots[id].policy=p; return true;}
export function setIntent(m,id,intent) {if (id!==0 && id!==1 || !intent || typeof intent!=='object') return false; m.bots[id].intent=intent; return true;}
function log(m,text) {m.events.unshift(text); m.events.length=Math.min(m.events.length,5);}
export function step(m) {
  if (m.phase!=='running') return m;
  m.tick++;
  const old=m.bots.map(b=>({x:b.x,y:b.y}));
  for (const b of m.bots) {
    b.cooldown=Math.max(0,b.cooldown-DT); b.retrofit=Math.max(0,b.retrofit-DT);
    b.heat=cap(b.heat-(b.utility==='cooler'?29:17)*DT,0,100);
    b.energy=cap(b.energy+(b.utility==='cooler'?19:16)*DT,0,100);
    if (b.heat>=95) b.cooldown=Math.max(b.cooldown,.3);
    const p=b.policy;
    if (b.retrofit===0 && b.energy>=25 && (b.weapon!==p.weapon || b.utility!==p.utility)) {
      b.energy-=25; b.heat=cap(b.heat+7,0,100); b.retrofit=5;
      b.weapon=p.weapon; b.utility=p.utility; b.mods++; log(m,`Bot ${b.id+1} fitted ${b.weapon} + ${b.utility}`);
    }
    const other=m.bots[1-b.id];
    const dx=old[1-b.id].x-old[b.id].x, dy=old[1-b.id].y-old[b.id].y;
    const dist=Math.max(1,Math.hypot(dx,dy));
    const speed=(b.utility==='booster'?160:135)*(b.legs<50?.72:1);
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
    attacks.push({shooter,target,damage:hit?spec.damage:0,aim:p.aim,weapon:shooter.weapon,hit});
    m.effects.push({x1:shooter.x,y1:shooter.y,x2:target.x,y2:target.y,kind:shooter.weapon,hit,life:.17});
  }
  // Apply simultaneous attacks so seat order cannot suppress a valid same-tick shot.
  for (const hit of attacks) {
    if (!hit.damage) continue;
    const t=hit.target;
    let damage=hit.damage;
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
export function digest(m) {return JSON.stringify({tick:m.tick,seed:m.seed,phase:m.phase,winner:m.winner,bots:m.bots.map(b=>({x:+b.x.toFixed(4),y:+b.y.toFixed(4),hp:+b.hp.toFixed(4),energy:+b.energy.toFixed(4),heat:+b.heat.toFixed(4),weapon:b.weapon,utility:b.utility,shots:b.shots,mods:b.mods,legs:b.legs,gun:b.gun}))});}
