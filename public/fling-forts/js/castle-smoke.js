// Cut-out rig of the original painted smoke. Castle pixels and collision geometry stay fixed.
const CACHE=new WeakMap();
let flashCanvas;
export const castleFlashStats={bytes:0,paints:0};
// Integer device-pixel bounds retain the original raster phase. Include the plume's
// maximum sway/stretch, then intersect the viewport so zoom cannot allocate an unbounded surface.
export function castleFlashBounds(m,im,cx,width,flip,viewportWidth,viewportHeight){
  const k=width/im.width,pad=Math.max(im.width,im.height)*.09+2,points=[];
  for(const x of [-pad,im.width+pad])for(const y of [-pad,im.height+pad]){
    const wx=cx+(flip?-1:1)*k*(x-im.width/2),wy=k*(y-im.height);
    points.push([m.a*wx+m.c*wy+m.e,m.b*wx+m.d*wy+m.f]);
  }
  const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0])))-2),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1])))-2);
  const right=Math.min(viewportWidth,Math.ceil(Math.max(...points.map(p=>p[0])))+2),bottom=Math.min(viewportHeight,Math.ceil(Math.max(...points.map(p=>p[1])))+2);
  return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}
export function drawCastleSmoke(g,im,mask,cx,width,flip,now,phase) {
  if(!mask)return false;
  let rig=CACHE.get(im);
  if(!rig){
    const base=document.createElement('canvas');base.width=im.width;base.height=im.height;
    const b=base.getContext('2d');b.drawImage(im,0,0);
    const [x0,y0,x1,y1]=mask.box,smoke=document.createElement('canvas');smoke.width=x1-x0;smoke.height=y1-y0;
    const c=smoke.getContext('2d');
    for(const [y,x,w] of mask.runs){b.clearRect(x,y,w,1);c.drawImage(im,x,y,w,1,x-x0,y-y0,w,1);}
    rig={base,smoke,box:mask.box};CACHE.set(im,rig);
  }
  if(g.filter&&g.filter!=='none'&&g.globalCompositeOperation==='source-over'&&!g.shadowBlur&&!g.shadowOffsetX&&!g.shadowOffsetY){
    const m=g.getTransform(),b=castleFlashBounds(m,im,cx,width,flip,g.canvas.width,g.canvas.height);
    if(!b.width||!b.height)return true;
    flashCanvas ||= document.createElement('canvas');
    if(flashCanvas.width!==b.width||flashCanvas.height!==b.height){flashCanvas.width=b.width;flashCanvas.height=b.height;}
    const c=flashCanvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,b.width,b.height);
    c.setTransform(m.a,m.b,m.c,m.d,m.e-b.left,m.f-b.top);c.filter=g.filter;c.globalAlpha=g.globalAlpha;
    c.imageSmoothingEnabled=g.imageSmoothingEnabled;c.imageSmoothingQuality=g.imageSmoothingQuality;
    // Filter AFTER destination sampling, just like the original renderer. Prefiltering
    // the source changes clipped highlight/edge colours, even at original resolution.
    paintRig(c,rig,im,cx,width,flip,now,phase);
    g.save();g.setTransform(1,0,0,1,0,0);g.filter='none';g.globalAlpha=1;g.drawImage(flashCanvas,b.left,b.top);g.restore();
    castleFlashStats.bytes=b.width*b.height*4;castleFlashStats.paints++;return true;
  }
  paintRig(g,rig,im,cx,width,flip,now,phase);return true;
}
function paintRig(g,rig,im,cx,width,flip,now,phase){
  const k=width/im.width,[x0,y0,x1,y1]=rig.box;
  g.save();g.translate(cx,0);g.scale(flip?-k:k,k);g.translate(-im.width/2,-im.height);g.drawImage(rig.base,0,0);
  // Anchor the thin stem. The painted plume billows and sways without a reset/pop or a floating chimney.
  const ax=(x0+x1)/2,ay=y1,a=now*1.7+phase*1.3;
  g.translate(ax,ay);g.rotate(Math.sin(a)*.025);g.scale(1+.035*Math.sin(a+1),1+.045*Math.sin(a*.83));
  g.drawImage(rig.smoke,x0-ax,y0-ay);g.restore();
}
