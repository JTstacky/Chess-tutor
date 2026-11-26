// Presentation-only state: weak keys prevent old matches retaining troop objects.
export const MONSTER_FLIGHT = new Set(['monsters_bats', 'monsters_gargoyle']);
export const DEFENCE_SHOT = Object.freeze({fantasy:'arrow',aliens:'ray',robots:'dart',
  monsters:'spike',military:'bullet',undead:'skull',pirates:'ball',elementals:'ice',
  beastfolk:'javelin',steampunk:'rivet'});
const ULT_PAYLOAD = Object.freeze({fantasy:0,military:1,pirates:2});
export function ultimatePayload(race) { return `ultfx_a_${ULT_PAYLOAD[race]??0}`; }
export function dropBombStyle(kind, big) {
  return kind==='military_bomber' ? {key:'ultfx_a_1',height:34,finned:true}
    : {key:big?'ultfx_a_1':'proj_c_3',height:big?40:22,finned:!!big};
}
// Only this lane's directional models: the art lane retains its own facing contract.
export const TRACKED_FACING = new Set([...MONSTER_FLIGHT, 'military_bomber',
  'military_chopper', 'robots_drone', 'robots_gunship', 'steampunk_gyro',
  'robots_laser', 'aliens_trooper', 'aliens_walker', 'steampunk_tesla']);
const facing = new WeakMap();
export function monsterFacing(u, now, targetX) {
  const home = u.owner ? -1 : 1;
  if (!TRACKED_FACING.has(u.kind)) return home;
  let state = facing.get(u);
  if (!state || now < state.time) state = { x: u.x, time: now, face: home };
  const dx = u.x - state.x;
  if (u.act > 0 && Number.isFinite(targetX) && Math.abs(targetX-u.x) > 1) state.face = Math.sign(targetX-u.x);
  else if (Math.abs(dx) > .05) state.face = Math.sign(dx);
  state.x = u.x; state.time = now; facing.set(u, state);
  return state.face;
}

// Troop hits expose a live target; chief/castle hits keep their destination on the shot.
export function attackFacing(u, now, hits=[], effects=[]) {
  const targetX=TRACKED_FACING.has(u.kind)&&u.act>0
    ? hits.find(h=>h.by?.id===u.id)?.target?.x ?? effects.findLast(f=>f.by===u.id&&Number.isFinite(f.tx))?.tx
    : undefined;
  return monsterFacing(u,now,targetX);
}

// Orbital/tesla attacks share mechanics, but have distinct painted sources and payloads.
// The three converging charges arrive at the recorded strike time, not a new damage event.
export function drawUltimateStrike(g, f, age, {spr,stamp,sprite,ceiling=490}) {
  const tesla=f.race==='steampunk', charge=Math.max(.01,f.charge), q=Math.min(1,age/charge);
  // Leave space above the source for its painted rotor/ring and packet echoes.
  const sourceY=Math.min(410,ceiling-80), payload=tesla?'proj_d_1':'proj_f_0';
  const image=(key,x,y,w,alpha=1,rot=0)=>{const im=spr(key);if(im)stamp(g,im,x,y,w,w*im.height/im.width,{alpha,rot});};
  const fade=age<charge?1:Math.max(0,1-(age-charge)/.55);
  if(tesla) {
    image('proj_d_5',f.x,sourceY,72+14*Math.sin(q*Math.PI),fade,age*2);
    image('kingfx_steampunk_0',f.x,sourceY,48,fade);
  } else image(`f_aliens_saucer_${Math.floor(age*12)%6}`,f.x,sourceY,105,fade);
  if(age<charge) {
    for(let i=-1;i<=1;i++) {
      const travel=q*q, x=f.x+i*70*(1-travel), y=sourceY+(30-sourceY)*travel;
      image(payload,x,y,28+20*q,.95,Math.PI/2);
      for(let j=1;j<=2;j++) image(payload,x+i*j*2,y+j*18,22-j*5,.22-j*.06,Math.PI/2);
    }
    image('proj_d_5',f.x,12,100-32*q,.4+.4*q);
  } else {
    const burst=(age-charge)/.55, size=(f.radius||65)*2*(.65+.55*burst);
    sprite(g,`fx_${Math.min(3,Math.floor(burst*4))}`,f.x,20-size*.35,size,{alpha:fade});
    image(tesla?'proj_d_1':'proj_d_5',f.x,35,size,fade*.7,tesla?burst*3:0);
  }
}
