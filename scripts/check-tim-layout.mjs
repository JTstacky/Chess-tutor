// TIM layout regression check against the shipped site, using local fixtures.
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=resolve(process.env.RETRO_PRIVATE_ROOT||'E:/AI/Games/Retro Archive/private','tim');
const baseline=process.argv.includes('--baseline');
const out=resolve('.qa/tim-layout-'+(baseline?'before':'after'));mkdirSync(out,{recursive:true});
const files=readdirSync(root).map(path=>{const b=readFileSync(resolve(root,path));return{path,size:b.length,sha256:createHash('sha256').update(b).digest('hex')}});
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
const sizes=[[1280,800],[1024,768],[820,1180],[844,390],[667,375],[568,320],[390,844],[320,568],[320,480],[750,750]];
try{
  for(const[width,height]of sizes){
    const c=await browser.newContext({viewport:{width,height},hasTouch:true});
    await c.addInitScript(()=>{for(const[k,v]of Object.entries({'evonline.session':'local-tim-qa','tenggames.profileId':'local-qa','tg.owner':'local-qa','evonline.tier':'full','tg.partial':'1'}))localStorage.setItem(k,v)});
    await c.route('https://ev-online-api.justintengyz.workers.dev/**',r=>r.fulfill({json:{kind:'parent',tier:'full',id:'local-qa'}}));
    await c.route('**/private-data/tim/**',r=>{const name=decodeURIComponent(new URL(r.request().url()).pathname.split('/').at(-1));return name==='manifest'?r.fulfill({json:{files}}):r.fulfill({body:readFileSync(resolve(root,name)),contentType:'application/octet-stream'})});
    const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    try{
      await p.goto((process.env.QA_URL||'http://127.0.0.1:8836')+'/retro/web/tim/index.html');
      await p.waitForFunction(()=>window.__tim?.ready);await p.waitForTimeout(150);
      const geometry=await p.evaluate(()=>{
        const rect=el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
        return{canvas:rect(document.querySelector('#screen')),stage:rect(document.querySelector('#stage')),controls:rect(document.querySelector('#controls')),buttons:[...document.querySelectorAll('#controls button,#controls a')].map(b=>({text:b.textContent,...rect(b)}))};
      });
      const failures=[];
      const fits=r=>r.x>=-.5&&r.y>=-.5&&r.x+r.w<=width+.5&&r.y+r.h<=height+.5;
      if(!fits(geometry.canvas))failures.push('canvas outside viewport');
      for(const b of geometry.buttons)if(!fits(b))failures.push(b.text.trim()+' outside viewport');
      if(!baseline){
        assert.equal(failures.length,0,failures.join(', '));
        const cv=geometry.canvas,stage=geometry.stage;assert(cv.x>=stage.x-.5&&cv.y>=stage.y-.5&&cv.x+cv.w<=stage.x+stage.w+.5&&cv.y+cv.h<=stage.y+stage.h+.5,'canvas fits its reserved stage');
        assert(Math.abs(cv.w-Math.min(stage.w,stage.h*640/448))<2,'canvas uses the largest available scale');
        if(height>=width){
          assert(cv.y>=64,'portrait canvas clears the top pause area');
          assert(Math.abs(cv.y+cv.h-geometry.controls.y+8)<2,'portrait canvas is docked just above controls');
        }
        assert(geometry.controls.y+geometry.controls.h>=height-1,'controls are docked at the bottom');
        assert(Math.max(...geometry.buttons.map(b=>b.y+b.h))>=height-9,'buttons use the bottom edge rather than centering in the sidebar');
        assert.equal(await p.locator('#tg-pause-toggle').evaluate(el=>getComputedStyle(el).position),'static','Pause stays inside the bottom toolbar');
        for(const b of geometry.buttons){assert(b.h>=44,'44px touch target');assert(!(cv.x<b.x+b.w&&cv.x+cv.w>b.x&&cv.y<b.y+b.h&&cv.y+cv.h>b.y),'canvas overlaps toolbar');}
        assert.equal(geometry.buttons.length,8,'all seven native controls plus shared Pause are present');
        const point=await p.evaluate(()=>__tim.toClient(70,106));await p.touchscreen.tap(point.x,point.y);assert.equal(await p.evaluate(()=>__tim.state().screen),'play','in-canvas arrow responds at the scaled position');
        // Place and remove a part by touch, proving canvas input coordinates after scaling.
        const part=await p.evaluate(()=>{const b=__tim.binBox(2);return __tim.toClient(b.x+b.w/2,b.y+14)});await p.touchscreen.tap(part.x,part.y);
        assert(await p.evaluate(()=>!!__tim.state().held),'touch can pick a part from the bin');
        await p.locator('[data-action=flip]').tap();await p.locator('[data-action=remove]').tap();assert.equal(await p.evaluate(()=>__tim.state().held),null,'toolbar Remove responds');
        await p.locator('[data-action=run]').tap();assert(await p.evaluate(()=>__tim.state().running),'Start responds');
        await p.locator('#tg-pause-toggle').tap();await p.getByRole('button',{name:'Controller settings',exact:true}).tap();await p.getByRole('button',{name:'Back',exact:true}).tap();await p.getByRole('button',{name:'Resume',exact:true}).tap();await p.waitForFunction(()=>!TGController.paused);
        await p.locator('[data-action=run]').tap();assert.equal(await p.evaluate(()=>__tim.state().running),false,'Stop responds');
        await p.locator('[data-action=menu]').tap();assert.equal(await p.evaluate(()=>__tim.state().screen),'intro','Menu responds');
        // A toolbar size change must rescale without a window resize event.
        await p.evaluate(()=>document.querySelector('#controls').style.setProperty('padding-bottom','40px'));
        await p.waitForTimeout(100);
        assert(await p.evaluate(()=>{const a=document.querySelector('#screen').getBoundingClientRect(),b=document.querySelector('#stage').getBoundingClientRect();return a.width<=b.width+.5&&a.height<=b.height+.5}),'ResizeObserver fits changed toolbar space');
        await p.evaluate(()=>document.querySelector('#controls').style.removeProperty('padding-bottom'));
        await p.setViewportSize({width:height,height:width});await p.waitForTimeout(100);
        assert(await p.evaluate(()=>{const a=document.querySelector('#screen').getBoundingClientRect();return a.x>=0&&a.y>=0&&a.right<=innerWidth+.5&&a.bottom<=innerHeight+.5}),'canvas fits after rotation');
        await p.setViewportSize({width,height});await p.waitForTimeout(100);
        assert.equal(errors.length,0,errors.join('\n'));
      }
      await p.screenshot({path:resolve(out,`${width}x${height}.png`)});
      results.push({width,height,geometry,failures,passed:baseline?failures.length===0:true});console.log(width+'x'+height,failures.length?failures.join('; '):'PASS');
    }catch(e){results.push({width,height,passed:false,error:e.message});console.log('FAIL',width,height,e.message.split('\n')[0]);await p.screenshot({path:resolve(out,`FAIL-${width}x${height}.png`)}).catch(()=>{});}
    await c.close();
  }
}finally{await browser.close();writeFileSync(resolve(out,'results.json'),JSON.stringify(results,null,2));}
if(!baseline&&results.some(r=>!r.passed))process.exitCode=1;
