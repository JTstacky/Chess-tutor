// Learn-section content. Lessons are trees: at a "choice" the student picks which reply
// (or plan) to learn next. Every branch is checked by scripts/check-lessons.mjs
// (legal moves, exact notation, and Stockfish agrees your moves are sound unless marked demo).

export interface LessonMove {
  san: string;
  prompt?: string; // shown before YOUR move (what to look for)
  note?: string; // shown after the move is played (why it's good, or what it threatens)
  wrong?: Record<string, string>; // tempting wrong moves (SAN) -> what goes wrong
  demo?: boolean; // an intentionally bad move, played to SHOW a trap
}

export interface Branch {
  label: string; // button text when this branch is an option
  intro?: string; // what Hoot says when the branch starts
  moves: LessonMove[];
  then?: Choice; // decision point after these moves (absent = end of a variation)
}

export interface Choice {
  ask: string;
  options: Branch[];
}

export type Category = 'openings' | 'gambits' | 'puzzles' | 'endgames';

export interface Lesson {
  id: string;
  title: string;
  icon: string;
  category: Category;
  side: 'w' | 'b'; // the colour you play
  blurb: string;
  fen?: string; // start position (default: normal start)
  tree?: Branch;
  practice?: { goal: 'mate' | 'promote'; intro: string; tips: string[] };
}

export const CATEGORIES: { id: Category; title: string; icon: string; blurb: string }[] = [
  { id: 'openings', title: 'Openings', icon: '♞', blurb: 'Great ways to start a game, and what to do when your opponent tries something different' },
  { id: 'gambits', title: 'Gambits & Traps', icon: '⚔️', blurb: 'Sneaky tricks, how they work, and how to stop them' },
  { id: 'puzzles', title: 'Puzzles', icon: '🧩', blurb: 'Forks, pins, skewers and checkmates' },
  { id: 'endgames', title: 'Endgames', icon: '👑', blurb: 'Finish the game with a checkmate' },
];

/** Every complete variation, as the list of option indices taken at each choice. */
export function leafPaths(b: Branch, prefix: number[] = []): number[][] {
  if (!b.then) return [prefix];
  return b.then.options.flatMap((o, i) => leafPaths(o, [...prefix, i]));
}

/** The branches visited when following `path` (root first). */
export function branchesOnPath(root: Branch, path: number[]): Branch[] {
  const out = [root];
  let b = root;
  for (const i of path) {
    b = b.then!.options[i];
    out.push(b);
  }
  return out;
}

// ---- shared branches ----

const blackburneTrap: Choice = {
  ask: 'Black left the e5 pawn hanging on purpose. Do you want to play the safe move, or see the trap?',
  options: [
    {
      label: '✅ Play it safe',
      moves: [
        { san: 'Nxd4', prompt: 'Don\'t take e5! Take the knight on d4 instead.', note: 'You swap knights and Black\'s trick is gone.',
          wrong: { Nxe5: 'That\'s the trap! After Nxe5 Qg5! Black attacks your knight and g2 at the same time. Take the knight on d4 instead.' } },
        { san: 'exd4', note: 'Black takes back. Now that d4 pawn is weak.' },
        { san: 'c3', prompt: 'Attack the pawn on d4 right away!', note: 'If Black takes, you recapture and your pieces fly out.' },
        { san: 'dxc3' },
        { san: 'Nxc3', prompt: 'Take back with your knight.', note: 'You have a big lead in development. Black\'s trap backfired!' },
      ],
    },
    {
      label: '🪤 Show me the trap',
      intro: 'Let\'s see what happens if you get greedy. You\'ll play the WRONG moves on purpose!',
      moves: [
        { san: 'Nxe5', demo: true, prompt: 'Grab the e5 pawn with your knight. It looks free...', note: 'It looked free, but...' },
        { san: 'Qg5', note: 'Black\'s queen attacks your knight AND the g2 pawn!' },
        { san: 'Nxf7', demo: true, prompt: 'Fork the queen and rook with Nxf7. Surely that\'s great?', note: 'You attack the queen and rook, but it\'s Black\'s move...' },
        { san: 'Qxg2', note: 'Black takes g2 and attacks your rook on h1.' },
        { san: 'Rf1', demo: true, prompt: 'Save your rook: move it to f1.' },
        { san: 'Qxe4+', note: 'Check! Your bishop has to block.' },
        { san: 'Be2', demo: true, prompt: 'Block the check with your bishop.' },
        { san: 'Nf3#', note: 'CHECKMATE! That\'s the Blackburne Shilling Trap. When a knight lands on d4 like that, take it!' },
      ],
    },
  ],
};

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ openings
  {
    id: 'italian',
    title: 'Italian Game',
    icon: '🍕',
    category: 'openings',
    side: 'w',
    blurb: 'Aim your bishop at f7, the weakest square. Learn what to do against every main reply.',
    tree: {
      label: 'Italian Game',
      intro: 'Three golden rules: control the centre, get your knights and bishops out, and castle your king to safety.',
      moves: [
        { san: 'e4', prompt: 'Start by grabbing the centre with your king\'s pawn two squares.', note: 'Your pawn controls d5 and f5, and opens paths for your queen and bishop.',
          wrong: { a4: 'Edge pawns don\'t help control the centre. Try a middle pawn!', h4: 'Edge pawns don\'t help control the centre. Try a middle pawn!' } },
        { san: 'e5', note: 'Black grabs the centre too.' },
        { san: 'Nf3', prompt: 'Bring out a knight and attack Black\'s pawn on e5.', note: 'Knight out, and it attacks e5. Knights love to be near the centre.',
          wrong: { Qh5: 'Bringing the queen out this early lets Black chase her. Develop a knight first!', Nh3: 'A knight on the edge is dim. Knights are best towards the middle!' } },
        { san: 'Nc6', note: 'Black defends the pawn with a knight.' },
        { san: 'Bc4', prompt: 'Develop your bishop to a square where it aims at f7, the square next to Black\'s king.', note: 'This is the Italian Game! The bishop stares at f7, which only the king defends.' },
      ],
      then: {
        ask: 'Black has four main replies to the Italian. Which one do you want to learn?',
        options: [
          {
            label: '3...Bc5 (Giuoco Piano)',
            intro: 'Black copies you. This is the "quiet game", but there\'s a plan!',
            moves: [
              { san: 'Bc5', note: 'Black\'s bishop aims at YOUR weak square, f2.' },
              { san: 'c3', prompt: 'Get ready to push d4 by supporting it with your c-pawn.', note: 'Now d4 will be backed up by this pawn.' },
              { san: 'Nf6', note: 'Black develops and attacks your e4 pawn.' },
              { san: 'd3', prompt: 'Protect your e4 pawn with another pawn.', note: 'Solid! e4 is safe and your other bishop can come out.' },
              { san: 'd6', note: 'Black protects e5 the same way.' },
              { san: 'O-O', prompt: 'Time to tuck your king away. Castle!', note: 'Castled! Your king is safe.' },
              { san: 'O-O' },
              { san: 'Re1', prompt: 'Put your rook behind your e-pawn, where the action will be.', note: 'Your rook guards e4 and gets ready for d4 later. A great setup!' },
            ],
          },
          {
            label: '3...Nf6 (Two Knights)',
            intro: 'Black attacks your e4 pawn straight away. You can play calmly, or attack!',
            moves: [{ san: 'Nf6', note: 'Black\'s knight attacks e4.' }],
            then: {
              ask: 'How do you want to play against the Two Knights?',
              options: [
                {
                  label: '😌 Calm: 4.d3',
                  moves: [
                    { san: 'd3', prompt: 'Protect e4 with a pawn.', note: 'e4 is safe. Now just develop and castle.' },
                    { san: 'Be7' },
                    { san: 'O-O', prompt: 'Castle!' },
                    { san: 'O-O' },
                    { san: 'Re1', prompt: 'Rook to the e-file.' },
                    { san: 'd6' },
                    { san: 'c3', prompt: 'Make room for a later d4 push.', note: 'A solid, safe position. Next you can play Nbd2 and get ready for d4.' },
                  ],
                },
                {
                  label: '⚔️ Attack: 4.Ng5',
                  intro: 'Attack f7 with knight AND bishop! See the Fried Liver lesson for even more.',
                  moves: [
                    { san: 'Ng5', prompt: 'Jump your knight to attack f7 twice.', note: 'f7 is attacked by your knight and bishop!' },
                    { san: 'd5', note: 'The right defence: Black blocks the bishop with a pawn.' },
                    { san: 'exd5', prompt: 'Take the pawn.', note: 'Now what will Black do?' },
                    { san: 'Na5', note: 'Black\'s best: attack your bishop instead of taking back.' },
                    { san: 'Bb5+', prompt: 'Save your bishop with check.', note: 'Check, and your bishop is safe.' },
                    { san: 'c6' },
                    { san: 'dxc6', prompt: 'Take the pawn.' },
                    { san: 'bxc6' },
                    { san: 'Be2', prompt: 'Move your bishop back to safety.', note: 'You\'re a pawn up, but Black has lots of activity.' },
                    { san: 'h6', note: 'Black kicks your knight.' },
                    { san: 'Nf3', prompt: 'Retreat your knight.' },
                    { san: 'e4', note: 'Black attacks your knight again!' },
                    { san: 'Ne5', prompt: 'Jump into the centre!', note: 'A strong central knight. You keep your extra pawn!' },
                  ],
                },
              ],
            },
          },
          {
            label: '3...Be7 (Hungarian)',
            intro: 'A shy, defensive move. When your opponent is passive, grab the centre!',
            moves: [
              { san: 'Be7', note: 'The bishop hides on e7. Not very active.' },
              { san: 'd4', prompt: 'Black is passive, so take the centre with your d-pawn!', note: 'Two pawns in the centre!' },
              { san: 'd6', note: 'Black holds e5.' },
              { san: 'Nc3', prompt: 'Develop your other knight.' },
              { san: 'Nf6' },
              { san: 'h3', prompt: 'Stop Black\'s bishop from pinning your knight on g4.', note: 'Now Bg4 is impossible.' },
              { san: 'O-O' },
              { san: 'O-O', prompt: 'Castle.', note: 'You have more space and an easy game. Well played!' },
            ],
          },
          {
            label: '3...Nd4?! (Blackburne trap)',
            intro: 'Black leaves the e5 pawn hanging. Why would they do that? It\'s a trap!',
            moves: [{ san: 'Nd4', note: 'A strange knight move. Suspicious...' }],
            then: blackburneTrap,
          },
        ],
      },
    },
  },
  {
    id: 'ruy-lopez',
    title: 'Ruy Lopez',
    icon: '🇪🇸',
    category: 'openings',
    side: 'w',
    blurb: 'The famous Spanish Game. Pressure the knight that defends e5, whatever Black does.',
    tree: {
      label: 'Ruy Lopez',
      moves: [
        { san: 'e4', prompt: 'Grab the centre!', note: 'Classic first move.' },
        { san: 'e5' },
        { san: 'Nf3', prompt: 'Develop a knight and attack e5.', note: 'Attacking the pawn.' },
        { san: 'Nc6', note: 'Black defends with the knight.' },
        { san: 'Bb5', prompt: 'Attack the knight that is defending e5!', note: 'This is the Ruy Lopez. If that knight ever disappears, e5 has no defender.' },
      ],
      then: {
        ask: 'Black has four main replies. Which one do you want to learn?',
        options: [
          {
            label: '3...a6 (Morphy)',
            intro: 'The most popular reply: Black asks your bishop "Are you going to take or go back?"',
            moves: [{ san: 'a6', note: 'The bishop is attacked.' }],
            then: {
              ask: 'Do you want to keep your bishop, or trade it for the knight?',
              options: [
                {
                  label: 'Keep it: 4.Ba4',
                  moves: [
                    { san: 'Ba4', prompt: 'Move the bishop back, but stay on the same diagonal.', note: 'Your bishop keeps an eye on the knight.' },
                    { san: 'Nf6', note: 'Black develops and attacks e4.' },
                    { san: 'O-O', prompt: 'Don\'t worry about e4. Castle!', note: 'If Black takes e4, you win it back with Re1.' },
                    { san: 'Be7' },
                    { san: 'Re1', prompt: 'Put your rook on the e-file to protect e4.' },
                    { san: 'b5', note: 'Black chases the bishop again.' },
                    { san: 'Bb3', prompt: 'Move the bishop to safety, still aiming at f7.' },
                    { san: 'd6' },
                    { san: 'c3', prompt: 'Make a little home for your bishop and get ready for d4.', note: 'Your bishop can hide on c2 if attacked.' },
                    { san: 'O-O' },
                    { san: 'h3', prompt: 'Stop the pin Bg4 before playing d4.', note: 'Now d4 is next. This is how the world champions play it!' },
                  ],
                },
                {
                  label: 'Trade it: 4.Bxc6 (Exchange)',
                  intro: 'You swap your bishop for the knight and give Black doubled pawns.',
                  moves: [
                    { san: 'Bxc6', prompt: 'Take the knight!', note: 'Black must take back.' },
                    { san: 'dxc6', note: 'Black takes with the d-pawn so the bishop on c8 can come out.' },
                    { san: 'O-O', prompt: 'Castle. Don\'t grab e5 yet!', note: 'Safe first.',
                      wrong: { Nxe5: 'Careful! After Nxe5 Qd4! Black attacks your knight and e4 at the same time and wins the pawn back.' } },
                    { san: 'f6', note: 'Black protects e5 with a pawn.' },
                    { san: 'd4', prompt: 'Open the centre!' },
                    { san: 'exd4' },
                    { san: 'Nxd4', prompt: 'Take back with the knight.' },
                    { san: 'c5', note: 'Black kicks your knight.' },
                    { san: 'Nb3', prompt: 'Retreat the knight.', note: 'If the queens come off, you have 4 pawns vs 3 on the kingside. That can win the endgame!' },
                  ],
                },
              ],
            },
          },
          {
            label: '3...Nf6 (Berlin)',
            intro: 'The "Berlin Wall". Black attacks e4 and doesn\'t mind giving it back.',
            moves: [
              { san: 'Nf6', note: 'Black attacks your e4 pawn.' },
              { san: 'O-O', prompt: 'Castle. e4 is only "hanging" for a moment.' },
              { san: 'Nxe4', note: 'Black grabs e4, but it\'s not really free.' },
              { san: 'Re1', prompt: 'Attack the knight on e4 with your rook.', note: 'The knight must move.' },
              { san: 'Nd6' },
              { san: 'Nxe5', prompt: 'Win your pawn back!', note: 'Material is equal again.' },
              { san: 'Be7' },
              { san: 'Bf1', prompt: 'Move your bishop back, so your rook sees along the e-file.', note: 'Your rook now looks straight at Black\'s king.' },
              { san: 'Nxe5' },
              { san: 'Rxe5', prompt: 'Take back with the rook.' },
              { san: 'O-O' },
              { san: 'd4', prompt: 'Grab the centre.', note: 'You have a comfortable, active position.' },
            ],
          },
          {
            label: '3...Nd4 (Bird)',
            intro: 'Black offers a knight trade. Take it and use your extra development.',
            moves: [
              { san: 'Nd4', note: 'Black attacks your knight.' },
              { san: 'Nxd4', prompt: 'Trade knights.' },
              { san: 'exd4' },
              { san: 'O-O', prompt: 'Castle.' },
              { san: 'c6', note: 'Black kicks your bishop.' },
              { san: 'Bc4', prompt: 'Move your bishop to a good diagonal aiming at f7.' },
              { san: 'Nf6' },
              { san: 'Re1', prompt: 'Rook to the e-file to support e4 and e5.' },
              { san: 'd6' },
              { san: 'c3', prompt: 'Attack the d4 pawn.', note: 'Black\'s pawn on d4 is a target. You\'re better!' },
            ],
          },
          {
            label: '3...d6 (Steinitz)',
            intro: 'A solid but passive defence. Build a big centre.',
            moves: [
              { san: 'd6', note: 'Black defends e5 with a pawn.' },
              { san: 'd4', prompt: 'Attack e5 again with your d-pawn.' },
              { san: 'Bd7', note: 'Black unpins the knight.' },
              { san: 'Nc3', prompt: 'Develop your knight.' },
              { san: 'Nf6' },
              { san: 'O-O', prompt: 'Castle.' },
              { san: 'Be7' },
              { san: 'Re1', prompt: 'Rook to e1.', note: 'Now if Black castles, Bxc6 and dxe5 wins a pawn. That\'s the Tarrasch Trap!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'london',
    title: 'London System',
    icon: '💂',
    category: 'openings',
    side: 'w',
    blurb: 'Play the same easy setup against almost anything, and learn what to do when Black attacks it.',
    tree: {
      label: 'London System',
      intro: 'In the London you build a strong pawn triangle and put your bishop on f4.',
      moves: [{ san: 'd4', prompt: 'Start with the queen\'s pawn two squares.', note: 'Protected by the queen, very solid.' }],
      then: {
        ask: 'How does Black start?',
        options: [
          {
            label: '1...d5',
            moves: [
              { san: 'd5' },
              { san: 'Bf4', prompt: 'Bring the dark-squared bishop out to f4 BEFORE you play e3.', note: 'If you play e3 first, this bishop gets stuck behind your pawns!' },
            ],
            then: {
              ask: 'What does Black play next?',
              options: [
                {
                  label: '2...Nf6 (normal)',
                  moves: [
                    { san: 'Nf6' },
                    { san: 'e3', prompt: 'Now build your pawn chain: support d4.' },
                    { san: 'e6' },
                    { san: 'Nf3', prompt: 'Develop your king\'s knight.' },
                    { san: 'c5', note: 'Black attacks your d4 pawn.' },
                    { san: 'c3', prompt: 'Support d4 with another pawn to make the triangle.', note: 'c3, d4 and e3: the famous London triangle!' },
                    { san: 'Nc6' },
                    { san: 'Nbd2', prompt: 'Develop the other knight, but keep c3 for your pawn.' },
                    { san: 'Bd6', note: 'Black offers to swap bishops.' },
                    { san: 'Bg3', prompt: 'Keep your bishop: step back along the diagonal.', note: 'If Black takes on g3, recapture with the h-pawn and your rook gets the h-file.' },
                    { san: 'O-O' },
                    { san: 'Bd3', prompt: 'Develop your last minor piece, aiming at Black\'s king.', note: 'All developed! Castle next and your London is complete.' },
                  ],
                },
                {
                  label: '2...c5 (attacks d4)',
                  intro: 'The most annoying reply: Black hits your centre right away.',
                  moves: [
                    { san: 'c5', note: 'Black attacks d4.' },
                    { san: 'e3', prompt: 'Keep calm: support d4 with your e-pawn.' },
                  ],
                  then: {
                    ask: 'Now Black can develop, or go after your b2 pawn with the queen. Which?',
                    options: [
                      {
                        label: '3...Nc6 (develops)',
                        moves: [
                          { san: 'Nc6' },
                          { san: 'c3', prompt: 'Build your pawn triangle.' },
                          { san: 'Nf6' },
                          { san: 'Nd2', prompt: 'Develop the queen\'s knight to d2.' },
                          { san: 'e6' },
                          { san: 'Ngf3', prompt: 'Now the other knight.' },
                          { san: 'Bd6' },
                          { san: 'Bg3', prompt: 'Step your bishop back.' },
                          { san: 'O-O' },
                          { san: 'Bd3', prompt: 'Develop your last piece.', note: 'Your London setup is complete!' },
                        ],
                      },
                      {
                        label: '3...Qb6 (attacks b2)',
                        intro: 'Black\'s queen attacks your b2 pawn. Don\'t panic, set a trap!',
                        moves: [
                          { san: 'Qb6', note: 'Black\'s queen attacks b2.' },
                          { san: 'Nc3', prompt: 'Don\'t just defend. Develop your knight and let Black take b2 if they dare!', note: 'If Black grabs b2, your knight jumps to b5.',
                            wrong: { Qc1: 'That works, but it\'s passive. Nc3 is stronger: if Black takes b2, Nb5 causes big trouble.' } },
                        ],
                        then: {
                          ask: 'Does Black grab the pawn?',
                          options: [
                            {
                              label: '4...Qxb2 (greedy!)',
                              moves: [
                                { san: 'Qxb2', note: 'Black takes b2. Now punish it!' },
                                { san: 'Nxd5', prompt: 'Take the d5 pawn with your knight! Now Nc7+ is threatened, forking king and rook.', note: 'Nc7+ is coming, and Rb1 will chase the queen. Black is in big trouble!' },
                              ],
                            },
                            {
                              label: '4...Nf6 (careful)',
                              moves: [
                                { san: 'Nf6' },
                                { san: 'Rb1', prompt: 'Protect b2 with your rook.', note: 'b2 is safe. Now finish developing with Nf3 and Bd3.' },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            label: '1...Nf6 & g6 (King\'s Indian setup)',
            intro: 'Black puts the bishop on g7. The London works against this too!',
            moves: [
              { san: 'Nf6' },
              { san: 'Bf4', prompt: 'Same plan: bishop to f4.' },
              { san: 'g6', note: 'Black gets ready to put the bishop on g7.' },
              { san: 'e3', prompt: 'Build your chain.' },
              { san: 'Bg7' },
              { san: 'Nf3', prompt: 'Develop your knight.' },
              { san: 'O-O' },
              { san: 'Be2', prompt: 'Develop your bishop to e2. Nice and safe.' },
              { san: 'd6' },
              { san: 'h3', prompt: 'Make a hiding square on h2 for your bishop.', note: 'If Black plays e5 or Nh5, your bishop can hide on h2. Castle next!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'queens-gambit',
    title: "Queen's Gambit",
    icon: '👸',
    category: 'openings',
    side: 'w',
    blurb: 'Offer a pawn to win the centre. Learn what to do when Black accepts, declines, or tries a trick.',
    tree: {
      label: "Queen's Gambit",
      moves: [
        { san: 'd4', prompt: 'Queen\'s pawn two squares.', note: 'Good start.' },
        { san: 'd5', note: 'Black copies you.' },
        { san: 'c4', prompt: 'Offer your c-pawn to pull Black\'s d-pawn away from the centre.', note: 'This is the Queen\'s Gambit! It\'s not a real sacrifice: you usually win the pawn back.' },
      ],
      then: {
        ask: 'Black can take the pawn (Accepted), keep d5 (Declined or Slav), or counter-attack. Which do you want to learn?',
        options: [
          {
            label: 'Accepted: 2...dxc4',
            intro: 'Black grabs the pawn. Don\'t worry, you\'ll get it back!',
            moves: [
              { san: 'dxc4', note: 'Black took the pawn, so the d5 pawn has left the centre.' },
              { san: 'e3', prompt: 'Open the diagonal for your light-squared bishop so it can win back c4.', note: 'Your bishop now attacks the pawn on c4.',
                wrong: { b3: 'After b3 Black plays cxb3 and your queenside is weak. Aim your bishop at c4 instead.' } },
            ],
            then: {
              ask: 'What does Black do next?',
              options: [
                {
                  label: '3...b5 (holds on, greedy!)',
                  moves: [
                    { san: 'b5', note: 'Black defends c4 with another pawn. Greedy!' },
                    { san: 'a4', prompt: 'Attack the pawn that protects c4.', note: 'You attack b5.' },
                    { san: 'c6', note: 'Black defends b5 with another pawn.' },
                    { san: 'axb5', prompt: 'Take on b5!', note: 'If Black takes back, a long diagonal opens up...' },
                    { san: 'cxb5', note: 'Now look at the long diagonal to a8!' },
                    { san: 'Qf3', prompt: 'Find the queen move that attacks the rook in the corner!', note: 'The queen attacks the rook on a8!',
                      wrong: { Bxc4: 'Good try, that wins the pawn back, but there\'s something much bigger. Look at the rook on a8!' } },
                    { san: 'Nc6', note: 'Black blocks with the knight.' },
                    { san: 'Qxc6+', prompt: 'Take the knight, with check!', note: 'You won a whole knight. Greedy pawn-grabbing doesn\'t pay!' },
                  ],
                },
                {
                  label: '3...Nf6 (normal)',
                  moves: [
                    { san: 'Nf6' },
                    { san: 'Bxc4', prompt: 'Win your pawn back!', note: 'Material is equal again and your bishop is on a great diagonal.' },
                    { san: 'e6' },
                    { san: 'Nf3', prompt: 'Develop your knight.' },
                    { san: 'c5', note: 'Black attacks your centre.' },
                    { san: 'O-O', prompt: 'Castle. Your king is safe and you\'re ready for the middlegame.', note: 'A nice, active position.' },
                  ],
                },
                {
                  label: '3...e5 (strikes back)',
                  moves: [
                    { san: 'e5', note: 'Black attacks your d4 pawn right away.' },
                    { san: 'Bxc4', prompt: 'Grab back your pawn first!' },
                    { san: 'exd4' },
                    { san: 'exd4', prompt: 'Take back with your pawn.', note: 'Your d4 pawn controls the centre, and your pieces have open lines.' },
                    { san: 'Nf6' },
                    { san: 'Nf3', prompt: 'Develop.' },
                    { san: 'Be7' },
                    { san: 'O-O', prompt: 'Castle.', note: 'You\'re a bit more active. Good job!' },
                  ],
                },
              ],
            },
          },
          {
            label: 'Declined: 2...e6',
            intro: 'Black keeps a pawn on d5. Classical and solid.',
            moves: [
              { san: 'e6', note: 'Black supports d5 with a pawn.' },
              { san: 'Nc3', prompt: 'Develop a knight and add pressure on d5.', note: 'Now d5 is attacked twice.' },
              { san: 'Nf6', note: 'Black defends d5 again.' },
              { san: 'Bg5', prompt: 'Pin the knight that defends d5!', note: 'If the knight moves, you can take the queen.' },
            ],
            then: {
              ask: 'Black has two ideas here. Which one?',
              options: [
                {
                  label: '4...Be7 (normal)',
                  moves: [
                    { san: 'Be7', note: 'Black breaks the pin.' },
                    { san: 'e3', prompt: 'Open a path for your other bishop.' },
                    { san: 'O-O' },
                    { san: 'Nf3', prompt: 'Develop your knight.' },
                    { san: 'Nbd7' },
                    { san: 'Rc1', prompt: 'Put your rook on the c-file.', note: 'The rook will be strong when the c-file opens.' },
                    { san: 'c6' },
                    { san: 'Bd3', prompt: 'Develop your last piece.', note: 'Classic Queen\'s Gambit Declined!' },
                  ],
                },
                {
                  label: '4...Nbd7 (a hidden trap!)',
                  intro: 'This move looks like it leaves d5 weak. It\'s the Elephant Trap!',
                  moves: [{ san: 'Nbd7', note: 'Black is secretly setting a trap.' }],
                  then: {
                    ask: 'Do you want to play the safe move, or see the Elephant Trap?',
                    options: [
                      {
                        label: '✅ Play it safe',
                        moves: [
                          { san: 'e3', prompt: 'Keep calm and play e3.', note: 'Solid. d5 isn\'t really free.' },
                          { san: 'c6' },
                          { san: 'Nf3', prompt: 'Develop.' },
                          { san: 'Be7' },
                          { san: 'Bd3', prompt: 'Develop your bishop.', note: 'All good. Castle next.' },
                        ],
                      },
                      {
                        label: '🪤 Show me the trap',
                        intro: 'You\'ll play the WRONG moves on purpose to see how the trap works.',
                        moves: [
                          { san: 'cxd5', prompt: 'Swap pawns on d5 first.' },
                          { san: 'exd5' },
                          { san: 'Nxd5', demo: true, prompt: 'Now grab the pawn on d5 with your knight. It looks free!', note: 'You grabbed the pawn...' },
                          { san: 'Nxd5', note: 'Black takes your knight! But the queen on d8 is now unprotected...' },
                          { san: 'Bxd8', demo: true, prompt: 'Take Black\'s queen! Surely that\'s great?' },
                          { san: 'Bb4+', note: 'Surprise! Check, and your own queen will be taken with check.' },
                          { san: 'Qd2', demo: true, prompt: 'Block the check with your queen.' },
                          { san: 'Bxd2+' },
                          { san: 'Kxd2', demo: true, prompt: 'Take back.' },
                          { san: 'Kxd8', note: 'Black is a whole knight up! That\'s the Elephant Trap. Never grab d5 like that.' },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          },
          {
            label: 'Slav: 2...c6',
            intro: 'Black protects d5 with the c-pawn, so the light-squared bishop can still come out.',
            moves: [
              { san: 'c6', note: 'The Slav Defence.' },
              { san: 'Nf3', prompt: 'Develop your knight.' },
              { san: 'Nf6' },
              { san: 'Nc3', prompt: 'Develop the other knight.' },
              { san: 'dxc4', note: 'NOW Black takes, hoping to keep the pawn with b5.' },
              { san: 'a4', prompt: 'Stop Black\'s b5 idea!', note: 'Now b5 isn\'t possible, and you\'ll win back c4.' },
              { san: 'Bf5' },
              { san: 'e3', prompt: 'Open your bishop\'s path to c4.' },
              { san: 'e6' },
              { san: 'Bxc4', prompt: 'Win back the pawn.' },
              { san: 'Bb4' },
              { san: 'O-O', prompt: 'Castle.', note: 'A typical Slav position. You have a nice centre!' },
            ],
          },
          {
            label: 'Counter-attack: 2...e5 (Albin)',
            intro: 'Black gives a pawn to attack you. There\'s a famous trap here!',
            moves: [
              { san: 'e5', note: 'The Albin Countergambit.' },
              { san: 'dxe5', prompt: 'Take the pawn.' },
              { san: 'd4', note: 'Black\'s pawn pushes into your half of the board.' },
            ],
            then: {
              ask: 'Do you want to play the right move, or see the famous Lasker Trap?',
              options: [
                {
                  label: '✅ Play it right',
                  moves: [
                    { san: 'Nf3', prompt: 'Develop your knight. Don\'t play e3 here!', note: 'Good.',
                      wrong: { e3: 'That walks into the Lasker Trap! After e3 Bb4+ Bd2 dxe3! Black gets a winning attack.' } },
                    { san: 'Nc6' },
                    { san: 'Nbd2', prompt: 'Bring the other knight to d2.', note: 'Next g3 and Bg2, and you keep the extra pawn.' },
                  ],
                },
                {
                  label: '🪤 Show me the Lasker Trap',
                  intro: 'You\'ll play the WRONG moves on purpose. Watch the pawn!',
                  moves: [
                    { san: 'e3', demo: true, prompt: 'Attack Black\'s d4 pawn with e3.' },
                    { san: 'Bb4+', note: 'Check!' },
                    { san: 'Bd2', demo: true, prompt: 'Block the check with your bishop.' },
                    { san: 'dxe3', note: 'Black\'s pawn keeps coming!' },
                    { san: 'Bxb4', demo: true, prompt: 'Take the bishop.' },
                    { san: 'exf2+', note: 'Check! The pawn is on f2.' },
                    { san: 'Ke2', demo: true, prompt: 'Your king has to move.' },
                    { san: 'fxg1=N+', note: 'The pawn becomes a KNIGHT with check! (a queen would be taken). Black wins your queen next. That\'s the Lasker Trap!' },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  },
  {
    id: 'sicilian',
    title: 'Sicilian Defence',
    icon: '🌋',
    category: 'openings',
    side: 'b',
    blurb: 'The fighting answer to 1.e4. Learn what to do against each way White plays.',
    tree: {
      label: 'Sicilian',
      intro: 'You are Black. The Sicilian makes the game unbalanced, which is great when you want to win.',
      moves: [
        { san: 'e4' },
        { san: 'c5', prompt: 'Fight for d4 with your c-pawn!', note: 'The Sicilian! Your c-pawn controls d4 from the side.' },
      ],
      then: {
        ask: 'White has lots of ways to fight the Sicilian. Which one do you want to learn?',
        options: [
          {
            label: '2.Nf3 & 3.d4 (Open)',
            intro: 'The main line: White opens the centre.',
            moves: [
              { san: 'Nf3' },
              { san: 'd6', prompt: 'Stop the knight from coming to e5 and open your bishop.' },
              { san: 'd4', note: 'White opens the centre.' },
              { san: 'cxd4', prompt: 'Take the pawn!', note: 'You swap a side pawn for a centre pawn. Good trade!' },
              { san: 'Nxd4' },
              { san: 'Nf6', prompt: 'Develop a knight and attack e4.' },
              { san: 'Nc3', note: 'White defends e4.' },
              { san: 'a6', prompt: 'Play the Najdorf move: stop White\'s pieces using b5.', note: 'The Najdorf, played by Fischer and Kasparov!' },
            ],
            then: {
              ask: 'White has three main 6th moves. Which one?',
              options: [
                {
                  label: '6.Be3 (English Attack)',
                  moves: [
                    { san: 'Be3' },
                    { san: 'e5', prompt: 'Kick the knight away and grab space!' },
                    { san: 'Nb3' },
                    { san: 'Be6', prompt: 'Develop your light-squared bishop.' },
                    { san: 'f3', note: 'White plans g4 and a pawn storm.' },
                    { san: 'Be7', prompt: 'Develop and get ready to castle.', note: 'Castle next and attack on the queenside with b5!' },
                  ],
                },
                {
                  label: '6.Bg5 (the pin)',
                  moves: [
                    { san: 'Bg5', note: 'White pins your knight to your queen.' },
                    { san: 'e6', prompt: 'Solid: open a path for your dark-squared bishop.' },
                    { san: 'f4' },
                    { san: 'Be7', prompt: 'Break the pin.' },
                    { san: 'Qf3' },
                    { san: 'Qc7', prompt: 'Put your queen on c7, watching e5 and the c-file.', note: 'A classic Najdorf setup.' },
                  ],
                },
                {
                  label: '6.Be2 (quiet)',
                  moves: [
                    { san: 'Be2' },
                    { san: 'e5', prompt: 'Kick the knight and grab space.' },
                    { san: 'Nb3' },
                    { san: 'Be7', prompt: 'Develop.' },
                    { san: 'O-O' },
                    { san: 'O-O', prompt: 'Castle.', note: 'Equal, and a great fighting position for you.' },
                  ],
                },
              ],
            },
          },
          {
            label: '2.c3 (Alapin)',
            intro: 'White wants to play d4 and keep a pawn there. Attack e4!',
            moves: [
              { san: 'c3', note: 'White prepares d4. But now the knight can\'t go to c3!' },
              { san: 'Nf6', prompt: 'Attack e4! White can\'t defend it with Nc3 any more.' },
              { san: 'e5', note: 'White kicks your knight.' },
              { san: 'Nd5', prompt: 'Jump to the centre.' },
              { san: 'd4' },
              { san: 'cxd4', prompt: 'Take the pawn.' },
              { san: 'Nf3' },
              { san: 'Nc6', prompt: 'Develop and attack e5.' },
              { san: 'cxd4' },
              { san: 'd6', prompt: 'Attack White\'s e5 pawn again.', note: 'You\'re challenging White\'s centre. Nice!' },
            ],
          },
          {
            label: '2.Nc3 (Closed)',
            intro: 'White keeps things closed and slow.',
            moves: [
              { san: 'Nc3' },
              { san: 'Nc6', prompt: 'Develop your knight.' },
              { san: 'g3' },
              { san: 'g6', prompt: 'Copy White\'s idea: prepare Bg7.' },
              { san: 'Bg2' },
              { san: 'Bg7', prompt: 'Bishop to the long diagonal.' },
              { san: 'd3' },
              { san: 'd6', prompt: 'Solid centre.', note: 'Next e6 or e5, then Nge7 and castle.' },
            ],
          },
          {
            label: '2.Bc4?! (aims at f7)',
            intro: 'A beginner favourite. Block the bishop and hit it with a pawn!',
            moves: [
              { san: 'Bc4' },
              { san: 'e6', prompt: 'Block the bishop\'s view of f7 with a pawn.' },
              { san: 'Nf3' },
              { san: 'd5', prompt: 'Attack the bishop with a pawn!', note: 'You gain time.' },
              { san: 'exd5' },
              { san: 'exd5', prompt: 'Take back. Your bishop on c8 is free now.' },
              { san: 'Bb5+' },
              { san: 'Bd7', prompt: 'Block the check with your bishop.' },
              { san: 'Bxd7+' },
              { san: 'Nxd7', prompt: 'Take back with the knight.', note: 'You have a great centre. White wasted time with the bishop!' },
            ],
          },
          {
            label: '2.Qh5?! (early queen)',
            intro: 'White brings the queen out early, hoping for Bc4 and Qxf7#. Develop and kick her!',
            moves: [
              { san: 'Qh5' },
              { san: 'Nc6', prompt: 'Develop a knight.', wrong: { Nf6: 'Careful! After Nf6 the queen just takes your c5 pawn: Qxc5.' } },
              { san: 'Bc4', note: 'Now f7 is attacked twice!' },
              { san: 'e6', prompt: 'Block the attack on f7 with a pawn.' },
              { san: 'Nf3' },
              { san: 'Nf6', prompt: 'Now kick the queen with your knight!', note: 'The queen has to move again. You\'re winning the development race!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'caro-kann',
    title: 'Caro-Kann Defence',
    icon: '🛡️',
    category: 'openings',
    side: 'b',
    blurb: 'A rock-solid defence for Black against 1.e4, against all of White\'s main tries.',
    tree: {
      label: 'Caro-Kann',
      moves: [
        { san: 'e4' },
        { san: 'c6', prompt: 'Prepare to challenge the centre with d5 next move.', note: 'The Caro-Kann! c6 supports your d5 push.' },
        { san: 'd4' },
        { san: 'd5', prompt: 'Now strike in the centre!', note: 'You attack e4 and your d5 pawn is protected by c6.' },
      ],
      then: {
        ask: 'White has three main ways to deal with your d5 pawn. Which one?',
        options: [
          {
            label: '3.Nc3 (Classical)',
            moves: [
              { san: 'Nc3', note: 'White defends e4.' },
              { san: 'dxe4', prompt: 'Take the e4 pawn.' },
              { san: 'Nxe4' },
            ],
            then: {
              ask: 'Main line, or see a famous trap for Black?',
              options: [
                {
                  label: '✅ Main line: 4...Bf5',
                  moves: [
                    { san: 'Bf5', prompt: 'Bring your bishop out BEFORE e6, and attack the knight.', note: 'Your bishop is outside the pawn chain.',
                      wrong: { e6: 'That locks your light-squared bishop in! Get it out first with Bf5.' } },
                    { san: 'Ng3', note: 'The knight attacks your bishop.' },
                    { san: 'Bg6', prompt: 'Keep your bishop on the same diagonal, but safe.' },
                    { san: 'h4', note: 'White threatens h5 to trap your bishop!' },
                    { san: 'h6', prompt: 'Make an escape square for your bishop.' },
                    { san: 'Nf3' },
                    { san: 'Nd7', prompt: 'Develop your queen\'s knight to d7.' },
                    { san: 'h5', note: 'The bishop is attacked.' },
                    { san: 'Bh7', prompt: 'Tuck your bishop away on h7.' },
                    { san: 'Bd3' },
                    { san: 'Bxd3', prompt: 'Trade bishops.' },
                    { san: 'Qxd3' },
                    { san: 'e6', prompt: 'Now open your other bishop.', note: 'A solid Caro-Kann. Next Ngf6, Be7 and castle.' },
                  ],
                },
                {
                  label: '🪤 Show me the trap',
                  intro: 'A famous trap where Black gets mated in 6 moves. You\'ll play the WRONG move on purpose.',
                  moves: [
                    { san: 'Nd7', prompt: 'Play Nd7. This move is fine!' },
                    { san: 'Qe2', note: 'White sets a sneaky trap.' },
                    { san: 'Ngf6', demo: true, prompt: 'Now develop your other knight to f6... (this is the mistake!)' },
                    { san: 'Nd6#', note: 'Smothered mate! Your e7 pawn can\'t take because the queen on e2 pins it. After Qe2, play Ndf6 or e6 instead!' },
                  ],
                },
              ],
            },
          },
          {
            label: '3.e5 (Advance)',
            intro: 'White pushes past you and grabs space.',
            moves: [
              { san: 'e5', note: 'White\'s pawn chain points at your kingside.' },
              { san: 'Bf5', prompt: 'Get your bishop out before playing e6.', wrong: { e6: 'That locks your bishop in! Play Bf5 first.' } },
              { san: 'Nf3' },
              { san: 'e6', prompt: 'Now build your own pawn chain.' },
              { san: 'Be2' },
              { san: 'c5', prompt: 'Attack the base of White\'s pawn chain with your c-pawn!', note: 'Always attack a pawn chain at its base.' },
              { san: 'O-O' },
              { san: 'Nc6', prompt: 'Add pressure on d4.', note: 'You\'re putting pressure on d4. Good plan!' },
            ],
          },
          {
            label: '3.exd5 (Exchange)',
            intro: 'White swaps pawns. The position becomes symmetrical and calm.',
            moves: [
              { san: 'exd5' },
              { san: 'cxd5', prompt: 'Take back with your c-pawn.' },
              { san: 'Bd3' },
              { san: 'Nc6', prompt: 'Develop a knight.' },
              { san: 'c3' },
              { san: 'Nf6', prompt: 'Develop the other knight.' },
              { san: 'Bf4' },
              { san: 'Bg4', prompt: 'Develop your bishop actively.', note: 'If White\'s queen attacks b7 with Qb3, defend with Qd7.' },
            ],
          },
        ],
      },
    },
  },

  // ------------------------------------------------------------------ gambits & traps
  {
    id: 'scholars-mate',
    title: "Scholar's Mate",
    icon: '🎓',
    category: 'gambits',
    side: 'w',
    blurb: 'The 4-move checkmate, and what happens when your opponent sees it coming.',
    tree: {
      label: "Scholar's Mate",
      intro: 'The queen and bishop team up against f7. It only works if Black doesn\'t notice!',
      moves: [
        { san: 'e4', prompt: 'Open lines for your queen and bishop.' },
        { san: 'e5' },
        { san: 'Bc4', prompt: 'Aim your bishop at f7.' },
        { san: 'Nc6' },
        { san: 'Qh5', prompt: 'Bring your queen to attack f7 as well.', note: 'Now f7 is attacked twice and only the king defends it!' },
      ],
      then: {
        ask: 'Will Black spot the danger?',
        options: [
          {
            label: '3...Nf6?? (misses it)',
            moves: [
              { san: 'Nf6', note: 'Black attacks your queen but forgets about f7.' },
              { san: 'Qxf7#', prompt: 'Find the checkmate!', note: 'Checkmate! The bishop protects the queen so the king can\'t take her.' },
            ],
          },
          {
            label: '3...g6 (blocks it)',
            intro: 'A good opponent blocks the attack. Now what?',
            moves: [
              { san: 'g6', note: 'Black blocks the queen AND attacks her.' },
              { san: 'Qf3', prompt: 'Move your queen but keep attacking f7!' },
              { san: 'Nf6', note: 'Black blocks again with a knight.' },
              { san: 'Ne2', prompt: 'The attack is over. Develop a piece.' },
              { san: 'Bg7' },
              { san: 'Nbc3', prompt: 'Develop your other knight.' },
              { san: 'd6' },
              { san: 'd3', prompt: 'Open your last bishop.', note: 'Your queen got chased around. Scholar\'s Mate only works against mistakes. Real players develop first!' },
            ],
          },
          {
            label: '3...Qe7 (defends f7)',
            moves: [
              { san: 'Qe7', note: 'Black\'s queen defends f7 and e5.' },
              { san: 'Nc3', prompt: 'Develop. The attack is blocked.' },
              { san: 'Nf6', note: 'Black kicks your queen.' },
              { san: 'Qe2', prompt: 'Bring your queen back to safety on e2.', note: 'Safe again. Next Nf3 and castle. Don\'t waste more time with the queen!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'stop-scholars',
    title: "Stop Scholar's Mate",
    icon: '🛑',
    category: 'gambits',
    side: 'b',
    blurb: 'You are Black. Block the early queen attack, whatever order White tries it in.',
    tree: {
      label: "Stop Scholar's Mate",
      moves: [
        { san: 'e4' },
        { san: 'e5', prompt: 'Grab the centre.' },
      ],
      then: {
        ask: 'White can bring out the queen first, or the bishop first. Which do you want to practise?',
        options: [
          {
            label: 'Queen first: 2.Qh5',
            moves: [
              { san: 'Qh5', note: 'White\'s queen attacks your e5 pawn.' },
              { san: 'Nc6', prompt: 'Defend the e5 pawn.' },
              { san: 'Bc4', note: 'Danger! Queen AND bishop attack f7. Mate is threatened!' },
              { san: 'g6', prompt: 'Block the queen\'s path to f7 and chase her!', note: 'The queen is attacked and can\'t reach f7.',
                wrong: {
                  Nf6: 'Nf6 attacks the queen, but it doesn\'t stop Qxf7, which is CHECKMATE! Look at f7.',
                  Nh6: 'That defends f7, but g6 is even better: it blocks the queen AND attacks her.',
                  d6: 'That doesn\'t stop Qxf7, which is checkmate! Look at f7.',
                } },
              { san: 'Qf3', note: 'The queen tries again from f3. f7 is still in danger!' },
              { san: 'Nf6', prompt: 'Block the attack on f7 with a piece.', note: 'The knight blocks the queen.',
                wrong: { Nd4: 'That attacks the queen, but White just plays Qxf7#. Protect f7 first!' } },
            ],
            then: {
              ask: 'White\'s queen keeps coming! What does White try next?',
              options: [
                {
                  label: '5.Qb3 (f7 again!)',
                  moves: [
                    { san: 'Qb3', note: 'Queen and bishop attack f7 AGAIN!' },
                    { san: 'Nd4', prompt: 'Counter-attack! Hit the queen with your knight.', note: 'If Bxf7+ Ke7, White\'s queen is still attacked and the bishop is stuck. The queen must run again. You\'re way ahead!',
                      wrong: { Qe7: 'That defends f7, but there\'s something stronger: attack the queen with your knight!' } },
                  ],
                },
                {
                  label: '5.Ne2 (gives up)',
                  moves: [
                    { san: 'Ne2' },
                    { san: 'Bg7', prompt: 'Develop your bishop to the long diagonal.' },
                    { san: 'Nbc3' },
                    { san: 'O-O', prompt: 'Castle to safety.', note: 'Your pieces are out and your king is safe. Great defending!' },
                  ],
                },
              ],
            },
          },
          {
            label: 'Bishop first: 2.Bc4',
            moves: [
              { san: 'Bc4', note: 'White\'s bishop aims at f7. Qh5 or Qf3 might come next.' },
              { san: 'Nf6', prompt: 'Develop a knight that guards h5 and blocks f3-f7!', note: 'Now Qh5 is impossible and Qf3 is blocked.' },
              { san: 'd3' },
              { san: 'Bc5', prompt: 'Develop your bishop, aiming at f2.' },
              { san: 'Nf3' },
              { san: 'd6', prompt: 'Protect e5.' },
              { san: 'O-O' },
              { san: 'O-O', prompt: 'Castle.', note: 'Safe and sound. No Scholar\'s Mate today!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'fried-liver',
    title: 'Fried Liver Attack',
    icon: '🍳',
    category: 'gambits',
    side: 'w',
    blurb: 'Attack f7 with knight and bishop, and learn every way Black can defend.',
    tree: {
      label: 'Fried Liver',
      moves: [
        { san: 'e4' },
        { san: 'e5' },
        { san: 'Nf3' },
        { san: 'Nc6' },
        { san: 'Bc4', note: 'Italian Game.' },
        { san: 'Nf6', note: 'The Two Knights Defence.' },
        { san: 'Ng5', prompt: 'Attack f7 with your knight too!', note: 'Knight and bishop both attack f7.' },
      ],
      then: {
        ask: 'f7 is under fire. How does Black defend?',
        options: [
          {
            label: '4...d5 (correct)',
            moves: [
              { san: 'd5', note: 'Black blocks the bishop with a pawn. The right idea!' },
              { san: 'exd5', prompt: 'Take the pawn in the centre.', note: 'Your bishop\'s path to f7 is open again.' },
            ],
            then: {
              ask: 'How does Black take back?',
              options: [
                {
                  label: '5...Nxd5? (mistake)',
                  moves: [{ san: 'Nxd5', note: 'Black takes back with the knight. This lets you attack!' }],
                  then: {
                    ask: 'Two strong ways to punish it. Which do you want to try?',
                    options: [
                      {
                        label: '🔥 Fried Liver: 6.Nxf7',
                        moves: [
                          { san: 'Nxf7', prompt: 'Sacrifice your knight on f7!', note: 'If the king takes, it gets pulled into the open.' },
                          { san: 'Kxf7' },
                          { san: 'Qf3+', prompt: 'Check the king and attack the knight on d5 at the same time.', note: 'Check! And your queen also attacks d5.' },
                          { san: 'Ke6', note: 'The king has to defend the knight. It\'s in the middle of the board!' },
                          { san: 'Nc3', prompt: 'Bring another piece to attack the d5 knight.', note: 'Three pieces attack d5. Black\'s king is in big trouble!' },
                        ],
                      },
                      {
                        label: '💥 Lolli: 6.d4',
                        moves: [
                          { san: 'd4', prompt: 'Open the centre with d4!', note: 'Lines open towards Black\'s king.' },
                          { san: 'exd4' },
                          { san: 'O-O', prompt: 'Castle so your rook can join the attack on the e-file.', note: 'Next Re1+ and Nxf7. A very dangerous attack!' },
                        ],
                      },
                    ],
                  },
                },
                {
                  label: '5...Na5! (best)',
                  moves: [
                    { san: 'Na5', note: 'The best move! Black attacks your bishop instead of taking back.' },
                    { san: 'Bb5+', prompt: 'Save your bishop with check.' },
                    { san: 'c6' },
                    { san: 'dxc6', prompt: 'Take the pawn.' },
                    { san: 'bxc6' },
                    { san: 'Be2', prompt: 'Retreat your bishop to safety.' },
                    { san: 'h6', note: 'Black kicks your knight.' },
                    { san: 'Nf3', prompt: 'Retreat the knight.' },
                    { san: 'e4' },
                    { san: 'Ne5', prompt: 'Jump into the centre!', note: 'You\'re a pawn up. Black has activity for it. That\'s a real gambit!' },
                  ],
                },
              ],
            },
          },
          {
            label: '4...h6?? (ignores it)',
            moves: [
              { san: 'h6', note: 'Black kicks your knight but forgets f7!' },
              { san: 'Nxf7', prompt: 'Fork the queen and the rook!', note: 'The knight attacks d8 and h8.' },
              { san: 'Qe7' },
              { san: 'Nxh8', prompt: 'Take the rook!', note: 'A whole rook won!' },
            ],
          },
          {
            label: '4...Bc5 (Traxler, super risky!)',
            intro: 'Black ignores f7 and counter-attacks f2. Keep calm!',
            moves: [
              { san: 'Bc5', note: 'Black attacks your f2 pawn.' },
              { san: 'Bxf7+', prompt: 'Take on f7 with the bishop, with check!', note: 'The king must move.' },
              { san: 'Ke7' },
              { san: 'Bd5', prompt: 'Retreat the bishop to the centre.', note: 'You\'re a pawn up and Black\'s king can\'t castle. Stay alert!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'legals-mate',
    title: "Légal's Mate",
    icon: '🎩',
    category: 'gambits',
    side: 'w',
    blurb: 'Give away your QUEEN and then checkmate, or win a pawn if Black spots it.',
    tree: {
      label: "Légal's Mate",
      moves: [
        { san: 'e4' },
        { san: 'e5' },
        { san: 'Nf3' },
        { san: 'd6' },
        { san: 'Bc4' },
        { san: 'Bg4', note: 'Black pins your knight to your queen.' },
        { san: 'Nc3', prompt: 'Develop your other knight.' },
        { san: 'g6', note: 'Black plays a slow move. Time for the trick!' },
        { san: 'Nxe5', prompt: 'Take the pawn with the "pinned" knight, even though your queen is attacked!', note: 'Your queen is hanging. Will Black take it?' },
      ],
      then: {
        ask: 'Does Black take your queen?',
        options: [
          {
            label: '5...Bxd1?? (greedy)',
            moves: [
              { san: 'Bxd1', note: 'Black grabs your queen! Big mistake.' },
              { san: 'Bxf7+', prompt: 'Check the king with your bishop!', note: 'The king has only one square.' },
              { san: 'Ke7' },
              { san: 'Nd5#', prompt: 'Checkmate with a knight!', note: 'CHECKMATE with three little pieces!' },
            ],
          },
          {
            label: '5...dxe5 (takes the knight)',
            moves: [
              { san: 'dxe5', note: 'Black takes your knight instead. Smart!' },
              { san: 'Qxg4', prompt: 'Your queen is free now. Take the bishop!', note: 'You won a pawn overall. Still a good trade!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'kings-gambit',
    title: "King's Gambit",
    icon: '🤴',
    category: 'gambits',
    side: 'w',
    blurb: 'The most romantic gambit! Learn what to do when it\'s accepted, declined or countered.',
    tree: {
      label: "King's Gambit",
      moves: [
        { san: 'e4' },
        { san: 'e5' },
        { san: 'f4', prompt: 'Offer your f-pawn to deflect Black\'s e-pawn!', note: 'The King\'s Gambit. If Black takes, you get the centre and an open f-file.' },
      ],
      then: {
        ask: 'How does Black answer?',
        options: [
          {
            label: 'Accepted: 2...exf4',
            moves: [
              { san: 'exf4', note: 'Black takes the pawn.' },
              { san: 'Nf3', prompt: 'Stop Qh4+ by guarding h4 with your knight.', note: 'Now Qh4+ is impossible.',
                wrong: { d4: 'Careful! After d4 Black plays Qh4+ and your king has to walk.' } },
            ],
            then: {
              ask: 'Black\'s plan: keep the pawn, or give it back?',
              options: [
                {
                  label: '3...g5 (keeps it)',
                  moves: [
                    { san: 'g5', note: 'Black protects f4 with another pawn.' },
                    { san: 'h4', prompt: 'Attack the g5 pawn!', note: 'Black\'s pawns get pushed forward and weak.' },
                    { san: 'g4' },
                    { san: 'Ne5', prompt: 'Jump into the centre.', note: 'The Kieseritzky Gambit! Your knight is super active.' },
                  ],
                },
                {
                  label: '3...d5 (gives it back)',
                  moves: [
                    { san: 'd5', note: 'Smart! Black gives the pawn back to open lines.' },
                    { san: 'exd5', prompt: 'Take the pawn.' },
                    { san: 'Nf6' },
                    { san: 'Nc3', prompt: 'Develop your knight.' },
                    { san: 'Nxd5' },
                    { san: 'Nxd5', prompt: 'Trade knights.' },
                    { san: 'Qxd5' },
                    { san: 'd4', prompt: 'Grab the centre.', note: 'Next Bxf4 wins back the pawn. Good position!' },
                  ],
                },
              ],
            },
          },
          {
            label: 'Declined: 2...Bc5',
            moves: [
              { san: 'Bc5', note: 'Black\'s bishop aims at g1, so you can\'t castle kingside easily.' },
              { san: 'Nf3', prompt: 'Develop. Don\'t take e5!', wrong: { fxe5: 'Trap! After fxe5?? Qh4+ g3 Qxe4+ Black wins your rook on h1.' } },
              { san: 'd6' },
              { san: 'c3', prompt: 'Prepare d4 to kick the bishop.' },
              { san: 'Nf6' },
              { san: 'd4', prompt: 'Push d4!' },
              { san: 'exd4' },
              { san: 'cxd4', prompt: 'Take back. Now you have a big centre.' },
              { san: 'Bb4+' },
              { san: 'Bd2', prompt: 'Block the check.', note: 'Your big pawn centre gives you a great game.' },
            ],
          },
          {
            label: 'Falkbeer: 2...d5',
            moves: [
              { san: 'd5', note: 'Black counter-attacks in the centre!' },
              { san: 'exd5', prompt: 'Take the pawn.' },
              { san: 'exf4' },
              { san: 'Nf3', prompt: 'Develop and stop Qh4+.' },
              { san: 'Nf6' },
              { san: 'Bb5+', prompt: 'Check with your bishop.', note: 'You keep the extra d5 pawn for now.' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'stafford',
    title: 'Beat the Stafford Gambit',
    icon: '🪤',
    category: 'gambits',
    side: 'w',
    blurb: 'A tricky gambit popular online. Learn the trap AND the safe way to play.',
    tree: {
      label: 'Stafford',
      moves: [
        { san: 'e4' },
        { san: 'e5' },
        { san: 'Nf3' },
        { san: 'Nf6', note: 'Petrov\'s Defence.' },
        { san: 'Nxe5', prompt: 'Take the free pawn.' },
        { san: 'Nc6', note: 'The Stafford Gambit! Black offers a knight.' },
        { san: 'Nxc6', prompt: 'Take the knight.' },
        { san: 'dxc6', note: 'Black opens lines for the queen and bishop.' },
        { san: 'd3', prompt: 'Protect e4 with a pawn.', note: 'Solid and safe.' },
        { san: 'Bc5', note: 'The bishop aims at f2. Careful now!' },
      ],
      then: {
        ask: 'This is the critical moment. Play safe, or see the trap?',
        options: [
          {
            label: '✅ Play it safe',
            moves: [
              { san: 'Be2', prompt: 'Develop calmly and get ready to castle. Don\'t go for the queen!', note: 'Safe! Your king can castle next.',
                wrong: { Bg5: 'This is the trap! After Bg5 Nxe4! Bxd8 Bxf2+ Ke2 Bg4 it\'s CHECKMATE for Black.' } },
              { san: 'h5', note: 'Black wants to bring the knight to g4.' },
              { san: 'c3', prompt: 'Get ready for d4 to block the bishop.' },
              { san: 'Ng4', note: 'The knight jumps in, attacking f2 with the bishop.' },
              { san: 'd4', prompt: 'Block the bishop\'s diagonal with d4!', note: 'Now f2 is only attacked once.' },
              { san: 'Bd6' },
              { san: 'h3', prompt: 'Kick the knight away.', note: 'You\'re a piece up and safe. Well done!' },
            ],
          },
          {
            label: '🪤 Show me the trap',
            intro: 'You\'ll play the WRONG moves on purpose to see the trap.',
            moves: [
              { san: 'Bg5', demo: true, prompt: 'Pin the knight and attack the queen with Bg5... (this is the mistake!)' },
              { san: 'Nxe4', note: 'Black ignores the queen!' },
              { san: 'Bxd8', demo: true, prompt: 'Take the queen!' },
              { san: 'Bxf2+', note: 'Check!' },
              { san: 'Ke2', demo: true, prompt: 'Your king has only one square.' },
              { san: 'Bg4#', note: 'CHECKMATE! Black gave up the queen to mate you. Never play Bg5 in this line!' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'evans',
    title: 'Evans Gambit',
    icon: '🚀',
    category: 'gambits',
    side: 'w',
    blurb: 'Give up a pawn for speed and a huge centre. Accepted or declined, you\'ll know what to do.',
    tree: {
      label: 'Evans Gambit',
      moves: [
        { san: 'e4' },
        { san: 'e5' },
        { san: 'Nf3' },
        { san: 'Nc6' },
        { san: 'Bc4' },
        { san: 'Bc5' },
        { san: 'b4', prompt: 'Offer a pawn to Black\'s bishop!', note: 'The Evans Gambit!' },
      ],
      then: {
        ask: 'Does Black accept the gambit?',
        options: [
          {
            label: 'Accepted: 4...Bxb4',
            moves: [
              { san: 'Bxb4' },
              { san: 'c3', prompt: 'Attack the bishop with a pawn.', note: 'The bishop has to move again, and c3 prepares d4.' },
              { san: 'Ba5' },
              { san: 'd4', prompt: 'Build your big centre!' },
              { san: 'exd4' },
              { san: 'O-O', prompt: 'Castle quickly. Speed is what the gambit is about!' },
            ],
            then: {
              ask: 'How does Black continue?',
              options: [
                {
                  label: '7...Nge7 (solid)',
                  moves: [
                    { san: 'Nge7' },
                    { san: 'cxd4', prompt: 'Take back. Now you have a huge centre!' },
                    { san: 'd5' },
                    { san: 'exd5', prompt: 'Take the pawn.', note: 'Your pieces are much more active.' },
                  ],
                },
                {
                  label: '7...dxc3?! (greedy)',
                  moves: [
                    { san: 'dxc3', note: 'Black grabs another pawn!' },
                    { san: 'Qb3', prompt: 'Attack f7 with queen AND bishop!' },
                    { san: 'Qf6', note: 'Black defends f7.' },
                    { san: 'e5', prompt: 'Kick the queen!' },
                    { san: 'Qg6' },
                    { san: 'Nxc3', prompt: 'Take back a pawn and develop.', note: 'You\'re pawns down but miles ahead in development. Attack!' },
                  ],
                },
              ],
            },
          },
          {
            label: 'Declined: 4...Bb6',
            moves: [
              { san: 'Bb6', note: 'Black declines and keeps the bishop safe.' },
              { san: 'a4', prompt: 'Threaten a5, trapping the bishop!' },
              { san: 'a6', note: 'Black makes an escape square.' },
              { san: 'Nc3', prompt: 'Develop your knight.' },
              { san: 'Nf6' },
              { san: 'Nd5', prompt: 'Jump into the centre.', note: 'Your pawn on b4 gives you extra space on the queenside.' },
            ],
          },
        ],
      },
    },
  },
  {
    id: 'blackburne',
    title: 'Blackburne Shilling Trap',
    icon: '🪙',
    category: 'gambits',
    side: 'w',
    blurb: 'A cheeky trap for Black. Learn why you should NOT grab the pawn.',
    tree: {
      label: 'Blackburne Shilling',
      moves: [
        { san: 'e4' },
        { san: 'e5' },
        { san: 'Nf3' },
        { san: 'Nc6' },
        { san: 'Bc4' },
        { san: 'Nd4', note: 'A strange move! It leaves e5 hanging. Suspicious...' },
      ],
      then: blackburneTrap,
    },
  },

  // ------------------------------------------------------------------ puzzles
  {
    id: 'p-back-rank', title: 'Back-rank mate', icon: '🧱', category: 'puzzles', side: 'w',
    blurb: 'Mate in 1. The king is trapped behind its own pawns!',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    tree: { label: 'Mate in 1', moves: [{ san: 'Ra8#', prompt: 'Black\'s king can\'t escape its own pawns. Find checkmate!', note: 'Back-rank mate! Always give your king an escape square (called "luft").' }] },
  },
  {
    id: 'p-queen-mate', title: 'Queen and king', icon: '👑', category: 'puzzles', side: 'w',
    blurb: 'Mate in 1 with your queen, protected by your king.',
    fen: 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1',
    tree: { label: 'Mate in 1', moves: [{ san: 'Qb7#', prompt: 'Put your queen right next to the king, where your king protects it.', note: 'The king can\'t take the queen because your king guards her. Checkmate!' }] },
  },
  {
    id: 'p-f7', title: 'Attack on f7', icon: '🎯', category: 'puzzles', side: 'w',
    blurb: 'Black just played Nf6?? Punish it!',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    tree: { label: 'Mate in 1', moves: [{ san: 'Qxf7#', prompt: 'Your queen and bishop both aim at one square...', note: 'Scholar\'s Mate!' }] },
  },
  {
    id: 'p-knight-fork', title: 'Knight fork', icon: '🍴', category: 'puzzles', side: 'w',
    blurb: 'Attack two pieces at once with your knight.',
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    tree: { label: 'Win the rook', moves: [
      { san: 'Nc7+', prompt: 'Find a knight check that also attacks the rook!', note: 'A fork! The knight attacks the king AND the rook.' },
      { san: 'Kd7', note: 'The king has to move.' },
      { san: 'Nxa8', prompt: 'Now collect your prize!', note: 'You won the rook!' },
    ] },
  },
  {
    id: 'p-queen-fork', title: 'Queen fork', icon: '⚡', category: 'puzzles', side: 'w',
    blurb: 'Check the king and attack the rook in the corner with one queen move.',
    fen: 'r5k1/6pp/8/8/8/8/6PP/3Q2K1 w - - 0 1',
    tree: { label: 'Win the rook', moves: [
      { san: 'Qd5+', prompt: 'Find a queen check that also attacks the rook on a8.', note: 'Fork! The queen checks along one diagonal and attacks the rook along the other.' },
      { san: 'Kh8', note: 'The king escapes.' },
      { san: 'Qxa8#', prompt: 'Take the rook! Look closely, it\'s even better than that...', note: 'You won the rook AND it\'s checkmate! The king is stuck behind its own pawns.' },
    ] },
  },
  {
    id: 'p-skewer', title: 'Skewer', icon: '🍢', category: 'puzzles', side: 'w',
    blurb: 'Attack the king, and win the piece behind it.',
    fen: '7R/8/4k3/8/8/8/4q3/6K1 w - - 0 1',
    tree: { label: 'Win the queen', moves: [
      { san: 'Re8+', prompt: 'Check the king along the e-file. What\'s hiding behind it?', note: 'Skewer! When the king moves, the queen behind it is exposed.' },
      { san: 'Kd5' },
      { san: 'Rxe2', prompt: 'Take the queen!', note: 'You won the queen with a rook. Skewers are like forks in a straight line!' },
    ] },
  },
  {
    id: 'p-pin', title: 'Pin and win', icon: '📌', category: 'puzzles', side: 'w',
    blurb: 'The knight is pinned to its king. Attack it!',
    fen: '4k3/8/5p2/4n3/8/8/3P4/4R1K1 w - - 0 1',
    tree: { label: 'Win the knight', moves: [
      { san: 'd4', prompt: 'The knight can\'t move because your rook would give check. Don\'t take it with the rook (the f6 pawn guards it). Attack it with a pawn!', note: 'The pinned knight can\'t run away.' },
      { san: 'Kd7', note: 'The king steps aside, but it\'s too late.' },
      { san: 'dxe5', prompt: 'Take the knight!', note: 'Pins win pieces!' },
    ] },
  },

  // ------------------------------------------------------------------ endgames (play vs the computer)
  {
    id: 'e-kq-k', title: 'Queen checkmate', icon: '👑', category: 'endgames', side: 'w',
    blurb: 'King and queen vs king. Push the king to the edge and checkmate it.',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    practice: {
      goal: 'mate',
      intro: 'Use your queen to shrink the box around Black\'s king, then bring your own king to help. Watch out for stalemate!',
      tips: [
        'Move your queen a knight\'s jump away from the enemy king to make the box smaller.',
        'When the king is on the edge, bring YOUR king closer.',
        'Stalemate = the king has no moves but is NOT in check. That\'s only a draw!',
      ],
    },
  },
  {
    id: 'e-kr-k', title: 'Rook checkmate', icon: '🏰', category: 'endgames', side: 'w',
    blurb: 'King and rook vs king. Harder than the queen, but you can do it!',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    practice: {
      goal: 'mate',
      intro: 'Your rook cuts the king off like a wall. Your king pushes it back. Then checkmate on the edge.',
      tips: [
        'Use the rook as a wall so the king can\'t cross.',
        'Bring your king to face the enemy king ("opposition"), then check with the rook.',
        'If the enemy king attacks your rook, move the rook far away along the same line.',
      ],
    },
  },
  {
    id: 'e-pawn', title: 'Promote the pawn', icon: '♟️', category: 'endgames', side: 'w',
    blurb: 'King and pawn vs king. Walk your pawn to the end and make a queen!',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    practice: {
      goal: 'promote',
      intro: 'Your king is in front of your pawn. That\'s the key! Use it to push the enemy king away, then promote.',
      tips: [
        'Your king should lead the way, and the pawn follows.',
        'Don\'t let the enemy king get in front of your pawn.',
        'Make sure your new queen is protected, or at least not next to the enemy king!',
      ],
    },
  },
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}
