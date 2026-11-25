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
    pros: ['Stone keep: fort blocks +15% HP', 'Boulders cost 18g'], cons: ['Troops cost a little more', 'Shields cost 55g'],
    mods: { unitCost: 1.09, kingHp: 0.96, blockHp: 1.15, ammoCost: { boulder: 18 }, shieldCost: 55},
    fort: { look: 'a grey stone castle keep with battlements, banners and a round turret at the back', skin: { L: 'oak beams', S: 'castle stone', I: 'iron-bound gate' },
      layout: [[0, 0, 'S'], [0, 1, 'S'], [0, 2, 'S'], [1, 2, 'S'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S'], [3, 3, 'L']] },
    units: {
      shieldbearer: U('Dwarf Shieldbearer', 'Shields', 1, 190, 26, 13, 1.0, 24, { armor: 2, bld: 2 }, 'anvil', 'a stocky dwarf behind a huge round shield with an axe'),
      archer: U('Elf Archers', 'Archers', 2, 30, 44, 9, 0.9, 14, { range: 130 }, 'slinger', 'a slim elf in green with a longbow'),
      dancer: U('Blade Dancers', 'Dancers', 2, 40, 70, 8, 0.5, 13, { charge: 3 }, 'skimmer', 'a quick elf with two curved swords, mid-leap'),
      sapper: U('Dwarf Sappers', 'Sappers', 2, 30, 44, 0, 1.0, 15, { boom: { dmg: 60, r: 70 } }, 'keg', 'a dwarf carrying a powder keg with a lit fuse'),
      priest: U('Rune Priest', 'Priest', 1, 44, 46, 3, 1.0, 16, { heal: { amt: 9, r: 90 } }, 'caller', 'an old dwarf priest with a glowing rune staff'),
      gryphon: U('Gryphon Rider', 'Gryphon', 1, 70, 66, 12, 0.8, 20, { air: true, range: 46 }, 'skimmer', 'an elf knight riding a gryphon, lance down'),
      dragon: U('Young Dragon', 'Dragon', 1, 150, 40, 16, 1.2, 26, { air: true, range: 90, splash: 46, aa: true, bld: 1.6 }, 'bark', 'a red young dragon breathing a puff of fire'),
    },
  },
  // ------------------------------------------------------------------ aliens
  aliens: {
    name: 'Zyx Swarm', theme: 'Aliens', chief: 'the Overmind, a big brain in a glass jar on spider legs',
    tag: 'Goo that splits, rays that zap, and a saucer overhead.',
    pros: ['Energy shields cost 30g and last 26s', 'Blobs split when they pop'], cons: ['Catapult reloads 10% slower', 'Soft fort: blocks -10% HP'],
    mods: { unitCost: 0.87, kingHp: 1.07, shieldCost: 30, shieldLife: 26, reload: 1.1, blockHp: 0.9},
    fort: { look: 'a cluster of glowing green egg pods and purple crystal around a landed saucer hull', skin: { L: 'slime pod', S: 'purple crystal', I: 'saucer hull plate' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'L'], [1, 3, 'L'], [2, 2, 'L'], [2, 3, 'L'], [3, 0, 'I'], [3, 1, 'L'], [3, 2, 'L']] },
    units: {
      blob: U('Blobs', 'Blobs', 3, 26, 52, 5, 0.6, 13, { split: { kind: 'bloblet', n: 2 } }, 'sprout', 'a wobbly green jelly blob with one eye'),
      bloblet: U('Bloblets', 'Bloblets', 1, 10, 62, 3, 0.6, 9, { minion: true }, 'sprout', 'a tiny green jelly drop with one eye'),
      trooper: U('Ray Troopers', 'Troopers', 2, 32, 46, 9, 0.9, 14, { range: 120 }, 'slinger', 'a little grey alien in a bubble helmet with a ray gun'),
      walker: U('Brain Walker', 'Walker', 1, 210, 24, 11, 1.1, 25, { range: 60, slow: 1.5, bld: 1.5 }, 'bark', 'a tall three-legged walker with a brain dome on top'),
      spitter: U('Acid Spitters', 'Spitters', 2, 30, 40, 8, 1.3, 15, { range: 110, splash: 40 }, 'spore', 'a squat purple alien bug spitting green acid'),
      saucer: U('Scout Saucers', 'Saucers', 2, 34, 70, 6, 0.7, 15, { air: true, range: 70, aa: true }, 'skimmer', 'a small flying saucer with a blinking dome'),
      mothership: U('Brood Ship', 'Brood', 1, 150, 26, 5, 1.2, 28, { air: true, range: 80, spawn: { kind: 'bloblet', every: 3.2 } }, 'bark', 'a fat purple mothership dripping green blobs'),
    },
  },
  // ------------------------------------------------------------------ robots
  robots: {
    name: 'Bolt Brigade', theme: 'Robots', chief: 'Unit Zero, a boxy old robot with a crown-shaped antenna',
    tag: 'Armoured, tireless, expensive to build.',
    pros: ['Every troop has +1 armour', 'Iron bunker: very hard blocks'], cons: ['Gold comes in 8% slower', 'Slow, costly troops'],
    mods: { unitCost: 0.86, kingHp: 1.07, unitArmor: 1, income: 0.92},
    fort: { look: 'a squat riveted iron bunker with antenna dishes and warning stripes', skin: { L: 'wire mesh crate', S: 'concrete slab', I: 'riveted steel plate' },
      layout: [[0, 0, 'I'], [0, 1, 'I'], [0, 2, 'S'], [1, 2, 'I'], [2, 2, 'I'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S']] },
    units: {
      scrap: U('Scrap Bots', 'Scraps', 3, 22, 54, 5, 0.6, 12, {}, 'skimmer', 'a small rusty wheeled robot with pincer hands'),
      tread: U('Tread Tank', 'Tread', 1, 200, 22, 14, 1.1, 26, { armor: 2, bld: 2.2 }, 'anvil', 'a chunky robot on tank treads with ram fists'),
      laser: U('Laser Bots', 'Lasers', 2, 30, 42, 10, 1.0, 14, { range: 125 }, 'slinger', 'a thin robot with a glowing red laser eye'),
      bomb: U('Bomb Bots', 'Bombs', 2, 28, 48, 0, 1.0, 14, { boom: { dmg: 62, r: 68 } }, 'keg', 'a round rolling bomb robot with a ticking timer'),
      welder: U('Welder', 'Welder', 1, 46, 44, 3, 1.0, 15, { heal: { amt: 9, r: 90 } }, 'caller', 'a repair robot with a sparking welding arm'),
      drone: U('Hover Drones', 'Drones', 2, 30, 74, 6, 0.6, 13, { air: true, range: 64 }, 'skimmer', 'a small quad-rotor drone with a stinger gun'),
      gunship: U('Gunship', 'Gunship', 1, 130, 34, 9, 0.6, 26, { air: true, range: 100, aa: true, armor: 1 }, 'anvil', 'a heavy flying robot gunship with twin rotors'),
    },
  },
  // ------------------------------------------------------------------ monsters
  monsters: {
    name: 'Grimgrowl Pack', theme: 'Monsters', chief: 'the Monster Under the Bed, a huge furry purple beast with tiny horns',
    tag: 'Big, hungry, hard to put down.',
    pros: ['Troops have +15% HP', 'Chief regrows 2 HP/s'], cons: ['Catapult reloads 10% slower', 'Scatter costs 18g'],
    mods: { unitCost: 1.35, kingHp: 0.85, unitHp: 1.15, kingRegen: 2, reload: 1.1, ammoCost: { scatter: 18 }},
    fort: { look: 'a rocky cave lair with a giant skull over the door, claw marks and bones', skin: { L: 'bone and hide', S: 'cave rock', I: 'iron cage bars' },
      layout: [[0, 0, 'S'], [0, 1, 'S'], [0, 2, 'S'], [0, 3, 'L'], [1, 2, 'S'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'L']] },
    units: {
      slime: U('Slimes', 'Slimes', 3, 24, 44, 5, 0.6, 13, { split: { kind: 'slimelet', n: 2 } }, 'sprout', 'a grinning orange slime with googly eyes'),
      slimelet: U('Slimelets', 'Slimelets', 1, 9, 54, 3, 0.6, 9, { minion: true }, 'sprout', 'a tiny orange slime drop'),
      werewolf: U('Werewolf', 'Wolf', 1, 80, 76, 12, 0.55, 17, { steal: 0.4, charge: 2 }, 'skimmer', 'a lanky grey werewolf in torn trousers, pouncing'),
      ogre: U('Ogre', 'Ogre', 1, 240, 22, 16, 1.3, 27, { bld: 3 }, 'bark', 'a huge green ogre with a tree-trunk club'),
      spider: U('Web Spiders', 'Spiders', 2, 28, 50, 5, 1.1, 14, { range: 100, slow: 2.2 }, 'netter', 'a fat purple spider shooting a web ball'),
      cyclops: U('Cyclops', 'Cyclops', 1, 110, 28, 18, 1.8, 22, { range: 140, splash: 44, bld: 1.8 }, 'bark', 'a one-eyed giant hurling a rock'),
      bats: U('Bats', 'Bats', 3, 14, 84, 4, 0.5, 11, { air: true, range: 36, aa: true }, 'skimmer', 'a small black bat with red eyes'),
      gargoyle: U('Gargoyle', 'Gargoyle', 1, 110, 38, 13, 1.0, 22, { air: true, range: 50, armor: 2, bld: 2 }, 'anvil', 'a stone gargoyle with bat wings, diving'),
    },
  },
  // ------------------------------------------------------------------ humans / military
  military: {
    name: 'Iron Company', theme: 'Humans / military', chief: 'the General, a moustached commander with a chest full of medals',
    tag: 'Drilled ranks, sandbags and air support.',
    pros: ['Towers hit 40% harder', 'Walls cost 22g', 'Scatter costs 8g'], cons: ['Chief -8% HP', 'Troops are average at everything'],
    mods: { unitCost: 0.90, kingHp: 0.96, towerDmg: 1.4, wallCost: 22, ammoCost: { scatter: 8 },},
    fort: { look: 'a sandbag and timber command bunker with a radio mast, camo net and a lookout post', skin: { L: 'sandbags', S: 'concrete', I: 'steel plate' },
      layout: [[0, 0, 'L'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'I'], [2, 2, 'I'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S'], [3, 3, 'L']] },
    units: {
      rifles: U('Riflemen', 'Rifles', 3, 20, 46, 6, 0.9, 13, { range: 125 }, 'slinger', 'a soldier in a green helmet aiming a rifle'),
      shields: U('Riot Shields', 'Shields', 2, 70, 34, 7, 0.9, 16, { armor: 2 }, 'anvil', 'a soldier crouched behind a tall riot shield'),
      medic: U('Medic', 'Medic', 1, 40, 50, 3, 1.0, 14, { heal: { amt: 10, r: 95 } }, 'caller', 'a field medic with a red-cross satchel'),
      grenadier: U('Grenadiers', 'Grenades', 2, 30, 40, 9, 1.5, 14, { range: 105, splash: 44, bld: 1.5 }, 'spore', 'a soldier lobbing a grenade'),
      tank: U('Battle Tank', 'Tank', 1, 210, 22, 20, 1.8, 28, { armor: 3, range: 120, bld: 2.2 }, 'anvil', 'a small cartoon tank with a stubby cannon'),
      chopper: U('Attack Chopper', 'Chopper', 1, 90, 50, 7, 0.5, 22, { air: true, range: 90, aa: true }, 'skimmer', 'a green cartoon helicopter with a nose gun'),
      bomber: U('Bomber', 'Bomber', 1, 70, 60, 0, 1.0, 22, { air: true, boom: { dmg: 80, r: 74 } }, 'keg', 'a fat propeller bomber plane with one big bomb'),
    },
  },
  // ------------------------------------------------------------------ undead
  undead: {
    name: 'Bonewake', theme: 'Undead', chief: 'the Lich Queen, a skeleton in a tattered purple robe and tall crown',
    tag: 'What falls gets up again, on their side.',
    pros: ['Enemy ground troops your troops kill may rise as Skeletons', 'Troops are cheap'], cons: ['Chief -10% HP', 'Brittle crypt: blocks -10% HP'],
    mods: { unitCost: 0.74, kingHp: 1.03, raise: 0.3, blockHp: 0.9},
    fort: { look: 'a crooked graveyard crypt of tombstones and stacked bones with a rusty gate and green candle light', skin: { L: 'stacked bones', S: 'tombstone', I: 'iron coffin' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'L'], [1, 3, 'L'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'L'], [3, 2, 'L'], [3, 3, 'L']] },
    units: {
      skeleton: U('Skeletons', 'Skeletons', 4, 14, 50, 5, 0.6, 12, {}, 'sprout', 'a wobbly skeleton with a rusty sword'),
      zombie: U('Zombies', 'Zombies', 2, 70, 24, 8, 1.0, 16, { regen: 2 }, 'bark', 'a green shambling zombie with arms out'),
      necro: U('Necromancer', 'Necro', 1, 40, 40, 9, 1.1, 15, { range: 115, raiser: 'skeleton' }, 'caller', 'a hooded necromancer with a skull staff'),
      golem: U('Bone Golem', 'Golem', 1, 220, 22, 15, 1.2, 26, { bld: 2.4 }, 'bark', 'a hulking golem built from big bones'),
      plague: U('Plague Bearers', 'Plague', 2, 28, 42, 0, 1.0, 15, { boom: { dmg: 40, r: 64, cloud: { r: 78, t: 5, dps: 12 } } }, 'spore', 'a bloated zombie carrying a bubbling green cauldron'),
      ghost: U('Ghosts', 'Ghosts', 2, 30, 56, 6, 0.8, 14, { air: true, range: 40, steal: 0.5 }, 'caller', 'a pale see-through ghost with a spooky grin'),
      bonedrake: U('Bone Drake', 'Drake', 1, 130, 40, 14, 1.2, 26, { air: true, range: 84, splash: 44, aa: true }, 'bark', 'a skeleton dragon breathing green flame'),
    },
  },
  // ------------------------------------------------------------------ pirates
  pirates: {
    name: 'Saltdogs', theme: 'Pirates', chief: 'Captain Barnacle, a peg-legged pirate with a huge hat and a parrot',
    tag: 'Fast, loud, and in it for the gold.',
    pros: ['Plunder: +3 extra gold for every enemy troop killed', 'Gold kites and chests give 50% more'], cons: ['Wooden fort: blocks -15% HP', 'Towers -20% HP'],
    mods: { unitCost: 1.08, kingHp: 0.95, plunder: 3, bonusGold: 1.5, blockHp: 0.85, towerHp: 0.8},
    fort: { look: 'a fort built from a beached pirate ship: plank hull, mast with crow\'s nest, barrels and a skull flag', skin: { L: 'ship planks', S: 'ballast stone', I: 'cannon iron' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [0, 3, 'L'], [1, 2, 'L'], [2, 2, 'L'], [3, 0, 'L'], [3, 1, 'L'], [3, 2, 'L'], [3, 3, 'L']] },
    units: {
      deckhand: U('Deckhands', 'Deckhands', 3, 20, 72, 5, 0.5, 12, {}, 'skimmer', 'a scrawny pirate in a striped shirt with a cutlass'),
      buccaneer: U('Buccaneers', 'Pistols', 2, 30, 46, 10, 1.1, 14, { range: 110 }, 'slinger', 'a pirate with an eyepatch firing a flintlock pistol'),
      monkey: U('Powder Monkeys', 'Powder', 2, 26, 60, 0, 1.0, 13, { boom: { dmg: 56, r: 68 } }, 'keg', 'a monkey in a tiny pirate hat hugging a powder barrel'),
      bosun: U('Bosun', 'Bosun', 1, 190, 28, 15, 1.1, 24, { bld: 2.2 }, 'anvil', 'a giant bald pirate swinging an anchor'),
      cannoneer: U('Deck Cannon', 'Cannon', 1, 80, 22, 22, 2.2, 22, { range: 150, splash: 46, bld: 2 }, 'bark', 'two pirates pushing a small wheeled cannon'),
      parrots: U('Parrots', 'Parrots', 3, 13, 88, 4, 0.5, 11, { air: true, range: 36 }, 'skimmer', 'a red parrot with a tiny bandana'),
      sloop: U('Sky Sloop', 'Sloop', 1, 140, 30, 12, 1.2, 28, { air: true, range: 110, bld: 1.6 }, 'bark', 'a small pirate ship hanging under a patched balloon'),
    },
  },
  // ------------------------------------------------------------------ elementals
  elementals: {
    name: 'Primal Court', theme: 'Elementals', chief: 'the Ember Sovereign, a calm figure of living flame in a stone crown',
    tag: 'Fire, frost, stone and storm.',
    pros: ['Firepots cost 10g and burn 50% longer', 'Frost and storm slow everything'], cons: ['No healing troop', 'Boulders cost 31g'],
    mods: { unitCost: 0.97, kingHp: 1.02, ammoCost: { fire: 10, boulder: 31 }, burnTime: 1.5},
    fort: { look: 'floating rune-carved boulders and glowing crystal pillars around a fire altar', skin: { L: 'ice crystal', S: 'rune boulder', I: 'obsidian slab' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'S'], [1, 2, 'S'], [2, 2, 'S'], [3, 0, 'I'], [3, 1, 'L'], [3, 2, 'L']] },
    units: {
      imp: U('Ember Imps', 'Imps', 3, 18, 74, 6, 0.5, 12, {}, 'skimmer', 'a tiny fire imp with a mischievous grin'),
      golem: U('Stone Golem', 'Golem', 1, 230, 20, 15, 1.3, 27, { armor: 3, bld: 2.5 }, 'bark', 'a boulder golem with glowing rune eyes'),
      frost: U('Frost Wisps', 'Frost', 2, 28, 46, 6, 1.0, 14, { range: 115, slow: 2.2 }, 'netter', 'a floating blue ice wisp with a little face'),
      magma: U('Magma Lumps', 'Magma', 2, 30, 40, 0, 1.0, 15, { boom: { dmg: 46, r: 64, cloud: { r: 70, t: 4, dps: 14 } } }, 'spore', 'a glowing blob of lava with a worried face'),
      thorn: U('Thorn Elemental', 'Thorn', 1, 90, 38, 9, 0.8, 18, { regen: 3, splash: 34 }, 'bark', 'a walking tangle of vines and thorns with a flower head'),
      gale: U('Gale Sprites', 'Gales', 2, 24, 86, 5, 0.6, 12, { air: true, range: 44, aa: true }, 'skimmer', 'a swirling white wind sprite'),
      storm: U('Storm Cloud', 'Storm', 1, 120, 30, 11, 1.1, 28, { air: true, range: 96, splash: 44, slow: 1.2, aa: true }, 'bark', 'a grumpy dark thundercloud throwing lightning'),
    },
  },
  // ------------------------------------------------------------------ beastfolk
  beastfolk: {
    name: 'Tusk Tribes', theme: 'Beastfolk: orcs, goblins and animal tribes', chief: 'Chief Bigtusk, a fat orc warlord on a throne of shields',
    tag: 'Cheap, fast, and there are always more.',
    pros: ['Troops cost 10% less and move 10% faster'], cons: ['Walls -30% HP, towers -20% HP', 'Stick fort: blocks -10% HP'],
    mods: { unitCost: 1.06, kingHp: 0.91, unitSpeed: 1.1, wallHp: 0.7, towerHp: 0.8, blockHp: 0.9},
    fort: { look: 'a wooden palisade war camp with tusks, hide tents, war drums and a totem pole', skin: { L: 'lashed logs', S: 'boulder and tusk', I: 'scrap-metal shield wall' },
      layout: [[0, 0, 'S'], [0, 1, 'L'], [0, 2, 'L'], [1, 2, 'L'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'L'], [3, 2, 'L'], [3, 3, 'L']] },
    units: {
      goblin: U('Goblins', 'Goblins', 4, 14, 62, 4, 0.5, 11, {}, 'sprout', 'a cackling green goblin with a dagger'),
      orc: U('Orc Raiders', 'Orcs', 2, 60, 48, 10, 0.8, 16, { charge: 2 }, 'anvil', 'a muscly orc with a notched axe'),
      boar: U('Boar Rider', 'Boar', 1, 120, 82, 13, 0.9, 20, { charge: 3, bld: 1.8 }, 'skimmer', 'a goblin riding a charging war boar'),
      shaman: U('Shaman', 'Shaman', 1, 40, 46, 4, 1.0, 15, { heal: { amt: 8, r: 90 }, range: 90 }, 'caller', 'an orc shaman with a feathered mask and bone rattle'),
      troll: U('Troll', 'Troll', 1, 230, 24, 15, 1.3, 27, { regen: 4, bld: 2.6 }, 'bark', 'a lanky blue troll dragging a boulder on a rope'),
      wyvern: U('Wyvern Rider', 'Wyvern', 1, 85, 62, 12, 0.8, 22, { air: true, range: 48, charge: 2 }, 'skimmer', 'an orc riding a green wyvern'),
      vultures: U('Bomb Vultures', 'Vultures', 2, 26, 70, 0, 1.0, 14, { air: true, boom: { dmg: 40, r: 60 } }, 'keg', 'a vulture carrying a goblin bomb in its claws'),
    },
  },
  // ------------------------------------------------------------------ steampunk
  steampunk: {
    name: 'Brass Guild', theme: 'Steampunk', chief: 'the Grand Inventor, a tiny lady in goggles driving a brass walking chair',
    tag: 'Gears, steam, and far too much pressure.',
    pros: ['Catapult reloads 15% faster', 'Boulders cost 16g'], cons: ['Troops move 10% slower', 'Shields cost 55g'],
    mods: { unitCost: 1.05, kingHp: 0.98, reload: 0.85, ammoCost: { boulder: 16 }, unitSpeed: 0.9, shieldCost: 55},
    fort: { look: 'a brass and brick workshop with a smoking chimney, big gears, pipes and a clock face', skin: { L: 'copper pipework', S: 'red brick', I: 'brass boiler plate' },
      layout: [[0, 0, 'I'], [0, 1, 'S'], [0, 2, 'L'], [1, 2, 'I'], [2, 2, 'L'], [3, 0, 'S'], [3, 1, 'S'], [3, 2, 'S'], [3, 3, 'L']] },
    units: {
      clockwork: U('Clockwork Soldiers', 'Clockworks', 3, 24, 50, 6, 0.7, 12, { armor: 1 }, 'skimmer', 'a wind-up brass toy soldier with a key in its back'),
      knight: U('Steam Knight', 'Knight', 1, 200, 24, 15, 1.1, 25, { armor: 3, bld: 2.2 }, 'anvil', 'a puffing steam-powered suit of armour with a piston lance'),
      tesla: U('Tesla Gunners', 'Teslas', 2, 30, 40, 8, 1.2, 14, { range: 110, splash: 42 }, 'slinger', 'an engineer with a crackling tesla coil backpack gun'),
      boiler: U('Boiler Bombs', 'Boilers', 2, 30, 44, 0, 1.0, 15, { boom: { dmg: 64, r: 70 } }, 'keg', 'a wobbling over-pressured boiler on little legs'),
      tinker: U('Tinker', 'Tinker', 1, 42, 46, 3, 1.0, 14, { heal: { amt: 9, r: 90 } }, 'caller', 'a goggled mechanic with a giant spanner and oil can'),
      gyro: U('Gyrocopters', 'Gyros', 2, 32, 68, 6, 0.6, 14, { air: true, range: 70, aa: true }, 'skimmer', 'a one-seat pedal gyrocopter with a blunderbuss'),
      zeppelin: U('War Zeppelin', 'Zeppelin', 1, 170, 22, 20, 2.0, 30, { air: true, range: 60, splash: 50, bld: 2.2 }, 'bark', 'a brass war zeppelin dropping round bombs'),
    },
  },
};
