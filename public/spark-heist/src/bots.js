import {recipe,compile} from './catalog.js';
const strategies={
  meadow:['fox','crab','sprig'], rush:['fox','moth','balloon'], gust:['snail','fox','sprig'], roots:['mushroom','fox','cactus'], garden:['cloud','cabbage','fox'], iron:['beetle','kettle'], novice:['sprig','cloud','sprig'], seeds:['cactus','cactus','fox'], scatter:['fox','sprig','beetle']
};
export const BOT_TYPES=Object.keys(strategies);
export function botTeam(seed=1,round=1,style='adaptive',previous=[]){
  if(style==='adaptive'){
    const metals=previous.filter(p=>compile(p).metal).length;
    style=metals>0?'roots':BOT_TYPES[(seed+round*3)%BOT_TYPES.length];
  }
  const list=strategies[style]||strategies.meadow;
  return list.map((id,i)=>({...recipe(id),job:i===0&&['snail','beetle','kettle','cactus'].includes(id)?'intercept':id==='crab'?'escort':'fetch',lane:(i+seed)%3}));
}
export function botCommand(state,seat){
  const units=state.units.filter(u=>u.seat===seat&&!u.knocked);
  const carrier=units.find(u=>u.carrying!==null);
  const u=carrier||units.find(u=>compile(u).speed>0)||units[0];
  return {slot:u?.slot??0,job:carrier?'fetch':state.sparks.some(p=>p.carrier!==null&&state.units.find(v=>v.id===p.carrier)?.seat!==seat)?'intercept':'fetch'};
}
