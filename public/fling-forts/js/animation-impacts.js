import {UNIT, GEOM, FORT, dir, mx, guarded, kingPos, kingR} from './sim.js';

// Read the structure actually in front of a melee siege troop. Chiefs now share
// the siege target priority, but their bodies should not shed masonry fragments.
export function meleeStructureContact(u,s) {
  const spec=UNIT[u.kind];if(!spec?.siege||spec.range)return false;
  const foe=1-u.owner,d=dir(u.owner);
  let gap=(mx(foe,FORT.frontX)-u.x)*d;
  for(const b of s.buildings){
    if(b.owner!==foe||b.dead||b.kind==='shield'||!GEOM[b.kind])continue;
    const edge=(b.x-u.x)*d-GEOM[b.kind].w/2;
    if(edge>-40)gap=Math.min(gap,edge);
  }
  if(guarded(s,foe)){
    const chiefGap=(kingPos(foe,s).x-u.x)*d-kingR(foe,s);
    if(chiefGap>-60&&chiefGap<gap)return false;
  }
  return gap<spec.r+2;
}

// Cache this on the visual bolt while its pending hit still exists. Matching by
// shooter and arrival time distinguishes a previous shot from the next volley.
export function boltStructureContact(f,s) {
  if(!f.fly)return false;
  const h=s.hits.find(h=>h.by?.id===f.by&&h.owner===f.owner&&Math.abs(h.t+f.t-f.fly)<.05);
  return h?.tkind==='bld'||h?.tkind==='fort';
}

export function drawMeleeStructureChips(g,u,s,x,y,q,face,debris) {
  if(meleeStructureContact(u,s))debris(g,x,y,q,6,u.id,{size:7,away:-face,speed:.42,set:[0,1,4]});
}
