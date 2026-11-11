import { importFromFiles,readManifest,forgetGameData } from './data-import.js';
import { privateStoreSource } from './sources/private-store.js';
import { engineAvailable,launch } from './launcher.js';
import { setupTouch } from './touch.js';
import { listSaves,importSave,deleteSave } from './saves.js';
import { mountOnline } from './online.js';
import { saveFiles } from './saves.js';
import { createCloudSaves,cloudApi,readCredentials,localState } from './cloud-saves.js';
import { PRIVATE_STORE } from './config.js';
import { isEngineFailure,isEngineExit } from './engine-health.js';

const $=id=>document.getElementById(id);
// Remember the AudioContext SDL creates (it isn't reliably reachable on the module object), so the
// Sound button and the hidden-tab pause can find it. It starts suspended until the first tap.
let gameAudio=null;
if(window.AudioContext){
  const Base=window.AudioContext;
  window.AudioContext=class extends Base{constructor(...a){super(...a);gameAudio=this;}};
}
const audioOf=m=>m?.SDL2?.audioContext??m?.SDL?.audioContext??m?.audioContext??gameAudio;
globalThis.h3GameAudio=()=>gameAudio;
let isolated=crossOriginIsolated, manifest=null, engine=false, module=null, launching=false;
let online=null, cloud=null;
// Solo saves sync with the player's account (full accounts), so a campaign carries on from any device.
function cloudStatus(text){
  const box=$('cloud-status');box.textContent=text;box.hidden=!text;
  clearTimeout(cloudStatus.timer);cloudStatus.timer=setTimeout(()=>{box.hidden=true;},6000);
}
function mountCloud(){
  const signedIn=readCredentials();if(!signedIn)return null;
  return createCloudSaves({files:saveFiles,state:localState(),profile:signedIn.profile,onStatus:cloudStatus,
    api:cloudApi({base:PRIVATE_STORE.apiBase,token:signedIn.token,device:signedIn.device})});
}
// Bring in saves from other devices before VCMI lists them; never hold the game up for long.
async function syncBeforeStart(){
  if(!cloud)return;
  status('Getting your saves…');
  await Promise.race([cloud.sync(),new Promise(resolve=>setTimeout(resolve,20000))]);
}
function status(message){$('status').textContent=message;}
async function ensureIsolation(){
  if(isolated)return true;
  if('serviceWorker' in navigator && !sessionStorage.getItem('h3.coiReloaded')) {
    sessionStorage.setItem('h3.coiReloaded','1');
    await navigator.serviceWorker.register('./coi-sw.js',{scope:'./'});
    await navigator.serviceWorker.ready;
    location.reload();return false;
  }
  status("This browser can't run the game. Try Chrome, Edge, Firefox or Safari directly, not inside another app.");
  return false;
}
function refresh(){
  $('forget').hidden=!manifest;$('forget-saves-wrap').hidden=!manifest;
  $('launch').disabled=!(manifest&&engine&&isolated)||launching;
  $('engine-status').textContent=!engine?'Engine not built yet':manifest ? (isolated?'Ready to play.':'Game needs a supported browser.') : 'Getting the game ready…';
  $('data-note').hidden=Boolean(manifest);
  if(isolated&&manifest)status('Ready to play.');
}
function progress({bytesDone,bytesTotal,fileCount,totalFiles,persistent}){
  $('progress').hidden=false;$('progress').max=Math.max(1,bytesTotal);$('progress').value=bytesDone;
  $('progress-text').textContent=`${Math.round(100*bytesDone/Math.max(1,bytesTotal))}% · the first time takes a little longer`;
}
async function refreshSaves(){
  const list=$('save-list');list.replaceChildren();
  const saves=await listSaves();
  $('save-status').textContent=saves.length?`${saves.length} save${saves.length===1?'':'s'} on this device.`:'No saved games on this device yet.';
  for(const save of saves){
    const row=document.createElement('li'),label=document.createElement('span');
    label.textContent=`${save.name} · ${(save.size/1048576).toFixed(1)} MB · ${new Date(save.modified).toLocaleString()}`;
    const remove=document.createElement('button');
    remove.type='button';remove.textContent='Delete';
    remove.addEventListener('click',async()=>{
      if(!confirm(`Delete ${save.name} from this device?`))return;
      try{await deleteSave(save.name);await refreshSaves();}
      catch(error){$('save-status').textContent=error.message;}
    });
    row.append(label,remove);list.append(row);
  }
}
async function runImport(task){
  status('Loading Heroes III…');$('progress').hidden=true;$('progress-text').textContent='';
  try {
    const result=await task({onProgress:progress});
    manifest=result.manifest;
    $('progress').hidden=true;$('progress-text').textContent='';
    refresh();
    online?.resume();
    return true;
  }
  catch(e){status(e.message);console.error(e);$('private-store').hidden=!privateStoreSource.isAvailable();return false;}
}
// The game files come from the private store (full accounts), downloaded once per device.
async function getFiles(){
  if(!privateStoreSource.isAvailable()){status('Heroes III needs a full Teng Games account.');return false;}
  $('private-store').hidden=true;
  status('Loading Heroes III…');
  return runImport(o=>privateStoreSource.load(o));
}
// Start-up bar over the game screen: engine log lines move it through stages, and between stages it
// keeps creeping towards the next one with a seconds counter, so a slow step never looks frozen.
const BOOT_STAGES=[
  [/Starting client of/,0.08,'Starting the game engine'],
  [/\tInitialization: /,0.12,'Reading game files'],
  [/\tData loading: /,0.55,'Loading game content'],
  [/Created renderer/,0.6,'Loading game content'],
  [/Parsing mod: /,0.7,'Loading game content'],
  [/Loading mod data/,0.8,'Loading game content'],
  [/Resolving identifiers/,0.88,'Preparing the main menu'],
  [/Handlers post-load/,0.93,'Preparing the main menu'],
  [/All game content loaded/,0.97,'Opening the main menu'],
  [/Initialization of VCMI \(together\)/,1,'Ready'],
];
function bootProgress(){
  const box=$('boot'),bar=$('boot-bar'),text=$('boot-text'),t0=Date.now();
  let value=0.02,stage=0,label='Starting the game engine',done=false;
  box.hidden=false;
  const show=()=>{bar.value=value;text.textContent=`${label}… ${Math.round(value*100)}% · ${Math.round((Date.now()-t0)/1000)}s`;};
  const timer=setInterval(()=>{
    const next=BOOT_STAGES[stage]?.[1]??1;
    value=Math.min(next-0.01,value+(next-value)*0.02);show();
  },500);
  const finish=()=>{if(done)return;done=true;clearInterval(timer);value=1;label='Ready';show();setTimeout(()=>{box.hidden=true;},800);};
  show();
  return {
    line(message){
      if(done)return;
      const text=String(message);
      for(let i=stage;i<BOOT_STAGES.length;i++)if(BOOT_STAGES[i][0].test(text)){
        stage=i+1;value=Math.max(value,BOOT_STAGES[i][1]);label=BOOT_STAGES[i][2];show();
        if(BOOT_STAGES[i][1]>=1)finish();
        break;
      }
    },
    finish,
    fail(){done=true;clearInterval(timer);box.hidden=true;},
  };
}
// A crash or fatal error leaves SDL's last frame (or nothing) on the canvas: say so and offer a reload.
// Quitting from the game's own menu ends the engine the same way, so that says so too.
let stopped=null;
function engineStopped(reason,kind='failure'){
  if(stopped==='failure'||stopped===kind||!$('game')||$('game').hidden)return;
  stopped=kind;
  if(kind==='failure')console.error('Engine stopped:',reason);
  $('boot').hidden=true;$('stopped').hidden=false;
  $('stopped-text').textContent=kind==='quit'?'You have left Heroes III. Your saved games are safe.':'The game stopped unexpectedly. Your saved games are safe.';
  $('stopped-reload').textContent=kind==='quit'?'Play again':'Reload the game';
  cloud?.stop();void cloud?.sync();
}
function watchEngineErrors(){
  addEventListener('error',event=>{if(module&&isEngineFailure(event.message??event.error))engineStopped(event.message);});
  addEventListener('unhandledrejection',event=>{if(module&&isEngineFailure(event.reason?.message??event.reason))engineStopped(String(event.reason));});
}
async function startEngine({localSeat,saveName,phase,onTurnPass,onSeats,onCheckpoint,onBattle}={}){
  if(!isolated||!manifest||!engine||launching||module)throw Error('The game is not ready to start.');
  launching=true;refresh();$('setup').hidden=true;$('game').hidden=false;
  $('loading-status').textContent='';
  const boot=bootProgress();
  try{
    module=await launch({canvas:$('canvas'),localSeat,saveName,phase,onTurnPass,onSeats,onCheckpoint,onBattle,
      onMessage:message=>{console.log(message);boot.line(message);if(isEngineFailure(message))engineStopped(message);else if(isEngineExit(message))engineStopped(message,'quit');},
      onStatus:message=>{if(isEngineFailure(message))engineStopped(message);}});
    // Safety net: if the last log line never comes, still clear the bar once the menu has had time.
    setTimeout(()=>boot.finish(),300000);
    $('friends-mode').hidden=localSeat!==undefined;
    return module;
  }catch(error){boot.fail();$('friends-mode').hidden=true;$('setup').hidden=false;$('game').hidden=true;console.error(error);throw error;}
  finally{launching=false;refresh();}
}
const soloStart=async()=>{$('launch').hidden=true;await syncBeforeStart();return startEngine().then(()=>cloud?.watch()).catch(error=>{status(`Could not start the game: ${error.message}`);$('launch').hidden=!manifest;});};
const invited=()=>Boolean(new URLSearchParams(location.hash.slice(1)).get('invite'));
const onlineMode=()=>invited()||new URLSearchParams(location.search).has('online');
// ?manual (tests): don't start by itself.
const autoStart=()=>!onlineMode()&&!new URLSearchParams(location.search).has('manual');
function switchMode(online){
  const target=new URL(location.href);
  target.searchParams.delete('manual');
  if(online)target.searchParams.set('online','1');
  else target.searchParams.delete('online');
  target.hash='';
  location.assign(target.href);
}
async function init(){
  setupTouch($('canvas'),{getAudio:()=>audioOf(module)});
  $('friends-mode').addEventListener('click',()=>{
    if(confirm('Leave this solo game? Save it inside Heroes III first if you want to keep your progress.'))switchMode(true);
  });
  $('solo-mode').addEventListener('click',()=>switchMode(false));
  $('forget').addEventListener('click',async()=>{await forgetGameData({includeSaves:$('forget-saves').checked});manifest=null;refresh();await refreshSaves();status('Game files removed from this device.');});
  $('save-input').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const name=await importSave(file);await refreshSaves();$('save-status').textContent=`Imported ${name}.`;}
    catch(error){$('save-status').textContent=error.message;}
    finally{e.target.value='';}
  });
  $('refresh-saves').addEventListener('click',()=>refreshSaves().catch(error=>$('save-status').textContent=error.message));
  $('private-store').addEventListener('click',async()=>{if(await getFiles()&&autoStart())await soloStart();});
  $('launch').addEventListener('click',soloStart);
  // On touch screens the friends button joins the control bar instead of covering the map.
  if(matchMedia('(pointer: coarse)').matches)$('touch-bar').append($('friends-mode'));
  $('stopped-reload').addEventListener('click',()=>location.reload());
  watchEngineErrors();
  // Hidden: local test harnesses load the owner's copy from disk through it. Not shown to players.
  $('files-input').addEventListener('change',e=>runImport(o=>importFromFiles(e.target.files,o)));
  manifest=await readManifest().catch(e=>{status(e.message);return null;});
  engine=await engineAvailable();
  isolated=await ensureIsolation();
  refresh();
  await refreshSaves();
  online=mountOnline({parent:$('online'),gameParent:$('online-turn'),
    canvas:$('canvas'),stage:$('canvas-wrap'),setup:$('setup'),game:$('game'),getModule:()=>module,
    ready:()=>Boolean(isolated&&manifest&&engine&&!module&&!launching),start:startEngine});
  $('solo-mode').hidden=!onlineMode();
  if(!onlineMode()){
    cloud=mountCloud();
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&module)void cloud?.sync();});
  }
  if(!isolated||!engine)return;
  if(!manifest&&!await getFiles())return;
  // Solo play starts by itself, like the other games. An invite link waits for the lobby instead.
  if(autoStart())await soloStart();
}
init().catch(e=>status(e.message));
