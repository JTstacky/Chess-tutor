import {compile} from './catalog.js';
import {W,H} from './engine.js';
const images={};
export async function loadArt(){await Promise.all(['sprig','crab','snail','mushroom','cabbage','cloud','kettle','moth','beetle','fox','cactus','balloon','spark'].map(id=>new Promise(resolve=>{const i=new Image();i.onload=resolve;i.onerror=resolve;i.src=new URL('../assets/'+id+'.svg',import.meta.url);images[id]=i;})));}
function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
function line(c,x,y,tx,ty,color,width=2){c.beginPath();c.moveTo(x,y);c.lineTo(tx,ty);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
function spark(c,x,y,size,t){c.save();c.translate(x,y);c.rotate(Math.sin(t*.002)*.12);c.shadowColor='#eebd56';c.shadowBlur=14;if(images.spark?.complete)c.drawImage(images.spark,-size/2,-size/2,size,size);c.restore();}
export function draw(canvas,state,{seat=0,privateSide=null,planning=false,paused=false,time=0}={}){
  const c=canvas.getContext('2d');c.clearRect(0,0,W,H);
  const grad=c.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#e9efd3');grad.addColorStop(1,'#dce9c5');c.fillStyle=grad;c.fillRect(0,0,W,H);
  c.fillStyle='#afc79535';for(let x=17;x<W;x+=37)for(let y=24;y<H;y+=41){c.beginPath();c.arc(x+(y%3)*3,y,1,0,7);c.fill();}
  // Soft garden edges and tiny original paper pennants.
  c.fillStyle='#8eac7a35';c.fillRect(0,0,W,38);c.fillRect(0,H-34,W,34);
  for(let x=22;x<W;x+=65){ellipse(c,x,34,29,15,'#a9c58a');ellipse(c,x+24,22,19,15,'#b9cf96');ellipse(c,x,H-21,33,13,'#a8c489');}
  c.strokeStyle='#aebd92';c.lineWidth=2;c.setLineDash([5,10]);c.beginPath();c.moveTo(500,55);c.lineTo(500,505);c.stroke();c.setLineDash([]);
  for(const y of [140,280,420]){c.fillStyle='#f4f3dc88';c.beginPath();c.roundRect(95,y-36,810,72,36);c.fill();}
  if(state?.map===1){for(const x of [380,620]){ellipse(c,x,280,46,62,'#acc6aa');ellipse(c,x-5,275,35,50,'#c8dcc1');for(let n=0;n<5;n++)ellipse(c,x-20+n*10,255+n%2*30,5,8,'#88ad8a');}}
  for(const side of [0,1]){
    const x=side?935:65;ellipse(c,x,280,58,212,side?'#d99c7833':'#73a78533');
    c.fillStyle=side?'#ca765b':'#3e8067';c.beginPath();c.roundRect(x-34,230,68,100,14);c.fill();
    c.fillStyle='#fff6df';c.beginPath();c.roundRect(x-28,238,56,35,8);c.fill();
    c.font='bold 9px Trebuchet MS';c.textAlign='center';c.fillStyle=side?'#9c4f3c':'#2b624c';c.fillText(side?'THEIR BANK':'YOUR BANK',x,259);spark(c,x,300,40,time);
  }
  c.textAlign='center';c.font='bold 10px Trebuchet MS';c.fillStyle='#7f9469';c.fillText(state?.map===1?'THE DEWDROP CROSSING':'THE MEADOW MARKET',500,27);
  if(!state)return;
  const xOf=x=>seat?W-x:x;
  for(const effect of state.effects||[]){
    c.globalAlpha=Math.min(1,effect.life/8)*.65;
    if(effect.kind==='spring'){c.strokeStyle='#d1a74e';c.lineWidth=3;c.beginPath();c.arc(xOf(effect.x),effect.y,effect.r*(1-effect.life/20),0,7);c.stroke();}
    else if(effect.tx!==undefined){line(c,xOf(effect.x),effect.y,xOf(effect.tx),effect.ty,['gust','rain','glow'].includes(effect.kind)?'#96bdd0':'#dda968',effect.kind==='gust'?9:3);ellipse(c,xOf(effect.tx),effect.ty,7,7,'#f8df99');}c.globalAlpha=1;
  }
  for(const p of state.sparks)if(p.banked===null&&p.carrier===null){ellipse(c,xOf(p.x),p.y+15,18,6,'#9a88462a');spark(c,xOf(p.x),p.y+Math.sin(time*.004+p.id)*3,42,time);}
  const units=[...state.units].sort((a,b)=>a.y-b.y);
  for(const u of units){
    const x=xOf(u.x),friendly=u.seat===seat,color=friendly?'#398267':'#cf795c';
    if(privateSide===u.seat){ellipse(c,x,u.y+21,31,10,'#8c977233');c.fillStyle='#b9c6a2';c.beginPath();c.roundRect(x-22,u.y-22,44,43,15);c.fill();c.font='bold 23px Georgia';c.textAlign='center';c.fillStyle='#f6f7e9';c.fillText('?',x,u.y+8);continue;}
    if(u.knocked){c.globalAlpha=.3;ellipse(c,x,u.y+15,24,7,color);c.globalAlpha=1;continue;}
    const f=compile(u);ellipse(c,x,u.y+25,30,9,'#6473442c');
    if(f.ability==='shield'){c.strokeStyle=friendly?'#77b79670':'#df9b8070';c.lineWidth=3;c.beginPath();c.arc(x,u.y,48,Math.PI,Math.PI*2);c.stroke();}
    c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.ellipse(x,u.y+24,28,10,0,0,7);c.stroke();
    const bob=planning||paused?Math.sin(time*.002+u.slot)*1.5:Math.sin(time*.012+u.slot*2)*(f.speed?3:1);
    c.save();c.translate(x,u.y+bob);if(!friendly)c.scale(-1,1);c.rotate(planning?0:Math.sin(time*.008+u.slot)*.035);if(u.flash)c.filter='brightness(1.3)';const img=images[u.family];if(img?.complete)c.drawImage(img,-42,-47,84,84);c.restore();
    if(u.boost){c.strokeStyle='#f1c454';c.lineWidth=2;for(let n=0;n<3;n++)line(c,x+(friendly?-1:1)*(34+n*5),u.y+n*4,x+(friendly?-1:1)*(43+n*5),u.y+n*4,'#e8bb58',2);}
    if(u.trait!=='plain'){c.fillStyle='#fff9e5';c.beginPath();c.arc(x+28,u.y-25,9,0,7);c.fill();c.font='bold 9px Trebuchet MS';c.textAlign='center';c.fillStyle='#6b7d55';c.fillText({swift:'↗',sturdy:'◆',feather:'≈',metal:'M'}[u.trait],x+28,u.y-22);}
    c.fillStyle='#b4bfa1';c.beginPath();c.roundRect(x-23,u.y-46,46,4,2);c.fill();c.fillStyle=color;c.beginPath();c.roundRect(x-23,u.y-46,46*Math.max(0,u.hp/u.maxHp),4,2);c.fill();
    if(u.carrying!==null)spark(c,x,u.y-63,29,time);
    else if(u.claim>0&&u.claim<16){c.strokeStyle='#efbc49';c.lineWidth=4;c.beginPath();c.arc(x,u.y,37,-Math.PI/2,-Math.PI/2+Math.PI*2*u.claim/16);c.stroke();}
    if(planning){c.fillStyle='#426344';c.font='bold 9px Trebuchet MS';c.textAlign='center';c.fillText(f.name,x,u.y+45);c.font='8px Trebuchet MS';c.fillText(u.job.toUpperCase(),x,u.y+58);}
  }
}
