// Game data: elements, dragons, the overworld map, people, and story text.
// No DOM or Three.js here, so tools/checkmap.js can load it under Node.
(function (root) {
  'use strict';

  // Each element beats exactly one other, in a ring.
  const ELEMENTS = {
    thunder: { name: 'Thunder', icon: '⚡', color: 0xf6d743, css: '#f6d743', beats: 'water' },
    water: { name: 'Water', icon: '💧', color: 0x4db8ff, css: '#4db8ff', beats: 'fire' },
    fire: { name: 'Fire', icon: '🔥', color: 0xff7a33, css: '#ff7a33', beats: 'earth' },
    earth: { name: 'Earth', icon: '⛰️', color: 0xc9925a, css: '#c9925a', beats: 'thunder' },
  };
  const ELEMENT_ORDER = ['thunder', 'water', 'fire', 'earth'];

  function weaknessOf(element) {
    return ELEMENT_ORDER.find((e) => ELEMENTS[e].beats === element);
  }

  // Damage multiplier for an attack of `attackEl` (may be null) against `targetEl`.
  function effectiveness(attackEl, targetEl) {
    if (!attackEl) return 1;
    if (ELEMENTS[attackEl].beats === targetEl) return 1.5;
    if (attackEl === targetEl) return 0.5;
    return 1;
  }

  const DRAGONS = {
    thunder: {
      id: 'thunder', name: 'Voltarax', title: 'the Storm Wing', element: 'thunder', lair: 'Stormspire Peak',
      hp: 190, attacks: ['claw', 'bolts', 'cross'], big: 'storm', bigName: 'THUNDERSTORM', roams: 0.7,
      intro: 'Lightning walks the peak on legs of white fire. Above you, wings unfold across the storm.',
      relic: 'Stormheart', relicText: 'Your blade crackles. Thunder now answers your call.',
    },
    water: {
      id: 'water', name: 'Maelis', title: 'the Drowned Tide', element: 'water', lair: 'The Sunken Grotto',
      hp: 240, attacks: ['claw', 'wave', 'bubble'], big: 'tidal', bigName: 'TIDAL WAVE', roams: 0.4,
      intro: 'The tide goes out, and keeps going out. Something in the grotto has breathed it in.',
      relic: 'Tidepearl', relicText: 'Your blade runs cold and clear. The tide now answers your call.',
    },
    fire: {
      id: 'fire', name: 'Pyrrhax', title: 'the Cinder Maw', element: 'fire', lair: 'Mount Cinder',
      hp: 240, attacks: ['claw', 'breath', 'fireballs'], big: 'inferno', bigName: 'INFERNO', roams: 0.4,
      intro: 'The mountain is not erupting. It is yawning. Pyrrhax wakes hungry.',
      relic: 'Emberfang', relicText: 'Your blade glows like a coal. Flame now answers your call.',
    },
    earth: {
      id: 'earth', name: 'Gorrum', title: "the Mountain's Bones", element: 'earth', lair: 'Hollowstone Canyon',
      hp: 270, attacks: ['claw', 'rockfall', 'shockwave'], big: 'quake', bigName: 'EARTHQUAKE', roams: 0, toughHide: true,
      intro: 'What you took for the canyon wall opens one amber eye.',
      relic: 'Stonecore', relicText: 'Your blade grows heavy as bedrock. Stone now answers your call.',
    },
    demon: {
      id: 'demon', name: 'Malgrath', title: 'the Demon Dragon', element: 'thunder', lair: 'The Ashen Throne',
      hp: 620, attacks: ['claw', 'element', 'element2'], big: 'cataclysm', bigName: 'CATACLYSM', roams: 0.5, shifts: true,
      intro: '"You broke my seals, little knight. You killed my children. Come, then. Let me keep my promise."',
    },
  };
  // The two signature attacks the Demon Dragon borrows from each element.
  const ELEMENT_ATTACKS = {
    thunder: ['bolts', 'cross'], water: ['wave', 'bubble'], fire: ['breath', 'fireballs'], earth: ['rockfall', 'shockwave'],
  };
  const ELEMENT_BIG = { thunder: 'storm', water: 'tidal', fire: 'inferno', earth: 'quake' };

  // The overworld. 39 x 31 tiles, written as three 13-column strips per row so widths are easy to check.
  //  . grass   , tall grass   = path    s sand    p peak stone   a ash   c canyon floor
  //  T tree    R rock    M mountain    W canyon wall    ~ water    L lava    # bridge
  //  H house   C castle  G castle gate    S sign    * chest    1-4 dragon lairs    5 the Ashen Gate
  const WORLD_ROWS = [
    ['MMMMMMMMMMMMM', 'MMMMMMMMMMMMM', 'MMMMMMMMMMMMM'],
    ['MMMMMMMMMMMMM', 'MMMMMMMMMMMMM', 'MMMMMMMMMMMMM'],
    ['MMppMpppMMMMM', 'MMMMMa5aMMMMM', 'MMMMLLaMaaLMM'],
    ['MMpp1pppppMMM', 'MMMMaa=aaMMMM', 'MMMLLaa3aaLMM'],
    ['MMpp=ppRppMMM', 'MMMMMa=aMMMMM', 'MMMLaaa=aaLMM'],
    ['MMpR=pp,,ppMM', 'MMMMMa=aMMMMM', 'MMaaa,,=aRaLM'],
    ['MMpp=p,,,pRMM', 'MMMMMM=MMMMMM', 'MMaR,,,=aaaLM'],
    ['MMMp====,,ppM', 'MMMMMM=MMMMMM', 'Maaa,,a=aaLLM'],
    ['MMMMMMM=pppRM', 'MMTTTT=TTTTMM', 'MaLaaaa=aaMMM'],
    ['MMMMMMM=ppppT', 'TTT...=...TTT', 'Taaa====aMMMM'],
    ['TTTTTTT=.,,..', '..T...=...T..', '..,,=.TTTTTTT'],
    ['TTT..T.=.,,,.', '......=......', '.,,,=..T.TTTT'],
    ['TT.....======', '=============', '=====.....TTT'],
    ['TT.....=.....', '..T..S=..T...', '....=.....TTT'],
    ['T..T...=..T..', '......=......', '..T.=...T..TT'],
    ['T......=.....', '.HH...=...HH.', '....=......TT'],
    ['WWWWWW.=.WWWW', '.HH...=...HH.', '..T.=..sssssT'],
    ['WWWWWWc=cWWWW', '......=......', '....=.ssssss~'],
    ['WWWcccc=cccWW', 'T.....=.....T', '...s=sss~~~~~'],
    ['WWWcccccccRWW', 'T.....=.CCCCC', '..ss=ss~~~~~~'],
    ['WWWc,,cWWcccW', 'T.*...=.CCCCC', '.sss=s~~~~~~~'],
    ['WWcc,,,WWc*cW', 'T.....=.CCCCC', 'ssss=ss~~~~~~'],
    ['WWc,,,cWWWWWW', 'TT....=.CCGCC', 'sss,=sss~~~~~'],
    ['WWcc,ccWWWWWW', 'TTT...=====..', 'ss,,=ss~~~~~~'],
    ['WWcWWWcWWWWWW', 'TTTT.........', 's,,,=ss~~2~~~'],
    ['WWcW4WcWWWWWW', 'TTTTT.....TTT', 'ss,,==##sss~~'],
    ['WWcWcWcWWWWWW', 'TTTTTTTTTTTTT', 'sss*ss~~sss~~'],
    ['WWcccccWWWWWW', 'TTTTTTTTTTTTT', 'ssssss~~~~~~~'],
    ['WWWWWWWWWWWWW', 'TTTTTTTTTTTTT', 'TTsss~~~~~~~~'],
    ['WWWWWWWWWWWWW', 'TTTTTTTTTTTTT', 'TTTTT~~~~~~~~'],
    ['WWWWWWWWWWWWW', 'TTTTTTTTTTTTT', 'TTTTTTTTTTTTT'],
  ];
  const WORLD = WORLD_ROWS.map((r) => r.join(''));
  const LAIR_CHARS = { 1: 'thunder', 2: 'water', 3: 'fire', 4: 'earth', 5: 'demon' };
  const WALKABLE = '.,=spac#';
  const START = { x: 23, y: 23, dir: 'down' };

  const CHESTS = {
    '15,20': { id: 'c1', kind: 'heart', text: 'A Heart Vessel! Your life grows by one heart.' },
    '29,26': { id: 'c2', kind: 'heart', text: 'A Heart Vessel, crusted with salt. Your life grows by one heart.' },
    '10,21': { id: 'c3', kind: 'sword', text: 'A dwarven whetstone! Your sword bites deeper.' },
  };

  const SIGNS = {
    '18,13': 'CROSSROADS.  North: the Ashen Gate.  West road: Stormspire Peak, and south of it Hollowstone Canyon.  East road: Mount Cinder, and south of it the Sunken Grotto.',
  };

  // Survivors of the King's army. Each one's story carries a hint about the dragon that beat them.
  const NPCS = [
    { x: 8, y: 9, look: 'soldier', name: 'Wounded Soldier', lines: [
      'We climbed the Stormspire. None of us saw the top.',
      'Watch the ground, knight. Where the stone glows red, lightning lands a heartbeat later. Never stand still.',
      'They say only stone can swallow a thunderbolt.' ] },
    { x: 31, y: 10, look: 'soldier', name: 'Scorched Soldier', lines: [
      'Pyrrhax breathes straight down the mountain. Step aside, not back.',
      'And mind where the fire has been. The ground keeps burning after.',
      'I would have given my sword for one bucket of water.' ] },
    { x: 31, y: 22, look: 'soldier', name: 'Drenched Soldier', lines: [
      "Maelis sends the sea at you in walls. There is always a gap. Find it, or roll through the wave as it breaks.",
      'Roll with (C), knight. For a blink, nothing can touch you.',
      'Water carries lightning well. Remember that.' ] },
    { x: 8, y: 17, look: 'soldier', name: 'Dusty Soldier', lines: [
      "Gorrum's hide turned every arrow we had. You will have to get close and use your sword (A).",
      'When he shakes the canyon, hide behind the boulders he throws. Or find the green safe ground, fast.',
      'Fire cracks stone, they say. We had none.' ] },
    { x: 18, y: 9, look: 'scholar', name: 'Old Scholar', lines: [
      'Four seal-stones hang above the Ashen Gate. One for each dragon.',
      "Slay a dragon and its seal breaks. Break all four and the gate opens. That is the King's whole plan.",
      '...I only wonder who put the seals there. And what they were meant to keep in.' ] },
    { x: 16, y: 17, look: 'villager', name: 'Villager', lines: [
      'Drakelings nest in the tall grass. Little ones, but they bite.',
      'Strike with your sword (A), or loose a bolt from afar (B). Bolts are safer. Swords hit harder.' ] },
    { x: 22, y: 17, look: 'villager2', name: 'Villager', lines: [
      'My brother marched out with the army. He sent one letter back.',
      'It said: every dragon tires after its greatest attack. That is the moment to strike.' ] },
  ];

  const KING_LINES = {
    start: ['Four dragons bar the road to the demon. Slay them, and the Ashen Gate will open.', 'Rest here whenever you are hurt. Valemoor has healers still.'],
    some: ['Word of your deeds runs ahead of you. Keep going, knight.', 'Your wounds are tended. Go well.'],
    all: ['The ground shook. The sky went red. What have we woken?', 'The gate stands open in the north. End this, knight. Please.'],
  };

  // Cutscenes. Each shot names a set, moves the camera from `from` to `to`, and shows its lines.
  const STORY = {
    intro: [
      { set: 'note', from: { pos: [0.6, 3.2, 3.4], target: [0, 0.6, 0] }, to: { pos: [0.2, 1.9, 1.9], target: [0, 0.62, 0] }, ms: 9000, lines: [
        'On the longest night of the year, a note was found pinned to the throne of King Aldric of Valemoor.',
        'It was written in ash. "Yield me your crown before the snows melt... or DEATH WILL COME."' ] },
      { set: 'castle', from: { pos: [-16, 5, 22], target: [0, 5, 0] }, to: { pos: [-6, 7, 25], target: [2, 4, 0] }, ms: 10000, lines: [
        'It bore no name. Only the mark of a black claw.',
        'The King did not yield. He sent his whole army north, to find the demon who wrote it, and kill him.' ] },
      { set: 'dragons', from: { pos: [0, 2.5, 17], target: [0, 3, 0] }, to: { pos: [0, 3.5, 11], target: [0, 3.2, 0] }, ms: 10000, lines: [
        'They never reached him.',
        'Four dragons rose to bar the road. Thunder. Water. Fire. Earth.',
        'The army did not come home.' ] },
      { set: 'hall', from: { pos: [3.2, 1.2, 4.6], target: [0, 0.9, 0] }, to: { pos: [-1.6, 1.5, 3.2], target: [0, 0.8, 0] }, ms: 9000, lines: [
        'Now the snows are melting. And the King has one blade left to send.' ] },
    ],
    rise: [
      { set: 'hall', from: { pos: [-1.6, 1.5, 3.2], target: [0, 0.8, 0] }, to: { pos: [0, 1.1, 2.6], target: [0, 0.8, 0] }, ms: 6000, lines: [
        'KING ALDRIC: Rise, {name}. Slay the four dragons. Open the Ashen Gate. Find the demon, and end this.' ] },
    ],
    awaken: [
      { set: 'awaken', phase: 'quiet', from: { pos: [0, 2.2, 12], target: [0, 1.5, 0] }, to: { pos: [0, 1.8, 9], target: [0, 2, 0] }, ms: 9000, lines: [
        'The last dragon falls. For one breath, the whole world is silent.',
        'Then the four relics burn in your hands. Thunder. Water. Fire. Earth.',
        'They were never trophies. They were keys. And the dragons were never guards. They were locks.' ] },
      { set: 'awaken', phase: 'rise', from: { pos: [0, 1.8, 9], target: [0, 2, 0] }, to: { pos: [-3, 1.2, 12], target: [0, 5, 0] }, ms: 9000, lines: [
        'Beneath the Ashen Gate, something vast opens its eyes.',
        'The demon who sent the note was never a man. He is MALGRATH, the Demon Dragon. Maker of the four.',
        'And you have slain his children.' ] },
      { set: 'awaken', phase: 'roar', from: { pos: [-3, 1.2, 12], target: [0, 5, 0] }, to: { pos: [0, 3, 8.5], target: [0, 5.4, 0] }, ms: 7000, lines: [
        'MALGRATH: LITTLE KNIGHT. I PROMISED THAT DEATH WOULD COME.',
        'MALGRATH: NOW I BRING IT MYSELF.' ] },
    ],
    ending: [
      { set: 'awaken', phase: 'fallen', from: { pos: [2, 1.6, 9], target: [0, 1.6, 0] }, to: { pos: [-2, 3, 11], target: [0, 1.2, 0] }, ms: 9000, lines: [
        'Malgrath crashes down, and the fire in his eyes goes dark.',
        'In your hands, the four relics crumble to dust.' ] },
      { set: 'castle', dawn: true, from: { pos: [8, 3, 24], target: [0, 5, 0] }, to: { pos: [2, 6, 27], target: [0, 5, 0] }, ms: 12000, lines: [
        'At dawn, {name} walks back through the gates of Valemoor, carrying a note written in ash.',
        'The King reads it twice. Then he feeds it to the hearth.',
        'Death came, as promised. It simply came for the wrong dragon.',
        'THE END.  Thank you for playing.' ] },
    ],
  };

  const api = { ELEMENTS, ELEMENT_ORDER, weaknessOf, effectiveness, DRAGONS, ELEMENT_ATTACKS, ELEMENT_BIG, WORLD, LAIR_CHARS, WALKABLE, START, CHESTS, SIGNS, NPCS, KING_LINES, STORY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Data = api;
})(typeof window !== 'undefined' ? window : globalThis);
