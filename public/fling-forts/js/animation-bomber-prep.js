import {UNIT, RACES, GEOM, FORT, dir, mx, kingPos, kingR, guarded} from './sim.js';

export const BOMBER_PREP = Object.freeze({
  fantasy_sapper:'fuse', robots_bomb:'timer', undead_plague:'spill', steampunk_boiler:'steam',
});

// A visual warning about actual nearby ground contact, never a new fuse/damage
// timer. Ignore allies, flyers, shields and rubble just as a ground bomber does.
export function bomberApproach(u, s) {
  const flavour=BOMBER_PREP[u.kind], spec=UNIT[u.kind];
  if(!flavour || u.hp<=0 || u.spent || !['play','sudden'].includes(s.phase)) return null;
  const foe=1-u.owner,d=dir(u.owner); let gap=Infinity;
  for(const e of s.units){
    const es=UNIT[e.kind];
    if(e.owner===foe && e.hp>0 && es && !es.air) gap=Math.min(gap,Math.abs(e.x-u.x)-spec.r-es.r-4);
  }
  for(const b of s.buildings){
    if(b.owner!==foe || b.dead || b.kind==='shield' || !GEOM[b.kind])continue;
    const edge=(b.x-u.x)*d-GEOM[b.kind].w/2;
    if(edge>-40)gap=Math.min(gap,edge-spec.r-2);
  }
  if(guarded(s,foe)){
    const edge=(kingPos(foe,s).x-u.x)*d-kingR(foe,s);
    if(edge>-60)gap=Math.min(gap,edge-spec.r-2);
  }
  gap=Math.min(gap,(mx(foe,FORT.frontX)-u.x)*d-spec.r-2);
  const speed=spec.speed*(RACES[s.players[u.owner].race]?.mods.unitSpeed||1)*(u.slow>0?.5:1);
  const window=Math.max(24,speed*.7),q=Math.min(1,Math.max(0,1-gap/window));
  return q>0 ? {flavour,q,lean:(flavour==='steam'?-.06:.08)*q,sy:1-.06*q} : null;
}

export function prepareBomberFrame(u,s,frame,{spr,meta}) {
  const prep=bomberApproach(u,s); if(!prep)return frame;
  let next=frame;
  if(u.hurt<=0 && u.act<=0 && prep.q>.78){
    // Keep stepping during the warning; brace only for the final contact step.
    // The pre-punch pose avoids the unrelated fist strike.
    // Plague's original contact picture tips its own cauldron, so keep that art.
    const group=prep.flavour==='spill'&&prep.q>.7?`t_${u.kind}`:`a_${u.kind}`;
    const key=group+(group.startsWith('t_')?'_2':'_0'),m=meta?.[group];
    if(spr(key))next={key,k:m?.k||1,dy:m?.dy||0};
  }
  return {...next,prep:{...prep,lean:u.hurt>0?0:prep.lean,sy:u.hurt>0?1:prep.sy}};
}

export function drawBomberCue(g,frame,{x,y,h,face,now,seed},{sprite,trace}) {
  const p=frame.prep;if(!p)return;
  const pulse=.65+.35*Math.sin(now*(10+12*p.q)+seed),fade=p.q;
  const draw=(key,xx,yy,size,alpha,rot=0)=>sprite(g,key,x+face*xx*h,y+yy*h,size,{alpha,rot:rot*face,flip:face<0});
  if(p.flavour==='fuse'||p.flavour==='timer'){
    const timer=p.flavour==='timer';
    draw('fx_0',timer?-.18:-.28,.94,Math.min(12,h*.22)*( .7+.3*pulse),fade*pulse,now*2);
  }else if(p.flavour==='steam'){
    for(let i=0;i<2;i++){
      const t=(now*(1+2*p.q)+i*.5+seed*.17)%1;
      draw('fx_3',-.24-t*.08,.91+t*.23,Math.min(14,h*.22)*(.5+t*.5),fade*(1-t)*.65);
    }
  }else{
    for(let i=0;i<2;i++){
      const t=(now*2+i*.5+seed*.13)%1;
      draw('proj_b_2',.23+t*.10,.61-t*t*.35,Math.min(9,h*.13),fade*(1-t)*.8,t*.4);
    }
  }
  trace?.push(['bomber-prep',seed,p.flavour,p.q]);
}
