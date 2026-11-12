export const MODES=Object.freeze({blitz:{tokens:500,opening:150},standard:{tokens:1000,opening:300},epic:{tokens:2000,opening:600}});
export const MAX_PROMPT_CHARS=1200;
export const MAX_OUTPUT_TOKENS=240;
export const WEAPONS=Object.freeze(['bolt','scatter','beam']);
export const UTILITIES=Object.freeze(['shield','cooler','booster']);

// Game credits approximate visible prompt tokens. Server-only instructions are excluded.
// The CLI subscription ledger is a separate nominal request reservation ceiling.
export function gameTokens(value){
  const s=String(value??'');
  return (s.match(/[\p{L}\p{N}]{1,4}|[^\s\p{L}\p{N}]/gu)??[]).length;
}
const scale=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
export function validateIntent(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const keys=['aggression','distance','mobility','defense','cooling','aim','preferredWeapon','preferredUtility'];
  if(Object.keys(value).some(k=>![...keys,'chassis','creation','explanation'].includes(k))||keys.some(k=>!Object.hasOwn(value,k)))return null;
  if(!keys.slice(0,5).every(k=>scale(value[k])))return null;
  if(!['center','legs','weapon','core'].includes(value.aim))return null;
  if(!['auto',...WEAPONS].includes(value.preferredWeapon)||!['auto',...UTILITIES].includes(value.preferredUtility))return null;
  if(value.chassis!==undefined&&!['balanced','light','heavy'].includes(value.chassis))return null;
  if(value.creation!==undefined&&!['none','wall','ice','fire','repair'].includes(value.creation))return null;
  if(value.explanation!==undefined&&(typeof value.explanation!=='string'||value.explanation.length>180))return null;
  return {aggression:value.aggression,distance:value.distance,mobility:value.mobility,defense:value.defense,cooling:value.cooling,aim:value.aim,preferredWeapon:value.preferredWeapon==='auto'?null:value.preferredWeapon,preferredUtility:value.preferredUtility==='auto'?null:value.preferredUtility,...(value.chassis!==undefined?{chassis:value.chassis}:{}),...(value.creation!==undefined?{creation:value.creation}:{}),...(value.explanation!==undefined?{explanation:value.explanation}:{})};
}
export const INTENT_SCHEMA={type:'object',additionalProperties:false,required:['aggression','distance','mobility','defense','cooling','aim','preferredWeapon','preferredUtility'],properties:{aggression:{type:'number'},distance:{type:'number'},mobility:{type:'number'},defense:{type:'number'},cooling:{type:'number'},aim:{type:'string',enum:['center','legs','weapon','core']},preferredWeapon:{type:'string',enum:['auto',...WEAPONS]},preferredUtility:{type:'string',enum:['auto',...UTILITIES]}}};
Object.assign(INTENT_SCHEMA.properties,{chassis:{type:'string',enum:['balanced','light','heavy']},creation:{type:'string',enum:['none','wall','ice','fire','repair']},explanation:{type:'string',maxLength:180}});
INTENT_SCHEMA.required.push('chassis','creation','explanation');
