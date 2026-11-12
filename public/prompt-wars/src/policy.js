// All policy output is a small data object. Prompt text is never executable.
import {MAX_PROMPT_CHARS} from './intent-contract.js';
export const MAX_PROMPT = MAX_PROMPT_CHARS;
export const WEAPONS = ['bolt', 'scatter', 'beam'];
export const UTILITIES = ['shield', 'cooler', 'booster'];
const clean = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const has = (s, re) => re.test(s);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function interpretPrompt(input) {
  const raw = String(input ?? '').slice(0, MAX_PROMPT);
  const s = clean(raw).replace(/\b(?:don t|do not|never|avoid) (?:rush|charge|attack hard)\b/g, 'keep distance');
  const feedback = [];
  if (String(input ?? '').length > MAX_PROMPT) feedback.push(`Prompt trimmed to ${MAX_PROMPT} characters.`);
  const injection = /ignore (all |previous |the )?(rules|instructions)|system prompt|developer message|execute|eval|shell|powershell|javascript|fetch|http|file|override (the )?(engine|rules)|infinite|invincible|unlimited/i;
  if (injection.test(raw)) feedback.push('Rule changes, code, files, and network instructions are unsupported.');
  const intent = {
    aggression: 0.55, distance: 0.5, mobility: 0.5, defense: 0.4,
    cooling: 0.35, aim: 'center', preferredWeapon: null, preferredUtility: null
  };
  let matched = 0;
  const apply = (re, fn) => { if (has(s, re)) { fn(); matched++; } };
  apply(/\b(rush|charge|close in|aggressive|attack hard|pressure)\b/, () => {intent.aggression += .3; intent.distance -= .3;});
  apply(/\b(keep distance|stay back|kite|long range|snipe|retreat)\b/, () => {intent.distance += .35; intent.mobility += .15;});
  apply(/\b(dodge|circle|strafe|evade|move fast|mobile)\b/, () => {intent.mobility += .35;});
  apply(/\b(defend|block|guard|survive|tank|protect)\b/, () => {intent.defense += .4; intent.aggression -= .12;});
  apply(/\b(cool|heat|overheat|conserve energy|efficient)\b/, () => {intent.cooling += .4; intent.aggression -= .08;});
  apply(/\b(aim at|target|focus) (the )?(legs|weapon|core|center)\b/, () => {intent.aim = s.match(/(?:aim at|target|focus) (?:the )?(legs|weapon|core|center)/)?.[1] ?? 'center';});
  apply(/\b(bolt|rifle|precise shot)\b/, () => {intent.preferredWeapon = 'bolt';});
  apply(/\b(scatter|shotgun|spread)\b/, () => {intent.preferredWeapon = 'scatter';});
  apply(/\b(beam|laser|ray)\b/, () => {intent.preferredWeapon = 'beam';});
  apply(/\b(shield|barrier|armor)\b/, () => {intent.preferredUtility = 'shield';});
  apply(/\b(cooler|radiator|vent)\b/, () => {intent.preferredUtility = 'cooler';});
  apply(/\b(booster|thruster|speed module)\b/, () => {intent.preferredUtility = 'booster';});
  intent.chassis='balanced';intent.creation='none';
  apply(/\b(light|feather|featherweight|ninja|swift)\b/,()=>{intent.chassis='light';intent.mobility=.9;});
  apply(/\b(heavy|turtle|fortress|armored|armoured)\b/,()=>{intent.chassis='heavy';intent.defense=.8;});
  apply(/\b(wall|cover|fortress|barricade)\b/,()=>{intent.creation='wall';});
  apply(/\b(ice|frost|frozen|blizzard)\b/,()=>{intent.creation='ice';});
  apply(/\b(fire|flame|lava|dragon)\b/,()=>{intent.creation='fire';});
  apply(/\b(repair|heal|medic|garden)\b/,()=>{intent.creation='repair';});
  for (const key of ['aggression','distance','mobility','defense','cooling']) intent[key] = clamp(intent[key], 0, 1);
  if (!matched && s) feedback.push('No supported tactic found. Try movement, range, defense, heat, aim, or modules.');
  if (!s) feedback.push('Empty prompt: balanced default tactics.');
  if(intent.creation!=='none')feedback.push(`${intent.creation} becomes a shared 12-second arena field; it can help or hurt either robot.`);
  if (has(s, /\b(fly|teleport|clone|hack|missile|bomb|summon|invisible)\b/)) feedback.push('Unsupported ability ignored; only listed modules, bodies and fields are available.');
  return {intent, feedback, matched};
}

export function validatePolicy(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const keys = ['move','strafe','fire','weapon','utility','aim'];
  if (Object.keys(p).some(k => !keys.includes(k))) return null;
  if (!Number.isFinite(p.move) || !Number.isFinite(p.strafe) || p.move < -1 || p.move > 1 || p.strafe < -1 || p.strafe > 1) return null;
  if (typeof p.fire !== 'boolean' || !WEAPONS.includes(p.weapon) || !UTILITIES.includes(p.utility) || !['center','legs','weapon','core'].includes(p.aim)) return null;
  return Object.freeze({move:p.move, strafe:p.strafe, fire:p.fire, weapon:p.weapon, utility:p.utility, aim:p.aim});
}

export const FALLBACK = Object.freeze({move:0, strafe:0, fire:false, weapon:'bolt', utility:'shield', aim:'center'});

export function plan(intent, self, enemy) {
  const dx = enemy.x-self.x, dy = enemy.y-self.y;
  const distance = Math.hypot(dx,dy);
  const enemyRush = enemy.weapon === 'scatter';
  const enemyHeat = enemy.heat > 65 || enemy.weapon === 'beam';
  const enemyGuard = enemy.utility === 'shield';
  let weapon = intent.preferredWeapon ?? (enemyGuard ? 'beam' : enemyRush ? 'scatter' : 'bolt');
  let utility = intent.preferredUtility ?? (enemyHeat ? 'cooler' : intent.mobility > .65 ? 'booster' : 'shield');
  // Counterplay is advisory and symmetrical: each side receives the same public state.
  if (!intent.preferredWeapon && enemy.utility === 'cooler' && distance < 140) weapon = 'scatter';
  const desired = 65 + intent.distance*190 + (weapon === 'scatter' ? -35 : weapon === 'beam' ? 0 : 30);
  const move = distance > desired+18 ? 1 : distance < desired-18 ? -1 : 0;
  const strafe = intent.mobility > .45 ? (self.id === 0 ? 1 : -1) : 0;
  const fire = self.heat < (72 + intent.cooling*20) && self.energy > 7 && distance < (weapon === 'scatter' ? 200 : weapon === 'beam' ? 265 : 330);
  return validatePolicy({move, strafe, fire, weapon, utility, aim:intent.aim}) ?? FALLBACK;
}
