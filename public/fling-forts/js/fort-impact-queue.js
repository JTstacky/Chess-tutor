// Decorative fort dust only: nearby simultaneous impacts share a burst. The first
// impact stays immediate and a continuous volley cannot extend a burst's lifetime.
export function createFortImpactQueue({gap=75,radius=48,perFort=12,tracked=false}={}) {
  const sides=[[],[]];
  return {clear(){sides[0].length=sides[1].length=0},remove(effect){
    for(const active of sides){const i=active.findIndex(r=>r.effect===effect);if(i>=0)active.splice(i,1);}
  },add(side,x,y,now,big,make){
    const active=sides[side];
    // In the renderer, removal follows actual VFX lifetime (including pause/slow motion).
    // Standalone users retain timed expiry. Backward clocks never retain stale groups.
    for(let i=active.length-1;i>=0;i--)if(now<active[i].at||(!tracked&&now-active[i].at>=active[i].life))active.splice(i,1);
    let near=null,distance=Infinity;
    for(const r of active){const d=Math.hypot(r.x-x,r.y-y);if(r.big===!!big&&d<distance&&now-r.at<gap&&d<radius){near=r;distance=d;}}
    // A later heavy strike gets its own cue; never resize particles already in flight.
    if(near)return null;
    if(active.length>=perFort)return null;
    const effect=make();active.push({x,y,big:!!big,at:now,life:effect.dur*1000,effect});return effect;
  }};
}
export function trimDecorativeChips(effects,limit=70,onRemove=()=>{}) {
  for(let i=0;effects.length>limit&&i<effects.length;)if(effects[i].type==='chips')onRemove(effects.splice(i,1)[0]);else i++;
}
