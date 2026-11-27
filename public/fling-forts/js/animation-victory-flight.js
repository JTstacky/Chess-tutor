// Keep a victory lap below the result banner. Use one envelope for the whole
// flight cycle, so a taller wing frame never moves the body down for one frame.
const envelopes = new WeakMap();
export function terminalTroopPose(u,s) {
  if(!s.ko||s.ko.loser<0||!['roundOver','over'].includes(s.phase))return u;
  // Combat timers stop at round end. Do not hold their muzzle flash/hit pose
  // for the entire result screen; the losing side keeps its existing sad lean.
  return {...u,act:0,hurt:0,slow:0};
}
export function flightEnvelope(kind, meta) {
  if (!meta) return {top:1, halfWidth:.75};
  let cache=envelopes.get(meta);if(!cache)envelopes.set(meta,cache=new Map());
  if(cache.has(kind))return cache.get(kind);
  let top=0,halfWidth=0;
  for(const prefix of ['f','f2','t','u2']) {
    const group=meta[`${prefix}_${kind}`];
    if(!group||group.off||prefix==='f2'&&['monsters_bats','monsters_gargoyle'].includes(kind))continue;
    const k=group.k||1,dy=group.dy||0;
    for(const f of (prefix==='t'||prefix==='u2'?group.frames?.slice(0,2):group.frames)||[]) {
      const [scale=1,,ry=0]=f.r||[];
      top=Math.max(top,dy+ry*k+k*scale);
      halfWidth=Math.max(halfWidth,k*scale*f.w/f.h/2);
    }
  }
  const result={top:top||1,halfWidth:halfWidth||.75};cache.set(kind,result);return result;
}

export function victoryFlightY(kind, altitude, height, dance, machine, lay, meta) {
  if(!lay)return altitude+dance.y*height;
  const topY=(lay.gy-(lay.safe?.t||0)-8)/lay.s,by=Math.min(400,topY-205);
  // Same banner bounds as drawHud: clock-height pill on phones, mid-sky tablet panel.
  const ceiling=by<400?topY-56:Math.min(386,by+20)-66;
  const envelope=flightEnvelope(kind,meta),bank=machine?.16:.28;
  const head=height*(envelope.top+Math.sin(bank)*envelope.halfWidth)+4;
  const base=Math.min(altitude,ceiling-head),room=Math.max(0,ceiling-head-base);
  return base+dance.y*height*Math.min(1,room/(height*.32));
}
