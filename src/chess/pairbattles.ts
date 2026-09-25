// Pair specials: clever battles written for one attacker/victim pair, where the attacker
// uses what makes the victim special (a knight loves carrots, a bishop can only go diagonally,
// a rook can't jump, a pawn dreams of promotion, a queen hates getting messy…).
// Each pair has these on top of its original special battle in battle.ts.
import { at, AX, GROUND, HEAD, K, MID, rand, spin, VX, wiggle, type Battle, type Fighter, type Stage } from './battle';
import {
  BALLOONS,
  BEANSTALK,
  BELL,
  BOWLING_BALL,
  BRICK,
  BROOM,
  CARRIAGE,
  CRATE,
  DOLLY,
  DOOR,
  DRAWBRIDGE,
  GUARD,
  HAY_BALE,
  HORN,
  JESTER_HAT,
  LADDER,
  MEDAL,
  MIRROR,
  MOUSE_TOY,
  PAPER_CROWN,
  PARTY_HAT,
  ROCKING_HORSE,
  ROLLER,
  SIGN,
  SUGAR_CUBE,
  TEAPOT,
  THRONE,
  WAVE,
  WOODEN_HORSE,
} from './props';
import { pieceSrc } from './themes';

export type PairBattle = Battle & { id: string };

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Hopping from one offset to another: n hops of height h. */
function hops(x1: number, x2: number, n: number, h = 4, y = 0): Keyframe[] {
  const f: Keyframe[] = [];
  for (let i = 0; i <= n * 2; i++) f.push(K(x1 + ((x2 - x1) * i) / (n * 2), y - (i % 2 ? h : 0)));
  return f;
}

/** A waddling walk (tilting side to side). */
function waddle(x1: number, x2: number, n: number, y = 0): Keyframe[] {
  const f: Keyframe[] = [];
  for (let i = 0; i <= n; i++) f.push(K(x1 + ((x2 - x1) * i) / n, y, i === 0 || i === n ? 0 : i % 2 ? 7 : -7));
  return f;
}

function show(f: Fighter) {
  f.el.style.visibility = '';
}

/** A little image of a chess piece in the current theme (for extra pins, spectators…). */
function pieceImg(s: Stage, f: Fighter) {
  return `<img src="${pieceSrc(s.theme, f.color, f.type)}" style="width:1em;height:1em;display:block">`;
}

export const PAIR_BATTLES: Record<string, PairBattle[]> = {
  // ================= Pawn attacks =================
  pp: [
    {
      id: 'rps',
      title: 'Rock, Paper, Scissors!',
      async run(s, A, V) {
        s.say(A, 'Rock, paper, scissors?', 900);
        await s.wait(800);
        s.say(V, 'You\'re on!', 800);
        await s.wait(800);
        for (const n of ['One…', 'Two…', 'THREE!']) {
          s.bubble(n, 50, 40, 500);
          s.sfx('step');
          void s.go(A, [K(0, 0), K(0, -5), K(0, 0)], 350);
          await s.go(V, [K(0, 0), K(0, -5), K(0, 0)], 350);
          await s.wait(150);
        }
        const pa = s.hold(A, '✋', 13, -8, 10);
        const pv = s.hold(V, '✊', -13, -8, 10);
        s.sfx('pop');
        void s.anim(pa, [K(0, 4, 0, 0), K(0, 0, 0, 1)], 200);
        await s.anim(pv, [K(0, 4, 0, 0), K(0, 0, 0, 1)], 200);
        await s.wait(300);
        s.pow('Paper covers rock!', 50, 38, { size: 6, color: '#3ec1ff', rot: 0 });
        s.mood(A, 'happy');
        s.mood(V, 'shock');
        await s.wait(800);
        s.say(V, 'Best two out of three?', 800);
        await s.wait(800);
        s.say(A, 'Nope!', 600);
        pv.remove();
        const cloud = s.hold(V, '🌧️', 0, -24, 9);
        void cloud;
        await s.turn(V);
        s.sfx('wobble');
        await s.go(V, hops(0, 40, 4, 2), 1300, 'linear');
      },
    },
    {
      id: 'follow',
      title: 'Follow the Leader!',
      async run(s, A, V) {
        s.say(A, 'Let\'s play follow the leader!', 1000);
        await s.wait(900);
        s.say(V, 'Okay!', 700);
        await s.wait(500);
        await s.turn(V);
        s.later(0, () => s.sfx('step'));
        s.later(450, () => s.sfx('step'));
        s.later(900, () => s.sfx('step'));
        void s.go(V, hops(0, 14, 4, 3), 1300, 'linear');
        await s.go(A, [K(0, -2), at(0.35, K(24, -14)), K(62, 0)], 1300, 'ease-in-out');
        s.say(A, 'Now watch this!', 700);
        await s.wait(300);
        // The leader hops aside at the edge; the follower keeps going.
        void s.go(A, [K(62, 0), K(56, -18), K(46, 0)], 450);
        await s.go(V, hops(14, 24, 2, 3), 450, 'linear');
        s.mood(V, 'shock');
        s.pow('OOPS!', 92, 44, { size: 7 });
        s.sfx('slideDown');
        await s.go(V, [K(24, 0, 0), K(30, 6, 30), K(36, 50, 90, 1, 1, 0)], 700, 'ease-in');
        s.say(A, 'I win!', 700);
        await s.go(A, waddle(46, 0, 6), 900);
      },
    },
  ],
  pn: [
    {
      id: 'mouse',
      title: 'Squeaky Toy Mouse!',
      async run(s, A, V) {
        s.say(A, 'Hey horsey! Look what I\'ve got…', 1000);
        const mouse = s.prop(MOUSE_TOY, AX + 14, GROUND - 4, 7);
        await s.anim(mouse, [K(0, -6, 0, 0.3), K(0, 0, 0, 1)], 300, 'ease-out');
        s.sfx('creak');
        await s.anim(mouse, [K(0, 0, 0), K(0, 0, -8), K(0, 0, 8), K(0, 0, 0)], 500);
        s.sfx('squeak');
        await s.anim(mouse, [K(0, 0, 0), K(8, -1, 4), K(16, 0, -4), K(26, -1, 4), K(32, 0)], 800, 'linear');
        s.mood(V, 'shock');
        s.pow('EEK! A MOUSE!', VX, 36, { size: 7, color: '#ffb400' });
        s.origin(V, '60% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, -2, 30)], 250, 'ease-out');
        await s.fx(V, [K(-0.8, -2, 30), K(0.8, -2, 30)], { duration: 70, iterations: 6 });
        await s.fx(V, [K(0, -2, 30), K(0, 0, 0)], 200);
        await s.turn(V, 150);
        s.dust(VX - 6, GROUND, 6);
        s.sfx('gallop');
        s.later(300, () => s.sfx('gallop'));
        await s.go(V, [K(0, 0), K(8, -5), K(18, 0), K(30, -5), K(46, 0), K(64, -5, 0, 1, 1, 0)], 900, 'ease-in');
        s.say(A, 'Works every time!', 800);
        await s.anim(mouse, [K(32, 0), K(32, 0, 0, 1, 1, 0)], 400);
      },
    },
    {
      id: 'sugar',
      title: 'Sugar Cube Trail!',
      async run(s, A, V) {
        s.say(A, 'Yummy sugar cubes, this way!', 1100);
        const crate = s.prop(CRATE, 48, GROUND - 10, 16);
        await s.anim(crate, [K(0, -40, 0, 1, 1, 0), K(0, 0, 0)], 400, 'ease-in');
        s.sfx('thud');
        const cubes = [64, 57].map((x) => s.prop(SUGAR_CUBE, x, GROUND - 3, 3.5));
        cubes.forEach((c, i) => void s.anim(c, [K(0, -12, 0, 0.5, 0.5, 0), K(0, 0, 0)], { duration: 250, delay: i * 150 }));
        await s.wait(500);
        s.mood(V, 'happy');
        s.say(V, 'Ooh! Sugar!', 700);
        for (let i = 0; i < cubes.length; i++) {
          await s.go(V, [K(i === 0 ? 0 : -9, 0), K(i === 0 ? -9 : -16, -4), K(i === 0 ? -9 : -16, 0)], 350);
          cubes[i].remove();
          s.sfx('pop');
          s.bubble('Crunch!', VX - 12 - i * 7, 60, 400);
          await s.wait(200);
        }
        await s.go(V, [K(-16, 0), K(-22, -6), K(-26, 0, 0, 0.8, 0.8)], 350);
        s.hide(V);
        s.sfx('clunk');
        s.pow('CLUNK!', 48, 60, { size: 6, color: '#8a5a2b' });
        s.say(A, 'Special delivery!', 800);
        await s.anim(crate, [K(0, 0), K(0, 0, -6), K(0, 0, 6), K(0, 0, 0)], 400);
        s.sfx('rumble');
        await s.anim(crate, [K(0, 0), K(60, 0, 0, 1, 1, 0.3)], 900, 'ease-in');
      },
    },
  ],
  pb: [
    {
      id: 'straight',
      title: 'Straight Line Trick!',
      async run(s, A, V) {
        s.say(A, 'Catch me! I\'m straight ahead!', 1000);
        await s.wait(700);
        s.say(V, 'Easy! …oh. I can only go diagonally.', 1300);
        const zig = [K(-8, -8), K(-16, 0), K(-24, -8), K(-16, 0), K(-8, -8), K(0, 0)];
        s.sfx('glide');
        await s.go(V, [K(0, 0), ...zig], 1600, 'linear');
        s.mood(V, 'dizzy');
        s.say(V, 'Zig… zag… zig… ugh…', 900);
        await s.fx(V, wiggle(12), 700);
        s.origin(V, '50% 88%');
        s.sfx('thud');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 450, 'ease-in');
        s.say(A, 'Chess joke!', 700);
        s.sfx('slideDown');
        await s.go(V, [K(0, 0, 0), K(40, 0, 0, 1, 1, 0)], 900, 'ease-in');
      },
    },
    {
      id: 'partyhat',
      title: 'Party Hat Hex!',
      async run(s, A, V) {
        s.say(A, 'A present for you!', 800);
        await s.go(A, hops(0, 26, 3, 3), 700, 'linear');
        const hat = s.prop(PARTY_HAT, AX + 26, HEAD - 6, 8);
        s.sfx('boing');
        await s.anim(hat, [K(0, 0, 0), at(0.5, K(10, -18, 180)), K(VX - AX - 26, -2, 360)], 500, 'ease-in-out');
        hat.remove();
        s.hold(V, PARTY_HAT, 0, -22, 9);
        s.sfx('pop');
        s.say(V, 'My magic! It\'s gone… PARTY MODE!', 1100);
        void s.go(A, hops(26, 0, 3, 3), 700, 'linear');
        s.sfx('music');
        s.stream(['🎵', '🎶'], VX, HEAD - 6, VX + 6, 24, 5, 140, 6, 4);
        s.mood(V, 'happy');
        await s.fx(V, [K(0, 0, -12), K(0, -4, 0), K(0, 0, 12), K(0, -4, 0), K(0, 0, -12), K(0, 0, 0)], 1000);
        await s.turn(V);
        await s.go(V, [K(0, 0, 0), K(10, -6, 10), K(20, 0, -10), K(30, -6, 10), K(46, 0, -10, 1, 1, 0)], 1100, 'linear');
      },
    },
  ],
  pr: [
    {
      id: 'balloons',
      title: 'Balloon Delivery!',
      async run(s, A, V) {
        const door = s.hold(V, DOOR, 0, 8, 10);
        await s.go(A, hops(0, 22, 3, 3), 700, 'linear');
        s.sfx('bonk');
        s.later(200, () => s.sfx('bonk'));
        s.say(A, 'Knock knock!', 700);
        await s.wait(700);
        s.say(V, 'Who\'s there?', 700);
        await s.wait(700);
        s.say(A, 'Balloon delivery!', 800);
        s.sfx('creak');
        await s.anim(door, [K(0, 0, 0, 1, 1), K(-2, 0, 0, 0.15, 1)], 300);
        for (let i = 0; i < 5; i++) {
          const b = s.prop(pick(['🎈', '🎈', '🎉']), AX + 30, HEAD - 2, 6, i % 2 ? 'blue' : '');
          s.sfx('bubble');
          void s.anim(b, [K(0, 0, 0, 1), K(VX - AX - 30, 10, 0, 0.2, 0.2, 0)], { duration: 350, easing: 'ease-in' }).then(() => b.remove());
          await s.wait(180);
        }
        await s.anim(door, [K(-2, 0, 0, 0.15, 1), K(0, 0, 0, 1, 1)], 200);
        s.mood(V, 'shock');
        s.say(V, 'Uh oh… I feel light!', 900);
        s.sfx('shrink');
        await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.12, 1.05), K(0, 0, 0, 1.25, 1.1)], 700);
        const bunch = s.hold(V, BALLOONS, 0, -26, 20);
        await s.anim(bunch, [K(0, 12, 0, 0.2), K(0, 0, 0, 1)], 300, 'ease-out');
        void s.go(A, hops(22, 0, 3, 3), 700, 'linear');
        s.sfx('slideUp');
        await s.go(V, [K(0, 0), K(-4, -20, -5), K(4, -45, 5), K(-3, -70, -4), K(6, -110)], 1700, 'ease-in');
      },
    },
    {
      id: 'ants',
      title: 'Ant Army!',
      async run(s, A, V) {
        s.say(A, 'Tweet tweet! Ants, attack!', 1000);
        s.sfx('sparkle');
        const ants: HTMLElement[] = [];
        for (let i = 0; i < 8; i++) {
          const a = s.prop('🐜', AX - 10 - i * 4, GROUND - 1, 3.5);
          ants.push(a);
          void s.anim(a, [K(0, 0, 90), K(VX - AX + 2 + (i % 4) * 3, 0, 90)], { duration: 1300, delay: i * 70, easing: 'linear' });
        }
        await s.wait(1400);
        s.sfx('laugh');
        s.mood(V, 'happy');
        s.say(V, 'Hee hee! That tickles!', 900);
        for (let i = 0; i < 3; i++) {
          s.bubble('munch munch', VX + (i - 1) * 8, GROUND - 14, 400);
          s.sfx('pop');
          await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, -3, 1, 0.96), K(0, 0, 3, 1, 0.94)], 300);
        }
        s.mood(V, 'shock');
        s.pow('TIMBER!', VX, 36, { color: '#8b5a2b' });
        s.origin(V, '50% 88%');
        s.sfx('creak');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 600, 'ease-in');
        s.sfx('thud');
        s.dust(VX + 10, GROUND, 6);
        s.say(A, 'Carry it away, team!', 800);
        ants.forEach((a) => void s.anim(a, [{}, K(VX - AX + 60, 0, 90, 1, 1, 0.5)], 1300, 'linear'));
        await s.go(V, [K(0, 0), K(0, -2), K(40, -2, 0, 1, 1, 0.3)], 1300, 'linear');
      },
    },
  ],
  pq: [
    {
      id: 'promotion',
      title: 'Paper Crown Promotion!',
      async run(s, A, V) {
        s.say(A, 'Guess what? I made it! PROMOTION!', 1100);
        const crown = s.hold(A, PAPER_CROWN, 0, -18, 12);
        s.sfx('tada');
        await s.anim(crown, [K(0, -30, 0, 1, 1, 0), K(0, 0, 0)], 450, 'ease-in');
        s.burst(AX, HEAD - 10, ['✨', '⭐'], { n: 8, dist: 14 });
        s.origin(A, '50% 88%');
        await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.25, 1.25)], 400);
        s.say(A, 'Now I\'m a queen too!', 900);
        await s.wait(700);
        s.mood(V, 'angry');
        s.say(V, 'TWO queens?! This board isn\'t big enough!', 1200);
        await s.wait(1000);
        s.sfx('fireworks');
        s.burst(AX, HEAD - 16, ['🎉', '🎊'], { n: 10, dist: 18 });
        s.pow('TA-DAA!', AX + 6, 38, { color: '#ffb400' });
        await s.turn(V);
        s.say(V, 'Hmph!', 600);
        s.sfx('thud');
        await s.go(V, [K(0, 0), K(8, -3), K(16, 0), K(24, -3), K(40, 0, 0, 1, 1, 0)], 1000, 'linear');
        void s.fx(A, [K(0, 0, 0, 1.25, 1.25), K(0, 0, 0, 1, 1)], 300);
      },
    },
    {
      id: 'mud',
      title: 'Mud Puddle Splash!',
      async run(s, A, V) {
        const puddle = s.prop('', 52, GROUND - 1, 22, 'mud');
        await s.anim(puddle, [K(0, 0, 0, 0), K(0, 0, 0, 1)], 300, 'ease-out');
        s.say(V, 'Don\'t you DARE…', 900);
        await s.wait(800);
        s.say(A, 'Cannonball!', 700);
        s.sfx('boing');
        await s.go(A, [K(0, 0), at(0.5, K(13, -28), 'ease-in'), K(26, 2)], 600, 'ease-out');
        s.sfx('splat');
        s.shake(2);
        s.pow('SPLOOSH!', 52, 44, { color: '#7a4a1e' });
        for (let i = 0; i < 12; i++) {
          const d = s.prop('', 52, GROUND - 4, rand(2, 3.4), 'mud-dot');
          const tx = i < 8 ? rand(14, 26) : rand(-20, 8);
          void s.anim(d, [K(0, 0), at(0.5, K(tx / 2, rand(-22, -12))), K(tx, rand(-16, 0), 0, 1, 1, i < 8 ? 1 : 0)], { duration: 500, easing: 'ease-out' }).then(() => s.later(700, () => d.remove()));
        }
        await s.wait(450);
        s.addClass(V, 'muddy');
        s.mood(V, 'shock');
        s.say(V, 'MY BEAUTIFUL DRESS!!', 1000);
        await s.fx(V, wiggle(8), 600);
        await s.turn(V, 150);
        s.sfx('squeak');
        void s.anim(puddle, [{}, K(0, 0, 0, 1, 1, 0)], 900);
        await s.go(V, [K(0, 0), K(10, -4), K(24, 0), K(46, -4, 0, 1, 1, 0)], 800, 'ease-in');
        s.mood(A, 'happy');
        s.say(A, 'Hehe! Mud is the best!', 800);
        await s.go(A, [K(26, 2), K(0, 0)], 500);
      },
    },
  ],

  // ================= Knight attacks =================
  np: [
    {
      id: 'ponyride',
      title: 'Pony Ride!',
      async run(s, A, V) {
        s.say(A, 'Want a pony ride?', 900);
        await s.wait(800);
        s.say(V, 'Yes please!', 700);
        await s.wait(500);
        s.sfx('boing');
        await s.go(V, [K(0, 0), at(0.5, K(-22, -28)), K(-46, -14)], 600, 'ease-in-out');
        s.mood(V, 'happy');
        s.say(V, 'Giddy-up!', 700);
        s.sfx('gallop');
        s.later(400, () => s.sfx('gallop'));
        const trip = (dx: number, y: number) => [K(0 + dx, y), K(8 + dx, y - 4), K(16 + dx, y), K(24 + dx, y - 4), K(30 + dx, y)];
        void s.go(A, trip(0, 0), 900, 'linear');
        await s.go(V, trip(-46, -14), 900, 'linear');
        s.say(A, 'Hold on tight!', 600);
        s.origin(A, '50% 88%');
        s.sfx('boing');
        await s.fx(A, [K(0, 0, 0), K(0, 0, -28), K(0, 0, 0)], 300);
        s.mood(V, 'shock');
        s.sfx('slideUp');
        void s.go(A, [K(30, 0), K(0, 0)], 700);
        await s.go(V, [K(-16, -14, 0), K(0, -50, 300, 0.6), K(12, -80, 620, 0.1, 0.1, 0)], 900, 'ease-out');
        s.twinkle(VX + 12, 8);
        await s.wait(400);
      },
    },
    {
      id: 'lhops',
      title: 'L-Shape Hopscotch!',
      async run(s, A, V) {
        s.say(A, 'Watch my fancy L-jumps!', 900);
        const spots: [number, number][] = [[22, -16], [62, 0], [46, -22], [28, 0], [62, -8], [0, 0]];
        let prev: [number, number] = [0, 0];
        for (const [x, y] of spots) {
          s.sfx('hop');
          await s.go(A, [K(prev[0], prev[1]), at(0.5, K((prev[0] + x) / 2, Math.min(prev[1], y) - 14)), K(x, y)], 320, 'ease-in-out');
          s.dust(AX + x, GROUND + y, 2);
          if (x > 48) void s.turn(V, 120);
          prev = [x, y];
          if (x === 28) void s.turn(V, 120);
        }
        s.mood(V, 'dizzy');
        s.say(V, 'Too… many… L\'s…', 900);
        await s.fx(V, spin(4), { duration: 700, easing: 'linear' });
        s.origin(V, '50% 88%');
        s.sfx('thud');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 400, 'ease-in');
        const stars = s.hold(V, '💫', 6, -6, 8);
        void s.anim(stars, [K(0, 0, 0), K(0, 0, 360)], { duration: 600, iterations: 2, easing: 'linear' });
        await s.wait(900);
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 400);
      },
    },
  ],
  nn: [
    {
      id: 'race',
      title: 'Horse Race!',
      async run(s, A, V) {
        s.say(A, 'Race you to the edge!', 900);
        await s.turn(V);
        const tape = s.prop('', 93, MID - 2, 18, 'finish');
        await s.anim(tape, [K(0, 0, 0, 1, 0), K(0, 0, 0, 1, 1)], 300, 'ease-out');
        for (const n of ['Ready…', 'Set…', 'GO!']) {
          s.bubble(n, 50, 40, 450);
          s.sfx(n === 'GO!' ? 'ding' : 'step');
          await s.wait(500);
        }
        s.sfx('gallop');
        s.later(300, () => s.sfx('gallop'));
        s.later(600, () => s.sfx('gallop'));
        void s.go(V, [K(0, 0), K(4, -4), K(8, 0), K(12, -4), K(15, 0)], 900, 'linear');
        await s.go(A, [K(0, 0), K(16, -5), K(32, 0), K(48, -5), K(62, 0)], 900, 'ease-in');
        s.sfx('tada');
        s.pow('WINNER!', 80, 40, { color: '#ffb400' });
        void s.anim(tape, [{}, K(0, 0, 0, 1, 1, 0)], 300);
        s.mood(V, 'shock');
        s.say(V, 'Whoa-oh!', 600);
        s.origin(V, '50% 88%');
        void s.fx(V, [K(0, 0, 0), K(0, 0, 60), K(0, 0, 360)], 700);
        await s.go(V, [K(15, 0), K(24, -8), K(40, 0, 0, 1, 1, 0)], 700, 'ease-in');
        await s.turn(A);
        await s.go(A, [K(62, 0), K(0, 0)], 700);
        await s.turn(A);
      },
    },
    {
      id: 'neighoff',
      title: 'Neigh-Off!',
      async run(s, A, V) {
        s.say(V, 'I bet I can neigh louder!', 900);
        await s.wait(900);
        s.origin(V, '40% 88%');
        void s.fx(V, [K(0, 0, 0), K(0, 0, -10), K(0, 0, 0)], 500);
        s.pow('neigh!', VX, 40, { size: 5, color: '#9aa0a6' });
        s.sfx('squeak');
        await s.wait(700);
        s.say(A, 'Oh yeah? Listen to THIS…', 800);
        await s.wait(700);
        s.origin(A, '60% 88%');
        await s.fx(A, [K(0, 0, 0), K(0, 0, 20)], 300);
        s.sfx('fanfare');
        s.shake(3, 600);
        s.pow('NEIIIIIGH!!!', 50, 38, { size: 12, color: '#ff7a00', dur: 1300 });
        for (let i = 0; i < 5; i++) {
          const r = s.prop('', AX + 12, HEAD, 12, 'soundwave');
          void s.anim(r, [K(0, 0, 0, 0.3, 0.6, 1), K(VX - AX - 12, 0, 0, 1.4, 1.8, 0)], { duration: 600, delay: i * 110 }).then(() => r.remove());
        }
        s.mood(V, 'shock');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 14)], 500);
        s.say(V, 'I… need to lie down…', 900);
        s.mood(V, 'sleep');
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 14), K(0, 0, 90)], 500, 'ease-in');
        s.sfx('thud');
        void s.fx(A, [K(0, 0, 20), K(0, 0, 0)], 300);
        await s.wait(500);
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 400);
      },
    },
  ],
  nb: [
    {
      id: 'spellbounce',
      title: 'Spell Bounce!',
      async run(s, A, V) {
        s.hold(V, '🪄', -12, -8, 9, 'flipx');
        s.say(V, 'Take that, horsey!', 800);
        for (let i = 0; i < 2; i++) {
          s.sfx('zap');
          const b = s.beam(VX - 12, HEAD - 8, AX + 8, GROUND - 4, 'beam-purple', 200, false);
          s.sfx('hop');
          await s.go(A, [K(0, 0), at(0.5, K(i ? -4 : 6, -22)), K(0, 0)], 450);
          b.remove();
          s.dust(AX + 8, GROUND, 3);
          s.say(A, i ? 'Nope!' : 'Missed me!', 500);
        }
        s.say(A, 'Horseshoe shield!', 700);
        s.sfx('zap');
        const beam = s.beam(VX - 12, HEAD - 8, AX + 12, HEAD, 'beam-purple', 200);
        await s.wait(250);
        beam.remove();
        s.sfx('clang');
        s.pow('BOING!', AX + 14, 44, { color: '#9aa0a6' });
        const back = s.beam(AX + 12, HEAD, VX - 6, HEAD - 4, 'beam-purple', 200);
        await s.wait(250);
        back.remove();
        s.addClass(V, 'sooty');
        s.mood(V, 'shock');
        s.say(V, 'My own spell?!', 800);
        s.sfx('cough');
        s.burst(VX, HEAD - 10, ['💨'], { n: 3, dist: 8 });
        await s.wait(700);
        await s.turn(V, 150);
        await s.go(V, [K(0, 0, 0), K(-4, 0, -8), K(50, 0, -8, 1, 1, 0)], 700, 'ease-in');
      },
    },
    {
      id: 'sneeze',
      title: 'Hay Fever!',
      async run(s, A, V) {
        const hay = s.prop(HAY_BALE, AX + 16, GROUND - 5, 10);
        await s.anim(hay, [K(0, -30, 0, 1, 1, 0), K(0, 0, 0)], 300, 'ease-in');
        s.say(A, 'Fresh hay, anyone?', 800);
        s.origin(A, '50% 88%');
        await s.fx(A, [K(0, 0, 0), K(0, 0, -20), K(0, 0, 8), K(0, 0, 0)], 350);
        s.sfx('whoosh');
        s.stream(['🌾'], AX + 18, GROUND - 8, VX - 4, HEAD, 10, 50, 6, 4);
        await s.wait(700);
        s.say(V, 'Ah… ah…', 700);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 8), K(0, 0, 14), K(0, 0, 20)], 900, 'ease-in');
        s.sfx('boom');
        s.pow('ACHOOOO!', VX, 36, { size: 12, color: '#3ec1ff' });
        s.burst(VX - 8, HEAD, ['💦', '💨'], { n: 6, dist: 12 });
        s.shake(2);
        void s.fx(V, [K(0, 0, 20), K(0, 0, -20)], 150);
        await s.go(V, [K(0, 0, 0), K(30, -10, 200), K(60, -4, 400, 1, 1, 0)], 700, 'ease-out');
        s.say(A, 'Bless you!', 700);
        await s.anim(hay, [{}, K(0, 0, 0, 1, 1, 0)], 400);
      },
    },
  ],
  nr: [
    {
      id: 'overthewall',
      title: 'Over the Wall!',
      async run(s, A, V) {
        s.say(A, 'Rooks can\'t jump. But I can!', 1000);
        await s.wait(700);
        s.sfx('boing');
        await s.go(A, [K(0, 0), at(0.5, K(34, -46), 'ease-out'), K(66, 0)], 800, 'ease-in');
        s.dust(AX + 66, GROUND, 4);
        s.sfx('thud');
        s.say(V, 'Huh? Where did it go?', 900);
        await s.fx(V, [K(0, 0, 0), K(0, 0, -6), K(0, 0, 6), K(0, 0, 0)], 700);
        s.origin(A, '50% 88%');
        s.sfx('boing');
        await s.fx(A, [K(0, 0, 0), K(0, 0, 30), K(0, 0, 0)], 320);
        s.pow('BUCK!', VX, 40);
        s.mood(V, 'shock');
        s.origin(V, '50% 88%');
        s.sfx('creak');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -8), K(0, 0, -90)], 600, 'ease-in');
        s.sfx('thud');
        s.dust(VX - 12, GROUND, 6);
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 400);
        await s.turn(A);
        await s.go(A, [K(66, 0), K(33, -18), K(0, 0)], 700);
        await s.turn(A);
      },
    },
    {
      id: 'trojan',
      title: 'Trojan Horse!',
      async run(s, A, V) {
        const horse = s.prop(WOODEN_HORSE, AX - 30, GROUND - 13, 26);
        s.sfx('rumble');
        await s.anim(horse, [K(0, 0), K(30, 0)], 600, 'ease-out');
        s.hide(A);
        s.say(V, 'Ooh! A gift for the castle?', 900);
        s.mood(V, 'happy');
        await s.wait(600);
        s.sfx('rumble');
        await s.anim(horse, [K(30, 0), K(52, 0)], 700, 'ease-in-out');
        await s.wait(300);
        s.sfx('boing');
        show(A);
        await s.go(A, [K(22, 0, 0, 0.3, 0.3, 0), K(28, -26, 0, 1.1, 1.1, 1), K(30, -18)], 450, 'ease-out');
        s.pow('SURPRISE!', VX - 10, 34, { color: '#ffb400', size: 9 });
        s.mood(V, 'shock');
        await s.wait(300);
        s.say(V, '*faints*', 700);
        s.mood(V, 'sleep');
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 500, 'ease-in');
        s.sfx('thud');
        void s.anim(horse, [K(52, 0), K(-30, 0, 0, 1, 1, 0)], 900);
        await s.go(A, [K(30, -18), K(15, -24), K(0, 0)], 600);
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 400);
      },
    },
  ],
  nq: [
    {
      id: 'circles',
      title: 'Gallop Circles!',
      async run(s, A, V) {
        s.say(A, 'Round and round we go!', 900);
        const f: Keyframe[] = [];
        const n = 24;
        for (let i = 0; i <= n; i++) {
          const t = Math.PI + (i / n) * Math.PI * 4;
          f.push(K(VX + Math.cos(t) * 20 - AX, Math.sin(t) * 6));
        }
        s.sfx('gallop');
        await s.go(A, [K(0, 0), f[0]], 350);
        s.later(0, () => s.sfx('gallop'));
        s.later(600, () => s.sfx('gallop'));
        s.later(1200, () => s.sfx('gallop'));
        // Behind the queen on the far side of each lap.
        for (let i = 0; i < 4; i++) {
          s.later(i * 450, () => (A.el.style.zIndex = '1'));
          s.later(i * 450 + 225, () => (A.el.style.zIndex = '3'));
        }
        for (let i = 0; i < 8; i++) s.later(i * 225, () => s.dust(VX + rand(-20, 20), GROUND, 2));
        void s.fx(V, spin(8), { duration: 1800, easing: 'linear' });
        await s.go(A, f, 1800, 'linear');
        A.el.style.zIndex = '';
        s.mood(V, 'dizzy');
        s.say(V, 'The room… is… spinning…', 900);
        void s.go(A, [f[n], K(0, 0)], 500);
        await s.fx(V, wiggle(14), 800);
        s.origin(V, '50% 88%');
        s.sfx('thud');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 450, 'ease-in');
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 400);
      },
    },
    {
      id: 'carriage',
      title: 'Royal Carriage!',
      async run(s, A, V) {
        await s.go(A, [K(0, 0), K(20, 0)], 500);
        const car = s.hold(A, CARRIAGE, -24, -2, 22);
        car.style.zIndex = '0';
        A.el.insertBefore(car, A.inner);
        await s.anim(car, [K(-20, 0, 0, 1, 1, 0), K(0, 0)], 400, 'ease-out');
        s.say(A, 'Your carriage awaits, Your Majesty!', 1100);
        await s.wait(900);
        s.mood(V, 'happy');
        s.say(V, 'How delightful!', 800);
        await s.go(V, [K(0, 0), at(0.5, K(-26, -22)), K(-52, -8, 0, 0.8, 0.8)], 700, 'ease-in-out');
        s.sfx('clunk');
        s.say(A, 'Hold on to your crown!', 700);
        s.sfx('gallop');
        s.later(300, () => s.sfx('gallop'));
        void s.go(V, [K(-52, -8, 0, 0.8, 0.8), K(28, -8, 0, 0.8, 0.8)], 900, 'ease-in');
        await s.go(A, [K(20, 0), K(100, 0)], 900, 'ease-in');
        await s.wait(400);
        car.remove();
        await s.turn(A, 1);
        await s.go(A, [K(100, 0), K(0, 0)], 700, 'ease-out');
        await s.turn(A, 1);
        s.say(A, 'Delivered!', 700);
        await s.wait(500);
      },
    },
  ],

  // ================= Bishop attacks =================
  bp: [
    {
      id: 'ladder',
      title: 'Promotion Ladder!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'Want to get promoted?', 900);
        s.sfx('sparkle');
        const ladder = s.prop(LADDER, VX + 10, 40, 64);
        const sign = s.prop(SIGN('PROMOTION ↑'), VX - 4, 24, 16);
        await s.anim(ladder, [K(0, 20, 0, 1, 0, 0), K(0, 0, 0, 1, 1)], 500, 'ease-out');
        await s.anim(sign, [K(0, -10, 0, 1, 1, 0), K(0, 0)], 300);
        s.mood(V, 'happy');
        s.say(V, 'Promotion?! Yes please!', 900);
        await s.wait(700);
        s.sfx('step');
        const climb: Keyframe[] = [K(0, 0)];
        for (let i = 1; i <= 6; i++) climb.push(K(10, -i * 12, i % 2 ? 6 : -6));
        climb.push(K(10, -90, 0, 1, 1, 0));
        s.later(200, () => s.sfx('step'));
        s.later(600, () => s.sfx('step'));
        s.later(1000, () => s.sfx('step'));
        await s.go(V, climb, 1500, 'linear');
        s.say(A, 'Good luck up there!', 800);
        void s.anim(sign, [{}, K(0, 0, 0, 1, 1, 0)], 400);
        await s.anim(ladder, [{}, K(0, 0, 0, 1, 1, 0)], 400);
      },
    },
    {
      id: 'story',
      title: 'Very Long Story!',
      async run(s, A, V) {
        s.hold(A, '📖', 12, -4, 9);
        s.say(A, 'Once upon a time…', 900);
        await s.wait(900);
        s.say(A, '…there was a very long hallway…', 1000);
        await s.wait(1000);
        s.mood(V, 'sleep');
        s.sfx('snore');
        s.say(A, '…and it went on… and on… and ON…', 1100);
        s.stream(['💤'], VX, HEAD - 8, VX + 8, 26, 4, 250, 4, 5);
        await s.wait(900);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 12), K(0, 0, 90)], 700, 'ease-in');
        s.sfx('thud');
        s.say(A, 'The end! …hello?', 800);
        await s.go(V, [K(0, 0, 0), K(40, 0, 0, 1, 1, 0)], 1100, 'ease-in');
      },
    },
  ],
  bn: [
    {
      id: 'unicorn',
      title: 'Unicorn Spell!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'Abraca-UNICORN!', 900);
        s.sfx('sparkle');
        s.stream(['✨', '🌟'], AX + 16, HEAD - 8, VX - 4, HEAD - 6, 8, 60, 5, 4);
        await s.wait(600);
        s.poof(VX, HEAD);
        const horn = s.hold(V, HORN, -9, -15, 10);
        void s.anim(horn, [K(0, 0, -135, 0), K(0, 0, -135, 1)], 300);
        s.mood(V, 'happy');
        s.say(V, 'I\'m a UNICORN!!', 900);
        s.sfx('tada');
        await s.wait(900);
        s.beam(VX, MID - 8, 104, 10, 'beam-rainbow', 500);
        await s.wait(500);
        await s.turn(V);
        s.sfx('slideUp');
        s.later(0, () => s.burst(VX, HEAD, ['✨'], { n: 4, dist: 8 }));
        await s.go(V, [K(0, 0), K(10, -18), K(20, -38), K(34, -64, 0, 0.6, 0.6, 0)], 1100, 'ease-in');
      },
    },
    {
      id: 'rocking',
      title: 'Rocking Horse Spell!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'Time for a toy makeover!', 900);
        s.sfx('zap');
        const beam = s.beam(AX + 16, HEAD - 8, VX - 4, HEAD, 'beam-green');
        await s.wait(350);
        beam.remove();
        s.poof(VX, MID);
        s.hide(V);
        const toy = s.prop(ROCKING_HORSE, VX, GROUND - 10, 20, 'flipx');
        await s.anim(toy, [K(0, 0, 0, 0.3), K(0, 0, 0, 1)], 300, 'ease-out');
        s.bubble('Clip… clop… creak…', VX, 50, 1400);
        const f: Keyframe[] = [];
        for (let i = 0; i <= 10; i++) f.push(K(i * 3.5, 0, i % 2 ? 14 : -14));
        s.later(0, () => s.sfx('creak'));
        s.later(500, () => s.sfx('creak'));
        s.later(1000, () => s.sfx('creak'));
        await s.anim(toy, f, 2000, 'ease-in-out');
        await s.anim(toy, [{}, K(60, 0, 0, 1, 1, 0)], 500);
      },
    },
  ],
  bb: [
    {
      id: 'colour',
      title: 'Wrong Colour Square!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'Bishops must stay on their own colour…', 1100);
        await s.wait(900);
        s.sfx('zap');
        const sq = s.prop('', VX, GROUND - 1, 26, 'floor-square');
        await s.anim(sq, [K(0, 0, 0, 0), K(0, 0, 0, 1)], 400, 'ease-out');
        s.say(A, '…so I changed yours!', 800);
        s.mood(V, 'shock');
        s.say(V, 'EEK! Wrong colour! Hot hot hot!', 1000);
        for (let i = 0; i < 4; i++) {
          s.sfx('hop');
          await s.go(V, [K(0, 0), K(0, -10), K(0, 0)], 230);
        }
        s.say(V, 'I\'m off to find my colour!', 800);
        s.sfx('glide');
        await s.go(V, [K(0, 0), K(10, -10), K(20, 0), K(30, -10), K(40, 0, 0, 1, 1, 0)], 900, 'linear');
        await s.anim(sq, [{}, K(0, 0, 0, 1, 1, 0)], 300);
      },
    },
    {
      id: 'hattower',
      title: 'Hat Tower!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'You need a taller hat!', 900);
        const hats: HTMLElement[] = [];
        for (let i = 0; i < 4; i++) {
          s.sfx('pop');
          const h = s.hold(V, `<img src="${pieceSrc(s.theme, V.color, 'b')}" style="width:1em;height:1em;display:block;clip-path:inset(0 0 55% 0)">`, 0, -22 - i * 9, 16);
          hats.push(h);
          await s.anim(h, [K(0, -6, 0, 0.3, 0.3, 0), K(0, 0, 0)], 250, 'ease-out');
          await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.05, 0.9 - i * 0.03)], 150);
        }
        s.say(V, 'Too… tall…!', 800);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, -4, 1, 0.8), K(0, 0, 6, 1, 0.8), K(0, 0, -8, 1, 0.8), K(0, 0, 12, 1, 0.8)], 900);
        s.sfx('crash');
        s.pow('CRASH!', VX + 10, 36);
        await s.fx(V, [K(0, 0, 12, 1, 0.8), K(0, 0, 90, 1, 0.8)], 400, 'ease-in');
        hats.forEach((h, i) => void s.anim(h, [{}, K(20 + i * 8, 30, 200, 1, 1, 0)], 600));
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 4, 0, 1, 1, 0)], 500);
      },
    },
  ],
  br: [
    {
      id: 'matador',
      title: 'Olé!',
      async run(s, A, V) {
        const cape = s.hold(A, '', 13, 0, 13, 'cape');
        s.say(A, 'Charge, if you can!', 900);
        void s.anim(cape, [K(0, 0, -6), K(0, 0, 6), K(0, 0, -6)], { duration: 500, iterations: 2 });
        await s.wait(900);
        s.mood(V, 'angry');
        s.sfx('rumble');
        await s.fx(V, [K(-0.6, 0), K(0.6, 0)], { duration: 80, iterations: 6 });
        s.say(V, 'CHAAARGE!', 600);
        s.sfx('gallop');
        void s.go(V, [K(0, 0), K(-100, 0)], 900, 'ease-in');
        await s.wait(500);
        s.sfx('whoosh');
        await s.go(A, [K(0, 0), K(-8, -14)], 200, 'ease-out');
        s.pow('OLÉ!', AX + 4, 34, { color: '#e63946', size: 11 });
        await s.wait(500);
        s.sfx('crash');
        s.pow('CRASH!', 8, 44, { size: 6, rot: -12 });
        s.say(A, 'Rooks only go straight!', 900);
        await s.go(A, [K(-8, -14), K(0, 0)], 300);
        await s.wait(500);
      },
    },
    {
      id: 'sandcastle',
      title: 'Sandcastle Spell!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'You\'d make a lovely sandcastle!', 1000);
        s.sfx('sparkle');
        s.stream(['✨'], AX + 16, HEAD - 8, VX, MID, 6, 60, 5, 4);
        await s.wait(500);
        s.addClass(V, 'sandy');
        s.mood(V, 'shock');
        s.say(V, 'I feel… grainy…', 800);
        s.hold(V, '🚩', 0, -24, 7);
        await s.wait(900);
        s.sfx('splash');
        const wave = s.prop(WAVE, 110, GROUND - 12, 26, 'flipx');
        await s.anim(wave, [K(0, 0), K(-36, 0)], 700, 'ease-in');
        s.sfx('splash');
        s.burst(VX, GROUND - 8, ['💧'], { n: 8, dist: 14 });
        for (let i = 0; i < 10; i++) {
          const g = s.prop('', VX + rand(-8, 8), MID + rand(-10, 6), rand(1, 2), 'confetto');
          (g.firstElementChild as HTMLElement).style.background = '#e8c07a';
          void s.anim(g, [K(0, 0), K(rand(-16, -4), GROUND - MID, 0, 1, 1, 0)], 700).then(() => g.remove());
        }
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 10, 0, 1.2, 0.2, 0)], 500, 'ease-in');
        await s.anim(wave, [K(-36, 0), K(20, 0, 0, 1, 1, 0)], 600, 'ease-out');
        s.say(A, 'Beach day!', 700);
        await s.wait(400);
      },
    },
  ],
  bq: [
    {
      id: 'teaparty',
      title: 'Sleepy Tea Party!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'Tea, Your Majesty?', 800);
        const pot = s.prop(TEAPOT, 50, HEAD - 8, 10);
        s.sfx('sparkle');
        await s.anim(pot, [K(0, -10, 0, 0.3, 0.3, 0), K(0, 0, 0)], 400, 'ease-out');
        s.mood(V, 'happy');
        s.say(V, 'How lovely!', 700);
        const cup = s.hold(V, '☕', -12, 0, 6);
        await s.anim(pot, [K(0, 0, 0), K(6, 0, 30)], 400);
        s.stream(['💧'], 57, HEAD - 12, VX - 12, MID - 4, 4, 80, 2, 2);
        await s.wait(500);
        void s.anim(pot, [K(6, 0, 30), K(0, -10, 0, 1, 1, 0)], 400);
        await s.anim(cup, [K(0, 0, 0), K(4, -6, -30), K(0, 0, 0)], 600);
        s.say(V, 'Mmm… this tea is… so… sleepy…', 1100);
        s.mood(V, 'sleep');
        s.sfx('snore');
        await s.wait(900);
        const big = s.prop('☕', VX, GROUND - 4, 26);
        await s.anim(big, [K(0, 20, 0, 0.3, 0.3, 0), K(0, 0, 0)], 400, 'ease-out');
        s.sfx('slideUp');
        void s.anim(big, [K(0, 0), K(10, -40), K(30, -90, 0, 0.5, 0.5, 0)], 1300, 'ease-in');
        await s.go(V, [K(0, 0), K(10, -40), K(30, -90, 0, 0.5, 0.5, 0)], 1300, 'ease-in');
      },
    },
    {
      id: 'jester',
      title: 'Jester Hat!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, 'A new crown for Her Majesty!', 900);
        s.sfx('zap');
        const beam = s.beam(AX + 16, HEAD - 8, VX - 2, HEAD - 8, 'beam-purple');
        await s.wait(300);
        beam.remove();
        s.poof(VX, HEAD - 8);
        const hat = s.hold(V, JESTER_HAT, 0, -17, 17);
        await s.anim(hat, [K(0, -4, 0, 0.3), K(0, 0, 0, 1)], 250, 'ease-out');
        s.sfx('ding');
        s.later(150, () => s.sfx('ding'));
        s.say(A, 'Ha! Fancy!', 700);
        s.stream(['😂', '🤣'], 20, 40, 40, 30, 4, 150, 6, 5);
        await s.wait(600);
        s.addClass(V, 'blush');
        s.mood(V, 'shock');
        s.say(V, 'How EMBARRASSING!', 900);
        await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 0.85, 0.85)], 400);
        await s.turn(V, 150);
        s.sfx('squeak');
        await s.go(V, [K(0, 0), K(8, -3), K(16, 0), K(24, -3), K(44, 0, 0, 1, 1, 0)], 900, 'linear');
      },
    },
  ],
};


Object.assign(PAIR_BATTLES, {
  // ================= Rook attacks =================
  rp: [
    {
      id: 'bridgecatapult',
      title: 'Drawbridge Catapult!',
      async run(s, A, V) {
        s.say(A, 'Come play on my drawbridge!', 900);
        const bridge = s.prop(DRAWBRIDGE, AX + 10, GROUND - 3, 40, 'pivot-bottom');
        s.sfx('creak');
        await s.anim(bridge, [K(0, 0, 0), K(0, 0, 90)], 800, 'ease-in-out');
        s.sfx('thud');
        s.mood(V, 'happy');
        s.say(V, 'A playground!', 700);
        await s.go(V, hops(0, -22, 3, 4), 800, 'linear');
        s.say(V, 'Wheee!', 500);
        await s.go(V, [K(-22, 0), K(-22, -3), K(-22, 0)], 300);
        s.say(A, 'Up she goes!', 600);
        s.sfx('boing');
        void s.anim(bridge, [K(0, 0, 90), K(0, 0, 10)], 250, 'ease-out');
        s.mood(V, 'shock');
        s.sfx('slideUp');
        await s.go(V, [K(-22, 0, 0), K(-6, -50, 300, 0.7), K(10, -80, 620, 0.1, 0.1, 0)], 900, 'ease-out');
        s.twinkle(VX + 10, 8);
        await s.anim(bridge, [{}, K(0, 0, 0, 1, 1, 0)], 400);
      },
    },
    {
      id: 'hideseek',
      title: 'Hide and Seek!',
      async run(s, A, V) {
        const door = s.hold(A, DOOR, 0, 8, 10);
        s.say(A, 'Quick! Hide in here!', 800);
        s.sfx('creak');
        await s.anim(door, [K(0, 0, 0, 1, 1), K(-2, 0, 0, 0.15, 1)], 300);
        s.mood(V, 'happy');
        s.say(V, 'Ooh, great spot!', 700);
        await s.go(V, [...hops(0, -40, 4, 4), K(-48, 4, 0, 0.5, 0.5, 0)], 1100, 'linear');
        s.hide(V);
        s.sfx('clunk');
        await s.anim(door, [K(-2, 0, 0, 0.15, 1), K(0, 0, 0, 1, 1)], 200);
        s.say(A, 'Hmm, where could it be?', 900);
        await s.fx(A, [K(-0.6, 0), K(0.6, 0)], { duration: 90, iterations: 8 });
        s.sfx('boom');
        s.pow('BURP!', AX, 42, { size: 9, color: '#9b5cff' });
        show(V);
        s.sfx('slideUp');
        await s.go(V, [K(-48, -16, 0, 0.6), K(-30, -60, 300, 0.7), K(-6, -96, 600, 0.3, 0.3, 0)], 900, 'ease-out');
        s.say(A, 'Found you!', 700);
        await s.wait(500);
      },
    },
  ],
  rn: [
    {
      id: 'moat',
      title: 'Castle Moat!',
      async run(s, A, V) {
        const moat = s.prop('', 52, GROUND - 1, 16, 'moat');
        s.sfx('splash');
        await s.anim(moat, [K(0, 0, 0, 0, 1), K(0, 0, 0, 1, 1)], 500, 'ease-out');
        s.say(A, 'Mind the moat!', 700);
        await s.wait(600);
        s.say(V, 'Pfft! Knights can jump anything!', 1000);
        await s.wait(700);
        s.sfx('boing');
        s.later(250, () => {
          s.say(A, 'Widening the moat!', 600);
          void s.anim(moat, [K(0, 0, 0, 1, 1), K(0, 0, 0, 2.4, 1)], 300, 'ease-out');
        });
        await s.go(V, [K(0, 0), at(0.5, K(-11, -26), 'ease-out'), K(-22, 2)], 650, 'ease-in');
        s.sfx('splash');
        s.pow('SPLASH!', 52, 42, { color: '#3ec1ff' });
        s.burst(52, GROUND - 6, ['💧', '💦'], { n: 10, dist: 16 });
        s.mood(V, 'shock');
        s.addClass(V, 'wet');
        await s.go(V, [K(-22, 2), K(-22, 12, 0, 1, 1, 1)], 300);
        s.say(V, 'Glub glub!', 700);
        await s.go(V, [K(-22, 12), K(-10, 12, 0, 1, 1, 0.5), K(10, 14, 0, 1, 1, 0)], 900, 'ease-in');
        await s.anim(moat, [{}, K(0, 0, 0, 0, 1)], 400);
      },
    },
    {
      id: 'trampoline',
      title: 'Wall and Trampoline!',
      async run(s, A, V) {
        s.say(A, 'Building a wall!', 700);
        const bricks: HTMLElement[] = [];
        for (let i = 0; i < 6; i++) {
          const b = s.prop(BRICK, 52 + (i % 2 ? 3 : -3), GROUND - 3 - Math.floor(i / 2) * 5, 4.5);
          bricks.push(b);
          s.sfx('clunk');
          await s.anim(b, [K(0, -20, 0, 1, 1, 0), K(0, 0)], 150, 'ease-in');
        }
        const tramp = s.prop('', 36, GROUND - 2, 14, 'trampoline');
        s.say(V, 'Walls can\'t stop a knight!', 900);
        await s.wait(700);
        s.sfx('boing');
        await s.go(V, [K(0, 0), at(0.5, K(-19, -30), 'ease-out'), K(-38, -2)], 650, 'ease-in');
        s.pow('BOING!', 36, 50, { color: '#3ec1ff' });
        s.sfx('boing');
        void s.anim(tramp, [K(0, 0, 0, 1, 1), K(0, 2, 0, 1.1, 0.6), K(0, 0, 0, 1, 1)], 250);
        s.mood(V, 'shock');
        s.sfx('slideUp');
        await s.go(V, [K(-38, -2, 0), K(0, -50, 360, 0.7), K(30, -90, 720, 0.2, 0.2, 0)], 1000, 'ease-out');
        s.twinkle(VX + 26, 8);
        s.say(A, 'Nice jump!', 600);
        bricks.forEach((b) => void s.anim(b, [{}, K(0, 0, 0, 1, 1, 0)], 400));
        await s.anim(tramp, [{}, K(0, 0, 0, 1, 1, 0)], 400);
      },
    },
  ],
  rb: [
    {
      id: 'bell',
      title: 'Bell Tower BONG!',
      async run(s, A, V) {
        const bell = s.hold(A, BELL, 0, -20, 10);
        await s.anim(bell, [K(0, -10, 0, 0.3, 0.3, 0), K(0, 0)], 300, 'ease-out');
        s.say(A, 'Ding… dong…', 700);
        for (let i = 0; i < 3; i++) {
          s.sfx('ding');
          s.sfx('thud');
          void s.anim(bell, [K(0, 0, -25), K(0, 0, 25), K(0, 0, 0)], 400);
          s.pow('BONG!', AX + 4, 34 - i * 4, { size: 6 + i * 2, color: '#d4a017' });
          for (let j = 0; j < 2; j++) {
            const r = s.prop('', AX + 10, HEAD - 12, 12, 'soundwave');
            (r.firstElementChild as HTMLElement).style.borderColor = '#d4a017';
            void s.anim(r, [K(0, 0, 0, 0.3, 0.6, 1), K(VX - AX - 10, 6, 0, 1.4, 1.8, 0)], { duration: 600, delay: j * 150 }).then(() => r.remove());
          }
          await s.fx(V, [K(-1 - i, 0), K(1 + i, 0)], { duration: 60, iterations: 6 });
        }
        s.mood(V, 'dizzy');
        s.say(V, 'My hat is… vibrating…', 900);
        s.sfx('whirl');
        void s.fx(V, spin(8), { duration: 1200, easing: 'linear' });
        await s.go(V, [K(0, 0), K(8, -4), K(18, 2), K(30, -4), K(46, 0, 0, 1, 1, 0)], 1200, 'ease-in');
      },
    },
    {
      id: 'sail',
      title: 'Hat Sail!',
      async run(s, A, V) {
        s.say(A, 'Opening all my windows!', 900);
        s.sfx('whoosh');
        s.later(500, () => s.sfx('whoosh'));
        for (let i = 0; i < 8; i++) {
          const line = s.prop('', AX + 10, HEAD - 12 + (i % 4) * 5, 12, 'windline');
          void s.anim(line, [K(0, 0, 0, 0.3, 1, 0), at(0.3, K(10, 0, 0, 1, 1, 1)), K(60, 0, 0, 1, 1, 0)], { duration: 600, delay: i * 120 }).then(() => line.remove());
        }
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 18)], 600);
        s.mood(V, 'shock');
        s.say(V, 'My hat is a SAIL!', 800);
        const flag = s.hold(V, '⛵', 12, -20, 7);
        void flag;
        s.sfx('slideDown');
        await s.go(V, [K(0, 0), K(12, 0), K(30, -2), K(56, 0, 0, 1, 1, 0)], 1300, 'ease-in');
        s.say(A, 'Bon voyage!', 700);
        await s.wait(300);
      },
    },
  ],
  rr: [
    {
      id: 'jenga',
      title: 'Jenga!',
      async run(s, A, V) {
        s.say(A, 'Let\'s play Jenga!', 800);
        s.say(V, 'Oh no…', 700);
        for (let i = 0; i < 3; i++) {
          const b = s.prop(BRICK, VX - 4 + (i - 1) * 3, GROUND - 6 - i * 4, 4);
          s.sfx('creak');
          await s.anim(b, [K(0, 0), K(-(VX - AX - 16), 0)], 500, 'ease-in-out');
          s.sfx('clunk');
          void s.anim(b, [{}, K(-(VX - AX - 16), 0, 0, 1, 1, 0)], 300).then(() => b.remove());
          s.origin(V, '50% 88%');
          await s.fx(V, [K(0, 0, 0), K(0, 0, 4 + i * 3), K(0, 0, -4 - i * 3), K(0, 0, 0)], 400);
          if (i === 1) s.say(V, 'Careful…!', 600);
        }
        s.pow('JENGA!', VX, 36, { color: '#ffb400', size: 10 });
        s.sfx('crash');
        s.shake(2);
        for (let i = 0; i < 8; i++) {
          const b = s.prop(BRICK, VX + rand(-8, 8), HEAD + rand(-2, 14), rand(3.5, 5));
          const dx = rand(-14, 14);
          void s.anim(b, [K(0, 0, 0), at(0.7, K(dx, GROUND - HEAD - 10, rand(-90, 90)), 'ease-in'), K(dx * 1.1, GROUND - HEAD - 10, rand(-90, 90), 1, 1, 0)], { duration: 900, delay: i * 30 }).then(() => b.remove());
        }
        s.dust(VX, GROUND, 6);
        await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 8, 0, 1.2, 0.2, 0)], 450, 'ease-in');
        await s.wait(500);
      },
    },
    {
      id: 'tug',
      title: 'Tug of War!',
      async run(s, A, V) {
        const ha = s.hold(A, '', 12, 0, 1);
        const hv = s.hold(V, '', -12, 0, 1);
        const rope = s.tether(ha, hv);
        s.say(A, 'Tug of war!', 700);
        s.origin(A, '50% 88%');
        s.origin(V, '50% 88%');
        void s.fx(A, [K(0, 0, 0), K(0, 0, -14)], 400);
        await s.fx(V, [K(0, 0, 0), K(0, 0, 14)], 400);
        s.sfx('creak');
        void s.go(A, [K(0, 0), K(4, 0), K(-2, 0), K(5, 0), K(-4, 0)], 1200);
        await s.go(V, [K(0, 0), K(4, 0), K(-2, 0), K(5, 0), K(-4, 0)], 1200);
        s.say(A, 'HEAVE!', 600);
        s.sfx('whoosh');
        s.mood(V, 'shock');
        void s.go(A, [K(-4, 0), K(-10, 0)], 250);
        await s.go(V, [K(-4, 0, 0), at(0.5, K(-30, -40, -180)), K(-90, -10, -360, 1, 1, 0)], 900, 'ease-out');
        rope();
        s.sfx('crash');
        s.pow('CRASH!', 8, 44, { size: 6, rot: -12 });
        void s.fx(A, [K(0, 0, -14), K(0, 0, 0)], 300);
        await s.go(A, [K(-10, 0), K(0, 0)], 400);
      },
    },
  ],
  rq: [
    {
      id: 'suite',
      title: 'Royal Suite!',
      async run(s, A, V) {
        const door = s.hold(A, DOOR, 0, 8, 10);
        s.say(A, 'Your Majesty, the royal suite awaits!', 1100);
        await s.wait(700);
        s.mood(V, 'happy');
        s.say(V, 'Finally, some proper service!', 900);
        s.sfx('creak');
        await s.anim(door, [K(0, 0, 0, 1, 1), K(-2, 0, 0, 0.15, 1)], 300);
        await s.go(V, [...waddle(0, -40, 5), K(-48, 4, 0, 0.5, 0.5, 0)], 1200, 'linear');
        s.hide(V);
        s.sfx('clunk');
        await s.anim(door, [K(-2, 0, 0, 0.15, 1), K(0, 0, 0, 1, 1)], 200);
        s.say(A, 'Checkout time!', 700);
        await s.wait(500);
        s.sfx('slideDown');
        show(V);
        await s.go(V, [K(-52, 4, 0, 0.6, 0.6, 1), K(-70, 10, -30, 0.7, 0.7, 1), K(-100, 16, -60, 0.8, 0.8, 0)], 900, 'ease-in');
        s.bubble('Wheeeee!', 12, 60, 700);
        await s.wait(600);
      },
    },
    {
      id: 'gutter',
      title: 'Rain Gutter!',
      async run(s, A, V) {
        s.say(A, 'Oops, my gutter is leaking!', 900);
        const cloud = s.prop('🌧️', VX, 34, 14);
        await s.anim(cloud, [K(-20, -10, 0, 0.5, 0.5, 0), K(0, 0)], 400, 'ease-out');
        s.sfx('splash');
        for (let i = 0; i < 16; i++) {
          s.later(i * 60, () => {
            const d = s.prop('💧', VX + rand(-8, 8), 40, 3.2, 'bt-fx');
            void s.anim(d, [K(0, 0), K(0, 18, 0, 1, 1, 0)], 400, 'ease-in').then(() => d.remove());
          });
        }
        await s.wait(500);
        s.addClass(V, 'wet');
        s.mood(V, 'shock');
        s.say(V, 'MY HAIR!!', 800);
        await s.wait(700);
        const brolly = s.hold(V, '☂️', 0, -22, 12);
        await s.anim(brolly, [K(0, 6, 0, 0.3), K(0, 0, 0, 1)], 250, 'ease-out');
        s.say(V, 'Too late now! Hmph!', 800);
        await s.turn(V);
        s.sfx('thud');
        void s.anim(cloud, [{}, K(40, 0, 0, 1, 1, 0)], 1000);
        await s.go(V, [K(0, 0), K(8, -3), K(16, 0), K(24, -3), K(40, 0, 0, 1, 1, 0)], 1000, 'linear');
      },
    },
  ],

  // ================= Queen attacks =================
  qp: [
    {
      id: 'naptime',
      title: 'Royal Decree: Nap Time!',
      async run(s, A, V) {
        s.say(A, 'By royal decree…', 800);
        await s.wait(700);
        s.sfx('fanfare');
        s.pow('NAP TIME!', 50, 38, { size: 10, color: '#9b5cff' });
        await s.wait(500);
        s.say(V, 'Yes, Your Majesty!', 800);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -10), K(0, 0, 0)], 300);
        s.mood(V, 'sleep');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 500, 'ease-in');
        s.sfx('snore');
        s.stream(['💤'], VX, MID, VX + 6, 30, 3, 250, 4, 5);
        const blanket = s.prop('', VX + 6, GROUND - 5, 18, 'blanket');
        await s.anim(blanket, [K(0, -30, 0, 1, 1, 0), K(0, 0)], 400, 'ease-in');
        s.say(A, 'Sweet dreams, little soldier.', 900);
        await s.wait(700);
        s.sfx('slideDown');
        void s.anim(blanket, [K(0, 0), K(40, 0, 0, 1, 1, 0)], 1000, 'ease-in');
        await s.go(V, [K(0, 0), K(40, 0, 0, 1, 1, 0)], 1000, 'ease-in');
      },
    },
    {
      id: 'promise',
      title: 'Promotion Promise!',
      async run(s, A, V) {
        s.say(A, 'March to the end of the board and you\'ll become a queen!', 1400);
        await s.wait(1200);
        s.mood(V, 'happy');
        s.say(V, 'Really?! Promotion, here I come!', 1000);
        await s.turn(V);
        s.sfx('step');
        s.later(350, () => s.sfx('step'));
        s.later(700, () => s.sfx('step'));
        await s.go(V, hops(0, 40, 5, 4), 1300, 'linear');
        s.mood(A, 'happy');
        s.say(A, '…it\'s a VERY long board.', 900);
        await s.fx(A, [K(0, 0, 0), K(0, 0, 8), K(0, 0, 0)], 400);
        await s.wait(500);
      },
    },
  ],
  qn: [
    {
      id: 'hoops',
      title: 'Circus Hoops!',
      async run(s, A, V) {
        s.say(A, 'Jump, horsey, jump!', 800);
        const h1 = s.prop('', 58, MID - 8, 14, 'hoop');
        const h2 = s.prop('', 94, MID - 12, 14, 'hoop');
        void s.anim(h1, [K(0, -10, 0, 0, 0), K(0, 0, 0, 1, 1)], 300);
        await s.anim(h2, [K(0, -10, 0, 0, 0), K(0, 0, 0, 1, 1)], 300);
        s.mood(V, 'happy');
        s.sfx('boing');
        await s.go(V, [K(0, 0), at(0.5, K(-16, -10)), K(-26, 0)], 550);
        s.sfx('tada');
        s.stream(['👏'], 30, 40, 40, 30, 3, 100, 5, 5);
        await s.turn(V);
        s.say(V, 'Ta-da!', 500);
        await s.wait(300);
        s.sfx('boing');
        await s.go(V, [K(-26, 0), at(0.6, K(18, -14)), K(56, -4, 0, 1, 1, 0)], 900);
        s.say(A, 'Bravo! …come back?', 900);
        void s.anim(h1, [{}, K(0, 0, 0, 0, 0)], 300);
        await s.anim(h2, [{}, K(0, 0, 0, 0, 0)], 300);
        await s.wait(400);
      },
    },
    {
      id: 'riding',
      title: 'Riding Lesson!',
      async run(s, A, V) {
        s.say(A, 'Time for my riding lesson!', 800);
        s.sfx('boing');
        await s.go(A, [K(0, 0), at(0.5, K(24, -30)), K(46, -14)], 600);
        s.say(A, 'Tally-ho!', 600);
        s.sfx('gallop');
        const prance = (dx: number, y: number) => [K(dx, y), K(dx, y - 4), K(dx, y), K(dx, y - 4), K(dx, y)];
        void s.go(A, prance(46, -14), 800);
        await s.go(V, prance(0, 0), 800);
        s.sfx('whoosh');
        await s.go(A, [K(46, -14, 0), at(0.5, K(24, -34, 360)), K(0, 0, 720)], 700);
        s.say(A, 'Off you go now!', 700);
        s.pow('*pat*', VX + 6, 50, { size: 5, color: '#9aa0a6' });
        s.mood(V, 'happy');
        await s.turn(V);
        s.sfx('gallop');
        s.later(300, () => s.sfx('gallop'));
        s.dust(VX - 6, GROUND, 5);
        await s.go(V, [K(0, 0), K(12, -5), K(26, 0), K(42, -5), K(60, 0, 0, 1, 1, 0)], 1000, 'ease-in');
      },
    },
  ],
  qb: [
    {
      id: 'bowling',
      title: 'Royal Bowling!',
      async run(s, A, V) {
        s.say(A, 'You look just like a bowling pin!', 1000);
        const pins = [[VX + 8, MID + 2], [VX + 14, MID - 2]].map(([x, y]) => s.prop(pieceImg(s, V), x, y, 12));
        pins.forEach((p) => void s.anim(p, [K(0, -10, 0, 0.3, 0.3, 0), K(0, 0)], 300));
        await s.wait(700);
        const ball = s.prop(BOWLING_BALL, AX + 12, GROUND - 5, 9);
        s.sfx('rumble');
        await s.anim(ball, [K(0, 0, 0), K(VX - AX - 18, 0, 900)], 900, 'ease-in');
        s.sfx('crash');
        s.pow('STRIKE!', VX, 34, { color: '#ffb400', size: 11 });
        s.burst(VX, MID, ['⭐', '🎳'], { n: 8, dist: 16 });
        pins.forEach((p, i) => void s.anim(p, [K(0, 0, 0), K(20 + i * 10, -30 + i * 10, 400, 1, 1, 0)], 800, 'ease-out'));
        void s.anim(ball, [{}, K(VX - AX + 20, 0, 1400, 1, 1, 0)], 600);
        await s.go(V, [K(0, 0, 0), K(20, -30, 360), K(40, -10, 720, 1, 1, 0)], 900, 'ease-out');
        s.stream(['👏'], 30, 40, 40, 30, 3, 100, 5, 5);
        await s.wait(400);
      },
    },
    {
      id: 'directions',
      title: 'Every Direction Dance!',
      async run(s, A, V) {
        s.say(A, 'Copy my dance! Up, down, left, right…', 1100);
        s.sfx('music');
        await s.go(A, [K(0, 0), K(0, -8), K(0, 0), K(6, 0), K(-6, 0), K(0, 0), K(5, -5), K(-5, -5), K(0, 0)], 1400);
        s.say(V, 'I can only go diagonally!', 900);
        await s.go(V, [K(0, 0), K(-5, -5), K(0, 0), K(5, -5), K(0, 0), K(-5, -5)], 1000);
        s.mood(V, 'dizzy');
        s.sfx('squish');
        s.pow('TANGLED!', VX, 40, { color: '#9b5cff', size: 7 });
        await s.fx(V, spin(3), { duration: 500, easing: 'linear' });
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 400, 'ease-in');
        s.sfx('thud');
        await s.go(V, [K(-5, -5, 0), K(30, 0, 360, 1, 1, 0)], 900, 'ease-in');
      },
    },
  ],
  qr: [
    {
      id: 'beanstalk',
      title: 'Magic Beanstalk!',
      async run(s, A, V) {
        s.say(A, 'Plant a magic bean…', 800);
        const bean = s.prop('🌱', AX + 10, HEAD, 5);
        await s.anim(bean, [K(0, 0, 0), at(0.5, K(24, -14, 180)), K(VX - AX - 10, GROUND - HEAD - 2, 360)], 600, 'ease-in-out');
        bean.remove();
        s.sfx('sparkle');
        const stalk = s.prop(BEANSTALK, VX, GROUND, 80, 'pivot-bottom');
        s.mood(V, 'shock');
        s.say(V, 'Whoa! Going up!', 800);
        s.sfx('slideUp');
        void s.anim(stalk, [K(0, 0, 0, 1, 0), K(0, 0, 0, 1, 1)], 1400, 'ease-in');
        await s.go(V, [K(0, 0), K(0, -78, 0, 0.8, 0.8)], 1400, 'ease-in');
        s.hide(V);
        s.say(A, 'Say hi to the giant!', 900);
        await s.wait(700);
        await s.anim(stalk, [{}, K(0, 0, 0, 1, 1, 0)], 500);
      },
    },
    {
      id: 'makeover',
      title: 'Royal Makeover!',
      async run(s, A, V) {
        s.say(A, 'This castle needs a makeover!', 900);
        await s.go(A, [K(0, 0), K(22, 0)], 500);
        const roller = s.hold(A, ROLLER, 14, -6, 12);
        for (let i = 0; i < 3; i++) {
          s.sfx('squish');
          await s.anim(roller, [K(0, 4, 0), K(4, -8, 0), K(0, 4, 0)], 350);
        }
        s.addClass(V, 'pinky');
        s.sfx('sparkle');
        s.burst(VX, MID - 4, ['🌸', '💖', '🌷'], { n: 8, dist: 14 });
        s.say(A, 'Gorgeous!', 600);
        await s.wait(500);
        s.mood(V, 'shock');
        s.say(V, 'PINK?! I\'m a FORTRESS!', 1000);
        void s.go(A, [K(22, 0), K(0, 0)], 500);
        await s.fx(V, wiggle(6), 600);
        s.sfx('rumble');
        await s.go(V, [K(0, 0), K(12, 0), K(46, 0, 0, 1, 1, 0)], 900, 'ease-in');
      },
    },
  ],
  qq: [
    {
      id: 'runway',
      title: 'Fashion Show!',
      async run(s, A, V) {
        const runway = s.prop('', 50, GROUND - 1, 60, 'runway');
        await s.anim(runway, [K(0, 0, 0, 0, 1), K(0, 0, 0, 1, 1)], 400);
        s.sfx('music');
        s.say(A, 'Watch and learn, darling.', 900);
        await s.go(A, [K(0, 0, 0), K(8, -2, 8), K(16, 0, -8), K(24, -2, 8), K(30, 0, 0)], 1100);
        s.stream(['👏', '📸', '✨'], 20, 40, 50, 30, 5, 100, 6, 5);
        await s.fx(A, spin(2), { duration: 400, easing: 'linear' });
        void s.go(A, [K(30, 0), K(0, 0)], 700);
        s.say(V, 'Hmph. My turn!', 700);
        await s.go(V, [K(0, 0, 0), K(-8, -2, -8), K(-14, 0, 8)], 600);
        s.sfx('slideDown');
        s.pow('TRIP!', VX - 14, 40, { size: 7 });
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -90)], 400, 'ease-in');
        s.say(V, 'My heel!!', 600);
        await s.go(V, [K(-14, 0, 0), K(40, 0, 0, 1, 1, 0)], 900, 'ease-in');
        await s.anim(runway, [{}, K(0, 0, 0, 0, 1)], 300);
      },
    },
    {
      id: 'mirror',
      title: 'Mirror, Mirror!',
      async run(s, A, V) {
        const m = s.prop(MIRROR, 50, HEAD, 22);
        await s.anim(m, [K(0, -30, 0, 0.5, 0.5, 0), K(0, 0)], 450, 'ease-out');
        s.say(V, 'Mirror mirror, who\'s the fairest?', 1100);
        await s.wait(1000);
        s.sfx('sparkle');
        const face = s.prop('👈', 50, HEAD - 2, 9);
        await s.anim(face, [K(0, 0, 0, 0), K(0, 0, 0, 1.2), K(0, 0, 0, 1)], 300);
        s.bubble('HER, obviously!', 50, 34, 1000);
        s.mood(A, 'happy');
        await s.wait(900);
        s.mood(V, 'angry');
        s.say(V, 'WHAT?! I\'m never coming back!', 900);
        void s.anim(m, [{}, K(0, -30, 0, 0.5, 0.5, 0)], 500);
        void s.anim(face, [{}, K(0, -30, 0, 0.5, 0.5, 0)], 500);
        await s.turn(V);
        s.sfx('thud');
        await s.go(V, [K(0, 0), K(10, -3), K(20, 0), K(30, -3), K(44, 0, 0, 1, 1, 0)], 1000, 'linear');
      },
    },
  ],

  // ================= King attacks =================
  kp: [
    {
      id: 'medal',
      title: 'Heavy Medal!',
      async run(s, A, V) {
        s.say(A, 'For your bravery… a medal!', 900);
        await s.go(A, waddle(0, 22, 4), 700);
        const medal = s.hold(V, MEDAL, -4, 2, 9);
        s.sfx('tada');
        await s.anim(medal, [K(0, -10, 0, 0.3, 0.3, 0), K(0, 0)], 300, 'ease-out');
        s.mood(V, 'happy');
        s.say(V, 'Thank you, Your Majesty!', 800);
        void s.go(A, waddle(22, 0, 4), 700);
        await s.wait(800);
        s.say(V, 'It\'s… quite… heavy…', 900);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -10), K(0, 0, -20), K(0, 0, -35)], 1100, 'ease-in');
        s.sfx('thud');
        await s.fx(V, [K(0, 0, -35), K(0, 0, -90)], 300, 'ease-in');
        s.mood(V, 'shock');
        await s.go(V, [K(0, 0, 0), K(40, 0, 720, 1, 1, 0)], 1000, 'ease-in');
      },
    },
    {
      id: 'guardduty',
      title: 'Guard Duty!',
      async run(s, A, V) {
        s.say(A, 'You there! Guard the far corner of the kingdom!', 1300);
        await s.wait(1000);
        s.say(V, 'Yes, sir! Right away, sir!', 900);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -10), K(0, 0, 0)], 300);
        await s.turn(V);
        s.sfx('fanfare');
        const march: Keyframe[] = [];
        for (let i = 0; i <= 10; i++) march.push(K(i * 4.5, i % 2 ? -3 : 0));
        for (let i = 0; i < 5; i++) s.later(i * 250, () => s.sfx('step'));
        await s.go(V, march, 1300, 'linear');
        s.say(A, 'That corner is VERY far away.', 900);
        await s.wait(600);
      },
    },
  ],
  kn: [
    {
      id: 'whisper',
      title: 'Royal Whisper!',
      async run(s, A, V) {
        await s.go(A, waddle(0, 26, 5), 900);
        s.bubble('psst… carrots… that way…', VX - 10, 44, 1200);
        s.sfx('squeak');
        await s.wait(1100);
        s.mood(V, 'happy');
        s.burst(VX, HEAD - 12, ['💕', '🥕'], { n: 4, dist: 8 });
        s.say(V, 'CARROTS?!', 700);
        await s.turn(V, 120);
        s.dust(VX - 6, GROUND, 6);
        s.sfx('gallop');
        s.later(250, () => s.sfx('gallop'));
        await s.go(V, [K(0, 0), K(12, -5), K(28, 0), K(46, -5), K(66, 0, 0, 1, 1, 0)], 800, 'ease-in');
        s.say(A, 'Works every time.', 800);
        await s.go(A, waddle(26, 0, 5), 900);
      },
    },
    {
      id: 'parade',
      title: 'Royal Parade!',
      async run(s, A, V) {
        s.say(A, 'Let\'s have a parade! You lead!', 1000);
        const blanket = s.hold(V, '', 2, 8, 16, 'parade-blanket');
        void blanket;
        s.sfx('fanfare');
        s.mood(V, 'happy');
        await s.turn(V);
        const guards = [0, 1].map((i) => s.prop(GUARD, VX - 18 - i * 10, GROUND - 9, 16));
        s.stream(['🎵', '🎶', '🎺'], VX - 20, HEAD, VX + 10, 26, 6, 150, 6, 4);
        for (let i = 0; i < 6; i++) s.later(i * 220, () => s.sfx('step'));
        const marchV: Keyframe[] = [];
        for (let i = 0; i <= 10; i++) marchV.push(K(i * 6, i % 2 ? -3 : 0));
        guards.forEach((g) => {
          const f: Keyframe[] = [];
          for (let i = 0; i <= 10; i++) f.push(K(i * 7, i % 2 ? -1.5 : 0));
          void s.anim(g, f, 1400, 'linear');
        });
        await s.go(V, marchV, 1400, 'linear');
        s.say(A, 'Lovely parade!', 700);
        await s.wait(400);
      },
    },
  ],
  kb: [
    {
      id: 'chores',
      title: 'Royal Chores!',
      async run(s, A, V) {
        s.say(A, 'The castle floors need sweeping!', 1000);
        const broom = s.hold(V, BROOM, -10, 2, 16);
        await s.anim(broom, [K(-20, -10, -60, 1, 1, 0), K(0, 0, -20)], 400, 'ease-out');
        s.say(V, 'Diagonally, of course…', 900);
        s.sfx('glide');
        const f: Keyframe[] = [K(0, 0)];
        for (let i = 1; i <= 6; i++) f.push(K(i * 7, i % 2 ? -6 : 0));
        f.push(K(50, 0, 0, 1, 1, 0));
        void s.anim(broom, [K(0, 0, -20), K(0, 0, 20), K(0, 0, -20)], { duration: 300, iterations: 5 });
        for (let i = 0; i < 6; i++) s.later(i * 220, () => s.dust(VX + i * 7, GROUND, 2));
        await s.turn(V);
        await s.go(V, f, 1500, 'linear');
        s.say(A, 'Much better!', 700);
        await s.wait(400);
      },
    },
    {
      id: 'snore',
      title: 'Royal Snore!',
      async run(s, A, V) {
        const throne = s.hold(A, THRONE, -2, -2, 32);
        throne.style.zIndex = '0';
        A.el.insertBefore(throne, A.inner);
        await s.anim(throne, [K(0, -30, 0, 1, 1, 0), K(0, 0)], 400, 'ease-in');
        s.say(A, 'Time for my royal nap…', 900);
        s.mood(A, 'sleep');
        await s.wait(800);
        for (let i = 0; i < 3; i++) {
          s.sfx('snore');
          s.pow(['snore…', 'SNORE…', 'SNOOOORE!'][i], AX + 10, 40 - i * 3, { size: 5 + i * 3, color: '#6d6594' });
          for (let j = 0; j < 2; j++) {
            const r = s.prop('', AX + 10, HEAD - 2, 10 + i * 3, 'soundwave');
            (r.firstElementChild as HTMLElement).style.borderColor = '#9b8cff';
            void s.anim(r, [K(0, 0, 0, 0.3, 0.6, 1), K(VX - AX - 10, 0, 0, 1.4, 1.8, 0)], { duration: 700, delay: j * 150 }).then(() => r.remove());
          }
          await s.fx(V, [K(0, 0, 0), K(0, 0, 6 + i * 6), K(0, 0, 0)], 600);
        }
        s.mood(V, 'shock');
        s.say(V, 'I can\'t take the noise!', 800);
        s.sfx('whoosh');
        await s.go(V, [K(0, 0, 0), K(20, -10, 60), K(56, -20, 200, 1, 1, 0)], 800, 'ease-in');
        s.mood(A, null);
      },
    },
  ],
  kr: [
    {
      id: 'castling',
      title: 'Castling!',
      async run(s, A, V) {
        s.pow('CASTLING!', 50, 36, { size: 10, color: '#ffb400' });
        s.sfx('royal');
        await s.wait(500);
        s.sfx('boing');
        await s.go(A, [K(0, 0), at(0.5, K(34, -40), 'ease-out'), K(66, 0)], 800, 'ease-in');
        s.dust(AX + 66, GROUND, 4);
        s.say(V, 'Huh? We\'re supposed to swap places!', 1000);
        await s.turn(V);
        await s.wait(500);
        await s.turn(A);
        s.say(A, 'Close enough!', 600);
        await s.go(A, [K(66, 0), K(60, 0)], 200);
        s.sfx('boing');
        s.pow('BUMP!', VX + 4, 44);
        await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.15, 0.9), K(0, 0, 0, 1, 1)], 200);
        s.mood(V, 'shock');
        s.sfx('slideDown');
        await s.go(V, [K(0, 0, 0), K(-20, 0, -20), K(-70, 4, -90, 1, 1, 0)], 900, 'ease-in');
        await s.go(A, [K(60, 0), K(0, 0)], 700);
        await s.turn(A);
      },
    },
    {
      id: 'movers',
      title: 'Moving Day!',
      async run(s, A, V) {
        s.say(A, 'This castle is moving to the countryside!', 1100);
        const guards = [0, 1].map((i) => s.prop(GUARD, -10 - i * 10, GROUND - 9, 16));
        const dolly = s.prop(DOLLY, -4, GROUND - 10, 20);
        await Promise.all([...guards.map((g, i) => s.anim(g, [K(0, 0), K(VX + 2 + i * 10, 0)], 1000, 'linear')), s.anim(dolly, [K(0, 0), K(VX + 14, 0)], 1000, 'linear')]);
        s.say(V, 'But I like it here!', 800);
        s.origin(V, '50% 88%');
        s.sfx('creak');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -15)], 400);
        s.bubble('Heave-ho!', VX + 8, 44, 700);
        s.sfx('rumble');
        const move = (el: HTMLElement, from: number) => s.anim(el, [K(from, 0), K(from + 50, 0, 0, 1, 1, 0)], 1300, 'ease-in');
        void move(guards[0], VX + 2);
        void move(guards[1], VX + 12);
        void move(dolly, VX + 14);
        await s.go(V, [K(0, -2), K(50, -2, 0, 1, 1, 0)], 1300, 'ease-in');
      },
    },
  ],
  kq: [
    {
      id: 'teaspill',
      title: 'Tea Spill!',
      async run(s, A, V) {
        const pot = s.hold(A, TEAPOT, 14, -6, 10);
        s.say(A, 'More tea, my dear?', 800);
        await s.go(A, waddle(0, 20, 4), 700);
        s.say(V, 'Just a drop, thank you.', 800);
        await s.anim(pot, [K(0, 0, 0), K(2, -2, 40)], 400);
        s.stream(['🟤', '💧'], AX + 42, HEAD - 6, VX, HEAD + 4, 8, 50, 3, 3);
        s.say(A, 'Oops! A bit more than a drop…', 900);
        await s.wait(500);
        s.addClass(V, 'muddy');
        s.mood(V, 'shock');
        s.say(V, 'MY DRESS!!', 800);
        await s.anim(pot, [K(2, -2, 40), K(0, 0, 0)], 300);
        await s.fx(V, wiggle(8), 500);
        await s.turn(V, 150);
        s.sfx('thud');
        void s.go(A, waddle(20, 0, 4), 700);
        await s.go(V, [K(0, 0), K(10, -3), K(20, 0), K(30, -3), K(44, 0, 0, 1, 1, 0)], 900, 'linear');
      },
    },
    {
      id: 'crownswap',
      title: 'Crown Swap!',
      async run(s, A, V) {
        s.say(A, 'Let\'s swap crowns for a day!', 900);
        await s.wait(800);
        const c1 = s.prop('👑', AX, HEAD - 8, 8);
        const c2 = s.prop('👑', VX, HEAD - 8, 8);
        s.sfx('whoosh');
        void s.anim(c1, [K(0, 0, 0), at(0.5, K(24, -22, 180)), K(VX - AX, 0, 360)], 700);
        await s.anim(c2, [K(0, 0, 0), at(0.5, K(-24, -26, -180)), K(AX - VX, 0, -360)], 700);
        s.sfx('ding');
        s.mood(V, 'happy');
        s.say(V, 'I\'M THE KING NOW!', 900);
        s.origin(V, '50% 88%');
        await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.1, 1.1)], 300);
        await s.turn(V);
        s.sfx('fanfare');
        void s.anim(c1, [K(VX - AX, 0), K(VX - AX + 44, 0, 0, 1, 1, 0)], 1200, 'linear');
        await s.go(V, [K(0, 0, 0, 1.1, 1.1), K(10, -3, 0, 1.1, 1.1), K(20, 0, 0, 1.1, 1.1), K(30, -3, 0, 1.1, 1.1), K(44, 0, 0, 1.1, 1.1, 0)], 1200, 'linear');
        s.say(A, 'Enjoy the paperwork!', 900);
        await s.anim(c2, [{}, K(AX - VX, 0, 0, 1, 1, 0)], 400);
      },
    },
  ],
} satisfies Record<string, PairBattle[]>);
