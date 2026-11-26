// Cut-out rig of the original painted smoke. Castle pixels and collision geometry stay fixed.
const CACHE=new WeakMap();
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
  const k=width/im.width,[x0,y0,x1,y1]=rig.box;
  g.save();g.translate(cx,0);g.scale(flip?-k:k,k);g.translate(-im.width/2,-im.height);g.drawImage(rig.base,0,0);
  // Anchor the thin stem. The painted plume billows and sways without a reset/pop or a floating chimney.
  const ax=(x0+x1)/2,ay=y1,a=now*1.7+phase*1.3;
  g.translate(ax,ay);g.rotate(Math.sin(a)*.025);g.scale(1+.035*Math.sin(a+1),1+.045*Math.sin(a*.83));
  g.drawImage(rig.smoke,x0-ax,y0-ay);g.restore();return true;
}
