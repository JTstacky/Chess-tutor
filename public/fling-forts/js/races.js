// races.js — the ten peoples of Fling Forts: units, powers and fort designs. Pure data.
//
// Unit fields: n squad size · hp · sp speed · dmg per hit · rate seconds between hits · r body radius
//   range   shoots from this far (ground shooters can also hit flyers)        air     flies over walls and troops
//   aa      (flyers) can also hit other flyers                                splash  hits everything this near the target
//   slow    seconds its hits slow the target                                  heal    { amt, r } mends friends nearby
//   boom    { dmg, r, cloud? } blows up on buildings and forts                armor   taken off every hit it suffers
//   regen   HP per second                                                     steal   share of damage dealt that heals it
//   split   { kind, n } what it bursts into when it dies                      spawn   { kind, every } what it keeps making
//   charge  multiplier on its first hit                                       bld     multiplier against blocks and buildings
//   minion  true = only ever made by another unit, never bought
// Prices are worked out from the stats (see priceOf in sim.js) and then scaled per race by mods.unitCost,
// which is the knob the balance tool turns.
//
// Fort layouts: [column, row, material]. Column 0 faces the enemy, 3 is the back. The chief's room is columns
// 1-2, rows 0-1, so those cells stay empty and the roof starts at row 2. Materials: L light, S stone, I iron.
// `skin` names what the art session should draw each material as for this race.

const U = (name, short, n, hp, sp, dmg, rate, r, extra = {}, art = '', look = '') => ({ name, short, count: n, hp, speed: sp, dmg, rate, r, bld: 1, ...extra, art, look });

export const RACE_DATA = {
  // ------------------------------------------------------------------ fantasy
  fantasy: {
    name: 'Highrealm', theme: 'Fantasy: dwarves, elves and dragons', chief: 'the Dwarf King under the mountain',
    tag: 'Stout walls, sharp arrows, and a dragon when it counts.',
    traits: { plus: ['castle', 'chiefHit'], minus: ['shields', 'reload'] },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'wall',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a grey stone castle keep with battlements, banners and a round turret at the back', skin: { L: 'oak beams', S: 'castle stone', I: 'iron-bound gate' },
      layout: [[0, 0, 'S'], [0, 1, 'S'], [0, 2, 'S'], [1, 2, 'S'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S'], [3, 3, 'L']] },
    units: {
      shieldbearer: U('Dwarf Shieldbearer', 'Shields', 1, 210, 26, 17, 1.0, 24, { armor: 4, bld: 2, cls: 'Melee', role: 'Armoured tank. Holds the line, breaks walls' }, 'anvil', 'a stocky dwarf behind a huge round shield with an axe'),
      archer: U('Elf Archers', 'Archers', 2, 30, 44, 12, 1.25, 14, { range: 130, vsAir: 1.8, bld: 0.7, cls: 'Anti-air', role: 'Anti-air. Beats flyers' }, 'slinger', 'a slim elf in green with a longbow'),
      dancer: U('Blade Dancers', 'Dancers', 2, 40, 70, 8, 0.5, 13, { charge: 3, pierce: true, bld: 0.7, cls: 'Melee', role: 'Fast, cuts armour. Beats tanks' }, 'skimmer', 'a quick elf with two curved swords, mid-leap'),
      sapper: U('Dwarf Sappers', 'Sappers', 2, 30, 44, 0, 1.0, 15, { boom: { dmg: 60, r: 70 }, cls: 'Bomber', role: 'Bomb. Beats swarms and walls' }, 'keg', 'a dwarf carrying a powder keg with a lit fuse'),
      gryphon: U('Gryphon Rider', 'Gryphon', 1, 70, 66, 12, 0.8, 20, { air: true, range: 46, cls: 'Flying anti-ground', role: 'Flyer. Hunts ground shooters' }, 'skimmer', 'an elf knight riding a gryphon, lance down'),
      dragon: U('Young Dragon', 'Dragon', 1, 150, 40, 16, 1.2, 26, { air: true, range: 90, splash: 46, aa: true, bld: 1.6, cls: 'Flying ranged', role: 'Flyer. Burns groups and flyers' }, 'bark', 'a red young dragon breathing a puff of fire'),
    },
    ult: { name: 'Dwarven Mortars', shape: 'barrage', n: 11, dmg: 55, r: 60, bld: 2, over: 1.8, chiefCap: 0.3 },
  },
  // ------------------------------------------------------------------ aliens
  aliens: {
    name: 'Zyx Swarm', theme: 'Aliens', chief: 'the Overmind, a big brain in a glass jar on spider legs',
    tag: 'Goo that splits, rays that zap, and a saucer overhead.',
    traits: { plus: ['shields', 'troopCost'], minus: ['castle', 'chiefHp'] }, traitSize: { troopCost: 0.09 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'mine',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a cluster of glowing green egg pods and purple crystal around a landed saucer hull', skin: { L: 'slime pod', S: 'purple crystal', I: 'saucer hull plate' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'L'], [1, 3, 'L'], [2, 2, 'L'], [2, 3, 'L'], [3, 0, 'I'], [3, 1, 'L'], [3, 2, 'L']] },
    units: {
      blob: U('Blobs', 'Blobs', 3, 30, 52, 6, 0.6, 13, { split: { kind: 'bloblet', n: 2 }, bld: 0.5, cls: 'Melee', role: 'Swarm, splits. Swamps siege' }, 'sprout', 'a wobbly green jelly blob with one eye'),
      bloblet: U('Bloblets', 'Bloblets', 1, 10, 62, 3, 0.6, 9, { minion: true }, 'sprout', 'a tiny green jelly drop with one eye'),
      trooper: U('Ray Troopers', 'Troopers', 2, 32, 46, 13, 1.2, 14, { range: 120, pierce: true, bld: 0.7, cls: 'Ranged', role: 'Ray gun cuts armour. Beats tanks' }, 'slinger', 'a little grey alien in a bubble helmet with a ray gun'),
      walker: U('Brain Walker', 'Walker', 1, 210, 24, 11, 1.1, 25, { range: 60, slow: 1.5, siege: true, bld: 7, noAir: true, cls: 'Siege', role: 'Siege. Smashes forts, ignores troops' }, 'bark', 'a tall three-legged walker with a brain dome on top'),
      spitter: U('Acid Spitters', 'Spitters', 3, 30, 40, 8, 1.3, 15, { range: 110, splash: 40, noAir: true, cls: 'Anti-ground', role: 'Acid splash. Beats swarms' }, 'spore', 'a squat purple alien bug spitting green acid'),
      saucer: U('Scout Saucers', 'Saucers', 2, 48, 70, 8, 0.7, 15, { air: true, range: 85, aa: true, vsAir: 2, bld: 0.7, cls: 'Flying anti-air', role: 'Anti-air flyer. Beats flyers' }, 'skimmer', 'a small flying saucer with a blinking dome'),
      mothership: U('Brood Ship', 'Brood', 1, 150, 26, 5, 1.2, 28, { air: true, range: 80, spawn: { kind: 'bloblet', every: 3.2 }, cls: 'Flying anti-ground', role: 'Flyer. Drops bloblets behind the line' }, 'bark', 'a fat purple mothership dripping green blobs'),
    },
    ult: { name: 'Orbital Ray', shape: 'beam', dmg: 220, blockDmg: 220, r: 65, chiefCap: 0.5 },
  },
  // ------------------------------------------------------------------ robots
  robots: {
    name: 'Bolt Brigade', theme: 'Robots', chief: 'Unit Zero, a boxy old robot with a crown-shaped antenna',
    tag: 'Armoured, tireless, expensive to build.',
    traits: { plus: ['armour', 'troopCost'], minus: ['gold', 'troopSpeed'] }, traitSize: { troopCost: 0.28 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'tower',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a squat riveted iron bunker with antenna dishes and warning stripes', skin: { L: 'wire mesh crate', S: 'concrete slab', I: 'riveted steel plate' },
      layout: [[0, 0, 'I'], [0, 1, 'I'], [0, 2, 'S'], [1, 2, 'I'], [2, 2, 'I'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S']] },
    units: {
      scrap: U('Scrap Bots', 'Scraps', 5, 22, 54, 5, 0.6, 12, { bld: 0.5, cls: 'Melee', role: 'Cheap swarm. Swamps siege' }, 'skimmer', 'a small rusty wheeled robot with pincer hands'),
      tread: U('Tread Tank', 'Tread', 1, 200, 22, 14, 1.1, 26, { armor: 4, bld: 6, siege: true, cls: 'Siege', role: 'Siege ram. Smashes forts' }, 'anvil', 'a chunky robot on tank treads with ram fists'),
      laser: U('Laser Bots', 'Lasers', 2, 28, 42, 9, 1.0, 14, { range: 125, pierce: true, bld: 0.7, cls: 'Ranged', role: 'Laser cuts armour. Beats tanks' }, 'slinger', 'a thin robot with a glowing red laser eye'),
      bomb: U('Bomb Bots', 'Bombs', 3, 28, 48, 0, 1.0, 14, { boom: { dmg: 62, r: 68 }, cls: 'Bomber', role: 'Rolling bomb. Beats swarms' }, 'keg', 'a round rolling bomb robot with a ticking timer'),
      drone: U('Hover Drones', 'Drones', 2, 30, 74, 6, 0.6, 13, { air: true, range: 64, bld: 0.7, cls: 'Flying anti-ground', role: 'Flyer. Hunts ground troops' }, 'skimmer', 'a small quad-rotor drone with a stinger gun'),
      gunship: U('Gunship', 'Gunship', 1, 110, 34, 14, 0.95, 26, { air: true, range: 100, aa: true, armor: 2, vsAir: 1.8, cls: 'Flying anti-air', role: 'Anti-air gunship. Beats flyers' }, 'anvil', 'a heavy flying robot gunship with twin rotors'),
    },
    ult: { name: 'EMP Wave', shape: 'sweep', dmg: 30, bldDmg: 60, slow: 5 },
  },
  // ------------------------------------------------------------------ monsters
  monsters: {
    name: 'Grimgrowl Pack', theme: 'Monsters', chief: 'the Monster Under the Bed, a huge furry purple beast with tiny horns',
    tag: 'Big, hungry, hard to put down.',
    traits: { plus: ['troopHp', 'regen'], minus: ['reload', 'ammo'] }, traitSize: { reload: 0.08, ammo: 0.15 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'wall',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a rocky cave lair with a giant skull over the door, claw marks and bones', skin: { L: 'bone and hide', S: 'cave rock', I: 'iron cage bars' },
      layout: [[0, 0, 'S'], [0, 1, 'S'], [0, 2, 'S'], [0, 3, 'L'], [1, 2, 'S'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'L']] },
    units: {
      slime: U('Slimes', 'Slimes', 3, 24, 44, 5, 0.6, 13, { split: { kind: 'slimelet', n: 2 }, bld: 0.5, cls: 'Melee', role: 'Swarm, splits. Swamps siege' }, 'sprout', 'a grinning orange slime with googly eyes'),
      slimelet: U('Slimelets', 'Slimelets', 1, 9, 54, 3, 0.6, 9, { minion: true }, 'sprout', 'a tiny orange slime drop'),
      ogre: U('Ogre', 'Ogre', 1, 240, 22, 16, 1.3, 27, { bld: 7, siege: true, cls: 'Siege', role: 'Siege. Smashes forts' }, 'bark', 'a huge green ogre with a tree-trunk club'),
      spider: U('Web Spiders', 'Spiders', 3, 30, 50, 8, 1.1, 14, { range: 100, slow: 2.2, vsAir: 2, bld: 0.7, cls: 'Anti-air', role: 'Webs and slows flyers. Beats flyers' }, 'netter', 'a fat purple spider shooting a web ball'),
      cyclops: U('Cyclops', 'Cyclops', 1, 110, 28, 18, 1.8, 22, { range: 140, splash: 44, bld: 1.8, noAir: true, cls: 'Anti-ground', role: 'Rock splash. Beats swarms' }, 'bark', 'a one-eyed giant hurling a rock'),
      bats: U('Bats', 'Bats', 3, 20, 84, 5, 0.5, 11, { air: true, range: 50, aa: true, vsAir: 1.6, bld: 0.5, cls: 'Flying anti-air', role: 'Anti-air swarm. Beats flyers' }, 'skimmer', 'a small black bat with red eyes'),
      gargoyle: U('Gargoyle', 'Gargoyle', 1, 110, 38, 13, 1.0, 22, { air: true, range: 50, armor: 3, bld: 2, cls: 'Flying anti-ground', role: 'Armoured flyer. Breaks walls' }, 'anvil', 'a stone gargoyle with bat wings, diving'),
    },
    ult: { name: 'Stampede', shape: 'sweep', dmg: 55, bldDmg: 45 },
  },
  // ------------------------------------------------------------------ humans / military
  military: {
    name: 'Iron Company', theme: 'Humans / military', chief: 'the General, a moustached commander with a chest full of medals',
    tag: 'Drilled ranks, sandbags and air support.',
    traits: { plus: ['towers', 'elite'], minus: ['gold', 'chiefHp'] }, traitSize: { gold: 0.16 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'mine',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a sandbag and timber command bunker with a radio mast, camo net and a lookout post', skin: { L: 'sandbags', S: 'concrete', I: 'steel plate' },
      layout: [[0, 0, 'L'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'I'], [2, 2, 'I'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S'], [3, 3, 'L']] },
    units: {
      rifles: U('Riflemen', 'Rifles', 3, 20, 46, 9, 1.2, 13, { range: 125, vsAir: 1.5, bld: 0.5, cls: 'Anti-air', role: 'Anti-air rifles. Beats flyers' }, 'slinger', 'a soldier in a green helmet aiming a rifle'),
      shields: U('Riot Shields', 'Shields', 2, 70, 34, 7, 0.9, 16, { armor: 3, cls: 'Melee', role: 'Armoured line. Shields the shooters' }, 'anvil', 'a soldier crouched behind a tall riot shield'),
      grenadier: U('Grenadiers', 'Grenades', 2, 30, 40, 9, 1.5, 14, { range: 105, splash: 44, bld: 1.5, noAir: true, cls: 'Anti-ground', role: 'Splash. Beats swarms' }, 'spore', 'a soldier lobbing a grenade'),
      tank: U('Battle Tank', 'Tank', 1, 230, 22, 28, 1.8, 28, { armor: 5, range: 120, bld: 2.2, pierce: true, noAir: true, cls: 'Anti-ground', role: 'Armour piercing. Beats tanks and towers' }, 'anvil', 'a small cartoon tank with a stubby cannon'),
      chopper: U('Attack Chopper', 'Chopper', 1, 90, 50, 13, 0.85, 22, { air: true, range: 90, aa: true, vsAir: 2, cls: 'Flying anti-air', role: 'Anti-air chopper. Beats flyers' }, 'skimmer', 'a green cartoon helicopter with a nose gun'),
      bomber: U('Bomber', 'Bomber', 1, 80, 60, 34, 2.2, 22, { air: true, range: 30, splash: 62, bld: 2, noAir: true, drop: true, cls: 'Flying bomber', role: 'Drops big bombs. Beats ground groups and buildings' }, 'keg', 'a fat propeller bomber plane with one big bomb'),
    },
    ult: { name: 'Airstrike', shape: 'barrage', n: 9, dmg: 55, r: 64, bld: 2, over: 1.2, chiefCap: 0.3 },
  },
  // ------------------------------------------------------------------ undead
  undead: {
    name: 'Bonewake', theme: 'Undead', chief: 'the Lich Queen, a skeleton in a tattered purple robe and tall crown',
    tag: 'What falls gets up again, on their side.',
    traits: { plus: ['raise', 'troopCost'], minus: ['castle', 'troopHp'] }, traitSize: { troopCost: 0.31 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'wall',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a crooked graveyard crypt of tombstones and stacked bones with a rusty gate and green candle light', skin: { L: 'stacked bones', S: 'tombstone', I: 'iron coffin' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'L'], [1, 3, 'L'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'L'], [3, 2, 'L'], [3, 3, 'L']] },
    units: {
      skeleton: U('Skeletons', 'Skeletons', 4, 19, 50, 5, 0.6, 12, { bld: 0.5, cls: 'Melee', role: 'Cheap swarm. Swamps siege' }, 'sprout', 'a wobbly skeleton with a rusty sword'),
      necro: U('Necromancer', 'Necro', 1, 40, 40, 9, 1.1, 15, { range: 115, raiser: 'skeleton', bld: 0.7, pierce: true, cls: 'Ranged', role: 'Raises the fallen, bolts cut armour. Beats tanks' }, 'caller', 'a hooded necromancer with a skull staff'),
      golem: U('Bone Golem', 'Golem', 1, 220, 22, 15, 1.2, 26, { bld: 7, siege: true, cls: 'Siege', role: 'Siege. Smashes forts' }, 'bark', 'a hulking golem built from big bones'),
      plague: U('Plague Bearers', 'Plague', 2, 28, 42, 0, 1.0, 15, { boom: { dmg: 40, r: 64, cloud: { r: 78, t: 5, dps: 12 } }, cls: 'Bomber', role: 'Bomb, poison cloud. Beats swarms' }, 'spore', 'a bloated zombie carrying a bubbling green cauldron'),
      ghost: U('Ghosts', 'Ghosts', 2, 30, 56, 6, 0.8, 14, { air: true, range: 40, steal: 0.5, bld: 0.7, cls: 'Flying anti-ground', role: 'Flyer. Drains ground troops' }, 'caller', 'a pale see-through ghost with a spooky grin'),
      bonedrake: U('Bone Drake', 'Drake', 1, 130, 40, 14, 1.2, 26, { air: true, range: 84, splash: 44, aa: true, vsAir: 1.4, cls: 'Flying anti-air', role: 'Flyer. Burns groups and flyers' }, 'bark', 'a skeleton dragon breathing green flame'),
    },
    ult: { name: 'Army of the Dead', shape: 'summon', units: [['skeleton', 9], ['golem', 1]] },
  },
  // ------------------------------------------------------------------ pirates
  pirates: {
    name: 'Saltdogs', theme: 'Pirates', chief: 'Captain Barnacle, a peg-legged pirate with a huge hat and a parrot',
    tag: 'Fast, loud, and in it for the gold.',
    traits: { plus: ['plunder', 'fling'], minus: ['troopCost', 'castle'] }, traitSize: { troopCost: 0.33 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'mine',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a fort built from a beached pirate ship: plank hull, mast with crow\'s nest, barrels and a skull flag', skin: { L: 'ship planks', S: 'ballast stone', I: 'cannon iron' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [0, 3, 'L'], [1, 2, 'L'], [2, 2, 'L'], [3, 0, 'L'], [3, 1, 'L'], [3, 2, 'L'], [3, 3, 'L']] },
    units: {
      deckhand: U('Deckhands', 'Deckhands', 5, 20, 72, 5, 0.5, 12, { bld: 0.5, cls: 'Melee', role: 'Fast swarm. Swamps siege' }, 'skimmer', 'a scrawny pirate in a striped shirt with a cutlass'),
      buccaneer: U('Buccaneers', 'Pistols', 2, 30, 46, 13, 1.3, 14, { range: 110, vsAir: 2.4, bld: 0.7, cls: 'Anti-air', role: 'Pistols. Beats flyers' }, 'slinger', 'a pirate with an eyepatch firing a flintlock pistol'),
      bosun: U('Bosun', 'Bosun', 1, 240, 28, 19, 1.1, 24, { bld: 2.2, pierce: true, cls: 'Melee', role: 'Bruiser, cuts armour. Beats tanks' }, 'anvil', 'a giant bald pirate swinging an anchor'),
      cannoneer: U('Deck Cannon', 'Cannon', 1, 80, 22, 22, 2.2, 22, { range: 150, splash: 46, siege: true, bld: 7, noAir: true, cls: 'Siege', role: 'Siege cannon. Shells forts from afar' }, 'bark', 'two pirates pushing a small wheeled cannon'),
      parrots: U('Parrots', 'Parrots', 5, 13, 88, 4, 0.5, 11, { air: true, range: 36, bld: 0.5, cls: 'Flying anti-ground', role: 'Flyer swarm. Hunts ground shooters' }, 'skimmer', 'a red parrot with a tiny bandana'),
      sloop: U('Sky Sloop', 'Sloop', 1, 140, 30, 12, 1.2, 28, { air: true, range: 110, bld: 1.6, cls: 'Flying anti-ground', role: 'Flyer. Shells walls from afar' }, 'bark', 'a small pirate ship hanging under a patched balloon'),
    },
    ult: { name: 'Broadside', shape: 'barrage', n: 13, dmg: 44, r: 54, bld: 2, over: 2.2, chiefCap: 0.3 },
  },
  // ------------------------------------------------------------------ elementals
  elementals: {
    name: 'Primal Court', theme: 'Elementals', chief: 'the Ember Sovereign, a calm figure of living flame in a stone crown',
    tag: 'Fire, frost, stone and storm.',
    traits: { plus: ['burn', 'ammo'], minus: ['troopHp', 'build'] }, traitSize: { burn: 0.25, ammo: 0.15, troopHp: 0.08 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'tower',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'floating rune-carved boulders and glowing crystal pillars around a fire altar', skin: { L: 'ice crystal', S: 'rune boulder', I: 'obsidian slab' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'S'], [1, 2, 'S'], [2, 2, 'S'], [3, 0, 'I'], [3, 1, 'L'], [3, 2, 'L']] },
    units: {
      imp: U('Ember Imps', 'Imps', 5, 22, 74, 6, 0.5, 12, { bld: 0.5, cls: 'Melee', role: 'Fast swarm. Swamps siege' }, 'skimmer', 'a tiny fire imp with a mischievous grin'),
      golem: U('Stone Golem', 'Golem', 1, 230, 20, 15, 1.3, 27, { armor: 5, bld: 7, siege: true, cls: 'Siege', role: 'Siege. Smashes forts' }, 'bark', 'a boulder golem with glowing rune eyes'),
      frost: U('Frost Wisps', 'Frost', 2, 30, 46, 9, 1.0, 14, { range: 115, slow: 2.2, vsAir: 1.6, bld: 0.7, cls: 'Anti-air', role: 'Freezes flyers. Beats flyers' }, 'netter', 'a floating blue ice wisp with a little face'),
      thorn: U('Thorn Elemental', 'Thorn', 1, 90, 38, 9, 0.8, 18, { regen: 3, splash: 48, cls: 'Melee', role: 'Splash, regrows. Beats swarms' }, 'bark', 'a walking tangle of vines and thorns with a flower head'),
      gale: U('Gale Sprites', 'Gales', 2, 38, 70, 7, 0.6, 12, { air: true, range: 95, aa: true, vsAir: 2, bld: 0.7, cls: 'Flying anti-air', role: 'Anti-air flyer. Beats flyers' }, 'skimmer', 'a swirling white wind sprite'),
      storm: U('Storm Cloud', 'Storm', 1, 145, 30, 12, 1.1, 28, { air: true, range: 96, splash: 44, slow: 1.2, aa: true, cls: 'Flying ranged', role: 'Flyer. Lightning slows groups' }, 'bark', 'a grumpy dark thundercloud throwing lightning'),
    },
    ult: { name: 'Wildfire', shape: 'sweep', dmg: 35, bldDmg: 35, burn: { t: 5, dps: 10 } },
  },
  // ------------------------------------------------------------------ beastfolk
  beastfolk: {
    name: 'Tusk Tribes', theme: 'Beastfolk: orcs, goblins and animal tribes', chief: 'Chief Bigtusk, a fat orc warlord on a throne of shields',
    tag: 'Cheap, fast, and there are always more.',
    traits: { plus: ['troopSpeed', 'chiefHit'], minus: ['troopCost', 'castle'] }, traitSize: { troopCost: 0.13 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'wall',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a wooden palisade war camp with tusks, hide tents, war drums and a totem pole', skin: { L: 'lashed logs', S: 'boulder and tusk', I: 'scrap-metal shield wall' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'L'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'L'], [3, 2, 'L'], [3, 3, 'L']] },
    units: {
      goblin: U('Goblins', 'Goblins', 4, 28, 62, 6, 0.5, 11, { bld: 0.5, cls: 'Melee', role: 'Cheap swarm. Swamps siege' }, 'sprout', 'a cackling green goblin with a dagger'),
      boar: U('Boar Rider', 'Boar', 1, 160, 82, 14, 0.9, 20, { charge: 3, siege: true, bld: 5, cls: 'Siege', role: 'Charges walls. Smashes forts' }, 'skimmer', 'a goblin riding a charging war boar'),
      shaman: U('Shaman', 'Shaman', 1, 60, 46, 10, 1.0, 15, { heal: { amt: 8, r: 90 }, range: 105, vsAir: 2, bld: 0.7, cls: 'Support', role: 'Heals troops, hexes flyers and fights' }, 'caller', 'an orc shaman with a feathered mask and bone rattle'),
      troll: U('Troll', 'Troll', 1, 240, 24, 20, 1.3, 27, { regen: 4, bld: 2.6, pierce: true, cls: 'Melee', role: 'Regrowing tank, club cuts armour. Beats tanks and walls' }, 'bark', 'a lanky blue troll dragging a boulder on a rope'),
      wyvern: U('Wyvern Rider', 'Wyvern', 1, 125, 54, 14, 0.8, 22, { air: true, range: 100, charge: 2, aa: true, vsAir: 1.5, cls: 'Flying anti-air', role: 'Flyer. Hunts other flyers' }, 'skimmer', 'an orc riding a green wyvern'),
      vultures: U('Bomb Vultures', 'Vultures', 2, 38, 70, 14, 1.5, 14, { air: true, range: 26, splash: 46, bld: 1.8, noAir: true, drop: true, cls: 'Flying bomber', role: 'Drop small bombs. Beat swarms and buildings' }, 'keg', 'a vulture carrying a goblin bomb in its claws'),
    },
    ult: { name: 'War Band', shape: 'summon', units: [['goblin', 8], ['boar', 1], ['troll', 1]] },
  },
  // ------------------------------------------------------------------ steampunk
  steampunk: {
    name: 'Brass Guild', theme: 'Steampunk', chief: 'the Grand Inventor, a tiny lady in goggles driving a brass walking chair',
    tag: 'Gears, steam, and far too much pressure.',
    traits: { plus: ['reload', 'troopCost'], minus: ['troopSpeed', 'shields'] }, traitSize: { troopCost: 0.16 },   // two strengths, two weaknesses (js/traits.js); traitSize: {} tunes them
    lean: 'tower',   // the building this race leans to (tuning.js LEAN): shown on the race card and in the guidebook
    fort: { look: 'a brass and brick workshop with a smoking chimney, big gears, pipes and a clock face', skin: { L: 'copper pipework', S: 'red brick', I: 'brass boiler plate' },
      layout: [[0, 0, 'I'], [0, 1, 'S'], [0, 2, 'L'], [1, 2, 'I'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S'], [3, 3, 'L']] },
    units: {
      clockwork: U('Clockwork Soldiers', 'Clockworks', 3, 24, 50, 6, 0.7, 12, { armor: 1, bld: 0.5, cls: 'Melee', role: 'Armoured swarm. Swamps siege' }, 'skimmer', 'a wind-up brass toy soldier with a key in its back'),
      knight: U('Steam Knight', 'Knight', 1, 200, 24, 15, 1.1, 25, { armor: 5, bld: 2.2, pierce: true, cls: 'Melee', role: 'Lance cuts armour. Beats tanks' }, 'anvil', 'a puffing steam-powered suit of armour with a piston lance'),
      tesla: U('Tesla Gunners', 'Teslas', 2, 30, 40, 8, 1.2, 14, { range: 110, splash: 42, vsAir: 1.4, bld: 0.7, cls: 'Anti-air', role: 'Chain zap. Beats swarms and flyers' }, 'slinger', 'an engineer with a crackling tesla coil backpack gun'),
      boiler: U('Boiler Bombs', 'Boilers', 2, 30, 44, 0, 1.0, 15, { boom: { dmg: 64, r: 70 }, cls: 'Bomber', role: 'Walking bomb. Beats swarms' }, 'keg', 'a wobbling over-pressured boiler on little legs'),
      gyro: U('Gyrocopters', 'Gyros', 2, 32, 68, 11, 1.0, 14, { air: true, range: 70, aa: true, vsAir: 2, bld: 0.7, cls: 'Flying anti-air', role: 'Anti-air flyer. Beats flyers' }, 'skimmer', 'a one-seat pedal gyrocopter with a blunderbuss'),
      zeppelin: U('War Zeppelin', 'Zeppelin', 1, 170, 22, 20, 2.0, 30, { air: true, range: 60, splash: 50, bld: 2.2, cls: 'Flying anti-ground', role: 'Flyer. Flattens buildings' }, 'bark', 'a brass war zeppelin dropping round bombs'),
    },
    ult: { name: 'Tesla Cannon', shape: 'beam', dmg: 200, blockDmg: 240, r: 60, chiefCap: 0.45 },
  },
};

// Price multipliers per troop, found by tools/tune_units.mjs (how well a troop does when it is the only one
// sent). 1 = the price worked out from its stats. Rewritten by the tool: do not hand-edit between the braces.
// Per-troop price correction for what the stats do not show (reach, abilities, squad size). The same rule for every
// race: each race's corrections average 1, so a race is never cheaper or dearer across the board here. A race-wide
// price level exists only as a listed trait (Cheap troops, Costly troops, Elite troops, Rabble in js/traits.js).
export const PRICE_TUNE = {
  aliens_blob: 0.97,
  aliens_trooper: 1.04,
  aliens_walker: 1.20,
  aliens_spitter: 0.90,
  aliens_saucer: 0.87,
  aliens_mothership: 0.91,
  beastfolk_goblin: 1.22,
  beastfolk_boar: 1.18,
  beastfolk_shaman: 0.77,
  beastfolk_troll: 1.22,
  beastfolk_wyvern: 0.77,
  beastfolk_vultures: 0.86,
  military_rifles: 1.01,
  military_shields: 1.53,
  military_grenadier: 0.81,
  military_tank: 0.94,
  military_chopper: 0.73,
  military_bomber: 0.84,
  monsters_slime: 0.89,
  monsters_ogre: 1.19,
  monsters_spider: 0.89,
  monsters_cyclops: 1.05,
  monsters_bats: 0.89,
  monsters_gargoyle: 1.08,
  elementals_imp: 1.08,
  elementals_golem: 0.84,
  elementals_frost: 1.08,
  elementals_thorn: 1.08,
  elementals_gale: 1.08,
  elementals_storm: 0.84,
  fantasy_shieldbearer: 0.76,
  fantasy_archer: 1.38,
  fantasy_dancer: 1.22,
  fantasy_sapper: 0.94,
  fantasy_gryphon: 1.02,
  fantasy_dragon: 0.68,
  pirates_deckhand: 1.04,
  pirates_buccaneer: 1.09,
  pirates_bosun: 0.92,
  pirates_cannoneer: 1.04,
  pirates_parrots: 0.96,
  pirates_sloop: 0.96,
  robots_scrap: 1.14,
  robots_tread: 0.80,
  robots_laser: 1.32,
  robots_bomb: 0.88,
  robots_drone: 1.04,
  robots_gunship: 0.89,
  steampunk_clockwork: 1.09,
  steampunk_knight: 1.18,
  steampunk_tesla: 0.98,
  steampunk_boiler: 0.83,
  steampunk_gyro: 0.83,
  steampunk_zeppelin: 1.09,
  undead_skeleton: 1.09,
  undead_necro: 1.03,
  undead_golem: 0.90,
  undead_plague: 1.03,
  undead_ghost: 1.03,
  undead_bonedrake: 0.93,
};
