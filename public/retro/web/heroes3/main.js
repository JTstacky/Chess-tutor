import { importFromFiles,importFromZip,importFromDirectoryHandle,importFromLegacyEntries,readManifest,forgetGameData } from './data-import.js';
import { privateStoreSource } from './sources/private-store.js';
import { engineAvailable,launch } from './launcher.js';
import { setupTouch } from './touch.js';
import { listSaves,importSave,deleteSave } from './saves.js';
import { mountOnline } from './online.js';

const $=id=>document.getElementById(id);
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
  $('engine-status').textContent=!engine?'Engine not built yet':manifest ? (isolated?'Ready to play.':'Game needs a supported browser.') : 'Choose your game files to start.';
  if(isolated)status(manifest?`${manifest.files.length} game files ready on this device.`:'Choose your Heroes III Complete files to get started.');
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
    refresh();
    online?.resume();
    status(`Game files ready.${result.skippedNames?.length?' Skipped unsafe names: '+result.skippedNames.join(', ')+'.':''}${result.missingRecommended?.length?' Optional files missing: '+result.missingRecommended.join(', '):''}`);
  }
  catch(e){status(e.message);console.error(e);}
}
async function fromDrop(e){
  e.preventDefault();$('drop-zone').classList.remove('over');
  const items=Array.from(e.dataTransfer.items||[]), handles=[];
  for(const item of items) {
    if(item.getAsFileSystemHandle) {const h=await item.getAsFileSystemHandle();if(h)handles.push(h);}
    else if(item.webkitGetAsEntry) {const entry=item.webkitGetAsEntry();if(entry)handles.push(entry);}
  }
  if(handles.some(h=>h.isDirectory)) {await runImport(o=>importFromLegacyEntries(handles,o));return;}
  if(handles.some(h=>h.kind==='directory')) {
    await runImport(o=>importFromDirectoryHandle(handles.filter(h=>h.kind==='directory'),o));return;
  }
  const files=Array.from(e.dataTransfer.files);
  if(files.length===1 && /\.zip$/i.test(files[0].name)) await runImport(o=>importFromZip(files[0],o));
  else await runImport(o=>importFromFiles(files,o));
}
async function startEngine({localSeat,saveName,phase,onTurnPass,onSeats,onCheckpoint,onBattle}={}){
  if(!isolated||!manifest||!engine||launching||module)throw Error('The game is not ready to start.');
  launching=true;refresh();$('setup').hidden=true;$('game').hidden=false;
  $('loading-status').textContent='Preparing game files…';
  try{
    module=await launch({canvas:$('canvas'),localSeat,saveName,phase,onTurnPass,onSeats,onCheckpoint,onBattle,onMessage:console.log,
      onStatus:message=>{$('loading-status').textContent=message;}});
    $('loading-status').textContent='VCMI is running.';
    if (!(module.SDL?.audioContext ?? module.audioContext)) {
      const sound=[...document.querySelectorAll('#touch-bar button')].find(button=>button.textContent==='Sound on');
      if (sound) { sound.textContent='Sound unavailable'; sound.setAttribute('aria-label',sound.textContent); sound.disabled=true; }
    }
    return module;
  }catch(error){$('setup').hidden=false;$('game').hidden=true;console.error(error);throw error;}
  finally{launching=false;refresh();}
}
async function init(){
  setupTouch($('canvas'),{getAudio:()=>module?.SDL?.audioContext??module?.audioContext});
  $('folder-input').addEventListener('change',e=>runImport(o=>importFromFiles(e.target.files,o)));
  $('files-input').addEventListener('change',e=>runImport(o=>importFromFiles(e.target.files,o)));
  $('zip-input').addEventListener('change',e=>{if(e.target.files[0])runImport(o=>importFromZip(e.target.files[0],o));});
  $('directory-button').addEventListener('click',()=>{if(window.showDirectoryPicker)showDirectoryPicker().then(h=>runImport(o=>importFromDirectoryHandle(h,o))).catch(e=>{if(e.name!=='AbortError')status(e.message);});else $('folder-input').click();});
  $('drop-zone').addEventListener('dragover',e=>{e.preventDefault();e.currentTarget.classList.add('over');});
  $('drop-zone').addEventListener('dragleave',e=>e.currentTarget.classList.remove('over'));
  $('drop-zone').addEventListener('drop',fromDrop);
  $('forget').addEventListener('click',async()=>{await forgetGameData({includeSaves:$('forget-saves').checked});manifest=null;refresh();await refreshSaves();status('Game files removed from this device.');});
  $('save-input').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{const name=await importSave(file);await refreshSaves();$('save-status').textContent=`Imported ${name}.`;}
    catch(error){$('save-status').textContent=error.message;}
    finally{e.target.value='';}
  });
  $('refresh-saves').addEventListener('click',()=>refreshSaves().catch(error=>$('save-status').textContent=error.message));
  $('private-store').hidden=!privateStoreSource.isAvailable();
  $('private-store').addEventListener('click',()=>runImport(o=>privateStoreSource.load(o)));
  $('launch').addEventListener('click',()=>startEngine().catch(error=>status(`Could not start the game: ${error.message}`)));
  manifest=await readManifest().catch(e=>{status(e.message);return null;});
  engine=await engineAvailable();
  isolated=await ensureIsolation();
  refresh();
  await refreshSaves();
  online=mountOnline({parent:$('online'),gameParent:$('online-turn'),
    canvas:$('canvas'),stage:$('canvas-wrap'),setup:$('setup'),game:$('game'),getModule:()=>module,
    ready:()=>Boolean(isolated&&manifest&&engine&&!module&&!launching),start:startEngine});
}
init().catch(e=>status(e.message));
