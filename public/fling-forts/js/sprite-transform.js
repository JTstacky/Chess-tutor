// Equivalent affine transforms for sprites and centred effect stamps.
function apply(g,a,b,c,d,e,f,basis) {
  if(basis)g.setTransform(basis.a*a+basis.c*b,basis.b*a+basis.d*b,basis.a*c+basis.c*d,basis.b*c+basis.d*d,basis.a*e+basis.c*f+basis.e,basis.b*e+basis.d*f+basis.f);
  else g.transform(a,b,c,d,e,f);
}
export function transformSprite(g,x,y,h,flip,rot,sx,sy,anchorY,basis=null) {
  const fx=(flip?-1:1)*sx;
  if(!rot){apply(g,fx,0,0,sy,x,-y,basis);return;}
  const c=Math.cos(rot),s=Math.sin(rot),pivot=h*(anchorY-.5);
  apply(g,c*fx,s*fx,-s*sy,c*sy,x-s*pivot,-y+(c-1)*pivot,basis);
}
export function transformStamp(g,x,y,rot,flipX,flipY,basis=null) {
  const fx=flipX?-1:1,fy=flipY?-1:1;
  if(!rot){apply(g,fx,0,0,fy,x,-y,basis);return;}
  const c=Math.cos(rot),s=Math.sin(rot);
  apply(g,fx*c,fy*s,-fx*s,fy*c,x,-y,basis);
}
