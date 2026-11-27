import {settledBottom} from './animation-reactions.js';

const BREAK = new Set(['robots_scrap','robots_tread','robots_laser','robots_bomb','steampunk_clockwork','steampunk_knight','steampunk_boiler','military_tank','aliens_walker','pirates_cannoneer','undead_skeleton','undead_golem','elementals_golem','monsters_gargoyle']);
const SINK = new Set(['aliens_blob','aliens_bloblet','monsters_slime','monsters_slimelet','elementals_imp','elementals_frost','elementals_thorn']);
const FADE = new Set(['undead_ghost','elementals_gale','elementals_storm']);
const smooth = t => t*t*(3-2*t);

// The body that was actually on screen carries through the blow. No replacement
// model, owner-facing reset, or generic coloured blocks during the exit.
export function drawTroopDeath(g, f, a, q, {spec, sprite, spr, fallback, machine}) {
  const p=f.pose||fallback, im=spr(p.key);
  if(!im)return;
  const h=p.h,w=h*im.width/im.height,back=p.flip?1:-1;
  const options={flip:p.flip,rot:p.rot||0,sx:p.sx||1,sy:p.sy||1,rotor:p.rotor,contrast:p.contrast};
  const body=(x,y,extra={})=>sprite(g,p.key,x,y,h,{...options,...extra});
  const dust=(x,y,t,size=30)=>sprite(g,'fx_3',x,y,size*(1+t),{alpha:.5*(1-t)});
  // Six pieces retain the troop's painted material and silhouette. Cropping the
  // original bitmap also means new still-art identities inherit this animation.
  const pieces=(t,x,y,rotation=options.rot,sx=options.sx,sy=options.sy)=>{
    const cw=im.width/3,ch=im.height/2,pw=w/3,ph=h/2;
    for(let i=0;i<6;i++){
      const col=i%3,row=Math.floor(i/3),side=p.flip?-1:1;
      const ox=side*(col-1)*pw*sx,oy=h/2+(-h+(row+.5)*ph)*sy;
      const cx=Math.cos(rotation)*ox-Math.sin(rotation)*oy,cy=Math.sin(rotation)*ox+Math.cos(rotation)*oy;
      const angle=rotation+back*t*(i%2?2.2:-2.8),vx=(col-1)*35+back*14;
      const floor=(Math.abs(Math.cos(angle))*ph*sy+Math.abs(Math.sin(angle))*pw*sx)/2+1;
      const yy=Math.max(floor,y+h/2-cy+(35+(i%3)*12)*t-180*t*t);
      g.save();g.translate(x+cx+vx*t,-yy);g.rotate(angle);g.scale(side*sx,sy);
      g.globalAlpha*=t<.62?1:Math.max(0,(1-t)/.38);
      g.drawImage(im,col*cw,row*ch,cw,ch,-pw/2,-ph/2,pw,ph);g.restore();
    }
  };
  if(FADE.has(f.kind)){
    body(p.x,p.y+32*smooth(q),{alpha:(1-q)**2,sx:options.sx*(1-.3*q),sy:options.sy*(1+.35*q)});
  }else if(spec.air){
    const c=Math.min(1,q/.68),e=c*c,rot=options.rot+back*(machine?1.08:1.45)*smooth(c);
    const ground=settledBottom(h,w,rot),y=p.y+(ground-p.y)*e;
    if(c<1){
      if(machine)for(let i=1;i<=3;i++)dust(p.x+back*(12*c-i*5),y+h*.45+i*7,Math.min(.9,.25+i*.17),12+i*5);
      body(p.x+back*18*c,y,{rot,sx:1+(options.sx-1)*(1-e),sy:1+(options.sy-1)*(1-e),rotor:p.rotor?{...p.rotor,now:p.rotor.now+a*(1-.65*c)}:null});
    }else{
      const d=(q-.68)/.32,x=p.x+back*18;
      if(machine||BREAK.has(f.kind))pieces(d,x,ground,rot,1,1);
      else body(x,ground,{rot,sx:1,sy:1,alpha:1-smooth(d)});
      dust(x,1,d,h*.4);
    }
  }else if(SINK.has(f.kind)){
    body(p.x,p.y,{alpha:q<.55?1:(1-q)/.45,rot:options.rot*(1-q),sx:options.sx*(1+.45*smooth(q)),sy:options.sy*(1-.9*smooth(q))});
  }else if(BREAK.has(f.kind)){
    const c=Math.min(1,q/.22);
    if(q<.22)body(p.x+back*4*smooth(c),p.y,{rot:options.rot+back*.12*smooth(c)});
    else pieces((q-.22)/.78,p.x+back*4,p.y,options.rot+back*.12);
  }else{
    const c=Math.min(1,q/.58),e=smooth(c),rot=options.rot+back*1.45*e;
    const ground=settledBottom(h,w,rot,Math.max(0,p.ground||0));
    const y=p.y+(ground-p.y)*e+Math.sin(Math.PI*c)*h*.06;
    body(p.x+back*h*.25*e,y,{rot,alpha:q<.76?1:(1-q)/.24,sx:1+(options.sx-1)*(1-e),sy:1+(options.sy-1)*(1-e)});
    if(c===1)dust(p.x+back*h*.3,1,(q-.58)/.42,h*.3);
  }
}
