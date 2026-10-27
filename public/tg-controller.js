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
    'demon-dragon': { native: true, pause: true, help: 'Left stick / D-pad: move · B: sword · A: bolt · X: dodge · Y / bumpers: switch relic · Start: pause (confirm upgrade on upgrade cards)' },
    'beast-binder': { buttons: ['ShiftLeft','KeyJ','Space','KeyF','KeyR','KeyG',null,'KeyJ',null,'Escape'], help: 'Left stick / D-pad: move · A: dash · B / RT: blade · X: net · Y: war horn · LB: recall · RB: charge · Start: pause' },
    chess: { native: true, help: 'D-pad / left stick: choose a menu item · A: select · B: back · Start: pause and settings. Use the board with touch or a mouse.' },
    omf: { pause: true, buttons: ['Enter','ShiftRight','Enter','ShiftRight',null,null,null,null,null,null], help: 'Left stick / D-pad: move · A / X: punch · B / Y: kick · Start: pause' },
    zzt: { pause: true, buttons: ['Enter','ShiftLeft','KeyT','KeyP',null,null,null,null,'KeyS',null], help: 'Left stick / D-pad: move · Hold B and a direction: shoot · A: confirm · X: torch · Y: play · View: save · Start: pause' },
  };
  // Every published game gets the same pause/settings navigation, including engines
  // whose gameplay is designed for a mouse. Never invent gameplay bindings for those.
  const pointerGames = ['heroes2','scummvm','openttd','tim','lemmings'];
  if (pointerGames.includes(id)) profiles[id] = { native: true, pause: id !== 'lemmings', help: 'Use touch or a mouse for gameplay. Controller: Start opens the pause menu · D-pad / left stick chooses a menu item · A selects · B goes back.' };
  // Metal Slug pages read the pad themselves (Start is the arcade Start, Select inserts a coin) and pause
  // from their header button, so they get the shared Settings but no Start-to-pause.
  const arcade = ['metal-slug','metal-slug-2','metal-slug-x','metal-slug-3','metal-slug-4','metal-slug-5','metal-slug-6'];
  for (const m of arcade) profiles[m] = { native: true, arcade: true, help: 'Left stick / D-pad: move · A: fire · B: jump · X: grenade · Select: coin · Start: start or join · Esc key: pause' };
  const profile = profiles[id];
  if (!profile) return;
  if (['keen','jazz','cosmo','pop','tyrian','escape-velocity','battle-bots'].includes(id)) profile.pause = true;
  const nativePads = navigator.getGamepads?.bind(navigator);
  const readPads = () => nativePads?.() || [];
  const empty = () => ({ buttons: [], axes: [0,0,0,0], connected: false });
  const api = window.TGController = { state: empty(), profile: id, suspended: false, paused: false };
  api.filterPad = pad => !active || !armed || document.hidden || api.suspended || !settings.enabled ? { ...pad, axes:[0,0,0,0], buttons:pad.buttons.map(()=>({pressed:false,value:0})), connected:true, tgBlocked:true } : { ...pad, axes:pad.axes.map(v=>Math.abs(v)<settings.deadzone?0:v), buttons:pad.buttons, connected:pad.connected, index:pad.index, id:pad.id, mapping:pad.mapping };
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
  const physical = new Set(), held = new Set(), pointers = new Map(), touches = new Map();
  window.addEventListener('pointerdown',e=>pointers.set(e.pointerId,e.target),true);
  for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>pointers.delete(e.pointerId),true);
  window.addEventListener('touchstart',e=>{for(const touch of e.changedTouches)touches.set(touch.identifier,{target:e.target,touch});},true);
  for(const type of ['touchend','touchcancel'])window.addEventListener(type,e=>{for(const touch of e.changedTouches)touches.delete(touch.identifier);},true);
  let previous = [], active = true, armed = false, padId = null, panel, pausePanel, lastMenu = 0;
  let settings = { enabled: true, deadzone: .22 };
  try { const saved=JSON.parse(localStorage.getItem('tg.controller.settings')); if(saved)settings={enabled:saved.enabled!==false,deadzone:Math.max(.1,Math.min(.5,Number(saved.deadzone)||.22))}; } catch {}
  const resumeWaiters = [];
  api.waitForResume = () => api.paused ? new Promise(resolve=>resumeWaiters.push(resolve)) : Promise.resolve();
  api.afterResume = callback => { if(api.paused)resumeWaiters.push(callback);else callback(); };
  function resetInput() {
    for(const code of physical)key(code,false);
    physical.clear(); release(); armed=false;
    for(const [pointerId,target] of [...pointers]){
      if(target.closest?.('.tg-pause-dialog'))continue;
      target.dispatchEvent(new PointerEvent('pointercancel',{pointerId,bubbles:true}));
      try{target.releasePointerCapture(pointerId);}catch{}
    }
    pointers.clear();
    for(const {target,touch} of [...touches.values()]){
      try{target.dispatchEvent(new TouchEvent('touchcancel',{changedTouches:[touch],touches:[],targetTouches:[],bubbles:true}));}catch{}
    }
    touches.clear();
    window.dispatchEvent(new CustomEvent('tg-input-reset'));
  }
  let resumeModule = null, pauseStarted = 0, nativeMenuPending = false, forwardingNativeKey = false;
  const originalMenuGames=['keen','jazz','cosmo','pop','tyrian','omf'];
  function setPaused(on) {
    if(api.paused===on)return;
    resetInput(); api.paused=on; api.suspended=on;
    const ev=window.evApp;
    if(on){
      pauseStarted=performance.now();
      if(ev){ev.paused=true;ev.keyboard.clear();}
      resumeModule=(window.__retro||window.__pop||window.__heroes2)?.mod?.tgPause?.();
    }else{
      if(ev){ev.paused=false;ev.last=performance.now();ev.keyboard.clear();}
      resumeModule?.();resumeModule=null;
      for(const resolve of resumeWaiters.splice(0))resolve();
    }
    window.dispatchEvent(new CustomEvent('tg-pause',{detail:{paused:on,duration:on?0:performance.now()-pauseStarted}}));
  }
  // One Settings page for every game: sound, screen and vibration (tg.settings, applied by tg-profile.js),
  // any game-only options, then the controller. Pages inside a dialog are told apart by data-page.
  const site=window.TGSettings||{volume:1,vibration:true};
  function saveSiteSettings(){try{localStorage.setItem('tg.settings',JSON.stringify({volume:site.volume,vibration:site.vibration}));}catch{}}
  function row(text, control, extra){const label=document.createElement('label');label.className='tg-setting';label.append(text,control);if(extra)label.append(extra);return label;}
  function slider(id, min, max, value, onInput, format){
    const range=document.createElement('input');range.type='range';range.id=id;range.min=String(min);range.max=String(max);range.step='1';range.value=String(value);
    const out=document.createElement('output');out.textContent=format(value);
    range.oninput=()=>{out.textContent=format(Number(range.value));onInput(Number(range.value));};
    return [range,out];
  }
  function check(id, checked, onChange){const box=document.createElement('input');box.type='checkbox';box.id=id;box.checked=checked;box.onchange=()=>onChange(box.checked);return box;}
  function heading(text){const h=document.createElement('h3');h.textContent=text;return h;}
  function gameOptions(){
    if(id!=='battle-bots')return [];
    let sens=.0024,invert=false;try{sens=Number(localStorage.getItem('bb-sens'))||sens;invert=localStorage.getItem('bb-invert')==='1';}catch{}
    const [range,out]=slider('tg-bb-sens',50,200,Math.round(sens/.0024*100),v=>{try{localStorage.setItem('bb-sens',String(.0024*v/100));}catch{}},v=>v+'%');
    const note=document.createElement('p');note.textContent='Mouse look changes apply the next time the game loads.';
    return [heading('Battle Bots'),row('Mouse look speed ',range,out),row(check('tg-bb-invert',invert,on=>{try{localStorage.setItem('bb-invert',on?'1':'0');}catch{}}),' Invert mouse look'),note];
  }
  function settingsContent(root, back) {
    root.replaceChildren();root.dataset.page='settings';
    root.setAttribute('aria-label','Settings');
    const title=document.createElement('h2');title.textContent='Settings';
    const [volume,volumeOut]=slider('tg-volume',0,100,Math.round(site.volume*100),v=>{site.setVolume?.(v/100);site.volume=v/100;saveSiteSettings();},v=>v?v+'%':'Off');
    const parts=[title,row('Volume ',volume,volumeOut)];
    const doc=document.documentElement;
    if(document.fullscreenEnabled&&doc.requestFullscreen){
      const full=menuButton(document.fullscreenElement?'Leave full screen':'Full screen',()=>{
        const p=document.fullscreenElement?document.exitFullscreen():doc.requestFullscreen({navigationUI:'hide'});
        p?.catch?.(()=>{});
      });full.id='tg-fullscreen';parts.push(full);
    }
    if('vibrate' in navigator)parts.push(row(check('tg-vibration',site.vibration!==false,on=>{site.setVibration?.(on);site.vibration=on;saveSiteSettings();}),' Vibration'));
    parts.push(...gameOptions());
    const status=document.createElement('p');status.setAttribute('role','status');
    let connected=false;try{connected=[...(readPads()||[])].some(p=>p?.connected&&p.mapping==='standard');}catch{}
    status.textContent=connected?'Controller connected':'Connect a standard USB or Bluetooth controller, then press and release a button.';
    const help=document.createElement('p');help.textContent=profile.help.replace('Start: menu','Start: pause');
    const checkbox=check('tg-controller-enabled',settings.enabled,on=>{settings.enabled=on;saveSettings();resetInput();});
    const [range,value]=slider('tg-deadzone',10,50,Math.round(settings.deadzone*100),v=>{settings.deadzone=v/100;saveSettings();},v=>v+'%');
    range.setAttribute('aria-label','Stick dead zone');
    const note=document.createElement('p');note.textContent='Menus: D-pad or left stick to move, A to select, B to go back. Keyboard and touch controls stay available.';
    parts.push(heading('Controller'),status,help,row(checkbox,' Enable controller gameplay'),row('Stick dead zone ',range,value),note,menuButton('Back',back));
    root.append(...parts);volume.focus({preventScroll:true});root.scrollTop=0;
  }
  function saveSettings(){try{localStorage.setItem('tg.controller.settings',JSON.stringify(settings));}catch{}}
  function menuButton(label, action){const b=document.createElement('button');b.type='button';b.textContent=label;b.className='tg-menu-action';b.onclick=action;return b;}
  const online=id==='battle-bots';
  function pauseContent() {
    pausePanel.replaceChildren();delete pausePanel.dataset.page;
    pausePanel.setAttribute('aria-label','Pause menu');
    const title=document.createElement('h2');title.textContent=online?'Game menu':'Paused';pausePanel.append(title);
    if(online){const note=document.createElement('p');note.textContent='Online matches keep running while this menu is open.';pausePanel.append(note);}
    pausePanel.append(menuButton('Resume',()=>pausePanel.close()),menuButton('Settings',()=>settingsContent(pausePanel,pauseContent)));
    if(originalMenuGames.includes(id))pausePanel.append(menuButton('Original game menu',()=>{nativeMenuPending=true;pausePanel.close();}));
    pausePanel.append(menuButton(online?'Leave match':'Quit to Teng Games',exitContent));
    pausePanel.querySelector('button').focus();
  }
  function exitContent(){
    pausePanel.replaceChildren();pausePanel.dataset.page='exit';
    const title=document.createElement('h2');title.textContent=online?'Leave the match?':'Quit the game?';
    const note=document.createElement('p');note.textContent=online?'You will leave the online match.':'Progress since your last save will be lost.';
    const stay=menuButton('Cancel',pauseContent);
    pausePanel.append(title,note,stay,menuButton(online?'Leave match':'Quit',()=>{location.href='/';}));stay.focus();
  }
  api.openPause = () => {
    if(!pausePanel||pausePanel.open)return;
    setPaused(true);pauseContent();pausePanel.showModal();pausePanel.querySelector('button').focus();
  };
  let settingsOpener = null;
  api.openSettings = () => {
    if(panel.open)return;
    settingsOpener=document.activeElement;resetInput();api.suspended=true;
    settingsContent(panel,()=>panel.close());panel.showModal();panel.querySelector('input').focus({preventScroll:true});panel.scrollTop=0;
  };
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
  function visible(el) { return el && !el.disabled && !el.closest('[hidden],.hidden') && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden'; }
  function menuRoot(){
    if(panel?.open)return panel;
    if(pausePanel?.open)return pausePanel;
    // Query separately: a selector list returns document order, which can put a
    // still-visible title screen before the options dialog layered over it.
    for(const selector of ['#options','#pausemenu','[data-name="pause"]','#panel','#overlay:not([hidden])','.modal-backdrop','#picker','#welcome','#lobby','#title','#menu','#home','#screens']){
      const root=[...document.querySelectorAll(selector)].reverse().find(el=>visible(el)&&el.querySelector('button,a[href],select,input'));
      if(root)return root;
    }
  }
  function menu(b, axes, now) {
    // Only website menus, never in-game canvas menus or the live HUD.
    const root = menuRoot();
    if (!visible(root)) return false;
    const items=[...root.querySelectorAll('button,a[href],select,input:not([type="hidden"])')].filter(visible);
    if (!items.length) return false;
    const selected=document.activeElement;
    const horizontal=b[15]||axes[0]>.5?1:b[14]||axes[0]<-.5?-1:0;
    if(horizontal&&items.includes(selected)&&now-lastMenu>220&&(selected.tagName==='SELECT'||selected.type==='range')){
      if(selected.tagName==='SELECT')selected.selectedIndex=Math.max(0,Math.min(selected.options.length-1,selected.selectedIndex+horizontal));
      else selected.value=String(Math.max(Number(selected.min),Math.min(Number(selected.max),Number(selected.value)+horizontal*Number(selected.step||1))));
      selected.dispatchEvent(new Event('input',{bubbles:true}));selected.dispatchEvent(new Event('change',{bubbles:true}));lastMenu=now;return true;
    }
    const step=(b[13]||axes[1]>.5||horizontal>0)?1:(b[12]||axes[1]<-.5||horizontal<0)?-1:0;
    if(step && now-lastMenu>220){const i=items.indexOf(document.activeElement);items[(i+step+items.length)%items.length].focus();lastMenu=now;}
    if(b[0]&&!previous[0]) { const selected=items.includes(document.activeElement)?document.activeElement:items.find(x=>x.tagName==='BUTTON')||items[0];selected.click(); armed=false; }
    if((b[1]&&!previous[1])||(b[9]&&!previous[9])){
      armed=false;if(panel?.open)panel.close();
      else if(pausePanel?.open){if(pausePanel.dataset.page)pauseContent();else pausePanel.close();}
      else items.find(x=>/back|cancel|resume|keep playing|close|done/i.test(x.textContent))?.click();
    }
    return true;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    let pad;try {pad=[...readPads()].find(p=>p?.connected&&p.mapping==='standard');}catch{}
    const status=(panel?.open?panel:pausePanel?.open?pausePanel:null)?.querySelector('[role=status]');
    const label=pad?'Controller connected':'Connect a standard USB or Bluetooth controller, then press and release a button.';
    if(status&&status.textContent!==label)status.textContent=label;
    if(!pad || !active || document.hidden){release(); previous=[];padId=null;return;}
    const b=pad.buttons.map(x=>x.pressed||x.value>.5), axes=[0,1,2,3].map(i=>Math.abs(pad.axes[i]||0)<settings.deadzone?0:Math.max(-1,Math.min(1,pad.axes[i])));
    if(padId!==pad.index+':'+pad.id){padId=pad.index+':'+pad.id;armed=false;release();}
    if(!armed){armed=!b.some(Boolean)&&!axes.some(Boolean);previous=b;return;}
    const typing=/^(TEXTAREA)$/.test(document.activeElement?.tagName)||document.activeElement?.matches('input:not([type="checkbox"]):not([type="range"])')||document.activeElement?.isContentEditable;
    api.suspended=typing||!!panel?.open||api.paused;
    if(typing){armed=false;release();previous=b;return;}
    if(id==='chess'&&b[9]&&!previous[9]&&!menuRoot()){document.querySelector('#settings-btn')?.click();armed=false;previous=b;return;}
    if(id==='lemmings'&&b[9]&&!previous[9]&&!menuRoot()){key('Escape',true);key('Escape',false);armed=false;previous=b;return;}
    if(profile.pause && b[9]&&!previous[9]&&!panel?.open&&!pausePanel?.open&&!visible(document.querySelector('#sheet.on'))){api.openPause();previous=b;return;}
    const inMenu = menu(b,axes,now);
    api.suspended = typing || !!panel?.open || api.paused || inMenu || !settings.enabled;
    if(inMenu){release();previous=b;return;}
    if(!settings.enabled){release();previous=b;return;}
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
    if(!document.body)return;   // the page is being replaced (e.g. tg-profile.js sent it elsewhere)
    const style=document.createElement('style');style.textContent=`
      .tg-pause-dialog{box-sizing:border-box!important;position:fixed!important;inset:0!important;margin:auto!important;width:min(480px,calc(100% - 24px))!important;max-width:calc(100% - 24px)!important;max-height:calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))!important;overflow:auto!important;background:#211b35!important;color:#fff!important;border:2px solid #a38bef!important;border-radius:16px!important;padding:20px!important;font:16px/1.5 system-ui!important;touch-action:pan-y!important;text-align:left!important;z-index:20000!important}
      .tg-pause-dialog::backdrop{background:#080512b8}.tg-pause-dialog h2{font:700 24px/1.25 system-ui;margin:0 0 16px}.tg-pause-dialog p{margin:12px 0;overflow-wrap:anywhere}.tg-menu-action{box-sizing:border-box;position:static!important;display:block!important;min-height:44px!important;max-width:100%;padding:10px 16px!important;margin:8px 0!important;border:1px solid #b9a8ef!important;border-radius:9px!important;background:#33264e!important;color:#fff!important;font:600 16px/1.4 system-ui!important;cursor:pointer;touch-action:manipulation!important;white-space:normal!important}
      .tg-menu-action:focus-visible,.tg-pause-dialog input:focus-visible{outline:3px solid #ffce54!important;outline-offset:2px}.tg-setting{display:flex!important;flex-wrap:wrap;align-items:center;gap:12px;margin:16px 0}.tg-setting input[type=checkbox]{width:24px;height:24px}.tg-setting input[type=range]{flex:1;min-width:100px;min-height:44px}.tg-setting output{min-width:3em}.tg-pause-dialog h3{font:700 18px/1.3 system-ui;margin:20px 0 4px}
      #tg-pause-toggle{position:fixed!important;right:calc(8px + env(safe-area-inset-right));top:calc(8px + env(safe-area-inset-top));z-index:9999;font-size:14px!important;margin:0!important}
      body[data-tg-game=demon-dragon] #tg-pause-toggle,body[data-tg-game=battle-bots] #tg-pause-toggle{top:calc(58px + env(safe-area-inset-top))}
      body[data-tg-game=escape-velocity] #tg-pause-toggle{right:auto;left:calc(8px + env(safe-area-inset-left))}
      body[data-tg-game=escape-velocity]:has(#tc[style*="display: block"]) #tg-pause-toggle{display:none!important}
      nav #tg-pause-toggle,#toolbar #tg-pause-toggle{position:static!important}
      body[data-tg-game=ninja-nab]:has(#screens .screen:not([hidden])) .rotate-hint,body[data-tg-game=mission-mars]:has(#pausemenu:not([hidden]),#options:not([hidden]),#help:not([hidden])) #rotate{display:none!important}
      body[data-tg-game=ninja-nab] [data-name=pause]{overflow:auto;max-height:100dvh;box-sizing:border-box}
    `;document.head.append(style);document.body.dataset.tgGame=id;
    panel=document.createElement('dialog');panel.id='tg-controller-settings';panel.className='tg-pause-dialog';panel.setAttribute('aria-label','Settings');document.body.append(panel);
    panel.addEventListener('close',()=>{resetInput();api.suspended=api.paused||!!menuRoot();settingsOpener?.focus();});
    if(profile.pause){
      pausePanel=document.createElement('dialog');pausePanel.id='tg-pause-menu';pausePanel.className='tg-pause-dialog';pausePanel.setAttribute('aria-label','Pause menu');document.body.append(pausePanel);
      const launcher=menuButton('Pause',api.openPause);launcher.id='tg-pause-toggle';launcher.setAttribute('aria-label','Pause menu');
      (document.querySelector('#toolbar, nav#bar, nav#controls')||document.body).append(launcher);
      pausePanel.addEventListener('close',()=>{
        setPaused(false);launcher.focus();
        if(nativeMenuPending){
          nativeMenuPending=false;
          requestAnimationFrame(()=>{
            forwardingNativeKey=true;key('Escape',true);
            requestAnimationFrame(()=>{key('Escape',false);forwardingNativeKey=false;});
          });
        }
      });
      pausePanel.addEventListener('cancel',e=>{if(pausePanel.dataset.page){e.preventDefault();pauseContent();}});
    }
    // These roots belong to the games' existing pause/options screens. Observing
    // rebuilt panels keeps the shared setting in place after tabs/round changes.
    const nativeMenus = {'mission-mars':'#pausemenu .panel, #options .panel','arcane-arena':'#options .panel','hammerguys-party':'#options .panel','ninja-nab':'[data-name="pause"]','beast-binder':'#panel-inner','chess':'.modal-backdrop .modal-body','lemmings':'#overlay .buttons'};
    const ownSettings=['chess','arcane-arena','hammerguys-party','mission-mars'];
    let nativeMenuWasOpen=false;
    function attach(){
      const selector=nativeMenus[id];if(!selector)return;
      const nativeMenuOpen=[...document.querySelectorAll(selector)].some(root=>visible(root));
      if(nativeMenuOpen&&!nativeMenuWasOpen){resetInput();api.suspended=true;}
      nativeMenuWasOpen=nativeMenuOpen;
      for(const root of document.querySelectorAll(selector)){
        if(id==='beast-binder'&&!/PAUSED/.test(root.textContent))continue;
        if(id==='chess'&&!/settings/i.test(root.closest('.modal').querySelector('h2')?.textContent))continue;
        if(id==='lemmings'&&document.querySelector('#overlay-title')?.textContent!=='Paused')continue;
        if(root.querySelector('[data-tg-controller]'))continue;
        const item=menuButton(ownSettings.includes(id)||root.closest('#options')?'More settings':'Settings',api.openSettings);item.dataset.tgController='';root.append(item);
        // One word for carrying on, in every game.
        for(const b of root.querySelectorAll('button'))if(/^\s*keep playing\s*$/i.test(b.textContent))b.textContent='Resume';
      }
      if(id==='ninja-nab'||id==='mission-mars')for(const root of document.querySelectorAll('.rotate-hint,#rotate')){
        if(root.querySelector('[data-tg-pause]'))continue;
        const button=menuButton('Pause menu',()=>{
          if(id==='ninja-nab')document.querySelector('#pauseBtn')?.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
          else document.querySelector('#btn-pause')?.click();
        });button.dataset.tgPause='';root.append(button);
      }
    }
    if(profile.arcade){
      try{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[...readPads()].map(p=>p&&api.filterPad(p))});}catch{}
      const header=document.querySelector('header');
      if(header){const item=menuButton('Settings',api.openSettings);item.id='tg-settings-toggle';item.className=header.querySelector('#pause')?.className||'';item.dataset.tgController='';const full=header.querySelector('#fullscreen');if(full)full.before(item);else header.append(item);}
    }
    attach();new MutationObserver(attach).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class','data-tg-pause']});
    window.addEventListener('keydown',e=>{
      if(forwardingNativeKey&&!e.isTrusted&&e.code==='Escape')return;
      const dialog=panel.open?panel:pausePanel?.open?pausePanel:null;
      if(dialog){
        if(e.key==='Escape'){e.preventDefault();if(dialog===pausePanel&&dialog.dataset.page)pauseContent();else dialog.close();}
        // Keep keyboard activation/tabbing within the modal, away from gameplay.
        e.stopImmediatePropagation();return;
      }
      if(e.repeat||e.target.matches?.('input,textarea,select,[contenteditable=true]'))return;
      if(profile.pause&&e.code==='Escape'&&!pointerGames.includes(id)&&id!=='zzt'&&!(id==='escape-velocity'&&window.evApp?.dialogs.length)){
        e.preventDefault();e.stopImmediatePropagation();api.openPause();
      }
      if(profile.arcade&&e.code==='Escape'){const p=document.querySelector('#pause');if(p&&!p.disabled){e.preventDefault();e.stopImmediatePropagation();p.click();}}
      if(id==='chess'&&(e.code==='Escape')){e.preventDefault();e.stopImmediatePropagation();document.querySelector('#settings-btn')?.click();}
    },true);
    requestAnimationFrame(frame);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
