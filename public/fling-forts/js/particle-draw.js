import {transformStamp} from './sprite-transform.js';
import {filteredSprite} from './sprite-filter.js';

// A burst keeps its original trajectories. Cache only constants, never time or game state.
const plans = new Map();
const random = (i,k) => { const v=Math.sin(i*12.9898+k*78.233)*43758.5453;return v-Math.floor(v); };
export function debrisPlan(n,seed,{size=14,away=0,speed=1,set=[0,1,2,3,4]}={}) {
  const key=`${n}:${seed}:${size}:${away}:${speed}:${set}`;
  if(plans.has(key))return plans.get(key);
  const plan=[];
  for(let i=0;i<n;i++) {
    const angle=away?.25+random(i,seed)*1.2:i/n*Math.PI+(random(i,seed)-.5)*.5;
    const v=(80+random(i,seed+1)*90)*speed,d=size*(.75+random(i,seed+2)*.5);
    plan.push({key:`rubble2_${set[i%set.length]}`,d,vx:(away||1)*Math.cos(angle)*v,vy:Math.sin(angle)*v*1.5,spin:(6+random(i,seed+3)*8)*(i%2?1:-1)});
  }
  if(plans.size>=256)plans.delete(plans.keys().next().value);
  plans.set(key,plan);return plan;
}
export function drawDebris(g,x,y,q,n,seed,options,spr,scale) {
  if(!spr('rubble2_0'))return false;
  const basis=g.getTransform(),filter=g.filter,alpha=q<.7?1:(1-q)/.3;
  g.save();if(filter!=='none')g.filter='none';g.globalAlpha=alpha;
  for(const p of debrisPlan(n,seed,options)) {
    const im=spr(p.key);if(!im)continue;
    const h=p.d,w=h*im.width/im.height;
    transformStamp(g,x+p.vx*q,Math.max(h*.4,y+p.vy*q-300*q*q),q*p.spin,false,false,basis);
    const pixels=Math.max(32,Math.ceil(h*scale*2/16)*16);
    g.drawImage(filteredSprite(im,filter,pixels),-w/2,-h/2,w,h);
  }
  g.restore();return true;
}
