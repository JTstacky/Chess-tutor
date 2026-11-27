// Cut-out animation of the original painted flight sheets. No new textures, filters,
// offscreen buffers, or generated geometry: the hull is held while blade regions sweep.
// Rectangles are normalized to the shared flight canvas, from visual inspection.
const REGIONS = Object.freeze({
  military_chopper:[[0,0,1,.32],[0,.32,.16,.37]],
  robots_drone:[[0,0,1,.32],[0,.76,1,.24]],
  robots_gunship:[[0,0,1,.30]],
  steampunk_gyro:[[0,0,1,.26]],
  pirates_sloop:[[0,0,1,.22]],
});
export const hasRotorRig = kind => Object.hasOwn(REGIONS,kind);
export function rotorPhase(now,seed=0) {
  const p=((now*18+seed*1.7)%6+6)%6,i=Math.floor(p);
  return {i,next:(i+1)%6,previous:(i+5)%6,mix:p-i};
}
export function paintRotorCraft(g,kind,now,seed,im,w,h,anchorY,spr) {
  const regions=REGIONS[kind];if(!regions)return false;
  const phase=rotorPhase(now,seed),x=-w/2,y=-h*anchorY;
  const cut=()=>{for(const [rx,ry,rw,rh] of regions)g.rect(x+rx*w,y+ry*h,rw*w,rh*h);};
  g.save();g.beginPath();g.rect(x-1,y-1,w+2,h+2);cut();g.clip('evenodd');
  // Keep the sloop's original alternating exhaust/porthole animation below the
  // rotor cut. Its body stays sharp while the blades use fractional exposures.
  const hull=kind==='pirates_sloop' ? spr(`f_${kind}_${Math.floor(now*8+seed)%2}`)||im : im;
  g.drawImage(hull,x,y,w,h);g.restore();
  g.save();g.beginPath();cut();g.clip();
  // Fractional blend prevents a hard blade-angle jump at 18 Hz; a faint previous
  // exposure reads as motion blur while leaving faces, guns and hull outlines sharp.
  const alpha=g.globalAlpha;
  for(const [frame,opacity] of [[phase.previous,.16],[phase.i,.84*(1-phase.mix)],[phase.next,.84*phase.mix]]) {
    const blade=spr(`f_${kind}_${frame}`)||im;
    g.globalAlpha=alpha*opacity;g.drawImage(blade,x,y,w,h);
  }
  g.restore();return true;
}
