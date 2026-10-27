// Browser integration tests. Uses isolated local QA identity and virtual gamepad;
// never authenticates to, writes to, or downloads private data from production.
// PLAYWRIGHT_PACKAGE may point to an existing toolkit installation.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const base = process.env.QA_URL || 'http://127.0.0.1:8836';
const out = resolve('.qa/controller-menus');
mkdirSync(out, { recursive: true });
const originals = ['chess','demon-dragon','beast-binder','arcane-arena','hammerguys-party','battle-bots','mission-mars','ninja-nab','zeliard','escape-velocity'];
const retro = ['keen','jazz','cosmo','pop','tyrian','omf','zzt','heroes2','openttd','scummvm','tim','lemmings','metal-slug'];
const results = [], errors = [];
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
async function context(viewport, touch = false) {
  const c = await browser.newContext({ viewport, hasTouch: touch, reducedMotion: 'reduce' });
  await c.addInitScript(() => {
    for (const [k,v] of Object.entries({ 'evonline.session':'local-menu-qa', 'tenggames.profileId':'local-qa', 'tg.owner':'local-qa', 'evonline.tier':'full', 'tg.partial':'1' })) localStorage.setItem(k,v);
    window.qaPad = { index:0, id:'Virtual QA standard pad', mapping:'standard', connected:true, axes:[0,0,0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0})) };
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[window.qaPad]});
  });
  await c.route('https://ev-online-api.justintengyz.workers.dev/**', r => r.fulfill({ json: { stage:'profile', id:'local-qa', kind:'parent', tier:'full' } }));
  // Launcher/menu coverage does not require commercial game data. Full engine
  // pause checks are run separately with the local private-data fixture root.
  await c.route('**/private-data/**', r => r.fulfill({ status:403, contentType:'text/plain', body:'Local menu QA: data not loaded' }));
  return c;
}
async function pad(page, button) {
  // A menu opening clears input and requires a neutral frame before rearming.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(i=>{qaPad.buttons[i]={pressed:true,value:1};},button);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForTimeout(60);
  await page.evaluate(i=>{qaPad.buttons[i]={pressed:false,value:0};},button);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForTimeout(80);
}
async function openNative(page,id) {
  if (id==='chess') return page.locator('#settings-btn').click();
  if (id==='arcane-arena'||id==='hammerguys-party') return page.locator('#menu-options').click();
  if (id==='mission-mars') return page.locator('#title-options').click();
  // Native game scenes are put directly into their real paused state for menu
  // layout coverage; the separate gameplay tests exercise their input triggers.
  if (id==='beast-binder') {
    await page.waitForFunction(()=>typeof Game!=='undefined'&&Game.canvas);
    await page.evaluate(()=>{Game.startNew();Game.pickHero('blade');Voyage.skip();UI.togglePanel('pause');});return;
  }
  if (id==='ninja-nab') {
    await page.waitForSelector('[data-name="pause"]',{state:'attached'});
    await page.evaluate(()=>{for(const s of document.querySelectorAll('#screens .screen'))s.hidden=s.dataset.name!=='pause';});return;
  }
  if (id==='lemmings') {
    // DOM menu structure is authored by the native engine, including its own
    // timer suspension; full running-level coverage is in the engine check.
    await page.evaluate(()=>{document.querySelector('#app').dataset.screen='play';document.querySelector('#overlay-title').textContent='Paused';document.querySelector('#overlay').hidden=false;document.querySelector('#play').style.display='block';});return;
  }
  if (id==='zeliard') {
    await page.waitForFunction(()=>window.game);
    await page.evaluate(async()=>{const {PauseScene}=await import('/zeliard/game/src/scenes/menus.js');game.push(new PauseScene(game,game.scenes.at(-1)));});
    // Controller settings is the second native canvas menu item.
    await pad(page,13);await pad(page,0);return;
  }
}
async function layout(page, dialog) {
  const box=await dialog.boundingBox();const size=page.viewportSize();
  assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,'dialog stays in viewport');
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'no horizontal overflow');
  for(const b of await dialog.locator('button').all())assert((await b.boundingBox()).height>=44,'touch target >=44px');
}
try {
  for(const [size,viewport] of Object.entries({desktop:{width:1280,height:800},tablet:{width:820,height:1180},phone:{width:390,height:844},landscape:{width:844,height:390}})) {
    const c=await context(viewport,size!=='desktop');
    for(const id of [...originals,...retro.map(x=>'retro/'+x),'escape-velocity-evo']) {
      const page=await c.newPage();const game=id.replace('retro/','').replace('-evo','');
      page.on('pageerror',e=>{if(!(id.startsWith('retro/')&&e.message==='This game needs a full account.'))errors.push({id,size,message:e.message});});
      try {
        const path=id.startsWith('retro/')?`/retro/web/${game}/index.html`:game==='chess'?'/chess/':game==='zeliard'?'/zeliard/game/index.html':`/${game}/index.html`;
        await page.goto(base+path+(id.endsWith('-evo')?'?game=evo':''));
        await page.waitForFunction(()=>window.TGController);
        await page.waitForTimeout(200);
        assert.equal(await page.locator('#tg-controller-help').count(),0,'no floating controller button');
        assert.equal(await page.evaluate(()=>[...document.head.children].find(e=>!(e.src||'').includes('/@vite/'))?.getAttribute('src')),'/tg-profile.js','profile script first in <head>');
        const fallback=await page.locator('#tg-pause-toggle').count();
        if(game==='escape-velocity'){await page.waitForFunction(()=>window.evApp);await page.evaluate(()=>evApp.paused=true);}
        if(fallback){if(await page.locator('#tg-pause-toggle').isVisible())await page.locator('#tg-pause-toggle').click();else await pad(page,9);
          assert.deepEqual(await page.locator('#tg-pause-menu button').allInnerTexts(),['Resume','Settings',...(['keen','jazz','cosmo','pop','tyrian','omf'].includes(game)?['Original game menu']:[]),game==='battle-bots'?'Leave match':'Quit to Teng Games'],'standard pause menu order');
          await page.getByRole('button',{name:'Settings',exact:true}).click();}
        else if(game.startsWith('metal-slug'))await page.locator('#tg-settings-toggle').click();
        else {
          await openNative(page,game);
          if(game!=='zeliard'){
            await pad(page,13);
            const roots={chess:'.modal-backdrop','arcane-arena':'#options','hammerguys-party':'#options','mission-mars':'#options','beast-binder':'#panel','ninja-nab':'[data-name="pause"]',lemmings:'#overlay'};
            assert(await page.evaluate(selector=>!!document.activeElement.closest(selector),roots[game]),'D-pad stays in the top menu');
            assert.equal(await page.locator('[data-tg-controller]:visible').last().innerText(),['chess','arcane-arena','hammerguys-party','mission-mars'].includes(game)?'More settings':'Settings','shared item name');
            if(game==='ninja-nab')assert.deepEqual(await page.locator('[data-name=pause] button').filter({hasText:/^(Resume|Keep playing)$/}).allInnerTexts(),['Resume'],'Resume, not Keep playing');
            await page.locator('[data-tg-controller]:visible').last().focus();await pad(page,0);
          }
        }
        const dialog=page.locator('dialog[open]');await dialog.waitFor();
        assert.match(await dialog.innerText(),/^Settings[\s\S]*Volume[\s\S]*Controller[\s\S]*Stick dead zone/);
        await layout(page,dialog);
        if(size==='phone'||(size==='landscape'&&['demon-dragon','zeliard','chess'].includes(game)))await page.screenshot({path:resolve(out,`${size}-${id.replace('/','-')}.png`)});
        if(size==='desktop')await dialog.getByRole('button',{name:'Back',exact:true}).click();else await dialog.getByRole('button',{name:'Back',exact:true}).tap();
        if(fallback){assert.equal(await page.evaluate(()=>TGController.paused),true,'Back keeps game paused');await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForFunction(()=>!TGController.paused);}
        else assert.equal(await page.locator('#tg-controller-settings[open]').count(),0);
        if(game==='escape-velocity')assert.equal(await page.evaluate(()=>evApp.paused),false,'Resume clears an existing native pause');
        results.push({id,size,passed:true});
      }catch(e){results.push({id,size,passed:false,error:e.message.split('\n')[0]});console.log('FAIL',size,id,e.message.split('\n')[0]);await page.screenshot({path:resolve(out,`FAIL-${size}-${id.replace('/','-')}.png`)}).catch(()=>{});}
      await page.close();
    }
    await c.close();
    console.log(size,results.filter(r=>r.size===size&&r.passed).length,'/',24);
  }
  // Real gameplay pause, analog input, and no held input after resume, with an
  // emulated standard pad. Hardware pairing/radio behavior is outside this test.
  const c=await context({width:390,height:844},true);const p=await c.newPage();
  await p.goto(base+'/demon-dragon/index.html?debug');await p.waitForFunction(()=>window.DBG,null,{timeout:60000});
  await p.evaluate(()=>DBG.world());await p.waitForFunction(()=>document.querySelector('#app.mode-world')&&DBG.level());await p.waitForTimeout(1000);
  await p.keyboard.down('ArrowRight');await p.waitForTimeout(120);await pad(p,9);
  assert(await p.locator('#tg-pause-menu').evaluate(el=>el.open),'Start pauses during movement');
  const time=await p.evaluate(()=>Gfx.time);await p.waitForTimeout(350);assert.equal(await p.evaluate(()=>Gfx.time),time,'simulation/render time frozen');
  await p.keyboard.up('ArrowRight');await p.waitForTimeout(200);await pad(p,13);await pad(p,0);
  assert.match(await p.locator('#tg-pause-menu').innerText(),/Stick dead zone/,'D-pad + A opens settings');
  await pad(p,1);assert.match(await p.locator('#tg-pause-menu').innerText(),/Resume/,'B returns to pause');await pad(p,1);await p.waitForFunction(()=>!TGController.paused);
  await p.waitForTimeout(150);const pos=await p.evaluate(()=>({x:DBG.level().knight.x,z:DBG.level().knight.z}));await p.waitForTimeout(250);
  assert.deepEqual(await p.evaluate(()=>({x:DBG.level().knight.x,z:DBG.level().knight.z})),pos,'no stuck movement after resume');
  // Touch entry, settings persistence, disabled gameplay and analog adjustment.
  await p.locator('#tg-pause-toggle').tap();await p.getByRole('button',{name:'Settings',exact:true}).tap();
  await p.locator('#tg-deadzone').focus();await pad(p,15);
  assert.equal(await p.locator('#tg-deadzone + output').innerText(),'23%','D-pad adjusts dead zone accurately');
  await p.locator('#tg-controller-enabled').tap();
  await p.getByRole('button',{name:'Back',exact:true}).tap();await p.getByRole('button',{name:'Resume',exact:true}).tap();await p.waitForFunction(()=>!TGController.paused);
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('tg.controller.settings')).enabled),false,'controller enable setting persists');
  await p.evaluate(()=>qaPad.axes[0]=.8);await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>TGController.state.connected),false,'disabled controller does not drive gameplay');
  await p.evaluate(()=>qaPad.axes[0]=0);await p.waitForTimeout(100);await pad(p,9);
  assert(await p.locator('#tg-pause-menu').evaluate(el=>el.open),'Start still opens menus when gameplay disabled');
  results.push({id:'demon-dragon',size:'interaction',passed:true});
  // Site volume: everything sent to the speakers goes through one level, saved per device.
  const qaSound=()=>p.evaluate(()=>{const ctx=new AudioContext();const o=ctx.createOscillator();const g=o.connect(ctx.destination);o.disconnect(ctx.destination);const a=new Audio();a.volume=.5;return {gain:Math.round(g.gain.value*100)/100,media:a.volume};});
  assert.deepEqual(await qaSound(),{gain:1,media:.5},'full volume by default; games read back their own volume');
  if(!await p.evaluate(()=>TGController.paused))await p.locator('#tg-pause-toggle').tap();await p.getByRole('button',{name:'Settings',exact:true}).tap();
  await p.locator('#tg-volume').evaluate(el=>{el.value='40';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await p.locator('#tg-volume + output').innerText(),'40%');
  assert.deepEqual(await qaSound(),{gain:.4,media:.5},'volume applies to new sound');
  assert.equal(await p.evaluate(()=>navigator.vibrate(30)),true,'vibration on by default');
  await p.locator('#tg-vibration').tap();
  assert.equal(await p.evaluate(()=>navigator.vibrate(30)),false,'vibration off is honoured');
  // Quit asks first; Cancel and B both go back to the pause menu.
  await p.getByRole('button',{name:'Back',exact:true}).tap();
  await p.getByRole('button',{name:'Quit to Teng Games',exact:true}).tap();
  assert.match(await p.locator('#tg-pause-menu').innerText(),/Quit the game\?/);
  await p.getByRole('button',{name:'Cancel',exact:true}).tap();
  await p.getByRole('button',{name:'Quit to Teng Games',exact:true}).tap();await pad(p,1);
  assert.match(await p.locator('#tg-pause-menu').innerText(),/Resume/,'B leaves the quit question');
  await p.getByRole('button',{name:'Resume',exact:true}).tap();await p.waitForFunction(()=>!TGController.paused);
  await p.reload();await p.waitForFunction(()=>window.TGController);
  assert.deepEqual(await qaSound(),{gain:.4,media:.5},'volume kept after reload');
  assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('tg.settings'))),{volume:.4,vibration:false},'settings saved per device');
  results.push({id:'site-settings',size:'interaction',passed:true});
  // Arcane Arena and Hammerguy's Party no longer share their mute switch.
  await p.goto(base+'/hammerguys-party/index.html');await p.waitForFunction(()=>window.TGController);
  await p.evaluate(()=>{localStorage.setItem('aa-muted','1');localStorage.setItem('aa-volume','0.3');});
  assert.deepEqual(await p.evaluate(()=>[localStorage.getItem('aa-muted'),Object.keys(localStorage).filter(k=>/^(aa|hp)-/.test(k)).sort()]),['1',['hp-muted','hp-volume']],"Hammerguy's keeps its own sound keys");
  await p.goto(base+'/arcane-arena/index.html');await p.waitForFunction(()=>window.TGController);
  assert.equal(await p.evaluate(()=>localStorage.getItem('aa-muted')),null,'Arcane Arena unaffected by muting Hammerguy');
  results.push({id:'separate-sound-keys',size:'interaction',passed:true});
  // Metal Slug's own pad reading gets the site dead zone and the controller switch.
  const slugAxis=async(x,enabled)=>{
    await p.evaluate(on=>{qaPad.axes=[0,0,0,0];localStorage.setItem('tg.controller.settings',JSON.stringify({enabled:on,deadzone:.22}));},enabled);
    await p.goto(base+'/retro/web/metal-slug/index.html');await p.waitForFunction(()=>window.TGController);await p.waitForTimeout(150);
    await p.evaluate(v=>{qaPad.axes=[v,0,0,0];},x);await p.waitForTimeout(100);
    return p.evaluate(()=>navigator.getGamepads()[0].axes[0]);
  };
  assert.equal(await slugAxis(.15,true),0,'site dead zone applies to Metal Slug');
  assert.equal(await slugAxis(.8,true),.8,'enabled controller reaches Metal Slug');
  assert.equal(await slugAxis(.8,false),0,'disabled controller blocks Metal Slug input');
  await p.evaluate(()=>{qaPad.axes=[0,0,0,0];});
  results.push({id:'metal-slug-pad',size:'interaction',passed:true});
  await c.close();
} finally {
  await browser.close();
  writeFileSync(resolve(out,'results.json'),JSON.stringify({results,errors},null,2));
  console.log('Results',results.filter(r=>r.passed).length,'passed;',results.filter(r=>!r.passed).length,'failed; page errors:',errors.length);
}
if(results.some(r=>!r.passed)||errors.length)process.exitCode=1;
