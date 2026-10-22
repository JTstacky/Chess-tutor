// Shared TengGames controller bridge. Native adapters consume state; legacy games receive keys.
(() => {
  if (window.TGController) return;
  const path = location.pathname;
  const id = path.match(/\/retro\/web\/([^/]+)/)?.[1] || path.split('/')[1];
  const profiles = {
    keen: { buttons: ['ControlLeft','AltLeft','Space','Enter',null,null,null,'Space','Enter','Escape'], help: 'Left stick / D-pad: move · A: jump · B: pogo · X / RT: fire · Y / View: status · Start: menu' },
    jazz: { buttons: ['Space','AltLeft','AltLeft','ControlRight',null,null,null,'AltLeft','Enter','Escape'], help: 'Left stick / D-pad: move · A: jump · B / X / RT: fire · Y: change weapon · View: confirm · Start: menu' },
    cosmo: { buttons: ['ControlLeft','AltLeft','AltLeft','F1',null,null,null,'AltLeft','Enter','Escape'], help: 'Left stick / D-pad: move · A: jump · B / X / RT: bomb · Y: help · View: confirm · Start: menu' },
    pop: { buttons: ['ArrowUp','ShiftLeft','ShiftLeft','ArrowDown',null,null,null,'ShiftLeft','Enter','Escape'], help: 'Left stick / D-pad: move · A: jump · B / X / RT: grab, walk or sword · Y: crouch · View: confirm · Start: menu' },
    tyrian: { buttons: ['Space','ControlLeft','AltLeft','Enter',null,null,null,'Space','Enter','Escape'], help: 'Left stick / D-pad: fly · A / RT: fire · B / X: sidekicks · Y: rear weapon · View: confirm · Start: menu' },
    'ninja-nab': { buttons: ['Space','KeyK','KeyJ','KeyL',null,null,null,'KeyJ',null,'Escape'], help: 'Left stick / D-pad: run and drop · A: jump · X / B / Y: weapons 1 / 2 / 3 · Start: pause' },
    'escape-velocity': { buttons: ['Space','ShiftLeft','KeyL','KeyJ','Tab','KeyW','KeyZ','Space','KeyM','Escape'], help: 'Left stick / D-pad: turn, thrust, reverse · A / RT: primary · B: secondary · X: land · Y: jump · LB: target · RB: next weapon · LT: afterburner · View: map · Start: pause · In menus A: confirm, B: back' },
    'mission-mars': { native: true, help: 'Left stick / D-pad: move · Right stick: aim · A / RT: primary attack · X / LT: secondary · B: special · Y / View: map · Start: pause' },
    'hammerguys-party': { native: true, help: 'Left stick: move · Right stick: aim · A / X / Y / RB: abilities 1–4 · RT: confirm target / attack · B: cancel · D-pad: minigame keys · Start: menu. Typing rounds still use the keyboard.' },
    'arcane-arena': { native: true, help: 'Left stick: move · Right stick: aim · RT: fireball · A / B / X / Y / LB / RB: spells 2–7 · LT: self-explode · Start: ready / options · View: scores' },
    'battle-bots': { native: true, help: 'Left stick: move · Right stick: look · RT / LT: attacks · LB: bot ability · RB: pilot ability · Y: transform · B: taunt · A: jump' },
    'zeliard': { native: true, help: 'Left stick / D-pad: move · A: jump / confirm · X / RT: sword · B / LT: magic / back · Y / View: inventory · Start: pause' },
    'demon-dragon': { native: true, help: 'Left stick / D-pad: move · B: sword · A: bolt · X: dodge · Y / bumpers: switch relic · Start: begin / confirm upgrade' },
  };
  const profile = profiles[id];
  if (!profile) return;
  const empty = () => ({ buttons: [], axes: [0,0,0,0], connected: false });
  const api = window.TGController = { state: empty(), profile: id, suspended: false };
  api.filterPad = pad => !active || !armed || document.hidden || api.suspended ? { ...pad, axes:[0,0,0,0], buttons:pad.buttons.map(()=>({pressed:false,value:0})), connected:true, tgBlocked:true } : pad;
// Uses the site controller service without replacing keyboard/touch commands.
class PartyGamepadControls {
  constructor(input) { this.input=input; this.was=[]; this.moving=false; this.sent=0; this.aim={x:1,y:0}; }
  frame() {
    const state=window.TGController?.state;
    const b=state?.connected?state.buttons:[], axes=state?.connected?state.axes:[0,0,0,0];
    const down=i=>b[i]&&!this.was[i];
    const input=this.input, me=input.world.myView();
    if(down(9))input.onMenu();
    if(down(1))input.cancelTarget();
    if(Math.hypot(axes[2],axes[3])>.22){const m=Math.hypot(axes[2],axes[3]);this.aim={x:axes[2]/m,y:axes[3]/m};}
    if(input.active&&me){
      const x=axes[0],y=axes[1],now=performance.now();
      if((x||y)&&now>=input.holdPause){
        if(now-this.sent>=100){input.moveTo({x:me.x+x*2,y:me.z+y*2},false,'steer');this.sent=now;this.moving=true;input.world.follow=true;}
      }else if(this.moving){input.send({t:'cmd',c:'stop'});this.moving=false;}
      for(const [i,slot] of [[0,0],[2,1],[3,2],[5,3]])if(down(i)){const quick=input.quickCast;input.quickCast=false;input.useSlot(slot);input.quickCast=quick;}
      if(down(7)){
        const p={x:me.x+this.aim.x*5,y:me.z+this.aim.y*5};
        if(input.targeting){input.castAt(input.targeting,p);input.cancelTarget();}
        else if(input.getSnap()?.attack)input.send({t:'cmd',c:'attack',...p});
      }
      // Minigames with direct arrow-key actions (including Mule Race).
      for(const [i,code] of [[12,'ArrowUp'],[13,'ArrowDown'],[14,'ArrowLeft'],[15,'ArrowRight']])if(down(i)){
        window.dispatchEvent(new KeyboardEvent('keydown',{key:code,code,bubbles:true}));
        window.dispatchEvent(new KeyboardEvent('keyup',{key:code,code,bubbles:true}));
      }
    }else if(this.moving){input.send({t:'cmd',c:'stop'});this.moving=false;}
    this.was=b.slice();
  }
}

  api.createPartyInput = input => new PartyGamepadControls(input);
  const physical = new Set(), held = new Set();
  let previous = [], active = true, armed = false, padId = null, panel, button, lastMenu = 0;
  const codes = { Space:[' ',32], Enter:['Enter',13], Escape:['Escape',27], Tab:['Tab',9], ControlLeft:['Control',17], ControlRight:['Control',17], ShiftLeft:['Shift',16], AltLeft:['Alt',18], ArrowUp:['ArrowUp',38], ArrowDown:['ArrowDown',40], ArrowLeft:['ArrowLeft',37], ArrowRight:['ArrowRight',39], F1:['F1',112] };
  function key(code, down) {
    const [name, number] = codes[code] || [code.replace('Key','').toLowerCase(), code.replace('Key','').charCodeAt(0)];
    const event = new KeyboardEvent(down?'keydown':'keyup', { key:name, code, keyCode:number, which:number, bubbles:true, cancelable:true, location:code.endsWith('Right')?2:code.endsWith('Left')?1:0 });
    const target = document.querySelector('canvas') || document.body;
    target?.dispatchEvent(event);
  }
  function release() { for (const code of held) if (!physical.has(code)) key(code,false); held.clear(); api.state=empty(); }
  window.addEventListener('keydown', e => { if(e.isTrusted) { physical.add(e.code); if(held.has(e.code)){e.preventDefault();e.stopImmediatePropagation();} } },true);
  window.addEventListener('keyup', e => { if(e.isTrusted) { physical.delete(e.code); if(held.has(e.code)){e.preventDefault();e.stopImmediatePropagation();} } },true);
  window.addEventListener('blur',()=>{ active=false; armed=false; physical.clear(); release(); });
  window.addEventListener('focus',()=>{active=true;armed=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){armed=false;release();}});
  window.addEventListener('gamepaddisconnected',()=>{armed=false;release();});
  function visible(el) { return el && !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden'; }
  function menu(b, axes, now) {
    // Only website menus, never in-game canvas menus or the live HUD.
    const root = panel?.open ? panel : [...document.querySelectorAll('#picker, #panel, #welcome, #pausemenu, #options, #lobby, #title, #menu, #home, #screens')].find(visible);
    if (!visible(root)) return false;
    const items=[...root.querySelectorAll('button,a[href],select')].filter(visible);
    if (!items.length) return false;
    const step=(b[13]||b[15]||axes[1]>.5||axes[0]>.5)?1:(b[12]||b[14]||axes[1]<-.5||axes[0]<-.5)?-1:0;
    if(step && now-lastMenu>220){const i=items.indexOf(document.activeElement);items[(i+step+items.length)%items.length].focus();lastMenu=now;}
    if(b[0]&&!previous[0]) { const selected=items.includes(document.activeElement)?document.activeElement:items.find(x=>x.tagName==='BUTTON')||items[0];selected.click(); armed=false; }
    if(b[1]&&!previous[1]){armed=false;if(panel?.open)panel.close();else items.find(x=>/back|cancel/i.test(x.textContent))?.click();}
    return true;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let pad;try {pad=[...(navigator.getGamepads?.()||[])].find(p=>p?.connected&&p.mapping==='standard');}catch{}
    const label=pad?'Controller connected':'Controller controls';
    if(button && button.textContent!==label)button.textContent=label;
    if(!pad || !active || document.hidden){release(); previous=[];padId=null;return;}
    const b=pad.buttons.map(x=>x.pressed||x.value>.5), axes=[0,1,2,3].map(i=>Math.abs(pad.axes[i]||0)<.22?0:Math.max(-1,Math.min(1,pad.axes[i])));
    if(padId!==pad.index+':'+pad.id){padId=pad.index+':'+pad.id;armed=false;release();}
    if(!armed){armed=!b.some(Boolean)&&!axes.some(Boolean);previous=b;return;}
    const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
    api.suspended=typing||!!panel?.open;
    if(typing){armed=false;release();previous=b;return;}
    const inMenu = menu(b,axes,now);
    api.suspended = typing || !!panel?.open || inMenu;
    if(inMenu){release();previous=b;return;}
    api.state={buttons:b,axes,connected:true};
    window.dispatchEvent(new CustomEvent('tg-controller-frame',{detail:api.state}));
    if(!profile.native){
      const next=new Set();
      const ev= id==='escape-velocity' ? window.evApp : null;
      const evMenu=ev && (!ev.screen?.flight || ev.dialogs?.length);
      const slotCode=(slot,fallback)=>ev?.keyboard?.byCode ? [...ev.keyboard.byCode].find(([,slots])=>slots.includes(slot))?.[0] || fallback : fallback;
      const buttons=evMenu ? ['Enter','Escape',null,null,null,null,null,null,'Enter','Escape'] : ev ? [13,14,22,8,17,15,4,13,27,19].map((slot,i)=>slotCode(slot,profile.buttons[i])) : profile.buttons;
      if(!inMenu){for(let i=0;i<buttons.length;i++)if(b[i]&&buttons[i])next.add(buttons[i]);
        if(axes[0]<-.4||b[14])next.add(ev&&!evMenu?slotCode(3,'ArrowLeft'):'ArrowLeft');if(axes[0]>.4||b[15])next.add(ev&&!evMenu?slotCode(2,'ArrowRight'):'ArrowRight');
        if(axes[1]<-.4||b[12])next.add(ev&&!evMenu?slotCode(0,'ArrowUp'):'ArrowUp');if(axes[1]>.4||b[13])next.add(ev&&!evMenu?slotCode(1,'ArrowDown'):'ArrowDown');}
      for(const code of held)if(!next.has(code)&&!physical.has(code))key(code,false);
      for(const code of next)if(!held.has(code)&&!physical.has(code))key(code,true);
      held.clear();for(const code of next)held.add(code);
    }
    previous=b;
  }
  function setup(){
    button=document.createElement('button');button.type='button';button.textContent='Controller controls';button.id='tg-controller-help';
    button.style.cssText='position:fixed;right:8px;top:max(8px,env(safe-area-inset-top));z-index:10000;min-height:32px;padding:6px 10px;border:1px solid #aaa;border-radius:8px;background:#211b35dd;color:white;font:12px system-ui;cursor:pointer';
    panel=document.createElement('dialog');panel.setAttribute('aria-label','Controller controls');panel.style.cssText='max-width:460px;background:#211b35;color:white;border:2px solid #a38bef;border-radius:16px;padding:24px;font:16px/1.6 system-ui';
    const title=document.createElement('h2');title.textContent='Controller controls';const info=document.createElement('p');info.textContent=profile.help;
    const note=document.createElement('p');note.textContent='Connect an Xbox, PlayStation or standard USB/Bluetooth controller. Press a button, then release the controls to activate it. Click or tap the game once if sound is muted.';
    const close=document.createElement('button');close.textContent='Back';close.style.cssText='min-height:44px;padding:8px 24px';close.onclick=()=>panel.close();panel.append(title,info,note,close);document.body.append(button,panel);
    button.onclick=()=>{release();panel.showModal();};panel.addEventListener('close',()=>{armed=false;api.suspended=false;});
    requestAnimationFrame(frame);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
