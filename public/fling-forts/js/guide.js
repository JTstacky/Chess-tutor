// guide.js — the Guidebook (owner 2026-11-26): every race's story, strengths, ultimate and six troops, each troop
// with a panel playing its real movement and attack pictures, what it does and its numbers.
//
// Loaded only when the Guidebook button is pressed (main.js imports it on demand), and it builds its own screen and
// styles, so the menu's first load does not grow. A race's sprites are fetched when its tab is opened (the same
// loadGroup the match uses, so opening a race here also warms it for a game). Every number comes from the rules
// (sim.js UNIT, RACES, costFor), strengths and weaknesses from RACES[r].traitLines, and "strong / weak against"
// from the Help screen's own table (index.html, table.types): nothing here restates a rule by hand.
import * as S from './sim.js';
import { art, loadGroup, CLS } from './view.js';
import { sound } from './sfx.js';

// ---------- stories (the only hand-written text) ----------
const STORY = {
  fantasy: ['Deep under Frostpeak the Dwarf King keeps the oldest stone hall in the world. When trouble comes, the elves of the pine woods bring their bows, the dwarves bring their axes, and somebody always remembers to wake the dragon. Highrealm builds slowly and carefully, and its walls are still standing long after everyone else has gone home.',
    { shieldbearer: 'Carries a shield so big he sleeps under it when it rains.', archer: 'Sisters from the pine woods who have never once missed the same bird twice.', dancer: 'They practise on falling leaves, and the leaves lose.', sapper: 'Miners who decided digging was too slow.', gryphon: 'The gryphon chooses its rider, and it is very picky.', dragon: 'Only eighty years old, and still learning not to sneeze indoors.' }],
  aliens: ['The Zyx came a very long way to look at the castles, and liked them so much they decided to keep them. The Overmind does all the thinking from inside its jar, the blobs do the wobbling, and the saucers hum a tune nobody else can hear. Their fort grew out of the ground in one night.',
    { blob: 'Pop one and you get two smaller, crosser ones.', trooper: 'Polishes the bubble helmet every morning. The ray gun does the rest.', walker: 'A brain in a walking machine with one very big idea: knock that castle over.', spitter: 'Bad table manners, turned into a job.', saucer: 'Scouts that spin when they are happy, which is whenever they are shooting.', mothership: 'A flying nursery. The babies jump out on their own.' }],
  robots: ['Unit Zero was built to tidy a workshop. It tidied so well that it built helpers, and the helpers built more helpers, and now the Bolt Brigade tidies whole battlefields. Robots never get tired and never get scared, but they are slow on their feet and the gold to build them trickles in.',
    { scrap: 'Made from leftovers and proud of it.', tread: 'Was once a bulldozer. Still thinks like one.', laser: 'One red eye that never blinks and never misses a seam in armour.', bomb: 'Ticks happily all the way to the wall.', drone: 'Buzzes like a wasp and stings like one too.', gunship: 'The heaviest thing that has ever stayed in the air.' }],
  monsters: ['Every child knows there is a Monster Under the Bed. What they do not know is that he has a whole pack, a cave with a skull over the door, and a very loud growl. The Grimgrowl Pack is big, hungry and hard to put down, and its chief feels better again after a short rest.',
    { slime: 'Giggles when it is squashed, then there are two of it.', ogre: 'Borrowed a tree as a club and forgot to give it back.', spider: 'Spins webs so sticky that birds have to walk home.', cyclops: 'One eye, so he never has to squint to aim.', bats: 'Small, squeaky, and awake when all the flyers want to sleep.', gargoyle: 'Sat on a roof for three hundred years waiting for this.' }],
  military: ['The General has a plan for everything, and a spare plan folded in his hat. The Iron Company marches in step, digs in behind sandbags and calls for air support on the radio. No single soldier is a hero, but together they hold the line.',
    { rifles: 'Three friends who share one flask of tea and aim at whatever flies.', shields: 'Stand in front so everyone behind can do their job.', grenadier: 'Best arm in the company. Used to be a cricket bowler.', tank: 'Small for a tank, and very keen to prove itself.', chopper: 'Flies low, flies loud, and keeps the sky clear.', bomber: 'Carries one enormous bomb, then goes home for another.' }],
  undead: ['Nobody stays down for long in Bonewake. The Lich Queen rules a crooked crypt lit by green candles, and when a fighter falls on her field she simply asks it to stand up again, on her side this time. Her troops are brittle one by one. There are always more.',
    { skeleton: 'Rattles when it runs and falls apart laughing.', necro: 'Has a staff with a skull on it, and the skull gives advice.', golem: 'Built from the biggest bones in the crypt, and a few borrowed ones.', plague: 'Carries a cauldron of soup that nobody should ever taste.', ghost: 'Floats straight through walls and borrows a little of your strength.', bonedrake: 'A dragon that kept flying long after it stopped needing lunch.' }],
  pirates: ['Captain Barnacle ran his ship aground on purpose, because a ship that cannot sail is a fort that cannot sink. The Saltdogs fight for gold, sing while they do it, and get paid extra for every enemy they beat. Their wooden walls are thin, so they try to win before anyone notices.',
    { deckhand: 'Fastest feet on the ship, mostly from running from the cook.', buccaneer: 'One eyepatch, one pistol, and one very good eye.', bosun: 'Swings the ship\'s anchor because nothing else was heavy enough.', cannoneer: 'Two pirates, one cannon, and a long argument about who lights it.', parrots: 'They repeat everything you say, then peck you.', sloop: 'A boat that got tired of the sea and tried the sky.' }],
  elementals: ['Before there were castles there were fire, frost, stone and storm, and they did not always get along. The Ember Sovereign sits calmly at the fire altar and keeps the peace between them, until somebody starts flinging rocks at the Court. Then all four answer together.',
    { imp: 'Little sparks that run everywhere and scorch the carpet.', golem: 'A hillside that stood up and started walking.', frost: 'So cold that birds fly slower just from looking at it.', thorn: 'A garden with a bad temper. It grows back.', gale: 'A breeze that learned to blow flyers out of the sky.', storm: 'A grumpy cloud. The lightning is how it complains.' }],
  beastfolk: ['Chief Bigtusk sits on a throne made of shields he won, and bangs a drum when it is time to charge. The Tusk Tribes are orcs, goblins, trolls and anything else that likes a good stampede. They are quick, there are lots of them, and their fort is mostly sticks.',
    { goblin: 'Cackle the whole way there. Four of them, so it is quite a lot of cackling.', boar: 'The goblin is only holding on. The boar is in charge.', shaman: 'Shakes a bone rattle: friends feel better and flyers feel worse.', troll: 'Hit it and it shrugs. Wait a bit and the bump is gone.', wyvern: 'Spits hot globs at anything else that dares to fly.', vultures: 'Carry goblin bombs in their claws and drop them politely.' }],
  steampunk: ['The Grand Inventor is very small and her ideas are very large. From her walking chair she runs the Brass Guild, a workshop of gears, pipes and whistling kettles where everything is cheap to build and slightly too full of steam. If it ticks, puffs or sparks, the Guild made it.',
    { clockwork: 'Wound up every morning. Marches until the key stops turning.', knight: 'A suit of armour with a boiler inside and a piston for a lance.', tesla: 'Wears a lightning coil as a backpack. Hair permanently on end.', boiler: 'A kettle on legs that is about to boil over.', gyro: 'Pedals as hard as they can and fires a blunderbuss with the other hand.', zeppelin: 'A brass balloon the size of a house, full of round bombs.' }],
};

// ---------- helpers ----------
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const file = (key) => { const m = /^(.*)_(\d+)$/.exec(key), a = art.meta?.[key] || (m && art.meta?.[m[1]]); return a ? art.base + (a.file || a.frames?.[+m[2]]?.file) : ''; };
const pic = (key, cls, alt = '') => { const i = el('img', cls); i.alt = alt; i.loading = 'lazy'; i.decoding = 'async'; i.draggable = false; i.src = file(key); return i; };
const num = (v) => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
const ULT_ORDER = ['fantasy', 'aliens', 'robots', 'monsters', 'military', 'undead', 'pirates', 'elementals', 'beastfolk', 'steampunk'];   // the badges' order in ulticon_a and ulticon_b
const plural = (n, name) => `${n} ${n === 1 ? name.replace(/s$/, '') : name}`;

/** A troop's numbers as it really fights for its race (the race's modifiers applied, as sim.js applies them). */
function statsOf(key) {
  const u = S.UNIT[key], m = S.RACES[u.race].mods, fake = { players: [{ race: u.race }] };
  return {
    cost: S.costFor(fake, 0, key), count: u.count, hp: Math.round(u.hp * (m.unitHp || 1)), dmg: u.boom ? u.boom.dmg : Math.round(u.dmg * (m.unitDmg || 1) * 10) / 10, perSec: u.boom ? 0 : 1 / u.rate,
    reach: u.range || 0, speed: u.speed * (m.unitSpeed || 1), armor: (u.armor || 0) + (m.unitArmor || 0),
  };
}
const ALL = Object.keys(S.UNIT).filter((k) => !S.UNIT[k].minion).map(statsOf);
const MAX = { hp: Math.max(...ALL.map((a) => a.hp)), dmg: Math.max(...ALL.map((a) => a.dmg)), perSec: Math.max(...ALL.map((a) => a.perSec)), reach: Math.max(...ALL.map((a) => a.reach)), speed: Math.max(...ALL.map((a) => a.speed)) };

/** What a troop can do beyond its bars, in whole words, read off the rules' own fields. */
function abilities(u) {
  const out = [], name = (k) => S.UNIT[k]?.name || k;
  const hitsAir = !u.noAir && !!u.range && !u.boom && (!u.air || !!u.aa);       // the rules' canHit
  out.push([hitsAir ? 'Can hit flyers' : 'Cannot hit flyers', hitsAir ? 'yes' : 'no']);
  if (u.air) out.push(['Flies over walls and troops']);
  if (u.vsAir > 1) out.push([`${num(u.vsAir)}× damage to flyers`]);
  if (u.splash) out.push(['Splash: hits everything close to its target']);
  if (u.pierce) out.push(['Cuts through armour']);
  if (u.siege) out.push(['Ignores troops and goes for buildings']);
  if (u.bld > 1) out.push([`${num(u.bld)}× damage to buildings`]);
  if (u.boom) out.push(['Blows itself up on buildings' + (u.boom.cloud ? ' and leaves a poison cloud' : '')]);
  if (u.drop) out.push(['Drops bombs from above']);
  if (u.heal) out.push([`Heals friends nearby (${u.heal.amt} each time)`]);
  if (u.slow) out.push([`Slows what it hits for ${num(u.slow)} seconds`]);
  if (u.charge) out.push([`First hit does ${num(u.charge)}× damage`]);
  if (u.regen) out.push([`Regrows ${num(u.regen)} health a second`]);
  if (u.steal) out.push(['Heals itself with half the damage it does']);
  if (u.split) out.push([`Splits into ${plural(u.split.n, name(u.split.kind))} when it pops`]);
  if (u.spawn) out.push([`Drops a ${name(u.spawn.kind).replace(/s$/, '')} every ${num(u.spawn.every)} seconds`]);
  if (u.raiser) out.push([`Enemies it beats rise as your ${name(u.raiser)}`]);
  return out;
}

/** An ultimate in plain words, from its rule fields. */
function ultText(race) {
  const U = S.RACES[race].ult;
  if (U.shape === 'barrage') return `${U.n} shots rain down on the enemy castle and its chief. Each one does ${U.dmg} damage to everything close by, and ${num(U.bld || 1)} times that to buildings.`;
  if (U.shape === 'beam') return `After a short warning a beam comes down on the enemy chief: ${U.dmg} damage to him, ${U.blockDmg} to the castle if it is under the beam, and half to any troops caught in it.`;
  if (U.shape === 'sweep') return `A wave crosses the whole field from your gate. Every enemy ground troop takes ${U.dmg} damage, and buildings and the castle take ${U.bldDmg ?? U.dmg * 2}.` + (U.slow ? ` Troops it hits are slowed for ${num(U.slow)} seconds.` : '') + (U.burn ? ` It leaves fire burning behind it for ${num(U.burn.t)} seconds.` : '');
  if (U.shape === 'summon') return `Calls in a free army at your gate: ${U.units.map(([k, n]) => plural(n, S.UNIT[`${race}_${k}`]?.name || k)).join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
  return '';
}
const ultNote = (race) => { const c = S.RACES[race].ult.chiefCap; return `Fills up as you fight. One use each round.${c && c < 1 ? ` It can take off no more than ${Math.round(c * 100)}% of the enemy chief's health.` : ''}`; };

/** "Strong against / Weak against" for a troop type, read from the Help screen's own table so the wording is one. */
function matchups(cls) {
  const rows = [...document.querySelectorAll('#help table.types tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())).filter((r) => r.length >= 3);
  if (!rows.length) return null;
  const head = rows[0].map((h) => h.toLowerCase()), si = head.findIndex((h) => h.includes('strong') || h.includes('beats')), wi = head.findIndex((h) => h.includes('weak') || h.includes('loses'));
  const want = cls.toLowerCase(), base = want.replace(/^flying /, '');
  const row = rows.find((r) => r[0].toLowerCase() === want) || rows.find((r) => r[0].toLowerCase() === base) || rows.find((r) => want.includes(r[0].toLowerCase()));
  return row && si > 0 && wi > 0 ? { strong: row[si], weak: row[wi] } : null;
}

// ---------- the animated panel ----------
const MACHINE = new Set(['aliens_saucer', 'aliens_mothership', 'robots_drone', 'robots_gunship', 'military_chopper', 'military_bomber', 'pirates_sloop', 'steampunk_gyro', 'steampunk_zeppelin']);   // flyers that only spin rotors (view.js)
const MOVE_T = 2.6, SWINGS = 3;
/** Which picture troop `kind` shows at time t of its loop: its movement cycle, then three attacks at its real pace. */
function pose(kind, u, t, now) {
  const M = art.meta, has = (k) => !!art.img[k];
  const move = (tt) => {
    if (!u.air && M[`w_${kind}`] && has(`w_${kind}_0`)) {
      const wm = M[`w_${kind}`], m2 = M[`w2_${kind}`], ph = tt / Math.min(1.5, Math.max(0.4, u.r * 3.5 * 0.85 / u.speed));     // one stride covers 0.85 of its height, as in a match
      if (m2 && !m2.off && has(`w2_${kind}_5`)) { const j = Math.floor(ph * 12) % 12, i = j >> 1; return j % 2 ? { key: `w2_${kind}_${i}`, k: m2.k || 1, dy: 0 } : { key: `w_${kind}_${i}`, k: wm.k || 1, dy: 0 }; }
      return { key: `w_${kind}_${Math.floor(ph * 6) % 6}`, k: wm.k || 1, dy: 0 };
    }
    if (u.air && M[`f_${kind}`] && has(`f_${kind}_0`)) {
      const fm = M[`f_${kind}`], f2 = M[`f2_${kind}`], rate = MACHINE.has(kind) ? 18 : 9;
      if (f2 && !f2.off && has(`f2_${kind}_5`)) { const j = Math.floor(now * rate * 2) % 12, i = j >> 1; return j % 2 ? { key: `f2_${kind}_${i}`, k: f2.k || 1, dy: f2.dy || 0 } : { key: `f_${kind}_${i}`, k: fm.k || 1, dy: fm.dy || 0 }; }
      return { key: `f_${kind}_${Math.floor(now * rate) % 6}`, k: fm.k || 1, dy: fm.dy || 0 };
    }
    return { key: `t_${kind}_${Math.floor(tt * 4) % 2}`, k: 1, dy: 0 };
  };
  const gap = Math.min(1.7, Math.max(0.75, u.rate || 1)), loop = MOVE_T + SWINGS * gap, tt = t % loop;
  if (tt < MOVE_T || u.boom) return { ...move(tt), lunge: 0 };      // walking bombs never swing: they blow up on what they reach
  const e = (tt - MOVE_T) % gap, am = M[`a_${kind}`];
  if (e < 0.5 && am && has(`a_${kind}_3`)) return { key: `a_${kind}_${e < 0.07 ? 0 : e < 0.2 ? 1 : e < 0.34 ? 2 : 3}`, k: am.k || 1, dy: am.dy || 0, lunge: Math.sin(Math.PI * Math.min(1, e / 0.4)) };
  if (e < 0.3 && !am) return { key: `t_${kind}_2`, k: 1, dy: 0, lunge: Math.sin(Math.PI * e / 0.3) };
  return { ...(u.air ? move(tt) : move(0)), lunge: 0 };            // between blows: a ground troop stands, a flyer keeps flying
}
function drawPanel(cv, kind, now) {
  const u = S.UNIT[kind], dpr = Math.min(window.devicePixelRatio || 1, 2), W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const n = Math.min(5, u.count), size = H * (0.5 + 0.3 * Math.min(1, (u.r - 9) / 19)) * (1 - 0.07 * Math.min(3, n - 1)), ground = H * 0.9;
  const step = Math.min(size * 0.5, (W - size * 0.8) / Math.max(1, n - 1));
  for (let i = n - 1; i >= 0; i--) {
    const fr = pose(kind, u, now + i * 0.17, now + i * 0.21), im = art.img[fr.key], rg = art.reg?.[fr.key] || [1, 0, 0];
    const cx = W / 2 + (i - (n - 1) / 2) * step, lane = (i % 2) * H * 0.035, bob = u.air ? Math.sin(now * 2.4 + i) * H * 0.02 : 0;
    const feet = ground - lane - (u.air ? H * 0.16 : 0) + bob;
    g.beginPath(); g.ellipse(cx, ground - lane + 1, size * (u.air ? 0.2 : 0.26), size * (u.air ? 0.045 : 0.07), 0, 0, 7); g.fillStyle = `rgba(30,40,20,${u.air ? 0.22 : 0.38})`; g.fill();   // shadow (pure light and shade: code-drawn)
    if (!im) continue;
    const hk = size * fr.k, h = hk * rg[0], w = h * im.width / im.height;
    g.drawImage(im, cx + rg[1] * hk + fr.lunge * size * 0.07 - w / 2, feet - fr.dy * size - rg[2] * hk - h, w, h);
  }
}

// ---------- the screen ----------
const CSS = `
#guide { align-items: stretch; padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); background: rgba(30, 25, 20, 0.72); }
#guide .gb { width: min(1000px, 100%); margin: 0 auto; background: #f6ecd6; border: 3px solid #2b2620; border-radius: 18px; box-shadow: 6px 8px 0 rgba(0,0,0,.35); overflow-y: auto; overflow-x: hidden; text-align: left; color: #2b2620; line-height: 1.4; font-size: 15px; }
#guide .gb-top { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #f6ecd6; border-bottom: 3px solid #2b2620; }
#guide .gb-top h2 { flex: 1; text-align: left; font-size: 22px; }
#guide .gb-top button { font-size: 16px; padding: 8px 16px; min-height: 40px; background: #e8664a; color: #fff; }
#guide .gb-races { display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; padding: 10px; }
#guide .gb-race { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 5px 2px 4px; min-width: 0; font-size: 12px; line-height: 1.1; border-width: 2px; border-radius: 12px; box-shadow: 2px 3px 0 rgba(0,0,0,.3); }
#guide .gb-race img { height: 46px; width: 100%; object-fit: contain; pointer-events: none; }
#guide .gb-race span { max-width: 100%; text-wrap: balance; }
#guide .gb-race.on { background: #2b2620; color: #f6ecd6; }
#guide .gb-body { padding: 0 12px 16px; display: flex; flex-direction: column; gap: 12px; }
#guide .gb-hero { display: flex; gap: 12px; align-items: flex-end; }
#guide .gb-art { flex: 0 0 auto; display: flex; align-items: flex-end; height: 150px; }
#guide .gb-art img { pointer-events: none; }
#guide .gb-art .castle { height: 150px; } #guide .gb-art .chief { height: 96px; margin-left: -34px; }
#guide .gb-hero h3 { margin: 0; font-size: 26px; line-height: 1.1; }
#guide .gb-hero .theme { margin: 2px 0 6px; color: #6b5d48; font-weight: 700; }
#guide p { margin: 0; }
#guide h4 { margin: 0 0 4px; font-size: 17px; }
#guide .gb-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
#guide .gb-box { background: #fbf5e8; border: 2px solid #2b2620; border-radius: 12px; padding: 8px 10px; }
#guide .gb-box.good { border-left: 8px solid #4caf50; } #guide .gb-box.bad { border-left: 8px solid #c8553a; }
#guide .gb-box ul { margin: 0; padding-left: 18px; }
#guide .gb-ult { display: flex; gap: 10px; align-items: center; }
#guide .gb-ult img { height: 60px; flex: 0 0 auto; pointer-events: none; }
#guide .gb-ult .note { color: #6b5d48; font-size: 13px; }
#guide .gb-units { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }
#guide .gb-unit { background: #fbf5e8; border: 2px solid #2b2620; border-radius: 14px; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
#guide .gb-head { display: flex; gap: 9px; }
#guide .gb-pan { flex: 0 0 132px; height: 120px; border: 2px solid #2b2620; border-radius: 10px; background: #8fd0f2 url('assets/bg.jpg') 50% 78% / 330% auto; overflow: hidden; }
#guide .gb-pan canvas { width: 100%; height: 100%; display: block; }
#guide .gb-name { font-weight: 800; font-size: 17px; line-height: 1.15; }
#guide .gb-chip { display: inline-block; margin: 3px 0; padding: 1px 9px; border-radius: 99px; color: #fff; font-weight: 800; font-size: 12.5px; border: 1.5px solid rgba(30,16,4,.7); }
#guide .gb-tale { font-style: italic; color: #5a4d3b; font-size: 13.5px; line-height: 1.3; }
#guide .gb-role { font-weight: 700; }
#guide .gb-stats { display: grid; grid-template-columns: auto 1fr auto; gap: 3px 8px; align-items: center; font-size: 13.5px; }
#guide .gb-stats .bar { height: 10px; border-radius: 6px; background: #e3d6b8; overflow: hidden; border: 1px solid rgba(43,38,32,.45); }
#guide .gb-stats .bar i { display: block; height: 100%; border-radius: 6px; }
#guide .gb-stats b { text-align: right; min-width: 3.2em; }
#guide .gb-top-stats { display: flex; gap: 6px; flex-wrap: wrap; }
#guide .gb-pill { background: #2b2620; color: #f6ecd6; border-radius: 9px; padding: 1px 9px; font-weight: 800; font-size: 13.5px; }
#guide .gb-pill.gold { background: #f2c230; color: #2b2620; }
#guide .gb-abil { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 4px; font-size: 12.5px; }
#guide .gb-abil li { background: #efe2c2; border-radius: 8px; padding: 1px 7px; border: 1px solid rgba(43,38,32,.35); }
#guide .gb-abil li.yes { background: #cfeccf; } #guide .gb-abil li.no { background: #f4d3ca; }
#guide .gb-vs { font-size: 13.5px; } #guide .gb-vs b.s { color: #2f7d33; } #guide .gb-vs b.w { color: #b3432b; }
#guide .gb-wait { color: #6b5d48; font-weight: 700; text-align: center; padding: 6px; }
@media (max-width: 720px), (max-height: 460px) {
  #guide .gb { font-size: 13.5px; }
  #guide .gb-top { padding: 5px 62px 5px 8px; } #guide .gb-top h2 { font-size: 18px; } #guide .gb-top button { padding: 5px 14px; min-height: 36px; }
  #guide .gb-races { grid-template-columns: repeat(10, 1fr); gap: 4px; padding: 6px 8px; }
  #guide .gb-race { font-size: 10px; padding: 3px 1px; } #guide .gb-race img { height: 34px; }
  #guide .gb-art, #guide .gb-art .castle { height: 104px; } #guide .gb-art .chief { height: 68px; margin-left: -24px; }
  #guide .gb-hero h3 { font-size: 21px; }
  #guide .gb-units { grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); }
  #guide .gb-pan { flex-basis: 112px; height: 104px; }
}
@media (max-width: 560px) { #guide .gb-races { grid-template-columns: repeat(5, 1fr); } #guide .gb-cols { grid-template-columns: 1fr; } }
`;
const STAT_COL = { hp: '#4caf50', dmg: '#c8553a', perSec: '#e08a1e', reach: '#3f8fd6', speed: '#8a5fc4' };
let root = null, body = null, tabs = {}, current = null, panels = [], raf = 0, onBack = null;

function build() {
  document.head.appendChild(el('style', null, CSS));
  root = el('section', 'screen'); root.id = 'guide'; root.hidden = true;
  const gb = el('div', 'gb'), top = el('div', 'gb-top'), back = el('button', null, 'Back');
  back.id = 'btn-guide-back'; back.addEventListener('click', () => { sound('click'); close(); });
  top.append(back, el('h2', null, 'Guidebook'));
  const races = el('div', 'gb-races');
  for (const r of S.RACE_KEYS) {
    if (!STORY[r]) continue;
    const b = el('button', 'gb-race'); b.dataset.race = r; b.append(pic(`king_${r}_0`, null), el('span', null, S.RACES[r].name));
    b.setAttribute('aria-label', `${S.RACES[r].name}: ${S.RACES[r].theme}`);
    b.addEventListener('click', () => { sound('click'); showRace(r); gb.scrollTop = 0; });
    tabs[r] = b; races.append(b);
  }
  body = el('div', 'gb-body');
  gb.append(top, races, body); root.append(gb); document.body.appendChild(root);
}

function statRow(grid, label, value, share, col, text) {
  const bar = el('div', 'bar'), fill = el('i'); fill.style.width = `${Math.round(Math.max(0.03, Math.min(1, share)) * 100)}%`; fill.style.background = col; bar.append(fill);
  grid.append(el('span', null, label), bar, el('b', null, text ?? num(value)));
}
function unitCard(key) {
  const u = S.UNIT[key], st = statsOf(key), short = key.slice(u.race.length + 1), card = el('article', 'gb-unit');
  const head = el('div', 'gb-head'), pan = el('div', 'gb-pan'), cv = el('canvas'), info = el('div');
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `${u.name} moving and attacking`); pan.append(cv); panels.push([cv, key]);
  const fly = u.cls.startsWith('Flying '), ck = Object.keys(CLS).find((k) => k.toLowerCase() === (fly ? u.cls.slice(7) : u.cls).toLowerCase()) || 'Melee';
  const chip = el('span', 'gb-chip', u.cls); chip.style.background = CLS[ck][0];
  const pills = el('div', 'gb-top-stats'); pills.append(el('span', 'gb-pill gold', `${st.cost} gold`), el('span', 'gb-pill', st.count > 1 ? `Squad of ${st.count}` : 'One big troop'));
  info.append(el('div', 'gb-name', u.name), chip, pills, el('div', 'gb-tale', STORY[u.race][1][short] || ''));
  head.append(pan, info);
  const grid = el('div', 'gb-stats');
  statRow(grid, st.count > 1 ? 'Health (each)' : 'Health', st.hp, st.hp / MAX.hp, STAT_COL.hp);
  statRow(grid, u.boom ? 'Blast damage' : 'Damage a hit', st.dmg, st.dmg / MAX.dmg, STAT_COL.dmg);
  if (!u.boom) statRow(grid, 'Hits a second', st.perSec, st.perSec / MAX.perSec, STAT_COL.perSec);
  statRow(grid, 'Reach', st.reach, st.reach / MAX.reach, STAT_COL.reach, st.reach ? num(st.reach) : 'Close up');
  statRow(grid, 'Speed', st.speed, st.speed / MAX.speed, STAT_COL.speed, String(Math.round(st.speed)));
  if (st.armor) statRow(grid, 'Armour', st.armor, st.armor / 6, '#7d6f66', `Blocks ${st.armor} a hit`);
  const ab = el('ul', 'gb-abil'); for (const [t, c] of abilities(u)) ab.append(el('li', c || null, t));
  card.append(head, el('div', 'gb-role', u.role), grid, ab);
  const mu = matchups(u.cls);
  if (mu) { const vs = el('div', 'gb-vs'); const s = el('b', 's', 'Strong against: '), w = el('b', 'w', 'Weak against: '); vs.append(s, mu.strong, el('br'), w, mu.weak); card.append(vs); }
  return card;
}
function traitBox(cls, title, lines) {
  const box = el('div', `gb-box ${cls}`), ul = el('ul'); box.append(el('h4', null, title));
  for (const l of lines) { const li = el('li'); if (typeof l === 'string') li.textContent = l; else { li.append(el('b', null, l.label + (l.text ? ': ' : '')), l.text || ''); } ul.append(li); }
  box.append(ul); return box;
}
function showRace(r) {
  current = r; panels = [];
  for (const [k, b] of Object.entries(tabs)) b.classList.toggle('on', k === r);
  const R = S.RACES[r]; body.textContent = '';
  const hero = el('div', 'gb-hero'), pics = el('div', 'gb-art'), words = el('div');
  pics.append(pic(`castle_${r}_0`, 'castle', `${R.name} castle`), pic(`king_${r}_0`, 'chief', R.chief));
  words.append(el('h3', null, R.name), el('p', 'theme', `${R.theme.split(':')[0]} · Chief: ${R.chief}`), el('p', null, STORY[r][0]));
  hero.append(pics, words);
  const cols = el('div', 'gb-cols'), T = R.traitLines;
  cols.append(traitBox('good', 'Strengths', T.plus), traitBox('bad', 'Weaknesses', T.minus));
  const lean = R.leanLine ? el('p', 'note', `Buildings: ${R.leanLine.label}. ${R.leanLine.text}.`) : null;   // races.js lean (integrator)
  // the chief's fighting style (owner, 2026-11-26: read the enemy chief and pick troops to beat him); tuning.js KING_ATK
  const KA = S.KING_ATK[r], KIND = { single: 'Single target', area: 'Area attack', chain: 'Chain attack' };
  const chief = KA?.what ? el('p', 'note', `Chief: ${KIND[KA.kind] || 'Attack'}. ${KA.what}; also hits flyers. Weak to ${KA.weak}.`) : null;
  const ult = el('div', 'gb-box gb-ult'), ri = ULT_ORDER.indexOf(r), uw = el('div');
  if (ri >= 0 && art.meta?.[`ulticon_${ri < 5 ? 'a' : 'b'}`]) ult.append(pic(`ulticon_${ri < 5 ? 'a' : 'b'}_${ri % 5}`, null));
  uw.append(el('h4', null, `Ultimate: ${R.ult.name}`), el('p', null, ultText(r)), el('p', 'note', ultNote(r))); ult.append(uw);
  const wait = el('div', 'gb-wait', 'Fetching the troops…'), units = el('div', 'gb-units');
  for (const k of R.roster) units.append(unitCard(k));
  body.append(hero, cols, ...(lean ? [lean] : []), ...(chief ? [chief] : []), ult, el('h4', null, 'Troops'), wait, units);
  // the race's pictures: base sheets first, then the in-between frames; the panels fill in as they arrive
  const done = () => { if (current === r) wait.remove(); };
  loadGroup(r).then(() => { done(); return loadGroup(r + '+'); }).catch(done);
}
function tick(t) {
  raf = root.hidden ? 0 : requestAnimationFrame(tick);
  const now = t / 1000, vh = window.innerHeight;
  for (const [cv, key] of panels) { const b = cv.getBoundingClientRect(); if (b.bottom > 0 && b.top < vh) drawPanel(cv, key, now); }
}
function close() { root.hidden = true; cancelAnimationFrame(raf); raf = 0; onBack?.(); }

/** Open the Guidebook. back() is called when the player leaves it. */
export function openGuide(back, race) {
  if (!root) build();
  onBack = back; root.hidden = false;
  showRace(race && STORY[race] ? race : current || S.RACE_KEYS.find((r) => STORY[r]));
  if (!raf) raf = requestAnimationFrame(tick);
}
export const guideOpen = () => !!root && !root.hidden;
