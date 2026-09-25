// More battles, mixed and matched so they don't get boring: every piece type has a set of
// signature attacks, and every attack ends with a random "how the victim leaves" ending.
// Together with the hand-made battle for each pair, a capture picks one at random
// (never the same one twice in a row for the same pair).
import type { PieceSymbol } from 'chess.js';
import { at, AX, BATTLES, GROUND, HEAD, K, MID, rand, spin, VX, wiggle, type Battle, type Fighter, type Stage } from './battle';
import {
  BALLOONS,
  BAND,
  BEE,
  BOULDER,
  BRICK,
  CAKE,
  CATAPULT,
  CATAPULT_ARM,
  DRAWBRIDGE,
  FIREWORK,
  FLAMES,
  GUARD,
  HAY_BALE,
  HORSESHOE,
  MAGIC_HAND,
  METEOR,
  MIRROR,
  PEBBLE,
  POGO,
  SLINGSHOT,
  SNOW_GLOBE,
  SNOWBALL,
  SPIRAL,
  STAR_WAND,
  THRONE,
  TOY_SWORD,
  WHITE_FLAG,
} from './props';
import { PAIR_BATTLES } from './pairbattles';
import { TEAM_ATTACKS, TEAM_ENDINGS } from './teamattacks';

/** What kind of hit the attack lands, so the ending fits. */
export type Hit = 'launch' | 'bonk' | 'squash' | 'zap' | 'wet' | 'scare' | 'daze';
export type React = (hit: Hit) => Promise<void>;
export type Attack = { id: string; title: string; run: (s: Stage, A: Fighter, V: Fighter, react: React) => Promise<void> };
export type Ending = { id: string; fits: Hit[]; run: (s: Stage, V: Fighter, A: Fighter) => Promise<void> };

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------------------------------------
// Endings: how the captured piece leaves the board. Nobody gets hurt!
// ---------------------------------------------------------------------------------------------

export const ENDINGS: Ending[] = [
  {
    id: 'twinkle',
    fits: ['launch', 'bonk'],
    async run(s, V) {
      s.mood(V, 'shock');
      s.sfx('slideUp');
      await s.go(V, [K(0, 0, 0), K(10, -40, 300, 0.6), K(16, -70, 620, 0.2), K(18, -76, 720, 0.05, 0.05, 0)], 900, 'ease-out');
      s.twinkle(VX + 18, 8);
      await s.wait(500);
    },
  },
  {
    id: 'crash',
    fits: ['launch'],
    async run(s, V) {
      s.mood(V, 'shock');
      s.sfx('whoosh');
      await s.go(V, [K(0, 0, 0), K(45, -14, 120, 1, 1, 1)], 380, 'ease-in');
      await s.wait(300);
      s.sfx('crash');
      s.shake(1.5);
      s.pow('CRASH!', 88, 34, { size: 7, rot: 12 });
      s.burst(96, 46, ['⭐', '💫', '🔩'], { n: 6, dist: 12 });
      await s.wait(700);
    },
  },
  {
    id: 'bounce',
    fits: ['launch', 'bonk', 'squash'],
    async run(s, V) {
      s.mood(V, 'dizzy');
      s.later(0, () => s.sfx('boing'));
      s.later(350, () => s.sfx('boing'));
      s.later(650, () => s.sfx('boing'));
      await s.go(
        V,
        [K(0, 0), at(0.18, K(10, -24, 90), 'ease-in'), at(0.36, K(20, 0, 180), 'ease-out'), at(0.52, K(28, -15, 270), 'ease-in'), at(0.68, K(36, 0, 360), 'ease-out'), at(0.8, K(42, -8, 420), 'ease-in'), K(56, 0, 520, 1, 1, 0)],
        1200,
        'ease-out',
      );
    },
  },
  {
    id: 'dizzy',
    fits: ['bonk', 'squash', 'daze'],
    async run(s, V) {
      s.mood(V, 'dizzy');
      const stars = s.hold(V, '💫', 0, -18, 9);
      void s.anim(stars, [K(0, 0, 0), K(0, 0, 360)], { duration: 600, iterations: 4, easing: 'linear' });
      s.say(V, pick(['Whoa… so many stars…', 'Which way is up?', 'Mummy?']), 1200);
      await s.fx(V, wiggle(12), 700);
      await s.turn(V);
      s.sfx('wobble');
      await s.go(V, [K(0, 0, 0), K(8, -2, -10), K(14, 0, 10), K(22, -2, -10), K(30, 0, 10), K(42, -2, -10), K(58, 0, 10, 1, 1, 0.2)], 1400, 'linear');
    },
  },
  {
    id: 'flag',
    fits: ['bonk', 'wet', 'scare', 'daze', 'zap'],
    async run(s, V) {
      s.mood(V, 'shock');
      const flag = s.hold(V, WHITE_FLAG, -9, -16, 16);
      await s.anim(flag, [K(0, 14, 0, 1, 0), K(0, 0, 0, 1, 1)], 250, 'ease-out');
      void s.anim(flag, [K(0, 0, -12), K(0, 0, 12), K(0, 0, -12)], { duration: 380, iterations: 4 });
      s.say(V, pick(['I give up!', 'You win! You win!', 'Truce! Truce!']), 1300);
      s.sfx('squeak');
      await s.wait(1300);
      await s.turn(V, 150);
      s.sfx('step');
      await s.go(V, [K(0, 0), K(6, -3), K(12, 0), K(18, -3), K(24, 0), K(30, -3), K(40, 0, 0, 1, 1, 0)], 900, 'linear');
    },
  },
  {
    id: 'pancake',
    fits: ['squash'],
    async run(s, V) {
      s.sfx('squish');
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.6, 0.14)], 140, 'ease-in');
      s.mood(V, 'dizzy');
      s.dust(VX, GROUND, 6);
      s.say(V, pick(['Flat as a pancake!', 'I\'m a doormat!', 'Squished!']), 1200);
      await s.wait(700);
      s.sfx('slideUp');
      await s.go(V, [K(0, 0, 0), K(8, -18, -20), K(0, -38, 20), K(12, -58, -25), K(6, -90, 15, 1, 1, 0)], 1400);
    },
  },
  {
    id: 'stone',
    fits: ['zap', 'bonk'],
    async run(s, V) {
      s.addClass(V, 'stone');
      s.mood(V, 'shock');
      s.sfx('clunk');
      s.pow('STONE!', VX, 40, { color: '#9aa0a6' });
      await s.fx(V, [K(-0.6, 0), K(0.6, 0), K(-0.6, 0), K(0, 0)], { duration: 90, iterations: 5 });
      s.sfx('crash');
      s.pow('CRACK!', VX + 4, 50, { size: 6, color: '#6b6b6b' });
      for (let i = 0; i < 9; i++) {
        const p = s.prop(PEBBLE, VX + rand(-9, 9), HEAD + rand(-2, 16), rand(2.5, 4.5), 'bt-fx');
        const dx = rand(-12, 12);
        void s.anim(p, [K(0, 0, 0), at(0.7, K(dx, GROUND - HEAD - 12, rand(-180, 180)), 'ease-in'), K(dx * 1.2, GROUND - HEAD - 14, rand(-180, 180), 1, 1, 0)], { duration: 900, delay: i * 30 }).then(() => p.remove());
      }
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 10, 0, 1.2, 0.2, 0)], 450, 'ease-in');
      s.dust(VX, GROUND, 8);
      await s.wait(500);
    },
  },
  {
    id: 'confetti',
    fits: ['zap', 'squash', 'bonk', 'scare'],
    async run(s, V) {
      s.mood(V, 'shock');
      s.sfx('shrink');
      s.say(V, pick(['I feel… puffy…', 'Uh oh…', 'Hic!']), 900);
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, -4, 1.25, 1.2), K(0, 0, 4, 1.35, 1.3), K(0, 0, -3, 1.5, 1.45)], 900, 'ease-in');
      s.sfx('fireworks');
      s.flash('#fff6d8', 200);
      s.pow('POP!', VX, 44, { color: '#ff5fa2', size: 11 });
      s.burst(VX, MID - 4, ['🎉', '🎊', '✨', '🌟'], { n: 16, dist: 30 });
      for (let i = 0; i < 18; i++) {
        const c = s.prop('', VX + rand(-4, 4), MID - 6, 2, 'confetto');
        (c.firstElementChild as HTMLElement).style.background = pick(['#ff5a8a', '#ffd23f', '#3ec1ff', '#7ae582', '#b57bff']);
        const dx = rand(-30, 30);
        void s.anim(c, [K(0, 0, 0), at(0.35, K(dx * 0.6, rand(-30, -10), 200)), K(dx, rand(10, 20), 720, 1, 1, 0)], { duration: 1300, easing: 'ease-out' }).then(() => c.remove());
      }
      s.hide(V);
      await s.wait(1100);
    },
  },
  {
    id: 'portal',
    fits: ['zap', 'daze', 'scare'],
    async run(s, V) {
      const portal = s.prop('', VX, GROUND - 1, 24, 'portal');
      await s.anim(portal, [K(0, 0, 0, 0, 0), K(0, 0, 0, 1, 1)], 350, 'ease-out');
      s.mood(V, 'shock');
      s.say(V, pick(['Where does this go?!', 'Wheee!', 'Not the portal!']), 900);
      s.sfx('slideDown');
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, -1, 1), K(0, 0, 0, 1, 1), K(0, 0, 0, -1, 1)], 450);
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 14, 0, 0.3, 0.3, 0)], 500, 'ease-in');
      s.sfx('pop');
      await s.anim(portal, [K(0, 0, 0, 1, 1), K(0, 0, 0, 0, 0)], 300, 'ease-in');
      portal.remove();
      s.twinkle(VX, GROUND - 6);
      await s.wait(400);
    },
  },
  {
    id: 'balloons',
    fits: ['scare', 'daze', 'zap', 'bonk'],
    async run(s, V) {
      const b = s.hold(V, BALLOONS, 0, -24, 18);
      s.sfx('bubble');
      await s.anim(b, [K(0, 10, 0, 0.2), K(0, 0, 0, 1.1), K(0, 0, 0, 1)], 400, 'ease-out');
      s.mood(V, 'happy');
      s.say(V, pick(['Up, up and away!', 'Bye bye!', 'Wheee!']), 1000);
      s.sfx('slideUp');
      await s.go(V, [K(0, 0, 0), K(-4, -20, -6), K(4, -45, 6), K(-3, -70, -5), K(6, -110, 4)], 1800, 'ease-in');
    },
  },
  {
    id: 'dash',
    fits: ['scare', 'wet', 'zap'],
    async run(s, V) {
      s.mood(V, 'shock');
      s.pow(pick(['EEK!', 'YIKES!', 'RUN!']), VX, 40, { color: '#ffb400' });
      s.sfx('squeak');
      await s.go(V, [K(0, 0), K(0, -12), K(0, 0)], 300);
      await s.turn(V, 120);
      s.dust(VX - 6, GROUND, 6);
      for (let i = 0; i < 4; i++) {
        const line = s.prop('', VX - 10, HEAD + i * 5, 10, 'windline');
        void s.anim(line, [K(0, 0, 180, 0.4, 1, 0), at(0.3, K(4, 0, 180, 1, 1, 1)), K(30, 0, 180, 1, 1, 0)], { duration: 500, delay: 100 + i * 50 }).then(() => line.remove());
      }
      s.sfx('whoosh');
      await s.go(V, [K(0, 0, 0), K(-4, 0, -8), K(60, 0, -8)], 600, 'ease-in');
      await s.wait(300);
    },
  },
  {
    id: 'melt',
    fits: ['wet'],
    async run(s, V) {
      s.addClass(V, 'wet');
      s.mood(V, 'sleep');
      s.say(V, pick(['I\'m meltiiiing…', 'Oh nooo…', 'Drip… drop…']), 1300);
      s.sfx('slideDown');
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.1, 0.8), K(0, 0, 0, 1.4, 0.4), K(0, 0, 0, 1.9, 0.12)], 1200, 'ease-in');
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(40, 0, 0, 1, 1, 0)], 900, 'ease-in');
    },
  },
];

async function endWith(s: Stage, V: Fighter, A: Fighter, hit: Hit) {
  // Often the loser leaves the way its theme character would (robots short-circuit, dinos go back in the egg…).
  const own = TEAM_ENDINGS[s.team(V)];
  const forced = s.ending ? (s.ending === 'team' ? own : ENDINGS.find((x) => x.id === s.ending)) : null;
  const e = forced ?? (own && Math.random() < 0.4 ? own : pick(ENDINGS.filter((x) => x.fits.includes(hit))));
  await e.run(s, V, A);
}

// ---------------------------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------------------------

const home = (s: Stage, A: Fighter, from: Keyframe, dur = 450) => s.go(A, [from, K(0, 0, 0)], dur);

/** Stick a prop behind a fighter (a throne, a catapult…) instead of in front of it. */
function behind(f: Fighter, el: HTMLElement) {
  el.style.zIndex = '0';
  f.el.insertBefore(el, f.inner);
}

export const ATTACKS: Record<PieceSymbol, Attack[]> = {
  // ---------------- Pawn ----------------
  p: [
    {
      id: 'slingshot',
      title: 'Slingshot Shot!',
      async run(s, A, V, react) {
        s.hold(A, SLINGSHOT, 13, -4, 14);
        const band = s.hold(A, BAND, 13, -9, 7);
        s.say(A, pick(['Ready… aim…', 'Bullseye time!', 'Pew!']), 900);
        s.sfx('creak');
        await s.anim(band, [K(0, 0, 0, 1, 1), K(-4, 2, 0, 1, 2)], 600, 'ease-in');
        s.sfx('boing');
        void s.anim(band, [K(-4, 2, 0, 1, 2), K(1, -1, 0, 1, 0.5), K(0, 0, 0, 1, 1)], 200);
        const stone = s.prop(PEBBLE, AX + 13, HEAD - 6, 3);
        await s.anim(stone, [K(0, 0, 0), at(0.5, K(22, -12, 360)), K(VX - AX - 16, 2, 720)], 420, 'linear');
        stone.remove();
        s.sfx('bonk');
        s.pow('BONK!', VX - 4, 42);
        s.burst(VX - 4, HEAD - 2, ['⭐'], { n: 5, dist: 10 });
        await s.fx(V, [K(0, 0, 0), K(0, 0, 10), K(0, 0, -4), K(0, 0, 0)], 300);
        await react('bonk');
      },
    },
    {
      id: 'pogo',
      title: 'Pogo Pounce!',
      async run(s, A, V, react) {
        const pogo = s.hold(A, POGO, 0, 14, 24);
        s.say(A, pick(['Boing boing!', 'Bouncy time!']), 800);
        await s.go(A, [K(0, 0), K(0, -12)], 250);
        const hops = [0, 12, 24];
        for (let i = 0; i < hops.length - 1; i++) {
          s.sfx('boing');
          await s.go(A, [K(hops[i], -12), K((hops[i] + hops[i + 1]) / 2, -30), K(hops[i + 1], -12)], 380, 'ease-in-out');
        }
        s.sfx('boing');
        await s.go(A, [K(24, -12), at(0.55, K(38, -50)), K(48, -34)], 500);
        s.pow('BOING!', VX, 36);
        s.sfx('squish');
        void s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.3, 0.55), K(0, 0, 0, 1, 1)], 300);
        void s.go(A, [K(48, -34), at(0.5, K(24, -52)), K(0, -12), K(0, 0)], 700);
        s.later(650, () => pogo.remove());
        await react('squash');
      },
    },
    {
      id: 'snowball',
      title: 'Snowball Fight!',
      async run(s, A, V, react) {
        s.say(A, pick(['Snowball fight!', 'Catch this!', 'Brrr-illiant!']), 900);
        for (let i = 0; i < 3; i++) {
          void s.fx(A, [K(0, 0, 0), K(0, 0, -15), K(0, 0, 10), K(0, 0, 0)], 300);
          s.sfx('whoosh');
          const b = s.prop(SNOWBALL, AX + 10, HEAD - 2, 5);
          const ty = rand(-6, 4);
          await s.anim(b, [K(0, 0, 0), at(0.5, K(20, -16 + ty, 200)), K(VX - AX - 14, ty, 400)], 420, 'linear');
          b.remove();
          s.sfx('splat');
          s.burst(VX - 6, HEAD + ty, ['❄️'], { n: 5, dist: 9, size: 3 });
          void s.fx(V, [K(0, 0, 0), K(0, 0, 6 + i * 3), K(0, 0, 0)], 220);
          await s.wait(120);
        }
        s.addClass(V, 'frozen');
        s.pow('SPLAT!', VX, 40, { color: '#3ec1ff' });
        s.say(V, 'Brrrr!', 700);
        await s.wait(400);
        await react('wet');
      },
    },
    {
      id: 'top',
      title: 'Spinning Top!',
      async run(s, A, _V, react) {
        s.say(A, pick(['Wheee!', 'Spin spin spin!']), 700);
        s.sfx('whirl');
        s.later(450, () => s.sfx('whirl'));
        void s.fx(A, spin(9), { duration: 1000, easing: 'linear' });
        for (let i = 0; i < 3; i++) {
          const line = s.prop('', AX - 8, HEAD + 4 + i * 5, 8, 'windline');
          void s.anim(line, [K(0, 0, 180, 0.4, 1, 0), at(0.4, K(10, 0, 180, 1, 1, 1)), K(30, 0, 180, 1, 1, 0)], { duration: 900, delay: i * 80 }).then(() => line.remove());
        }
        await s.go(A, [K(0, 0), K(6, 0), K(12, -2), K(20, 0), K(28, 0)], 1000, 'ease-in');
        s.sfx('punch');
        s.shake(2);
        s.pow('WHIRR-BONK!', VX - 6, 42, { size: 7 });
        void home(s, A, K(28, 0), 600);
        await react('launch');
      },
    },
    {
      id: 'gum',
      title: 'Bubblegum Blast!',
      async run(s, A, V, react) {
        s.say(A, 'Mmm… chewy…', 800);
        const gum = s.hold(A, '', 9, -3, 3, 'gum');
        s.sfx('squeak');
        await s.anim(gum, [K(0, 0, 0, 1), K(1, 0, 0, 2.5), K(1.5, 0, 0, 2.2), K(3, 0, 0, 4.5), K(3, 0, 0, 4.1), K(5, 0, 0, 6.5)], 1300, 'ease-in');
        s.sfx('pop');
        s.flash('#ffd6ec', 200);
        s.pow('POP!', AX + 20, 44, { color: '#ff5fa2', size: 11 });
        gum.remove();
        for (let i = 0; i < 7; i++) {
          const g = s.prop('', AX + 18, HEAD + rand(-4, 6), rand(2, 3.6), 'gum');
          void s.anim(g, [K(0, 0, 0, 0.5), K(VX - AX - 22 + rand(-4, 8), rand(-8, 10), 0, 1)], { duration: 300, delay: i * 30, easing: 'ease-out' });
          s.later(1500, () => g.remove());
        }
        await s.wait(300);
        s.addClass(V, 'gummy');
        s.mood(V, 'shock');
        s.say(V, pick(['Sticky!', 'Ew, gum!', 'I\'m stuck!']), 900);
        await s.fx(V, wiggle(6), 600);
        await react('wet');
      },
    },
  ],

  // ---------------- Knight ----------------
  n: [
    {
      id: 'horseshoe',
      title: 'Horseshoe Boomerang!',
      async run(s, A, V, react) {
        s.say(A, pick(['Catch!', 'Lucky horseshoe!']), 800);
        const shoe = s.prop(HORSESHOE, AX + 10, HEAD, 7);
        s.sfx('whirl');
        s.later(480, () => {
          s.sfx('clang');
          s.pow('CLANG!', VX, 40, { color: '#9aa0a6' });
          s.mood(V, 'dizzy');
          void s.fx(V, [K(0, 0, 0), K(0, 0, 14), K(0, 0, -6), K(0, 0, 0)], 400);
        });
        await s.anim(shoe, [K(0, 0, 0), at(0.25, K(22, -16, 360)), at(0.45, K(VX - AX - 12, -4, 720)), at(0.7, K(26, 14, 1080)), K(0, 0, 1440, 1, 1, 0)], 1100, 'linear');
        shoe.remove();
        s.say(A, 'Got it back!', 600);
        await react('bonk');
      },
    },
    {
      id: 'stomp',
      title: 'Rodeo Stomp!',
      async run(s, A, _V, react) {
        s.say(A, pick(['Yee-haw!', 'Giddy-up!']), 800);
        s.origin(A, '70% 88%');
        await s.fx(A, [K(0, 0, 0), K(0, 0, 28)], 400, 'ease-out');
        s.sfx('gallop');
        await s.wait(200);
        await s.fx(A, [K(0, 0, 28), K(0, 0, -6), K(0, 0, 0)], 180, 'ease-in');
        s.sfx('thud');
        s.shake(3);
        s.dust(AX, GROUND, 6);
        for (let i = 0; i < 3; i++) {
          const w = s.prop('', AX + 8, GROUND, 14, 'shockwave');
          void s.anim(w, [K(0, 0, 0, 0.3, 0.3, 1), K(VX - AX - 8, 0, 0, 1.4, 1.4, 0)], { duration: 600, delay: i * 120, easing: 'ease-out' }).then(() => w.remove());
        }
        s.pow('STOMP!', 50, 44, { color: '#c0522d' });
        await s.wait(550);
        await react('launch');
      },
    },
    {
      id: 'hay',
      title: 'Hay Bale Bowling!',
      async run(s, A, _V, react) {
        const hay = s.prop(HAY_BALE, AX + 16, GROUND - 5, 10);
        await s.anim(hay, [K(0, -40, 0, 1, 1, 0), K(0, 0, 0)], 350, 'ease-in');
        s.sfx('thud');
        s.say(A, pick(['Strike!', 'Bowling time!']), 800);
        await s.wait(200);
        s.origin(A, '50% 88%');
        await s.fx(A, [K(0, 0, 0), K(0, 0, -20), K(0, 0, 10), K(0, 0, 0)], 350);
        s.sfx('rumble');
        await s.anim(hay, [K(0, 0, 0), K(VX - AX - 30, 0, 540)], 650, 'ease-in');
        s.sfx('punch');
        s.pow('THUMP!', VX - 4, 44);
        s.burst(VX - 8, GROUND - 6, ['🌾'], { n: 6, dist: 12 });
        void s.anim(hay, [K(VX - AX - 30, 0, 540), K(VX - AX - 40, -10, 480), K(VX - AX - 46, 0, 420, 1, 1, 0)], 600);
        await react('launch');
      },
    },
    {
      id: 'neigh',
      title: 'Mighty Neigh!',
      async run(s, A, V, react) {
        s.origin(A, '70% 88%');
        await s.fx(A, [K(0, 0, 0), K(0, 0, 18)], 300);
        s.pow('NEIGHHH!', AX + 8, 38, { size: 9, color: '#ff7a00', dur: 1200 });
        s.sfx('fanfare');
        for (let i = 0; i < 5; i++) {
          const r = s.prop('', AX + 14, HEAD - 2, 10, 'soundwave');
          void s.anim(r, [K(0, 0, 0, 0.3, 0.6, 1), K(VX - AX - 12, 0, 0, 1.3, 1.6, 0)], { duration: 600, delay: i * 130, easing: 'ease-out' }).then(() => r.remove());
        }
        s.mood(V, 'shock');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 12), K(0, 0, 8), K(0, 0, 15)], 900);
        void s.fx(A, [K(0, 0, 18), K(0, 0, 0)], 300);
        await react('launch');
      },
    },
    {
      id: 'flip',
      title: 'Somersault Kick!',
      async run(s, A, V, react) {
        s.say(A, pick(['Watch this!', 'Hi-yah!']), 700);
        await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.1, 0.8)], 200);
        s.sfx('whoosh');
        s.origin(A, '50% 55%');
        void s.fx(A, [K(0, 0, 0, 1.1, 0.8), K(0, 0, -360, 1, 1)], 650, 'ease-in-out');
        await s.go(A, [K(0, 0), at(0.5, K(14, -34), 'ease-out'), K(24, 0)], 650, 'ease-in');
        s.dust(AX + 24, GROUND, 4);
        await s.fx(A, [K(0, 0, 0), K(0, 0, -25), K(0, 0, 0)], 250);
        s.sfx('punch');
        s.pow('HI-YAH!', VX - 4, 40);
        s.burst(VX - 8, MID, ['💥'], { n: 3, dist: 8 });
        void s.fx(V, [K(0, 0, 0), K(0, 0, 12), K(0, 0, 0)], 300);
        void home(s, A, K(24, 0), 500);
        await react('bonk');
      },
    },
  ],

  // ---------------- Bishop ----------------
  b: [
    {
      id: 'meteor',
      title: 'Meteor Shower!',
      async run(s, A, V, react) {
        const w = s.hold(A, '🪄', 12, -8, 9);
        s.say(A, pick(['Stars, fall!', 'Meteor-ific!']), 900);
        void s.anim(w, [K(0, 0, -20), K(0, -3, 30), K(0, 0, -20)], { duration: 400, iterations: 3 });
        const spots = [VX - 16, VX + 12, VX - 6];
        for (const x of spots) {
          const m = s.prop(METEOR, x + 24, 4, 7);
          s.sfx('whistle');
          await s.anim(m, [K(0, 0, 0), K(-24, GROUND - 10, 0)], 420, 'ease-in');
          m.remove();
          s.sfx('thud');
          s.dust(x, GROUND, 4);
          s.burst(x, GROUND - 4, ['🔥', '✨'], { n: 4, dist: 8 });
          s.mood(V, 'shock');
          await s.wait(120);
        }
        const big = s.prop(METEOR, VX + 30, -10, 14);
        s.sfx('whistle');
        await s.anim(big, [K(0, 0, 0), K(-30, HEAD - 2, 0)], 500, 'ease-in');
        big.remove();
        s.sfx('boom');
        s.flash('#ffe8b0');
        s.shake(3);
        s.pow('KA-BOOM!', VX, 38, { size: 10 });
        s.burst(VX, HEAD, ['🔥', '⭐', '💥'], { n: 10, dist: 18 });
        await react('squash');
      },
    },
    {
      id: 'bees',
      title: 'Bee Swarm!',
      async run(s, A, V, react) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, pick(['Buzz off!', 'Bee-hold!']), 900);
        s.sfx('sparkle');
        const bees: HTMLElement[] = [];
        for (let i = 0; i < 6; i++) {
          const b = s.prop(BEE, AX + 12, HEAD - 8, 4.2);
          bees.push(b);
          const ox = rand(-6, 6);
          const oy = rand(-10, 6);
          void s.anim(b, [K(0, 0, 0, 0), at(0.2, K(6, -6 + oy, 0, 1)), at(0.45, K(18, 4 + oy, 10)), at(0.7, K(30, -8 + oy, -10)), K(VX - AX - 12 + ox, oy, 0)], { duration: 1200, delay: i * 90 });
        }
        s.later(200, () => s.sfx('wobble'));
        s.later(700, () => s.sfx('wobble'));
        await s.wait(1300);
        s.mood(V, 'shock');
        s.say(V, pick(['BEES!!', 'Not the bees!', 'Buzzzz!']), 800);
        bees.forEach((b, i) => void s.anim(b, [{}, K(VX - AX - 12 + rand(-10, 10), rand(-14, 8), 0)], { duration: 250, iterations: 3, direction: 'alternate', delay: i * 20 }));
        await s.fx(V, wiggle(10), 700);
        bees.forEach((b) => void s.anim(b, [{}, K(VX - AX + 40, rand(-20, 0), 0, 1, 1, 0)], { duration: 1100, delay: 350, easing: 'ease-in' }).then(() => b.remove()));
        await react('scare');
      },
    },
    {
      id: 'hand',
      title: 'Giant Magic Hand!',
      async run(s, A, V, react) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, pick(['Hand of magic!', 'Flick!']), 800);
        s.sfx('sparkle');
        const hand = s.prop(MAGIC_HAND, VX - 26, MID - 6, 18);
        await s.anim(hand, [K(-6, 6, -10, 0.3, 0.3, 0), K(0, 0, -10, 1, 1, 1)], 450, 'ease-out');
        s.mood(V, 'shock');
        s.say(V, 'Uh oh…', 700);
        await s.anim(hand, [K(0, 0, -10), K(-6, 0, -25)], 400);
        s.sfx('punch');
        await s.anim(hand, [K(-6, 0, -25), K(8, -2, 15)], 120, 'ease-in');
        s.pow('FLICK!', VX, 40, { color: '#9b5cff' });
        s.burst(VX - 6, MID, ['✨'], { n: 6, dist: 12 });
        void s.anim(hand, [K(8, -2, 15), K(0, -10, 0, 0.6, 0.6, 0)], 600).then(() => hand.remove());
        await react('launch');
      },
    },
    {
      id: 'hypno',
      title: 'Hypno Spiral!',
      async run(s, A, V, react) {
        const sp = s.hold(A, SPIRAL, 14, -8, 10);
        s.say(A, pick(['You are getting sleepy…', 'Look into my spiral…']), 1400);
        void s.anim(sp.firstElementChild as HTMLElement, [{ transform: 'translate(-50%,-50%) rotate(0deg)' }, { transform: 'translate(-50%,-50%) rotate(360deg)' }], { duration: 700, iterations: 4, easing: 'linear' });
        s.sfx('whirl');
        s.later(700, () => s.sfx('whirl'));
        await s.wait(900);
        s.mood(V, 'dizzy');
        await s.fx(V, [K(0, 0, -8), K(0, 0, 8), K(0, 0, -8), K(0, 0, 8), K(0, 0, 0)], 1200);
        s.say(V, pick(['Yes… sleepy…', 'So… swirly…', 'Zzz… huh?']), 900);
        await react('daze');
      },
    },
    {
      id: 'globe',
      title: 'Snow Globe Spell!',
      async run(s, A, V) {
        s.hold(A, '🪄', 12, -8, 9);
        s.say(A, pick(['Let it snow!', 'Into the globe!']), 900);
        s.sfx('sparkle');
        await s.wait(500);
        const globe = s.prop(SNOW_GLOBE, VX, MID - 4, 32);
        s.sfx('freeze');
        await s.anim(globe, [K(0, -60, 0, 0.8), K(0, 2, 0, 1), K(0, 0, 0, 1)], 500, 'ease-in');
        s.mood(V, 'shock');
        s.say(V, 'Hey! Let me out!', 900);
        for (let i = 0; i < 12; i++) {
          const f = s.prop('❄️', VX + rand(-9, 9), HEAD - 8 + rand(-4, 4), 2.5, 'bt-fx');
          void s.anim(f, [K(0, 0, 0, 1, 1, 0), at(0.2, K(0, 0, 0, 1, 1, 1)), K(rand(-3, 3), 16, 180, 1, 1, 0)], { duration: 1200, delay: i * 80 }).then(() => f.remove());
        }
        await s.anim(globe, [K(0, 0, 0), K(0, 0, -8), K(0, 0, 8), K(0, 0, -8), K(0, 0, 0)], 800);
        s.say(A, 'A lovely souvenir!', 900);
        s.sfx('slideDown');
        void s.anim(globe, [K(0, 0, 0), K(40, 0, 400, 1, 1, 0.3)], 1000, 'ease-in');
        await s.go(V, [K(0, 0, 0), K(40, 0, 400, 1, 1, 0.3)], 1000, 'ease-in');
      },
    },
  ],

  // ---------------- Rook ----------------
  r: [
    {
      id: 'rocket',
      title: 'Rocket Tower!',
      async run(s, A, V, react) {
        s.say(A, '3… 2… 1…', 1000);
        const fl = s.hold(A, FLAMES, 0, 16, 9);
        void s.anim(fl, [K(0, 0, 180, 0.8, 0.8), K(0, 1, 180, 1.2, 1.3), K(0, 0, 180, 0.8, 0.8)], { duration: 160, iterations: 14 });
        s.sfx('rumble');
        await s.fx(A, [K(-0.5, 0), K(0.5, 0), K(-0.5, 0), K(0, 0)], { duration: 100, iterations: 8 });
        s.sfx('rocket');
        s.dust(AX, GROUND, 8);
        await s.go(A, [K(0, 0), K(0, -110)], 600, 'ease-in');
        s.mood(V, 'shock');
        s.say(V, 'Where did it go?', 800);
        await s.wait(700);
        s.sfx('whistle');
        void s.anim(fl, [{ opacity: 0 }], 1);
        await s.go(A, [K(48, -110, 180), K(48, -110, 180)], 1);
        await s.go(A, [K(48, -110, 180), K(48, -24, 180)], 500, 'ease-in');
        s.sfx('boom');
        s.flash();
        s.shake(3);
        s.pow('KA-THUNK!', VX, 32, { size: 9 });
        void s.go(A, [K(48, -24, 180), at(0.5, K(24, -46, 90)), K(0, 0, 0)], 800);
        await react('squash');
      },
    },
    {
      id: 'catapult',
      title: 'Catapult Boulder!',
      async run(s, A, _V, react) {
        const cat = s.prop(CATAPULT, AX + 18, GROUND - 5, 15);
        const arm = s.prop(CATAPULT_ARM, AX + 18, GROUND - 11, 12, 'pivot-left');
        const rock = s.prop(BOULDER, AX + 9, GROUND - 13, 5);
        void s.anim(arm, [K(0, 0, 170), K(0, 0, 170)], 1);
        await s.anim(cat, [K(-30, 0, 0, 1, 1, 0), K(0, 0, 0)], 350, 'ease-out');
        s.say(A, pick(['Load the catapult!', 'Fire!']), 900);
        s.sfx('creak');
        await s.wait(500);
        s.sfx('boing');
        await s.anim(arm, [K(0, 0, 170), K(0, 0, 300)], 180, 'ease-in');
        s.sfx('whoosh');
        await s.anim(rock, [K(0, 0, 0), at(0.5, K(20, -40, 300)), K(VX - AX - 9, -8, 600)], 700, 'linear');
        rock.remove();
        s.sfx('crash');
        s.shake(2);
        s.pow('CRUNCH!', VX, 38);
        s.burst(VX, HEAD - 4, ['⭐', '💫'], { n: 6, dist: 12 });
        void s.anim(cat, [K(0, 0, 0), K(-30, 0, 0, 1, 1, 0)], 600, 'ease-in');
        void s.anim(arm, [K(0, 0, 300), K(0, 0, 300, 1, 1, 0)], 400);
        await react('bonk');
      },
    },
    {
      id: 'drawbridge',
      title: 'Drawbridge Slam!',
      async run(s, A, V, react) {
        s.say(A, pick(['Lower the bridge!', 'Incoming!']), 900);
        const bridge = s.prop(DRAWBRIDGE, AX + 10, GROUND - 3, 50, 'pivot-bottom');
        const tip = document.createElement('i');
        tip.className = 'bt-marker';
        bridge.firstElementChild!.append(tip);
        const top = s.hold(A, '', 6, -12, 1);
        const chain1 = s.tether(top, tip, '#6b7280');
        s.sfx('creak');
        await s.anim(bridge, [K(0, 0, -6), K(0, 0, 20)], 700, 'ease-in');
        s.mood(V, 'shock');
        s.sfx('whistle');
        await s.anim(bridge, [K(0, 0, 20), K(0, 0, 88)], 300, 'ease-in');
        s.sfx('thud');
        s.shake(3);
        s.pow('WHAM!', VX, 40);
        s.dust(VX, GROUND, 8);
        await s.wait(250);
        void s.anim(bridge, [K(0, 0, 88), K(0, 0, 0, 1, 1, 0)], 700).then(() => {
          chain1();
          bridge.remove();
        });
        await react('squash');
      },
    },
    {
      id: 'bricks',
      title: 'Brick Barrage!',
      async run(s, A, V, react) {
        s.say(A, pick(['Brick by brick!', 'Special delivery!']), 900);
        for (let i = 0; i < 5; i++) {
          const b = s.prop(BRICK, AX + 6, HEAD - 12, 3.5);
          s.sfx('pop');
          void s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.06, 0.94), K(0, 0, 0, 1, 1)], 150);
          const ty = rand(-6, 6);
          void s.anim(b, [K(0, 0, 0), at(0.5, K(24, -14 + ty, 360)), K(VX - AX - 14, 6 + ty, 720)], 480, 'linear').then(() => {
            s.sfx('bonk');
            void s.fx(V, [K(0, 0, 0), K(0, 0, 5 + i * 2), K(0, 0, 0)], 180);
            void s.anim(b, [{}, K(VX - AX - 20 + rand(-6, 6), GROUND - HEAD + 8, rand(-40, 40))], 400, 'ease-in');
            s.later(1400, () => b.remove());
          });
          await s.wait(200);
        }
        await s.wait(400);
        s.pow('THUNK!', VX, 38, { color: '#c0522d' });
        await react('bonk');
      },
    },
    {
      id: 'roll',
      title: 'Tower Tumble!',
      async run(s, A, V, react) {
        s.say(A, pick(['Timberrr… I mean, rolling!', 'Roll out!']), 900);
        s.origin(A, '50% 60%');
        await s.fx(A, [K(0, 0, 0), K(0, 0, 90)], 350, 'ease-in');
        s.sfx('rumble');
        void s.fx(A, [K(0, 0, 90), K(0, 0, 810)], 900, 'ease-in');
        await s.go(A, [K(0, 4), K(26, 4)], 900, 'ease-in');
        s.sfx('crash');
        s.shake(2.5);
        s.pow('KA-THUNK!', VX - 4, 40);
        s.mood(V, 'shock');
        void s.fx(A, [K(0, 0, 810), K(0, 0, 720)], 400);
        void s.go(A, [K(26, 4), K(0, 0)], 700);
        await react('launch');
      },
    },
  ],

  // ---------------- Queen ----------------
  q: [
    {
      id: 'fireworks',
      title: 'Royal Fireworks!',
      async run(s, A, _V, react) {
        s.say(A, pick(['Let\'s celebrate!', 'Showtime!']), 900);
        const targets: [number, number][] = [[VX - 16, 30], [VX + 12, 26], [VX, MID - 6]];
        for (const [x, y] of targets) {
          const r = s.prop(FIREWORK, AX + 10, HEAD - 6, 7);
          s.sfx('whistle');
          const ang = (Math.atan2(y - HEAD + 6, x - AX - 10) * 180) / Math.PI + 90;
          await s.anim(r, [K(0, 0, ang), K(x - AX - 10, y - HEAD + 6, ang)], 380, 'ease-in');
          r.remove();
          s.sfx('fireworks');
          s.burst(x, y, ['✨', '🌟', '💖', '⭐'], { n: 12, dist: 16 });
          for (let i = 0; i < 10; i++) {
            const c = s.prop('', x, y, 1.6, 'spark');
            (c.firstElementChild as HTMLElement).style.background = pick(['#ff5a8a', '#ffd23f', '#3ec1ff', '#b57bff']);
            const a = (i / 10) * Math.PI * 2;
            void s.anim(c, [K(0, 0), K(Math.cos(a) * 14, Math.sin(a) * 14 + 6, 0, 1, 1, 0)], 700, 'ease-out').then(() => c.remove());
          }
        }
        s.flash('#fff0f8');
        s.pow('KABLOOEY!', VX, 40, { color: '#ff5fa2' });
        await react('zap');
      },
    },
    {
      id: 'mirror',
      title: 'Magic Mirror!',
      async run(s, A, V, react) {
        s.say(A, pick(['Mirror, mirror…', 'Who\'s the silliest of them all?']), 1100);
        const m = s.prop(MIRROR, VX - 16, HEAD + 2, 22);
        const face = s.prop('😜', VX - 16, HEAD - 1, 8);
        (face as HTMLElement).style.opacity = '0';
        await s.anim(m, [K(0, -40, 0, 0.5, 0.5, 0), K(0, 0, 0)], 450, 'ease-out');
        s.sfx('sparkle');
        await s.wait(500);
        s.sfx('boing');
        await s.anim(face, [K(0, 0, 0, 0.2, 0.2, 0), K(0, 0, -10, 1.3, 1.3, 1), K(0, 0, 10, 1, 1, 1)], 400);
        s.pow('BOO!', VX - 16, 34, { color: '#9b5cff' });
        s.mood(V, 'shock');
        await s.go(V, [K(0, 0), K(0, -12), K(0, 0)], 350);
        void s.anim(m, [{}, K(0, -40, 0, 0.5, 0.5, 0)], 500).then(() => m.remove());
        void s.anim(face, [{}, K(0, -40, 0, 0.5, 0.5, 0)], 500).then(() => face.remove());
        await react('scare');
      },
    },
    {
      id: 'starbeam',
      title: 'Star Beam!',
      async run(s, A, V, react) {
        s.say(A, pick(['Powering up…', 'Sparkle power!']), 1000);
        const orb = s.prop('', AX + 12, HEAD - 8, 6, 'orb');
        s.stream(['✨', '⭐'], AX + 30, HEAD - 30, AX + 12, HEAD - 8, 8, 70, 6, 3);
        s.sfx('shrink');
        await s.anim(orb, [K(0, 0, 0, 0.2), K(0, 0, 90, 1.2), K(0, 0, 180, 1.8)], 900, 'ease-in');
        s.sfx('zap');
        const beam = s.beam(AX + 14, HEAD - 8, VX - 2, HEAD - 2, 'beam-star', 150);
        s.flash('#fffbe0', 250);
        s.addClass(V, 'zapped');
        s.mood(V, 'shock');
        s.pow('ZAAAP!', VX, 36, { color: '#ffd000' });
        await s.fx(V, [K(-1, 0), K(1, 0)], { duration: 70, iterations: 10 });
        beam.remove();
        orb.remove();
        V.inner.classList.remove('zapped');
        await react('zap');
      },
    },
    {
      id: 'waltz',
      title: 'Whirlwind Waltz!',
      async run(s, A, V, react) {
        s.say(A, pick(['May I have this dance?', 'Shall we waltz?']), 1000);
        s.sfx('music');
        s.mood(A, 'happy');
        await s.go(A, [K(0, 0), K(22, 0)], 500);
        s.mood(V, 'shock');
        // Spin round together, then let go.
        const cx = 50;
        const rA: Keyframe[] = [];
        const rV: Keyframe[] = [];
        const n = 16;
        for (let i = 0; i <= n; i++) {
          const t = Math.PI + (i / n) * Math.PI * 2;
          const x = cx + Math.cos(t) * 12;
          const y = Math.sin(t) * 4;
          rA.push(K(x - AX, y));
          rV.push(K(cx - Math.cos(t) * 12 - VX, -y));
        }
        s.stream(['🎵', '🎶'], 50, HEAD, 50, 20, 6, 150, 12, 4);
        void s.go(A, [K(22, 0), rA[0]], 200);
        await s.go(V, [K(0, 0), rV[0]], 200);
        s.sfx('whirl');
        void s.go(A, rA, 1400, 'linear');
        await s.go(V, rV, 1400, 'linear');
        s.say(A, 'And… twirl!', 600);
        s.sfx('whoosh');
        void home(s, A, rA[rA.length - 1], 600);
        void s.fx(V, spin(3), { duration: 400, easing: 'linear' });
        await s.go(V, [rV[rV.length - 1], K(0, 0)], 400, 'ease-out');
        await react('launch');
      },
    },
    {
      id: 'wand',
      title: 'Giant Wand Bop!',
      async run(s, A, V, react) {
        s.say(A, pick(['Bippity-BOP!', 'Magic bop!']), 900);
        const w = s.prop(STAR_WAND, AX + 12, HEAD + 6, 40, 'pivot-bottom');
        s.sfx('sparkle');
        await s.anim(w, [K(0, 0, -40, 0.3, 0.3, 0), K(0, 0, -30, 1, 1, 1)], 400, 'ease-out');
        await s.anim(w, [K(0, 0, -30), K(0, 0, -50)], 350);
        s.sfx('whoosh');
        await s.anim(w, [K(0, 0, -50), K(0, 0, 64)], 220, 'ease-in');
        s.sfx('bonk');
        s.pow('BOP!', VX, 38, { size: 12, color: '#ffb400' });
        s.burst(VX, HEAD - 6, ['⭐', '✨'], { n: 8, dist: 14 });
        s.shake(2);
        await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.2, 0.75), K(0, 0, 0, 1, 1)], 300);
        void s.anim(w, [K(0, 0, 64), K(0, 0, 0, 0.3, 0.3, 0)], 500).then(() => w.remove());
        await react('bonk');
      },
    },
  ],

  // ---------------- King ----------------
  k: [
    {
      id: 'guards',
      title: 'Royal Guards!',
      async run(s, A, V) {
        s.say(A, pick(['Guards! Guards!', 'Take them away! Gently!']), 1100);
        s.sfx('fanfare');
        const guards = [0, 1, 2].map((i) => s.prop(GUARD, -10 - i * 9, GROUND - 9, 18));
        const march = (el: HTMLElement, x1: number, x2: number, dur: number) => {
          const f: Keyframe[] = [];
          for (let i = 0; i <= 10; i++) f.push(K(x1 + ((x2 - x1) * i) / 10, i % 2 ? -1.5 : 0));
          return s.anim(el, f, dur, 'linear');
        };
        s.later(0, () => s.sfx('step'));
        s.later(400, () => s.sfx('step'));
        s.later(800, () => s.sfx('step'));
        s.say(V, 'Uh oh…', 700);
        await Promise.all(guards.map((g, i) => march(g, 0, VX - 6 + i * 9, 1400)));
        s.mood(V, 'shock');
        s.bubble('Hup! Two! Hup!', VX, 44, 900);
        await s.go(V, [K(0, 0), K(0, -10)], 300);
        s.later(0, () => s.sfx('step'));
        s.later(400, () => s.sfx('step'));
        void Promise.all(guards.map((g, i) => march(g, VX - 6 + i * 9, VX + 60 + i * 9, 1300)));
        await s.go(V, [K(0, -10), K(8, -11), K(16, -10), K(24, -11), K(32, -10), K(60, -10, 0, 1, 1, 0.3)], 1300, 'linear');
      },
    },
    {
      id: 'throne',
      title: 'Throne Rocket!',
      async run(s, A, _V, react) {
        const throne = s.hold(A, THRONE, -2, -2, 32);
        behind(A, throne);
        await s.anim(throne, [K(0, -40, 0, 1, 1, 0), K(0, 0, 0)], 400, 'ease-in');
        s.sfx('thud');
        s.say(A, pick(['To battle, my throne!', 'Royal express!']), 900);
        const fl = s.hold(A, FLAMES, -16, 8, 9);
        behind(A, fl);
        void s.anim(fl, [K(0, 0, -90, 0.8), K(-1, 0, -90, 1.3), K(0, 0, -90, 0.8)], { duration: 150, iterations: 12 });
        s.sfx('rocket');
        await s.fx(A, [K(-0.5, 0), K(0.5, 0)], { duration: 80, iterations: 6 });
        await s.go(A, [K(0, 0), K(28, -2)], 350, 'ease-in');
        s.sfx('punch');
        s.shake(3);
        s.flash();
        s.pow('VROOM-POW!', VX - 4, 40, { size: 8 });
        void s.anim(fl, [{ opacity: 0 }], 200);
        void home(s, A, K(28, -2), 700);
        await react('launch');
      },
    },
    {
      id: 'laser',
      title: 'Crown Laser!',
      async run(s, A, V, react) {
        s.say(A, pick(['Crown power, activate!', 'Royal zap!']), 1000);
        const glow = s.prop('', AX, HEAD - 10, 5, 'orb');
        await s.anim(glow, [K(0, 0, 0, 0.2), K(0, 0, 0, 1.4), K(0, 0, 0, 1)], 700);
        s.sfx('zap');
        const b1 = s.beam(AX, HEAD - 10, VX - 2, HEAD, 'beam-red', 150);
        const b2 = s.beam(AX + 2, HEAD - 8, VX - 2, HEAD + 4, 'beam-red', 150);
        s.addClass(V, 'zapped');
        s.mood(V, 'shock');
        s.pow('PEW PEW!', VX, 36, { color: '#ff4757' });
        await s.fx(V, [K(-1, 0), K(1, 0)], { duration: 70, iterations: 9 });
        b1.remove();
        b2.remove();
        glow.remove();
        V.inner.classList.remove('zapped');
        await react('zap');
      },
    },
    {
      id: 'banquet',
      title: 'Royal Banquet!',
      async run(s, A, V, react) {
        s.say(A, pick(['Let them eat cake!', 'Food fight!']), 1000);
        for (let i = 0; i < 2; i++) {
          const c = s.prop(CAKE, AX + 10, HEAD - 4, 8);
          void s.fx(A, [K(0, 0, 0), K(0, 0, -12), K(0, 0, 8), K(0, 0, 0)], 300);
          s.sfx('whoosh');
          const miss = i === 0;
          await s.anim(c, [K(0, 0, 0), at(0.5, K(22, -20, 200)), K(VX - AX - (miss ? -6 : 12), miss ? GROUND - HEAD - 2 : 0, 360)], 520, 'linear');
          c.remove();
          s.sfx('splat');
          if (miss) {
            s.burst(VX + 16, GROUND - 4, ['🤍'], { n: 5, dist: 8, size: 3 });
            s.say(V, 'Ha! Missed!', 700);
            s.mood(V, 'happy');
            await s.wait(500);
          } else {
            s.pow('SPLAT!', VX, 40, { color: '#fff' });
            s.hold(V, '', 0, -5, 15, 'cream');
            s.mood(V, 'shock');
          }
        }
        await react('wet');
      },
    },
    {
      id: 'knighting',
      title: 'Royal Knighting!',
      async run(s, A, V, react) {
        const sword = s.hold(A, TOY_SWORD, 12, -6, 18, 'pivot-left');
        void s.anim(sword, [K(0, 0, -70), K(0, 0, -70)], 1);
        s.say(A, 'Kneel, please…', 900);
        await s.go(A, [K(0, 0), K(20, 0)], 600);
        s.sfx('royal');
        for (const r of [10, -40, 10]) {
          await s.anim(sword, [{}, K(0, 0, r)], 300);
          s.sfx('ding');
          s.burst(VX - 4, HEAD - 4, ['✨'], { n: 3, dist: 6 });
        }
        s.say(A, pick(['I dub thee… Sir Out-Of-Here!', 'Arise… and fly away!']), 1300);
        s.addClass(V, 'glow');
        void s.anim(sword, [{}, K(0, 0, -70, 0.3, 0.3, 0)], 400);
        await s.wait(900);
        void home(s, A, K(20, 0), 500);
        await react('launch');
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Picking a battle
// ---------------------------------------------------------------------------------------------

export interface BattleChoice extends Battle {
  id: string;
  weight: number; // how likely a random pick is
  pair?: boolean; // written for exactly this attacker and victim
  team?: boolean; // one of the attacking team's character moves
}

/**
 * Every battle a pair can have: its own special one, the attacker's piece attacks, and (in a themed
 * game) the attacking team's character moves, which are picked more often so battles fit the characters.
 */
export function battleOptions(a: PieceSymbol, v: PieceSymbol, team?: string): BattleChoice[] {
  const special = BATTLES[a + v] ?? BATTLES[`${a}p`];
  const wrap = (atk: Attack) => (s: Stage, A: Fighter, V: Fighter) => atk.run(s, A, V, (hit) => endWith(s, V, A, hit));
  return [
    // Pair specials (written for exactly this attacker and victim) are the most likely.
    { id: 'special', title: special.title, run: special.run, weight: 3, pair: true },
    ...(PAIR_BATTLES[a + v] ?? []).map((b) => ({ id: `pair-${b.id}`, title: b.title, run: b.run, weight: 3, pair: true })),
    ...ATTACKS[a].map((atk) => ({ id: atk.id, title: atk.title, run: wrap(atk), weight: 1 })),
    ...(TEAM_ATTACKS[team ?? ''] ?? []).map((atk) => ({ id: `team-${atk.id}`, title: atk.title, run: wrap(atk), weight: 2.5, team: true })),
  ];
}

const recent = new Map<string, string[]>();

/** A random battle for the pair, avoiding the last couple it had. `id` picks a specific one. */
export function pickBattle(a: PieceSymbol, v: PieceSymbol, id?: string, team?: string): BattleChoice {
  const all = battleOptions(a, v, team);
  const wanted = id && all.find((b) => b.id === id);
  if (wanted) return wanted;
  const key = `${team}${a}${v}`;
  const seen = recent.get(key) ?? [];
  const fresh = all.filter((b) => !seen.includes(b.id));
  const pool = fresh.length ? fresh : all;
  let r = Math.random() * pool.reduce((t, b) => t + b.weight, 0);
  const choice = pool.find((b) => (r -= b.weight) <= 0) ?? pool[0];
  recent.set(key, [...seen, choice.id].slice(-2));
  return choice;
}

// ---------------------------------------------------------------------------------------------
// Little extras: a random taunt before the fight and a random victory pose after it
// ---------------------------------------------------------------------------------------------

export async function taunt(s: Stage, A: Fighter, V: Fighter) {
  switch (Math.floor(Math.random() * 5)) {
    case 0:
      s.say(A, pick(['Ready?', 'Here I come!', 'En garde!', 'Let\'s go!']), 800);
      await s.go(A, [K(0, 0), K(0, -6), K(0, 0)], 300);
      break;
    case 1:
      s.mood(A, 'angry');
      s.sfx('thud');
      s.dust(AX, GROUND, 3);
      await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.08, 0.9), K(0, 0, 0, 1, 1)], 300);
      s.mood(A, null);
      break;
    case 2:
      s.say(V, pick(['Gulp!', 'Oh no…', 'Uh-oh!', 'Can we talk about this?']), 800);
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 0.94, 1.05), K(0, 0, 0, 1, 1)], 300);
      break;
    case 3:
      s.say(V, pick(['Bring it on!', 'You don\'t scare me!', 'Hmph!']), 800);
      s.mood(V, 'angry');
      await s.wait(500);
      s.mood(V, null);
      break;
    default:
      break;
  }
}

export async function victory(s: Stage, A: Fighter, spark: string) {
  s.mood(A, 'happy');
  s.sfx('tada');
  const cheer = () => s.say(A, pick(['Yay!', 'Too easy!', 'Hooray!', 'Victory!', 'Woo-hoo!', 'Nailed it!']), 900);
  switch (Math.floor(Math.random() * 5)) {
    case 0:
      s.burst(A.cx, HEAD - 6, [spark, '⭐'], { n: 6, dist: 12 });
      await s.go(A, [K(0, 0), K(0, -8), K(0, 0), K(0, -5), K(0, 0)], 600);
      break;
    case 1:
      cheer();
      s.burst(A.cx, HEAD, [spark, '✨'], { n: 8, dist: 14 });
      await s.fx(A, spin(3), { duration: 600, easing: 'linear' });
      break;
    case 2:
      s.say(A, pick(['Thank you, thank you!', 'Ta-da!', '*bows*']), 900);
      s.origin(A, '50% 88%');
      await s.fx(A, [K(0, 0, 0), K(0, 0, 22), K(0, 0, 22), K(0, 0, 0)], 800);
      break;
    case 3:
      cheer();
      s.stream(['🎵', '🎶'], A.cx, HEAD, A.cx + 6, 24, 4, 120, 6, 4);
      await s.fx(A, [K(0, 0, -10), K(0, -3, 0), K(0, 0, 10), K(0, -3, 0), K(0, 0, -10), K(0, 0, 0)], 800);
      break;
    default:
      cheer();
      s.pow('⭐', A.cx, HEAD - 14, { size: 12, color: '#ffd23f', rot: 0 });
      await s.go(A, [K(0, 0), K(0, -14, 0, 1.1, 1.1), K(0, 0)], 600);
      break;
  }
}
