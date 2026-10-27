// Run against local fixtures only. Commercial bytes are fulfilled directly into
// this isolated browser; they are never copied into the site or an artifact.
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'playwright');
const root=process.env.RETRO_PRIVATE_ROOT;
if(!root)throw Error('Set RETRO_PRIVATE_ROOT to the existing local fixture root');
const base=process.env.QA_URL||'http://127.0.0.1:8836';
const out=resolve('.qa/controller-engines');mkdirSync(out,{recursive:true});
const manifestCache=new Map();
function manifest(dir){
  if(manifestCache.has(dir))return manifestCache.get(dir);
  const files=[];
  function walk(folder,prefix=''){
    for(const entry of readdirSync(folder,{withFileTypes:true})){
      const rel=prefix?prefix+'/'+entry.name:entry.name,full=resolve(folder,entry.name);
      if(entry.isDirectory())walk(full,rel);
      else {const bytes=readFileSync(full);files.push({path:rel,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
    }
  }
  walk(dir);const data=JSON.stringify({files});manifestCache.set(dir,data);return data;
}
const ids=(process.env.QA_ENGINES||'keen,cosmo,jazz,tyrian,omf,openttd,scummvm,pop,heroes2,zzt,tim,lemmings').split(',');
const results=[];
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  for(const id of ids){
    const c=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
    await c.addInitScript(()=>{for(const[k,v]of Object.entries({'evonline.session':'local-engine-qa','tenggames.profileId':'local-qa','tg.owner':'local-qa','evonline.tier':'full','tg.partial':'1'}))localStorage.setItem(k,v);});
    await c.route('https://ev-online-api.justintengyz.workers.dev/**',r=>r.fulfill({json:{stage:'profile',kind:'parent',tier:'full',id:'local-qa'}}));
    await c.route('**/private-data/**',async route=>{
      const parts=decodeURIComponent(new URL(route.request().url()).pathname).split('/').filter(Boolean).slice(1);
      const dir=resolve(root,parts[0]),file=resolve(dir,...parts.slice(1));
      if(!dir.startsWith(resolve(root)+sep)||!(file===dir||file.startsWith(dir+sep)))return route.fulfill({status:404});
      try {
        if(parts.slice(1).join('/')==='manifest')return route.fulfill({contentType:'application/json',body:manifest(dir)});
        return route.fulfill({contentType:'application/octet-stream',body:readFileSync(file)});
      }catch{return route.fulfill({status:404});}
    });
    const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
    try {
      await p.goto(base+`/retro/web/${id}/index.html`+(id==='keen'?'?ep=keen1':''));
      await p.waitForFunction(()=>window.TGController);
      for(let n=0;n<45;n++){
        const ready=await p.evaluate(()=>!!((window.__retro||window.__pop||window.__heroes2)?.mod||window.__tim?.ready||window.__lemmings?.ready));
        if(ready)break;
        const start=p.locator('#start:not([disabled]), #episodes button, #worlds button, #games button, #picker button:not([disabled])').filter({visible:true}).first();
        if(await start.count())await start.click().catch(()=>{});
        await p.waitForTimeout(1000);
      }
      const running=await p.evaluate(()=>!!((window.__retro||window.__pop||window.__heroes2)?.mod||window.__tim?.ready||window.__lemmings?.ready));
      assert(running,'engine boots using local game data');
      await p.waitForTimeout(500);
      if(id==='tim'){
        await p.keyboard.press('Enter');await p.waitForTimeout(100);
        if(!(await p.evaluate(()=>__tim.state().running)))await p.keyboard.press('Space');
        await p.waitForTimeout(120);
        assert(await p.evaluate(()=>__tim.state().running),'TIM machine runs before pause');
      }
      await p.evaluate(()=>{
        const m=(window.__retro||window.__pop||window.__heroes2)?.mod;
        window.qaCounter=()=>m?.retroLastFrame||window.__retro?.frames?.()||window.__tim?.state().tick||window.__lemmings?.perf().ticks||0;
        if(m?._zoo_web_frame){const original=m._zoo_web_frame;window.qaZooFrames=0;m._zoo_web_frame=(...args)=>{qaZooFrames++;return original(...args)};window.qaCounter=()=>qaZooFrames;}
      });
      if(id==='lemmings'){
        await p.evaluate(()=>__lemmings.startLevel('lemmings',0,0));
        await p.waitForTimeout(300);await p.keyboard.press('Escape');
        await p.locator('#overlay [data-tg-controller]').click();
      }else{
        await p.evaluate(()=>TGController.openPause());
        await p.getByRole('button',{name:'Settings',exact:true}).click();
      }
      await p.waitForTimeout(200);const count=await p.evaluate(()=>qaCounter());
      const canvas=p.locator('canvas:visible').first();
      const picture=createHash('sha256').update(await canvas.screenshot()).digest('hex');
      await p.waitForTimeout(350);assert.equal(await p.evaluate(()=>qaCounter()),count,'frame/tick counter stays frozen');
      assert.equal(createHash('sha256').update(await canvas.screenshot()).digest('hex'),picture,'engine canvas stays frozen');
      await p.locator('dialog[open]').getByRole('button',{name:'Back',exact:true}).tap();
      if(id!=='lemmings'){
        assert(await p.evaluate(()=>TGController.paused),'Back preserves pause');
        await p.getByRole('button',{name:'Resume',exact:true}).tap();
        await p.waitForFunction(()=>!TGController.paused);
      }else{
        assert(await p.evaluate(()=>__lemmings.paused),'native timer stays paused after settings');
        await p.locator('#overlay button').filter({hasText:/^Resume$/}).tap();
      }
      await p.waitForTimeout(350);
      if(['keen','cosmo','jazz','tyrian','omf','pop'].includes(id)){
        await p.evaluate(()=>{window.qaNativeEscCount=0;window.addEventListener('keydown',e=>{if(e.code==='Escape')qaNativeEscCount++;},true);TGController.openPause();});
        await p.getByRole('button',{name:'Original game menu',exact:true}).tap();
        await p.waitForFunction(()=>!TGController.paused&&qaNativeEscCount>0);
        assert.equal(await p.locator('#tg-pause-menu[open]').count(),0,'original save/load menu key is forwarded');
      }
      assert.equal(errors.length,0,errors.join('\n'));
      results.push({id,passed:true,counterAtPause:count,counterAfterResume:await p.evaluate(()=>qaCounter())});
      console.log('PASS',id);
    }catch(e){console.log('FAIL',id,e.message.split('\n')[0]);results.push({id,passed:false,error:e.message,errors});await p.screenshot({path:resolve(out,`FAIL-${id}.png`)}).catch(()=>{});}
    await c.close();
  }
}finally{
  await browser.close();
  let prior=[];if(process.env.QA_ENGINES)try{prior=JSON.parse(readFileSync(resolve(out,'results.json'),'utf8')).filter(r=>!ids.includes(r.id));}catch{}
  writeFileSync(resolve(out,'results.json'),JSON.stringify([...prior,...results],null,2));
}
if(results.some(r=>!r.passed))process.exitCode=1;
