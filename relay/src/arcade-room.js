import {DurableObject} from 'cloudflare:workers';
const MAX=2*1024*1024,PART=64000;
export class ArcadeRoom extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.ready=ctx.blockConcurrencyWhile(async()=>{this.room=await ctx.storage.get('room');});ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('~','~'));this.rates=new Map();this.serial=Promise.resolve();}
 sockets(){return this.ctx.getWebSockets().filter(w=>w.readyState===1);}
 send(ws,value){try{ws.send(value instanceof ArrayBuffer?value:JSON.stringify(value));}catch{}}
 state(){return{type:'room',game:this.room.game,capacity:2,active:-1,persistent:true,generation:this.room.generation,serverOnline:this.sockets().some(w=>w.deserializeAttachment()?.seat===0),savedAt:this.room.savedAt||null,players:this.room.players.map((_,seat)=>({seat,online:this.sockets().some(w=>w.deserializeAttachment()?.seat===seat)}))};}
 broadcast(){for(const w of this.sockets())this.send(w,this.state());}
 locked(fn){const next=this.serial.catch(()=>{}).then(async()=>{await this.ready;return fn();});this.serial=next;return next;}
 fetch(req){return this.locked(()=>this.handleFetch(req));}
 async handleFetch(req){await this.ready;const url=new URL(req.url),profile=Number(req.headers.get('X-Player')),game=req.headers.get('X-Game');if(!Number.isSafeInteger(profile)||profile<=0||!/^metal-slug(?:-[2x3456])?$/.test(game||''))return new Response('Invalid player',{status:403});
  if(!this.room){if(url.searchParams.get('host')!=='1')return new Response('Unknown invite',{status:404});this.room={game,players:[profile],generation:0};}
  if(this.room.game!==game)return new Response('Wrong game',{status:409});
  let seat=this.room.players.indexOf(profile);if(seat<0){if(this.room.players.length>=2)return new Response('Game is full',{status:403});seat=this.room.players.length;this.room.players.push(profile);}
  for(const w of this.sockets())if(w.deserializeAttachment()?.seat===seat)w.close(4001,'Opened in another tab');
  this.room.generation++;await this.ctx.storage.put('room',this.room);
  const [client,server]=Object.values(new WebSocketPair());server.serializeAttachment({seat,seq:-1,build:null});this.ctx.acceptWebSocket(server);this.send(server,{type:'welcome',seat});this.broadcast();return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'tg-invite'}});
 }
 webSocketMessage(ws,raw){return this.locked(()=>this.handleMessage(ws,raw));}
 async handleMessage(ws,raw){await this.ready;const a=ws.deserializeAttachment();if(!a||!this.room)return;
  const now=Date.now(),rate=this.rates.get(ws)||{at:now,count:0,bytes:0};if(now-rate.at>1000){rate.at=now;rate.count=0;rate.bytes=0;}rate.count++;rate.bytes+=typeof raw==='string'?raw.length:raw.byteLength;this.rates.set(ws,rate);if(rate.count>180||rate.bytes>3*1024*1024){ws.close(1008,'Rate limit');return;}
  if(typeof raw!=='string'){if(!a.build||a.seat!==0||raw.byteLength<9||raw.byteLength>65536)return;const view=new DataView(raw);if(view.getUint32(0)!==this.room.generation)return;for(const peer of this.sockets())if(peer!==ws&&peer.deserializeAttachment()?.build===a.build)this.send(peer,raw);return;}
  if(raw.length>MAX*1.4)return;let m;try{m=JSON.parse(raw);}catch{return;}
  if(m.type==='ready'){
   if(typeof m.build!=='string'||!/^[a-z0-9-]{5,100}$/.test(m.build))return;
   if(this.room.build&&this.room.build!==m.build){this.send(ws,{type:'error',message:'Game version changed. Reload both browsers.'});return;}
   const firstReady=!a.build;this.room.build=m.build;a.build=m.build;ws.serializeAttachment(a);await this.ctx.storage.put('room',this.room);
   if(firstReady&&a.seat===0&&this.room.parts){let data='';for(let i=0;i<this.room.parts;i++)data+=await this.ctx.storage.get('save:'+i);this.send(ws,{type:'checkpoint',data,build:this.room.build});}
   this.send(ws,{type:'ready',generation:this.room.generation});for(const p of this.sockets())if(p!==ws)this.send(p,{type:'peer-ready',seat:a.seat});return;
  }
  if(!a.build||a.build!==this.room.build||m.generation!==this.room.generation)return;
  if(m.type==='input'){
   if(!Number.isSafeInteger(m.seq)||m.seq<=a.seq||!Number.isInteger(m.bits)||m.bits<0||m.bits>1023)return;a.seq=m.seq;ws.serializeAttachment(a);
   for(const p of this.sockets())if(p!==ws)this.send(p,{type:'input',seat:a.seat,bits:m.bits,seq:m.seq,generation:this.room.generation});return;
  }
  if(m.type==='signal'){
   if(!m.signal||JSON.stringify(m.signal).length>24000)return;
   for(const p of this.sockets())if(p!==ws&&p.deserializeAttachment()?.build===a.build)this.send(p,{type:'signal',seat:a.seat,signal:m.signal,generation:this.room.generation});return;
  }
  if(m.type==='checkpoint'&&a.seat===0){
   if(typeof m.data!=='string'||m.data.length>MAX*1.4||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data))return;
   const count=Math.ceil(m.data.length/PART),old=this.room.parts||0;this.room.parts=count;this.room.savedAt=new Date().toISOString();
   await this.ctx.storage.transaction(async tx=>{for(let i=0;i<count;i++)await tx.put('save:'+i,m.data.slice(i*PART,(i+1)*PART));for(let i=count;i<old;i++)await tx.delete('save:'+i);await tx.put('room',this.room);});
   this.send(ws,{type:'saved',at:this.room.savedAt});
  }
 }
 webSocketClose(ws){return this.locked(()=>this.handleClose(ws));}
 async handleClose(ws){await this.ready;this.rates.delete(ws);if(!this.room)return;this.room.generation++;await this.ctx.storage.put('room',this.room);for(const p of this.sockets())this.send(p,{type:'input',seat:ws.deserializeAttachment()?.seat,bits:0,generation:this.room.generation});this.broadcast();}
 webSocketError(ws){return this.webSocketClose(ws);}
}
