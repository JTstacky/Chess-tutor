// Character moves: in a themed game every team fights the way its characters would.
// Dragons breathe fire, robots fire lasers, aliens beam you up, sharks chomp, cupcakes
// throw sprinkles, T-rexes roar… and the loser leaves the way its character would too.
import type { Attack, Ending } from './attacks';
import { at, AX, GROUND, HEAD, K, MID, rand, spin, VX, wiggle, type Fighter, type Stage } from './battle';
import {
  CANDY_CANE,
  DINO_TAIL,
  EGG,
  FIN,
  HORN,
  JAW_BOTTOM,
  JAW_TOP,
  MAGNET,
  MARSHMALLOW,
  PIPING_BAG,
  TINY_ARM,
  UFO,
  WAVE,
  WING,
} from './props';

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const EYE = MID - 2; // eye level of the characters
const SPRINKLE_COLORS = ['#ff5a8a', '#ffd23f', '#3ec1ff', '#7ae582', '#b57bff', '#fff'];

/** A UFO swoops in over `f` and beams it up. */
async function beamUp(s: Stage, f: Fighter) {
  const ufo = s.prop(UFO, f.cx, 30, 22);
  s.sfx('teleport');
  await s.anim(ufo, [K(40, -30, 0, 0.5, 0.5, 0), K(0, 0, 0, 1)], 600, 'ease-out');
  const cone = s.prop('', f.cx, 34, 30, 'tractor');
  await s.anim(cone, [K(0, 0, 0, 0.2, 0, 0), K(0, 0, 0, 1, 1, 1)], 300, 'ease-out');
  s.mood(f, 'shock');
  s.say(f, pick(['Whoa! I\'m floating!', 'Take me to your leader!', 'Beam me up!']), 900);
  s.sfx('shrink');
  await s.go(f, [K(0, 0, 0, 1, 1, 1), K(0, -10, 10, 0.9), K(0, -22, -10, 0.6), K(0, -32, 0, 0.2, 0.2, 0)], 1100, 'ease-in');
  cone.remove();
  s.sfx('whoosh');
  await s.anim(ufo, [K(0, 0), K(-10, 4), K(70, -40, 0, 0.4, 0.4, 0)], 700, 'ease-in');
  ufo.remove();
}

/** Fire and smoke particles from a point, flying right. */
function fireStream(s: Stage, x1: number, y1: number, x2: number, y2: number, n: number) {
  for (let i = 0; i < n; i++) {
    s.later(i * 45, () => {
      const f = s.prop(pick(['🔥', '🔥', '💨']), x1, y1, rand(4, 6.5), 'bt-fx');
      const dy = rand(-4, 4);
      void s.anim(f, [K(0, 0, 0, 0.4), at(0.6, K((x2 - x1) * 0.7, (y2 - y1) * 0.7 + dy, 20, 1.2)), K(x2 - x1 + rand(-2, 4), y2 - y1 + dy, 40, 0.7, 0.7, 0)], 450, 'linear').then(() => f.remove());
    });
  }
}

export const TEAM_ATTACKS: Record<string, Attack[]> = {
  // Fairy-tale royals with a unicorn: rainbows and fairy dust.
  'fantasy-w': [
    {
      id: 'rainbow',
      title: 'Rainbow Blast!',
      async run(s, A, V, react) {
        s.say(A, pick(['Taste the rainbow!', 'Rainbow power!', 'By the unicorn\'s horn!']), 1000);
        s.sfx('sparkle');
        const orb = s.prop('', AX + 4, EYE - 12, 5, 'orb');
        await s.anim(orb, [K(0, 0, 0, 0.2), K(0, 0, 180, 1.4)], 600, 'ease-in');
        s.sfx('zap');
        const beam = s.beam(AX + 4, EYE - 12, VX - 2, EYE, 'beam-rainbow', 200);
        s.addClass(V, 'glow');
        s.mood(V, 'shock');
        s.pow('RAINBOW!', VX, 36, { color: '#ff5fa2', size: 8 });
        s.twinkle(VX - 16, 34);
        s.burst(VX, EYE, ['🌈', '✨', '⭐'], { n: 8, dist: 16 });
        await s.fx(V, [K(-1, 0), K(1, 0)], { duration: 80, iterations: 8 });
        beam.remove();
        orb.remove();
        await react('zap');
      },
    },
    {
      id: 'fairydust',
      title: 'Fairy Dust!',
      async run(s, A, V, react) {
        s.say(A, pick(['Sleepy-time sparkles!', 'Sweet dreams!']), 1000);
        s.sfx('glide');
        s.stream(['✨', '⭐', '💫'], AX + 10, EYE - 10, VX, EYE - 6, 14, 60, 7, 4);
        await s.wait(1000);
        s.mood(V, 'sleep');
        s.say(V, 'Zzz… so… sparkly…', 1000);
        s.sfx('snore');
        await s.fx(V, [K(0, 0, 0), K(0, 0, -6), K(0, 0, 6), K(0, 0, -4)], 900);
        await react('daze');
      },
    },
  ],

  // Little dragons: fire breath and big flapping wings.
  'fantasy-b': [
    {
      id: 'fire',
      title: 'Dragon Fire!',
      async run(s, A, V, react) {
        s.say(A, pick(['Hot hot hot!', 'Toasty time!']), 800);
        s.sfx('rumble');
        await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, -8, 1.12, 1.12)], 500);
        s.sfx('whoosh');
        s.later(150, () => s.sfx('fizzle'));
        void s.fx(A, [K(0, 0, -8, 1.12, 1.12), K(0, 0, 4, 1, 1), K(0, 0, 0, 1, 1)], 900);
        fireStream(s, AX + 10, MID, VX - 4, EYE, 18);
        await s.wait(700);
        s.addClass(V, 'sooty');
        s.mood(V, 'shock');
        s.pow('FWOOOSH!', VX, 38, { color: '#ff7a00' });
        const m = s.hold(V, MARSHMALLOW, 8, -18, 7);
        void m;
        await s.wait(500);
        s.say(V, pick(['*cough* At least I got a toasted marshmallow!', '*cough cough*', 'Extra crispy!']), 1100);
        s.sfx('cough');
        s.burst(VX, HEAD - 6, ['💨'], { n: 3, dist: 8 });
        await s.wait(800);
        await react('scare');
      },
    },
    {
      id: 'gust',
      title: 'Wing Gust!',
      async run(s, A, V, react) {
        const wl = s.hold(A, WING, -12, -8, 14);
        const wr = s.hold(A, WING, 12, -8, 14, 'flipx');
        s.say(A, pick(['Flap flap FLAP!', 'Feel the breeze!']), 800);
        for (const w of [wl, wr]) void s.anim(w, [K(0, 0, 0, 1, 1), K(0, -2, w === wl ? 25 : -25, 1, 0.7), K(0, 0, 0, 1, 1)], { duration: 260, iterations: 5 });
        s.later(0, () => s.sfx('whoosh'));
        s.later(520, () => s.sfx('whoosh'));
        for (let i = 0; i < 6; i++) {
          const line = s.prop('', AX + 14, HEAD - 6 + i * 5, 12, 'windline');
          void s.anim(line, [K(0, 0, 0, 0.3, 1, 0), at(0.3, K(10, 0, 0, 1, 1, 1)), K(50, 0, 0, 1, 1, 0)], { duration: 600, delay: i * 90 }).then(() => line.remove());
        }
        s.mood(V, 'shock');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 14), K(0, 0, 10), K(0, 0, 18)], 1200);
        await react('launch');
      },
    },
  ],

  // Robots: laser eyes and a giant magnet.
  'space-w': [
    {
      id: 'lasereyes',
      title: 'Laser Eyes!',
      async run(s, A, V, react) {
        s.say(A, pick(['TARGET LOCKED.', 'BEEP BOOP. PEW.', 'Laser mode: ON']), 900);
        s.sfx('clunk');
        await s.wait(500);
        s.sfx('zap');
        s.later(200, () => s.sfx('zap'));
        const b1 = s.beam(AX - 2, EYE, VX - 2, EYE - 2, 'beam-red', 120);
        const b2 = s.beam(AX + 4, EYE, VX - 2, EYE + 2, 'beam-red', 120);
        s.addClass(V, 'zapped');
        s.mood(V, 'shock');
        s.pow('PEW PEW PEW!', VX, 36, { color: '#ff4757', size: 7 });
        await s.fx(V, [K(-1, 0), K(1, 0)], { duration: 70, iterations: 10 });
        b1.remove();
        b2.remove();
        V.inner.classList.remove('zapped');
        await react('zap');
      },
    },
    {
      id: 'magnet',
      title: 'Mega Magnet!',
      async run(s, A, V, react) {
        const mag = s.hold(A, MAGNET, 13, -2, 11);
        s.say(A, pick(['MAGNET: ACTIVATED.', 'Come here, please!']), 900);
        s.sfx('clunk');
        for (let i = 0; i < 4; i++) {
          const r = s.prop('', VX - 18, MID, 10, 'soundwave');
          (r.firstElementChild as HTMLElement).style.borderColor = '#3ec1ff';
          void s.anim(r, [K(0, 0, 180, 1.2, 1.4, 0.8), K(-14, 0, 180, 0.3, 0.6, 0)], { duration: 500, delay: i * 120 }).then(() => r.remove());
        }
        s.mood(V, 'shock');
        s.say(V, 'Hey! I\'m sliding!', 800);
        s.sfx('slideDown');
        await s.go(V, [K(0, 0), K(-6, 0, -8), K(-24, 0, -12)], 900, 'ease-in');
        s.sfx('clang');
        s.pow('CLANK!', VX - 26, 44, { color: '#9aa0a6' });
        await s.wait(300);
        s.say(A, 'Reversing polarity!', 700);
        void s.anim(mag, [K(0, 0, 0), K(0, 0, 180)], 250);
        await s.wait(300);
        s.sfx('boing');
        await s.go(V, [K(-24, 0, -12), K(0, 0, 0)], 250, 'ease-out');
        await react('launch');
      },
    },
  ],

  // Aliens: a UFO tractor beam and a goo blaster.
  'space-b': [
    {
      id: 'tractor',
      title: 'Tractor Beam!',
      async run(s, _A, V) {
        s.say(_A, pick(['Calling the mothership!', 'Zorp zorp!']), 900);
        s.sfx('sparkle');
        await s.wait(500);
        await beamUp(s, V);
        s.say(_A, 'Enjoy the ride!', 800);
        await s.wait(500);
      },
    },
    {
      id: 'goo',
      title: 'Goo Blaster!',
      async run(s, A, V, react) {
        s.say(A, pick(['Goo time!', 'Splorp!']), 800);
        for (let i = 0; i < 4; i++) {
          const g = s.prop('', AX + 12, EYE, 4, 'goo');
          s.sfx('squish');
          const ty = rand(-6, 4);
          void s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.06, 0.94), K(0, 0, 0, 1, 1)], 140);
          await s.anim(g, [K(0, 0, 0, 0.6), at(0.5, K(20, -10 + ty, 180, 1)), K(VX - AX - 16, ty, 360, 1.2, 0.8)], 380, 'linear');
          s.sfx('splat');
          void s.anim(g, [{}, K(VX - AX - 16, ty + 6, 0, 1.6, 0.6, 0)], 700).then(() => g.remove());
          void s.fx(V, [K(0, 0, 0), K(0, 0, 6), K(0, 0, 0)], 200);
        }
        s.addClass(V, 'gooey');
        s.pow('SPLORP!', VX, 40, { color: '#7cff4a' });
        s.say(V, 'Eww, it\'s so gooey!', 900);
        await s.wait(600);
        await react('wet');
      },
    },
  ],

  // Dolphins: water jets and bubble rings.
  'ocean-w': [
    {
      id: 'waterjet',
      title: 'Water Jet!',
      async run(s, A, V, react) {
        s.say(A, pick(['Splash attack!', 'Squirt!']), 800);
        s.sfx('splash');
        const beam = s.beam(AX + 8, MID, VX - 4, EYE, 'beam-water', 200);
        for (let i = 0; i < 10; i++) {
          s.later(i * 70, () => {
            const d = s.prop('💧', VX - 6, EYE + rand(-4, 4), 3.5, 'bt-fx');
            void s.anim(d, [K(0, 0, 0), K(rand(-8, 4), rand(-12, 4), 0, 0.6, 0.6, 0)], 500).then(() => d.remove());
          });
        }
        s.mood(V, 'shock');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 10), K(0, 0, 6), K(0, 0, 12)], 900);
        beam.remove();
        s.addClass(V, 'wet');
        s.say(V, 'Soggy!', 700);
        await react('wet');
      },
    },
    {
      id: 'bubblerings',
      title: 'Bubble Rings!',
      async run(s, A, V, react) {
        s.say(A, pick(['Ring-a-ding!', 'Watch my bubble rings!']), 900);
        for (let i = 0; i < 3; i++) {
          const r = s.prop('', AX + 12, EYE, 8, 'bubblering');
          s.sfx('bubble');
          await s.anim(r, [K(0, 0, 0, 0.3), K(VX - AX - 14, rand(-4, 2), 0, 1.2)], 450, 'ease-out');
          s.sfx('bonk');
          s.pow(['BLOOP!', 'BLOP!', 'BONK!'][i], VX, 40 - i * 3, { size: 6, color: '#3ec1ff' });
          void s.anim(r, [{}, K(VX - AX - 14, -10, 0, 1.8, 1.8, 0)], 300).then(() => r.remove());
          void s.fx(V, [K(0, 0, 0), K(0, 0, 8 + i * 3), K(0, 0, 0)], 220);
        }
        s.mood(V, 'dizzy');
        await react('bonk');
      },
    },
  ],

  // Sharks: a big (friendly) chomp and a tidal wave.
  'ocean-b': [
    {
      id: 'chomp',
      title: 'Shark Chomp!',
      async run(s, A, V, react) {
        s.say(A, pick(['Nom nom nom!', 'Snack time!']), 800);
        await s.go(A, [K(0, 0), K(22, 0)], 450);
        const top = s.prop(JAW_TOP, VX - 8, EYE - 12, 24);
        const bottom = s.prop(JAW_BOTTOM, VX - 8, EYE + 12, 24);
        s.sfx('rumble');
        await Promise.all([s.anim(top, [K(-10, -6, -10, 0.5, 0.5, 0), K(0, -4, -10, 1, 1)], 300), s.anim(bottom, [K(-10, 6, 10, 0.5, 0.5, 0), K(0, 4, 10, 1, 1)], 300)]);
        s.mood(V, 'shock');
        await s.wait(250);
        s.sfx('punch');
        await Promise.all([s.anim(top, [K(0, -4, -10), K(0, 8, 0)], 150, 'ease-in'), s.anim(bottom, [K(0, 4, 10), K(0, -6, 0)], 150, 'ease-in')]);
        s.pow('CHOMP!', VX, 36, { size: 11 });
        s.shake(2);
        await s.wait(400);
        s.say(A, pick(['Blech! Tastes like chess!', 'Too crunchy!', 'Ptooey!']), 1000);
        void s.anim(top, [{}, K(0, -10, -20, 1, 1, 0)], 300).then(() => top.remove());
        void s.anim(bottom, [{}, K(0, 10, 20, 1, 1, 0)], 300).then(() => bottom.remove());
        void s.go(A, [K(22, 0), K(0, 0)], 500);
        await react('launch');
      },
    },
    {
      id: 'tidal',
      title: 'Tidal Wave!',
      async run(s, A, V) {
        s.say(A, pick(['Surf\'s up!', 'Here comes a big one!']), 900);
        s.sfx('rumble');
        const wave = s.prop(WAVE, AX - 20, GROUND - 16, 34);
        await s.anim(wave, [K(-30, 20, 0, 0.6, 0.4, 0), K(0, 0, 0, 1, 1)], 600, 'ease-out');
        s.mood(V, 'shock');
        s.say(V, 'Uh oh… cowabunga?', 800);
        s.sfx('splash');
        s.later(400, () => s.sfx('splash'));
        await s.anim(wave, [K(0, 0), K(VX - AX + 8, -2)], 700, 'ease-in');
        s.addClass(V, 'wet');
        void s.fx(V, spin(3), { duration: 900, easing: 'linear' });
        void s.go(V, [K(0, 0, 0), K(20, -18, 0), K(60, -10, 0, 1, 1, 0)], 1000, 'ease-out');
        await s.anim(wave, [K(VX - AX + 8, -2), K(VX - AX + 60, 0, 0, 1, 1, 0)], 1000, 'linear');
        wave.remove();
        s.burst(60, GROUND - 6, ['💧', '🐟'], { n: 6, dist: 14 });
        await s.wait(300);
      },
    },
  ],

  // Cupcakes: sprinkle storms and a frosting cannon.
  'candy-w': [
    {
      id: 'sprinkles',
      title: 'Sprinkle Storm!',
      async run(s, A, V, react) {
        s.say(A, pick(['Sprinkles for everyone!', 'Sugar rush!']), 900);
        s.sfx('sparkle');
        for (let i = 0; i < 40; i++) {
          const c = s.prop('', VX + rand(-14, 14), 20 + rand(-10, 4), 1.4, 'confetto');
          (c.firstElementChild as HTMLElement).style.background = pick(SPRINKLE_COLORS);
          void s.anim(c, [K(0, 0, rand(0, 180), 1, 1, 0), at(0.1, K(0, 2, rand(0, 180))), K(rand(-4, 4), GROUND - 22 + rand(-4, 2), rand(200, 540), 1, 1, 0.9)], { duration: 1000, delay: i * 25, easing: 'ease-in' }).then(() => c.remove());
        }
        await s.wait(900);
        s.mood(V, 'dizzy');
        s.say(V, pick(['Too… much… sugar!', 'Wheee, sugar rush!']), 900);
        await s.fx(V, wiggle(10), 700);
        await react('daze');
      },
    },
    {
      id: 'frosting',
      title: 'Frosting Cannon!',
      async run(s, A, V, react) {
        const bag = s.hold(A, PIPING_BAG, 14, -2, 12);
        s.say(A, pick(['Extra frosting!', 'Decorate time!']), 900);
        s.sfx('squish');
        await s.anim(bag, [K(0, 0, 0, 1, 1), K(0, 0, 0, 0.9, 1.2)], 400);
        const beam = s.beam(AX + 26, MID - 1, VX - 4, EYE - 2, 'beam-frosting', 250);
        s.sfx('splat');
        s.pow('SQUIRT!', VX, 38, { color: '#ff8fc8' });
        s.hold(V, '', 0, -6, 16, 'cream');
        s.mood(V, 'shock');
        await s.wait(700);
        beam.remove();
        s.say(V, pick(['I look delicious!', 'So much frosting!']), 800);
        await react('wet');
      },
    },
  ],

  // Chocolate bonbons: a chocolate fountain and a candy-cane hook.
  'candy-b': [
    {
      id: 'fountain',
      title: 'Chocolate Fountain!',
      async run(s, A, V, react) {
        s.say(A, pick(['Chocolate shower!', 'Choc-a-lot!']), 900);
        s.sfx('splash');
        const pour = s.prop('', VX, -2, 20, 'choc-pour');
        await s.anim(pour, [K(0, 0, 0, 1, 0), K(0, 0, 0, 1, 1)], 400, 'ease-in');
        s.addClass(V, 'choc');
        s.mood(V, 'shock');
        s.pow('GLOOP!', VX, 34, { color: '#7a4a2a' });
        await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.08, 0.9), K(0, 0, 0, 1, 1)], 500);
        await s.anim(pour, [K(0, 0, 0, 1, 1), K(0, 30, 0, 1, 0, 0)], 500);
        pour.remove();
        s.say(V, pick(['Mmm… wait, no!', 'I\'m dipped!']), 800);
        await react('wet');
      },
    },
    {
      id: 'candycane',
      title: 'Candy Cane Hook!',
      async run(s, A, V) {
        s.say(A, pick(['Get off the stage!', 'Hook, line and candy!']), 900);
        // The cane swings in from the right, hook first.
        const cane = s.prop(CANDY_CANE, VX + 8, MID - 10, 34, 'flipx');
        await s.anim(cane, [K(40, -10, 20), K(0, 0, 0)], 500, 'ease-out');
        s.sfx('clunk');
        s.mood(V, 'shock');
        s.say(V, 'Hey! Not the hook!', 800);
        await s.wait(300);
        s.sfx('whoosh');
        void s.anim(cane, [K(0, 0, 0), K(50, -4, 10)], 600, 'ease-in');
        await s.go(V, [K(0, 0, 0), K(4, -4, -10), K(50, -4, -10, 1, 1, 0.4)], 600, 'ease-in');
        s.pow('YOINK!', 86, 40, { color: '#e63946', size: 7 });
        await s.wait(500);
      },
    },
  ],

  // Triceratops: a horn charge and a tail swipe.
  'dino-w': [
    {
      id: 'horncharge',
      title: 'Horn Charge!',
      async run(s, A, _V, react) {
        const horn = s.hold(A, HORN, 14, 0, 12);
        s.say(A, pick(['Three horns ready!', 'Stampede!']), 800);
        for (let i = 0; i < 2; i++) {
          s.sfx('step');
          s.dust(AX - 4, GROUND, 3);
          await s.fx(A, [K(0, 0, 0), K(0, 0, 8), K(0, 0, 0)], 220);
        }
        s.sfx('gallop');
        s.later(250, () => s.sfx('gallop'));
        await s.go(A, [K(0, 0), K(24, 0)], 450, 'ease-in');
        s.sfx('punch');
        s.shake(3);
        s.pow('HORNED!', VX - 4, 40);
        void horn;
        void s.go(A, [K(24, 0), K(0, 0)], 500);
        await react('launch');
      },
    },
    {
      id: 'tailswipe',
      title: 'Tail Swipe!',
      async run(s, A, V, react) {
        s.say(A, pick(['Tail whip!', 'Swoosh!']), 800);
        await s.turn(A);
        const tail = s.prop(DINO_TAIL, AX + 4, GROUND - 5, 44, 'pivot-left');
        await s.anim(tail, [K(0, 0, -60, 0.4, 0.4, 0), K(0, 0, -40, 1, 1, 1)], 300, 'ease-out');
        s.sfx('whoosh');
        await s.anim(tail, [K(0, 0, -40), K(0, 0, 4)], 250, 'ease-in');
        s.sfx('bonk');
        s.pow('SWIPE!', VX, 44, { color: '#6f9a2c' });
        s.mood(V, 'dizzy');
        await s.fx(V, [K(0, 0, 0), K(0, -6, 30), K(0, 0, 0)], 400);
        void s.anim(tail, [K(0, 0, 4), K(0, 0, -30, 1, 1, 0)], 400).then(() => tail.remove());
        await s.turn(A);
        await react('bonk');
      },
    },
  ],

  // T-rexes: a mighty roar and (very) tiny arms.
  'dino-b': [
    {
      id: 'roar',
      title: 'Mighty Roar!',
      async run(s, A, V, react) {
        await s.fx(A, [K(0, 0, 0, 1, 1), K(0, 0, -10, 1.1, 1.1)], 400);
        s.sfx('boom');
        s.shake(4, 700);
        s.pow('ROOOAAAR!', 50, 36, { size: 12, color: '#c0522d', dur: 1300 });
        for (let i = 0; i < 5; i++) {
          const r = s.prop('', AX + 12, EYE, 12, 'soundwave');
          (r.firstElementChild as HTMLElement).style.borderColor = '#c0522d';
          void s.anim(r, [K(0, 0, 0, 0.3, 0.6, 1), K(VX - AX - 10, 0, 0, 1.4, 1.8, 0)], { duration: 600, delay: i * 110, easing: 'ease-out' }).then(() => r.remove());
        }
        s.mood(V, 'shock');
        await s.fx(V, [K(0, 0, 0), K(0, 0, 14), K(0, 0, 10), K(0, 0, 16)], 900);
        void s.fx(A, [K(0, 0, -10, 1.1, 1.1), K(0, 0, 0, 1, 1)], 300);
        await react('scare');
      },
    },
    {
      id: 'tinyarms',
      title: 'Tiny Arms Slap!',
      async run(s, A, V, react) {
        s.say(A, pick(['Take THIS! …and this!', 'Slappy slap!']), 900);
        await s.go(A, [K(0, 0), K(20, 0)], 450);
        const arm = s.hold(A, TINY_ARM, 10, 2, 5);
        for (let i = 0; i < 4; i++) {
          s.sfx('pop');
          await s.anim(arm, [K(0, 0, -20), K(2, 0, 20), K(0, 0, -20)], 160);
        }
        s.say(V, pick(['Is that… it?', 'Hee hee, that tickles!']), 900);
        s.mood(V, 'happy');
        await s.wait(700);
        s.say(A, 'Fine. STOMP!', 700);
        s.mood(A, 'angry');
        await s.go(A, [K(20, 0), K(20, -14), K(20, 0)], 350);
        s.sfx('thud');
        s.shake(3);
        s.dust(AX + 20, GROUND, 6);
        s.pow('STOMP!', VX, 40, { color: '#c0522d' });
        s.mood(A, null);
        void s.go(A, [K(20, 0), K(0, 0)], 500);
        await react('squash');
      },
    },
  ],
};

// ---- the way each team's characters leave the battle ----

export const TEAM_ENDINGS: Record<string, Ending> = {
  'fantasy-w': {
    id: 'curtsy',
    fits: [],
    async run(s, V) {
      s.say(V, pick(['Farewell, good sir!', 'I bid you adieu!']), 1000);
      s.origin(V, '50% 88%');
      await s.fx(V, [K(0, 0, 0), K(0, 0, 20), K(0, 0, 20), K(0, 0, 0)], 800);
      s.poof(VX, MID - 4);
      s.burst(VX, MID - 6, ['✨', '🌟', '💖'], { n: 10, dist: 16 });
      s.hide(V);
      await s.wait(700);
    },
  },
  'fantasy-b': {
    id: 'flyoff',
    fits: [],
    async run(s, V) {
      const wl = s.hold(V, WING, -12, -8, 14);
      const wr = s.hold(V, WING, 12, -8, 14, 'flipx');
      for (const w of [wl, wr]) void s.anim(w, [K(0, 0, 0, 1, 1), K(0, -2, w === wl ? 25 : -25, 1, 0.6), K(0, 0, 0, 1, 1)], { duration: 220, iterations: 8 });
      s.say(V, pick(['I\'ll be back!', 'Retreat! Flap flap!']), 900);
      s.sfx('whoosh');
      await s.go(V, [K(0, 0), K(4, -10, 8), K(20, -40, 10), K(40, -80, 12, 0.5, 0.5, 0)], 1600, 'ease-in');
    },
  },
  'space-w': {
    id: 'malfunction',
    fits: [],
    async run(s, V) {
      s.mood(V, 'dizzy');
      s.sfx('fizzle');
      s.pow('ERROR 404!', VX, 38, { color: '#28d7ff', size: 7 });
      s.burst(VX, HEAD, ['⚡', '🔩', '⚙️'], { n: 8, dist: 14 });
      await s.fx(V, [K(-0.8, 0), K(0.8, 0)], { duration: 60, iterations: 10 });
      s.say(V, 'Pow-er-ing… dowwwn…', 1000);
      s.mood(V, 'sleep');
      s.sfx('slideDown');
      await s.fx(V, [K(0, 0, 0), K(0, 0, 90)], 700, 'ease-in');
      s.sfx('clunk');
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 0, 0, 1, 1, 0)], 400);
    },
  },
  'space-b': {
    id: 'beamup',
    fits: [],
    async run(s, V) {
      s.say(V, 'Mothership, get me out of here!', 900);
      await s.wait(500);
      await beamUp(s, V);
    },
  },
  'ocean-w': {
    id: 'dive',
    fits: [],
    async run(s, V) {
      s.say(V, pick(['Time for a swim!', 'Splish splash!']), 800);
      s.sfx('boing');
      await s.go(V, [K(0, 0, 0), at(0.5, K(10, -24, 60)), K(20, 14, 160, 0.6, 0.6, 0)], 900, 'ease-in');
      s.sfx('splash');
      const ring = s.prop('', VX + 20, GROUND - 1, 16, 'shockwave');
      void s.anim(ring, [K(0, 0, 0, 0.3), K(0, 0, 0, 1.4, 1.4, 0)], 700).then(() => ring.remove());
      s.burst(VX + 20, GROUND - 4, ['💧'], { n: 8, dist: 12 });
      await s.wait(600);
    },
  },
  'ocean-b': {
    id: 'swimaway',
    fits: [],
    async run(s, V) {
      s.say(V, pick(['I\'ll swim for it!', 'See you later, alligator!']), 800);
      s.sfx('slideDown');
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 16, 0, 1, 1, 0)], 500, 'ease-in');
      const fin = s.prop(FIN, VX, GROUND - 5, 10);
      await s.anim(fin, [K(0, 8, 0, 1, 1, 0), K(0, 0, 0)], 250);
      s.sfx('whoosh');
      for (let i = 0; i < 4; i++) {
        const r = s.prop('', VX + i * 8, GROUND - 1, 8, 'shockwave');
        void s.anim(r, [K(0, 0, 0, 0.4), K(0, 0, 0, 1.2, 1.2, 0)], { duration: 600, delay: i * 150 }).then(() => r.remove());
      }
      await s.anim(fin, [K(0, 0), K(12, 0, -5), K(30, 0, 5, 1, 1, 0)], 900, 'ease-in');
    },
  },
  'candy-w': {
    id: 'crumble',
    fits: [],
    async run(s, V) {
      s.say(V, pick(['I\'m crumbling!', 'Oh crumbs!']), 800);
      await s.fx(V, [K(-0.6, 0), K(0.6, 0)], { duration: 80, iterations: 6 });
      s.sfx('crash');
      for (let i = 0; i < 16; i++) {
        const c = s.prop('', VX + rand(-8, 8), MID + rand(-10, 6), rand(1.4, 2.6), 'confetto');
        (c.firstElementChild as HTMLElement).style.background = pick(['#f7d9a8', '#e8b070', '#ffb3d6', '#fff']);
        (c.firstElementChild as HTMLElement).style.borderRadius = '40%';
        void s.anim(c, [K(0, 0, 0), K(rand(-10, 10), GROUND - MID - 2 + rand(-2, 2), rand(-180, 180), 1, 1, 0.8)], { duration: 700, delay: i * 20, easing: 'ease-in' });
        s.later(1500, () => c.remove());
      }
      const cherry = s.prop('🍒', VX, MID - 10, 5);
      await s.go(V, [K(0, 0, 0, 1, 1, 1), K(0, 8, 0, 1.1, 0.2, 0)], 450, 'ease-in');
      await s.anim(cherry, [K(0, 0, 0), K(0, GROUND - MID + 6, 0), K(30, GROUND - MID + 6, 540, 1, 1, 0)], 1000, 'ease-in');
    },
  },
  'candy-b': {
    id: 'chocmelt',
    fits: [],
    async run(s, V) {
      s.addClass(V, 'choc');
      s.say(V, pick(['I\'m melting… deliciously!', 'Too warm in here!']), 1000);
      s.sfx('slideDown');
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 1.2, 0.6), K(0, 0, 0, 1.8, 0.12)], 1000, 'ease-in');
      const drip = s.prop('', VX, GROUND - 1, 22, 'choc-puddle');
      s.hide(V);
      await s.anim(drip, [K(0, 0, 0, 1), K(30, 0, 0, 0.6, 1, 0)], 900, 'ease-in');
    },
  },
  'dino-w': {
    id: 'egg',
    fits: [],
    async run(s, V) {
      s.say(V, pick(['Back to my egg!', 'Egg-scuse me!']), 800);
      s.sfx('shrink');
      await s.fx(V, [K(0, 0, 0, 1, 1), K(0, 0, 0, 0.3, 0.3)], 500, 'ease-in');
      const egg = s.prop(EGG, VX, GROUND - 7, 12);
      s.poof(VX, GROUND - 8);
      s.hide(V);
      await s.anim(egg, [K(0, 0, 0, 0.2), K(0, 0, 0, 1)], 250, 'ease-out');
      await s.anim(egg, [K(0, 0, -12), K(0, 0, 12), K(0, 0, -12), K(0, 0, 0)], 600);
      s.sfx('rumble');
      await s.anim(egg, [K(0, 0, 0), K(40, 0, 540, 1, 1, 0.2)], 900, 'ease-in');
    },
  },
  'dino-b': {
    id: 'stompoff',
    fits: [],
    async run(s, V) {
      s.mood(V, 'angry');
      s.say(V, pick(['Hmph! I\'m going home!', 'Grumble grumble…']), 1000);
      await s.turn(V);
      for (let i = 1; i <= 3; i++) {
        await s.go(V, [K((i - 1) * 16, 0), K((i - 0.5) * 16, -8), K(i * 16, 0)], 360);
        s.sfx('thud');
        s.shake(1.5, 200);
        s.dust(VX + i * 16, GROUND, 3);
      }
      await s.go(V, [K(48, 0, 0, 1, 1, 1), K(60, 0, 0, 1, 1, 0)], 300);
    },
  },
};
