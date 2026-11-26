// Rendering only. The simulation owns targets, attack kinds and hit shapes.
// Snapshotting prevents a killed target or a return-home turn from dragging a live effect.
export function chiefAim(aim) {
  if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return null;
  return { ...aim, links: aim.links?.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({x:p.x,y:p.y})) };
}

export function drawChiefAim(g, race, tip, aim, t, now, scale, {spr, stamp, sprite}) {
  if (!aim || t < 0 || t >= 1) return;
  const fade = Math.min(1, (1-t)*3), dx=aim.x-tip.x, dy=aim.y-tip.y, angle=Math.atan2(-dy,dx);
  const image = (key,x,y,w,h,rot=0,alpha=fade) => { const im=spr(key); if(im) stamp(g,im,x,y,w,h??w*im.height/im.width,{rot,alpha}); };
  const impact = (point, size=18*scale, alpha=fade) => sprite(g,'fx_0',point.x,point.y-size/2,size,{alpha});
  const bolt = (a,b,width,colour,phase=0) => {
    const q=Math.min(1,Math.max(0,(t-phase*.08)/.24)),vx=b.x-a.x,vy=b.y-a.y;
    if(q<1)image('proj_d_1',a.x+vx*q,a.y+vy*q,30*scale,undefined,Math.atan2(-vy,vx));
  };
  if (!aim.air && aim.kind==='single' && ['fantasy','beastfolk'].includes(race)) {
    image('kingfx_'+race+'_0',aim.x,16*scale,36*scale,30*scale,0,fade);impact(aim,16*scale);return;
  }
  if (aim.kind==='chain' || race==='robots' || race==='fantasy') {
    const points=[{x:aim.x,y:aim.y},...(aim.kind==='chain'?aim.links||[]:[])];
    let from=tip;
    points.forEach((p,i)=>{if(Math.hypot(p.x-from.x,p.y-from.y)<.1)return;if(t>=i*.08){
        if(race==='undead'){const q=Math.min(1,(t-i*.08)/.20),a=Math.atan2(from.y-p.y,p.x-from.x);image('kingfx_undead_0',from.x+(p.x-from.x)*q,from.y+(p.y-from.y)*q,(i?20:28)*scale,undefined,a);}
        else bolt(from,p,(i?3:5)*scale,'#57d8ff',i);
        if(t>=i*.08+.24)impact(p,(i?12:19)*scale);
      }from=p;});
    return;
  }
  if(race==='aliens') {
    const q=Math.min(1,t/.4);
    if(q<1)image('proj_b_1',tip.x+dx*q,tip.y+dy*q,30*scale,undefined,angle);
    else impact(aim,15*scale);return;
  }
  if(race==='elementals') {
    // The final mechanic is a circular aerial splash, not damage along a cone.
    // A narrow jet reaches the target, then opens into the rule's reported radius there.
    const r=Number.isFinite(aim.r)?aim.r:70,fly=Math.min(1,t/.30);
    if(t<.30)image('kingfx_elementals_0',tip.x+dx*fly,tip.y+dy*fly,38*scale,20*scale,angle);
    else {const grow=Math.min(1,(t-.30)/.22),d=2*r*(.55+.45*grow);
      for(const f of [-1,0,1])image('kingfx_elementals_0',aim.x+f*d*.12,aim.y,d*.85,d*.75,angle+f*.7,fade*.7);}
    return;
  }
  if(race==='pirates') {
    const q=Math.min(1,t/.30);
    if(q<1)image('proj_a_1',tip.x+dx*q,tip.y+dy*q,23*scale,undefined,angle);
    else impact(aim,17*scale);return;
  }
  const key={monsters:'shots_0',military:'kingfx_military_0',undead:'kingfx_undead_0',beastfolk:'kingairfx_beastfolk_0',steampunk:'kingairfx_steampunk_0'}[race];
  if(!key)return;
  const fly=Math.min(1,t/.58),arc=race==='monsters'?Math.sin(fly*Math.PI)*25*scale:race==='undead'?Math.sin(fly*Math.PI)*14*scale:0;
  if(t<.58){const w=({monsters:23,military:40,undead:28,beastfolk:48,steampunk:26}[race])*scale;
    image(key,tip.x+dx*fly,tip.y+dy*fly+arc,w,undefined,race==='monsters'?t*5:angle);}
  else if(race==='steampunk'&&t<.88){const q=(t-.58)/.30;image(key,aim.x-dx*q,aim.y-dy*q,26*scale,undefined,angle);impact(aim,16*scale,(1-q)*fade);}
  else if(aim.kind==='area') {
    const q=(t-.58)/.42,r=Number.isFinite(aim.r)?aim.r:45*scale,d=2*r*(.6+.4*q);
    sprite(g,`fx_${Math.min(3,Math.floor(q*4))}`,aim.x,aim.y-d/2,d,{alpha:fade});
  } else impact(aim,18*scale);
}
