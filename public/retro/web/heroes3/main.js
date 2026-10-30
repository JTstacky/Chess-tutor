import { importFromFiles,readManifest,forgetGameData } from './data-import.js';
import { privateStoreSource } from './sources/private-store.js';
import { engineAvailable,launch } from './launcher.js';
import { setupTouch } from './touch.js';
import { listSaves,importSave,deleteSave } from './saves.js';
import { mountOnline } from './online.js';

const $=id=>document.getElementById(id);
// SDL2's Emscripten audio keeps its context on Module.SDL2.
const audioOf=m=>m?.SDL2?.audioContext??m?.SDL?.audioContext??m?.audioContext??null;
let isolated=crossOriginIsolated, manifest=null, engine=false, module=null, launching=false;
let online=null;
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
  $('progress-text').textContent=`${fileCount} of ${totalFiles} files · ${(bytesDone/1048576).toFixed(1)} of ${(bytesTotal/1048576).toFixed(1)} MB${persistent===false?' · Browser storage may be cleared automatically.':''}`;
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
  status('Checking game files…');$('progress').hidden=true;$('progress-text').textContent='';
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
  status('Downloading the game to this device. This only happens once.');
  return runImport(o=>privateStoreSource.load(o));
}
async function startEngine({localSeat,saveName,phase,onTurnPass,onSeats,onCheckpoint,onBattle}={}){
  if(!isolated||!manifest||!engine||launching||module)throw Error('The game is not ready to start.');
  launching=true;refresh();$('setup').hidden=true;$('game').hidden=false;
  $('loading-status').textContent='Preparing game files…';
  try{
    module=await launch({canvas:$('canvas'),localSeat,saveName,phase,onTurnPass,onSeats,onCheckpoint,onBattle,onMessage:console.log,
      onStatus:message=>{$('loading-status').textContent=message;}});
    $('loading-status').textContent='VCMI is running.';
    // SDL opens audio a little after launch; only call sound unavailable if it never appears.
    const launched=module;
    setTimeout(()=>{
      if(module!==launched||audioOf(launched))return;
      const sound=[...document.querySelectorAll('#touch-bar button')].find(button=>button.textContent==='Sound on');
      if(sound){sound.textContent='Sound unavailable';sound.setAttribute('aria-label',sound.textContent);sound.disabled=true;}
    },30000);
    return module;
  }catch(error){$('setup').hidden=false;$('game').hidden=true;console.error(error);throw error;}
  finally{launching=false;refresh();}
}
const soloStart=()=>startEngine().catch(error=>status(`Could not start the game: ${error.message}`));
const invited=()=>Boolean(new URLSearchParams(location.hash.slice(1)).get('invite'));
// ?manual (tests): don't start by itself.
const autoStart=()=>!invited()&&!new URLSearchParams(location.search).has('manual');
async function init(){
  setupTouch($('canvas'),{getAudio:()=>audioOf(module)});
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
  if(!isolated||!engine)return;
  if(!manifest&&!await getFiles())return;
  // Solo play starts by itself, like the other games. An invite link waits for the lobby instead.
  if(autoStart())await soloStart();
}
init().catch(e=>status(e.message));
