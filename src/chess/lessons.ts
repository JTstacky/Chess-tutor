// Learn-section content. Every line is checked by scripts/check-lessons.mjs (legal moves,
// and for puzzles that Stockfish agrees with the solution).

export interface LessonMove {
  san: string;
  prompt?: string; // shown before YOUR move (what to look for)
  note?: string; // shown after the move is played (why it's good)
  wrong?: Record<string, string>; // tempting wrong moves (SAN) -> what goes wrong
}

export interface LessonLine {
  title: string;
  intro?: string;
  moves: LessonMove[];
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
  lines?: LessonLine[];
  practice?: { goal: 'mate' | 'promote'; intro: string; tips: string[] };
}

export const CATEGORIES: { id: Category; title: string; icon: string; blurb: string }[] = [
  { id: 'openings', title: 'Openings', icon: '♞', blurb: 'Great ways to start a game' },
  { id: 'gambits', title: 'Gambits & Traps', icon: '⚔️', blurb: 'Sneaky tricks, and how to stop them' },
  { id: 'puzzles', title: 'Puzzles', icon: '🧩', blurb: 'Forks, pins, skewers and checkmates' },
  { id: 'endgames', title: 'Endgames', icon: '👑', blurb: 'Finish the game with a checkmate' },
];

export const LESSONS: Lesson[] = [
  // ------------------------------------------------------------------ openings
  {
    id: 'italian',
    title: 'Italian Game',
    icon: '🍕',
    category: 'openings',
    side: 'w',
    blurb: 'Point your bishop at the weakest square, f7. A favourite of champions!',
    lines: [
      {
        title: 'The main idea',
        intro: 'Three golden rules: control the centre, get your knights and bishops out, and castle your king to safety.',
        moves: [
          { san: 'e4', prompt: 'Start by grabbing the centre with your king\'s pawn two squares.', note: 'Your pawn controls d5 and f5, and opens paths for your queen and bishop.',
            wrong: { a4: 'Edge pawns don\'t help control the centre. Try a middle pawn!', h4: 'Edge pawns don\'t help control the centre. Try a middle pawn!' } },
          { san: 'e5', note: 'Black copies you and grabs the centre too.' },
          { san: 'Nf3', prompt: 'Bring out a knight and attack Black\'s pawn on e5.', note: 'Knight out, and it attacks the e5 pawn. Knights love to be near the centre.',
            wrong: { Qh5: 'Bringing the queen out this early lets Black chase her with pieces. Develop a knight first!', Nh3: 'A knight on the edge is dim. Knights are best towards the middle!' } },
          { san: 'Nc6', note: 'Black defends the pawn with a knight.' },
          { san: 'Bc4', prompt: 'Now develop your bishop to a square where it aims at f7, the square next to Black\'s king.', note: 'This is the Italian Game! The bishop stares at f7, which only the king defends.' },
          { san: 'Bc5', note: 'Black copies again, aiming at your f2 square.' },
          { san: 'c3', prompt: 'Get ready to push d4 by supporting it with your c-pawn.', note: 'Now d4 will be backed up by this pawn.' },
          { san: 'Nf6', note: 'Black develops the other knight and attacks your e4 pawn.' },
          { san: 'd3', prompt: 'Protect your e4 pawn with another pawn.', note: 'Solid! e4 is safe and your dark-squared bishop can come out.' },
          { san: 'd6', note: 'Black protects e5 the same way.' },
          { san: 'O-O', prompt: 'Time to tuck your king away. Castle!', note: 'Castled! Your king is safe and your rook can join the game. Great opening!' },
        ],
      },
    ],
  },
  {
    id: 'ruy-lopez',
    title: 'Ruy Lopez',
    icon: '🇪🇸',
    category: 'openings',
    side: 'w',
    blurb: 'One of the oldest and most famous openings. Put pressure on the knight that defends e5.',
    lines: [
      {
        title: 'The Spanish Game',
        moves: [
          { san: 'e4', prompt: 'Grab the centre!', note: 'Classic first move.' },
          { san: 'e5' },
          { san: 'Nf3', prompt: 'Develop a knight and attack e5.', note: 'Attacking the pawn.' },
          { san: 'Nc6', note: 'Black defends with the knight.' },
          { san: 'Bb5', prompt: 'Attack the knight that is defending e5!', note: 'This is the Ruy Lopez. If that knight ever disappears, e5 has no defender.' },
          { san: 'a6', note: 'Black asks your bishop: "Are you going to take or go back?"' },
          { san: 'Ba4', prompt: 'Keep the pin going: move the bishop back, but stay on the same diagonal.', note: 'Your bishop keeps an eye on the knight and Black\'s king.',
            wrong: { Bxc6: 'Taking is allowed (it\'s called the Exchange Variation) but today we keep the bishop. Try again!' } },
          { san: 'Nf6', note: 'Black develops and attacks e4.' },
          { san: 'O-O', prompt: 'Don\'t worry about e4. Castle!', note: 'If Black takes e4, you get it back with Re1. Safety first.' },
          { san: 'Be7', note: 'Black gets ready to castle too.' },
          { san: 'Re1', prompt: 'Put your rook on the e-file to protect e4.', note: 'The rook guards e4 and will be strong in the centre.' },
          { san: 'b5', note: 'Black chases the bishop again.' },
          { san: 'Bb3', prompt: 'Move the bishop to safety, still aiming at f7.', note: 'The bishop is safe and eyes f7 from far away.' },
          { san: 'd6' },
          { san: 'c3', prompt: 'Make a little home for your bishop and get ready for d4.', note: 'Now d4 is coming, and your bishop can hide on c2 if it\'s attacked. Great job!' },
        ],
      },
    ],
  },
  {
    id: 'london',
    title: 'London System',
    icon: '💂',
    category: 'openings',
    side: 'w',
    blurb: 'Play the same easy setup against almost anything. Very solid!',
    lines: [
      {
        title: 'The London setup',
        intro: 'In the London you build a strong pawn triangle and put your bishop on f4.',
        moves: [
          { san: 'd4', prompt: 'Start with the queen\'s pawn two squares.', note: 'This pawn is protected by the queen, so it\'s very solid.' },
          { san: 'd5' },
          { san: 'Bf4', prompt: 'Bring the dark-squared bishop out to f4 BEFORE you play e3.', note: 'If you play e3 first, this bishop gets stuck behind the pawns!' },
          { san: 'Nf6' },
          { san: 'e3', prompt: 'Now build your pawn chain: support d4.', note: 'The pawns on d4 and e3 make a strong chain.' },
          { san: 'e6' },
          { san: 'Nf3', prompt: 'Develop your king\'s knight.', note: 'Knights before bishops is a good habit, but this one is ready now.' },
          { san: 'c5', note: 'Black attacks your d4 pawn.' },
          { san: 'c3', prompt: 'Support d4 with another pawn to make the triangle.', note: 'c3, d4 and e3 make the famous London triangle!' },
          { san: 'Nc6' },
          { san: 'Nbd2', prompt: 'Develop the other knight, but keep c3 for your pawn.', note: 'The knight goes to d2 so the c-pawn can stay on c3.' },
          { san: 'Bd6', note: 'Black offers to swap bishops.' },
          { san: 'Bg3', prompt: 'Keep your bishop: step back along the diagonal.', note: 'If Black takes on g3, you take back with the h-pawn and get an open h-file for your rook.' },
          { san: 'O-O' },
          { san: 'Bd3', prompt: 'Develop your last minor piece, aiming at Black\'s king.', note: 'All developed! Next you castle and your London is complete.' },
        ],
      },
    ],
  },
  {
    id: 'queens-gambit',
    title: "Queen's Gambit",
    icon: '👸',
    category: 'openings',
    side: 'w',
    blurb: 'Offer a pawn to win the centre. If Black grabs it and holds on, there\'s a trap!',
    lines: [
      {
        title: 'Declined: Black says no thanks',
        moves: [
          { san: 'd4', prompt: 'Queen\'s pawn two squares.', note: 'Good start.' },
          { san: 'd5' },
          { san: 'c4', prompt: 'Offer a pawn to pull Black\'s d-pawn away from the centre.', note: 'This is the Queen\'s Gambit. It\'s not a real sacrifice: you usually win the pawn back.' },
          { san: 'e6', note: 'Black declines and keeps a strong centre.' },
          { san: 'Nc3', prompt: 'Develop a knight and add pressure on d5.', note: 'Now d5 is attacked twice.' },
          { san: 'Nf6', note: 'Black defends d5 again.' },
          { san: 'Bg5', prompt: 'Pin the knight that defends d5!', note: 'The knight on f6 is pinned to the queen: if it moves, you take the queen.' },
          { san: 'Be7', note: 'Black breaks the pin by putting the bishop in between.' },
          { san: 'e3', prompt: 'Open a path for your other bishop.', note: 'Now your f1 bishop can come out.' },
          { san: 'O-O' },
          { san: 'Nf3', prompt: 'Develop your last knight.', note: 'Everything is ready for castling. Classic chess!' },
        ],
      },
      {
        title: 'Accepted: the pawn-grab trap',
        intro: 'If Black takes the pawn and tries to keep it with b5, you can win a whole rook!',
        moves: [
          { san: 'd4' },
          { san: 'd5' },
          { san: 'c4', prompt: 'Play the gambit!' },
          { san: 'dxc4', note: 'Black grabs the pawn.' },
          { san: 'e3', prompt: 'Open the diagonal for your bishop so it can win back c4.', note: 'Your bishop now attacks the c4 pawn.' },
          { san: 'b5', note: 'Black tries to hang on to the extra pawn. Greedy!' },
          { san: 'a4', prompt: 'Attack the pawn that is protecting c4.', note: 'You attack the b5 pawn.' },
          { san: 'c6', note: 'Black defends b5 with another pawn.' },
          { san: 'axb5', prompt: 'Take on b5!', note: 'If Black takes back, a long diagonal opens up...' },
          { san: 'cxb5', note: 'Black takes back. Now look at the long diagonal to a8!' },
          { san: 'Qf3', prompt: 'Find the queen move that attacks the rook in the corner!', note: 'The queen attacks the rook on a8 AND the knight can\'t stop it without being taken. You win a piece. Brilliant!',
            wrong: { Bxc4: 'Good try, that wins the pawn back, but there\'s something much bigger. Look at the rook on a8!' } },
        ],
      },
    ],
  },
  {
    id: 'sicilian',
    title: 'Sicilian Defence',
    icon: '🌋',
    category: 'openings',
    side: 'b',
    blurb: 'The fighting answer to 1.e4. You play Black and fight for the win!',
    lines: [
      {
        title: 'The Najdorf',
        intro: 'You are Black. The Sicilian makes the game unbalanced, which is great when you want to win.',
        moves: [
          { san: 'e4' },
          { san: 'c5', prompt: 'Fight for d4 with your c-pawn!', note: 'The Sicilian! Your c-pawn controls d4 from the side.' },
          { san: 'Nf3' },
          { san: 'd6', prompt: 'Stop White\'s knight from coming to e5 and open your bishop.', note: 'Now your light-squared bishop can breathe.' },
          { san: 'd4', note: 'White opens the centre.' },
          { san: 'cxd4', prompt: 'Take the pawn!', note: 'You swap a side pawn for a centre pawn. Good trade!' },
          { san: 'Nxd4' },
          { san: 'Nf6', prompt: 'Develop a knight and attack the e4 pawn.', note: 'Attacking e4 makes White defend it.' },
          { san: 'Nc3', note: 'White defends e4.' },
          { san: 'a6', prompt: 'Play the famous Najdorf move: a little pawn move that stops White\'s pieces from using b5.', note: 'This is the Najdorf, played by world champions like Fischer and Kasparov!' },
        ],
      },
    ],
  },
  {
    id: 'caro-kann',
    title: 'Caro-Kann Defence',
    icon: '🛡️',
    category: 'openings',
    side: 'b',
    blurb: 'A rock-solid defence for Black against 1.e4. Hard to beat!',
    lines: [
      {
        title: 'The classical line',
        moves: [
          { san: 'e4' },
          { san: 'c6', prompt: 'Prepare to challenge the centre with d5 next move.', note: 'The Caro-Kann! c6 supports your d5 push.' },
          { san: 'd4' },
          { san: 'd5', prompt: 'Now strike in the centre!', note: 'You attack e4 and your d5 pawn is protected by c6.' },
          { san: 'Nc3', note: 'White defends e4.' },
          { san: 'dxe4', prompt: 'Take the e4 pawn.', note: 'You swap off White\'s big centre pawn.' },
          { san: 'Nxe4' },
          { san: 'Bf5', prompt: 'Bring your bishop out BEFORE playing e6, and attack the knight.', note: 'Your bishop is outside the pawn chain, so it will never get stuck.' },
          { san: 'Ng3', note: 'The knight attacks your bishop.' },
          { san: 'Bg6', prompt: 'Keep your bishop on the same diagonal, but safe.', note: 'Safe and still active.' },
          { san: 'h4', note: 'White threatens h5 to trap your bishop!' },
          { san: 'h6', prompt: 'Make an escape square for your bishop.', note: 'If h5 comes, your bishop can go to h7. Great defending!' },
          { san: 'Nf3' },
          { san: 'Nd7', prompt: 'Develop your queen\'s knight to d7 so it can support your position.', note: 'A solid Caro-Kann setup!' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ gambits & traps
  {
    id: 'scholars-mate',
    title: "Scholar's Mate",
    icon: '🎓',
    category: 'gambits',
    side: 'w',
    blurb: 'The 4-move checkmate! Learn how it works so it never happens to you.',
    lines: [
      {
        title: 'The attack',
        intro: 'The queen and bishop team up against f7. It only works if Black doesn\'t notice!',
        moves: [
          { san: 'e4', prompt: 'Open lines for your queen and bishop.', note: 'Both your queen and bishop can now come out.' },
          { san: 'e5' },
          { san: 'Bc4', prompt: 'Aim your bishop at f7.', note: 'The bishop targets f7.' },
          { san: 'Nc6' },
          { san: 'Qh5', prompt: 'Bring your queen to attack f7 as well.', note: 'Now f7 is attacked twice and only the king defends it!' },
          { san: 'Nf6', note: 'Oops! Black attacks your queen but forgets about f7.' },
          { san: 'Qxf7#', prompt: 'Find the checkmate!', note: 'Checkmate! The bishop protects the queen so the king can\'t take her.' },
        ],
      },
    ],
  },
  {
    id: 'stop-scholars',
    title: "Stop Scholar's Mate",
    icon: '🛑',
    category: 'gambits',
    side: 'b',
    blurb: 'You are Black. Block the early queen attack and make White regret it.',
    lines: [
      {
        title: 'Defend and punish',
        moves: [
          { san: 'e4' },
          { san: 'e5', prompt: 'Grab the centre.' },
          { san: 'Qh5', note: 'White\'s queen comes out early and attacks your e5 pawn.' },
          { san: 'Nc6', prompt: 'Defend the e5 pawn.', note: 'e5 is safe now.' },
          { san: 'Bc4', note: 'Danger! Queen AND bishop are attacking f7. Mate is threatened on f7.' },
          { san: 'g6', prompt: 'Block the queen\'s path to f7 and chase her!', note: 'The queen is attacked and can\'t reach f7 any more.',
            wrong: {
              Nf6: 'Nf6 attacks the queen, but it doesn\'t stop Qxf7, which is CHECKMATE! Look at f7.',
              Nh6: 'That defends f7, but g6 is even better: it blocks the queen AND attacks her.',
              d6: 'That doesn\'t stop Qxf7, which is checkmate! Look at f7.',
            } },
          { san: 'Qf3', note: 'The queen tries again from f3. f7 is still in danger!' },
          { san: 'Nf6', prompt: 'Block the attack on f7 with a piece.', note: 'Now the knight blocks the queen and f7 is safe.',
            wrong: { Nd4: 'That attacks the queen, but White just plays Qxf7#. Protect f7 first!' } },
          { san: 'Ne2', note: 'White plays a strange knight move.' },
          { san: 'Bg7', prompt: 'Develop your bishop to the long diagonal.', note: 'Your pieces are out and White\'s queen is in the way. You\'re doing great!' },
        ],
      },
    ],
  },
  {
    id: 'fried-liver',
    title: 'Fried Liver Attack',
    icon: '🍳',
    category: 'gambits',
    side: 'w',
    blurb: 'Sacrifice a knight to drag Black\'s king into the open!',
    lines: [
      {
        title: 'The sacrifice',
        moves: [
          { san: 'e4' },
          { san: 'e5' },
          { san: 'Nf3' },
          { san: 'Nc6' },
          { san: 'Bc4', note: 'Italian Game.' },
          { san: 'Nf6', note: 'This is the Two Knights Defence.' },
          { san: 'Ng5', prompt: 'Attack f7 with your knight too!', note: 'Knight and bishop both attack f7.' },
          { san: 'd5', note: 'Black blocks the bishop with a pawn. The right idea!' },
          { san: 'exd5', prompt: 'Take the pawn in the centre.', note: 'Your bishop\'s path to f7 is open again.' },
          { san: 'Nxd5', note: 'Black takes back with the knight. This is a mistake!' },
          { san: 'Nxf7', prompt: 'Sacrifice your knight on f7!', note: 'The Fried Liver! If the king takes, it gets pulled into the open.' },
          { san: 'Kxf7' },
          { san: 'Qf3+', prompt: 'Check the king and attack the knight on d5 at the same time.', note: 'Check! And your queen also attacks the knight on d5.' },
          { san: 'Ke6', note: 'The king has to defend the knight. It\'s in the middle of the board!' },
          { san: 'Nc3', prompt: 'Bring another piece to attack the d5 knight.', note: 'Three of your pieces attack d5. Black\'s king is in big trouble!' },
        ],
      },
      {
        title: 'How Black should defend',
        intro: 'Instead of taking with the knight, the best reply is 5...Na5! Play it through as White and see why.',
        moves: [
          { san: 'e4' },
          { san: 'e5' },
          { san: 'Nf3' },
          { san: 'Nc6' },
          { san: 'Bc4' },
          { san: 'Nf6' },
          { san: 'Ng5' },
          { san: 'd5' },
          { san: 'exd5' },
          { san: 'Na5', note: 'The right move! Black attacks your bishop instead of recapturing.' },
          { san: 'Bb5+', prompt: 'Save your bishop with check.', note: 'Check, and your bishop is safe.' },
          { san: 'c6' },
          { san: 'dxc6', prompt: 'Take the pawn.' },
          { san: 'bxc6', note: 'Black gave up a pawn but gets fast development and chances to attack. That\'s a real gambit!' },
          { san: 'Be2', prompt: 'Retreat your bishop to safety.', note: 'You are a pawn up, but Black is very active. Play carefully!' },
        ],
      },
    ],
  },
  {
    id: 'legals-mate',
    title: "Légal's Mate",
    icon: '🎩',
    category: 'gambits',
    side: 'w',
    blurb: 'Give away your QUEEN and then checkmate! A 250-year-old trick.',
    lines: [
      {
        title: 'The queen sacrifice',
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
          { san: 'Bxd1', note: 'Black grabs your queen! Big mistake.' },
          { san: 'Bxf7+', prompt: 'Check the king with your bishop!', note: 'The king has only one square.' },
          { san: 'Ke7' },
          { san: 'Nd5#', prompt: 'Checkmate with a knight!', note: 'CHECKMATE with three little pieces. Black should have taken the knight instead of the queen!' },
        ],
      },
    ],
  },
  {
    id: 'stafford',
    title: 'Beat the Stafford Gambit',
    icon: '🪤',
    category: 'gambits',
    side: 'w',
    blurb: 'A tricky gambit popular online. Learn the trap AND the safe way to play.',
    lines: [
      {
        title: 'Avoid the trap',
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
          { san: 'Be2', prompt: 'Develop calmly and get ready to castle. Don\'t go for the queen!', note: 'Safe! Your king can castle next.',
            wrong: { Bg5: 'This is the trap! After Bg5 Nxe4! Bxd8 Bxf2+ Ke2 Bg4 it\'s CHECKMATE for Black. Don\'t attack the queen here.' } },
          { san: 'h5', note: 'Black wants to bring the knight to g4.' },
          { san: 'c3', prompt: 'Get ready for d4 to block the bishop.', note: 'Next d4 shuts the bishop out. You\'re a piece up and safe. Well done!' },
        ],
      },
    ],
  },
  {
    id: 'evans',
    title: 'Evans Gambit',
    icon: '🚀',
    category: 'gambits',
    side: 'w',
    blurb: 'Give up a pawn for speed and a huge centre. Very fun to play!',
    lines: [
      {
        title: 'The gambit',
        moves: [
          { san: 'e4' },
          { san: 'e5' },
          { san: 'Nf3' },
          { san: 'Nc6' },
          { san: 'Bc4' },
          { san: 'Bc5' },
          { san: 'b4', prompt: 'Offer a pawn to Black\'s bishop!', note: 'The Evans Gambit! If Black takes, you gain time.' },
          { san: 'Bxb4' },
          { san: 'c3', prompt: 'Attack the bishop with a pawn.', note: 'The bishop has to move again, and c3 prepares d4.' },
          { san: 'Ba5' },
          { san: 'd4', prompt: 'Build your big centre!', note: 'Now you have a strong pawn centre.' },
          { san: 'exd4' },
          { san: 'O-O', prompt: 'Castle quickly. Speed is what the gambit is about!', note: 'Castled with lots of open lines to attack. That\'s worth a pawn!' },
        ],
      },
    ],
  },
  {
    id: 'blackburne',
    title: 'Blackburne Shilling Trap',
    icon: '🪙',
    category: 'gambits',
    side: 'w',
    blurb: 'A cheeky trap for Black. Learn why you should NOT grab the pawn.',
    lines: [
      {
        title: "Don't fall for it",
        moves: [
          { san: 'e4' },
          { san: 'e5' },
          { san: 'Nf3' },
          { san: 'Nc6' },
          { san: 'Bc4' },
          { san: 'Nd4', note: 'A strange move! It leaves e5 hanging. Suspicious...' },
          { san: 'Nxd4', prompt: 'Don\'t take e5! Take the knight instead.', note: 'Safe and good: you swap knights and Black\'s trick is gone.',
            wrong: { Nxe5: 'That\'s the trap! After Nxe5 Qg5! Nxf7? Qxg2 Rf1 Qxe4+ Be2 Nf3 is CHECKMATE. Take the knight on d4 instead.' } },
          { san: 'exd4' },
          { san: 'O-O', prompt: 'Castle to safety.', note: 'You are ahead in development. Black\'s trap fizzled out!' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ puzzles
  {
    id: 'p-back-rank', title: 'Back-rank mate', icon: '🧱', category: 'puzzles', side: 'w',
    blurb: 'Mate in 1. The king is trapped behind its own pawns!',
    fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1',
    lines: [{ title: 'Mate in 1', moves: [{ san: 'Ra8#', prompt: 'Black\'s king can\'t escape its own pawns. Find checkmate!', note: 'Back-rank mate! Always give your king an escape square (called "luft").' }] }],
  },
  {
    id: 'p-queen-mate', title: 'Queen and king', icon: '👑', category: 'puzzles', side: 'w',
    blurb: 'Mate in 1 with your queen, protected by your king.',
    fen: 'k7/8/2K5/8/8/8/8/1Q6 w - - 0 1',
    lines: [{ title: 'Mate in 1', moves: [{ san: 'Qb7#', prompt: 'Put your queen right next to the king, where your king protects it.', note: 'The king can\'t take the queen because your king guards her. Checkmate!' }] }],
  },
  {
    id: 'p-f7', title: 'Attack on f7', icon: '🎯', category: 'puzzles', side: 'w',
    blurb: 'Black just played Nf6?? Punish it!',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    lines: [{ title: 'Mate in 1', moves: [{ san: 'Qxf7#', prompt: 'Your queen and bishop both aim at one square...', note: 'Scholar\'s Mate!' }] }],
  },
  {
    id: 'p-knight-fork', title: 'Knight fork', icon: '🍴', category: 'puzzles', side: 'w',
    blurb: 'Attack two pieces at once with your knight.',
    fen: 'r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1',
    lines: [{ title: 'Win the rook', moves: [
      { san: 'Nc7+', prompt: 'Find a knight check that also attacks the rook!', note: 'A fork! The knight attacks the king AND the rook.' },
      { san: 'Kd7', note: 'The king has to move.' },
      { san: 'Nxa8', prompt: 'Now collect your prize!', note: 'You won the rook!' },
    ] }],
  },
  {
    id: 'p-queen-fork', title: 'Queen fork', icon: '⚡', category: 'puzzles', side: 'w',
    blurb: 'Check the king and attack the rook in the corner with one queen move.',
    fen: 'r5k1/6pp/8/8/8/8/6PP/3Q2K1 w - - 0 1',
    lines: [{ title: 'Win the rook', moves: [
      { san: 'Qd5+', prompt: 'Find a queen check that also attacks the rook on a8.', note: 'Fork! The queen checks along one diagonal and attacks the rook along the other.' },
      { san: 'Kh8', note: 'The king escapes.' },
      { san: 'Qxa8#', prompt: 'Take the rook! Look closely, it\'s even better than that...', note: 'You won the rook AND it\'s checkmate! The king is stuck behind its own pawns.' },
    ] }],
  },
  {
    id: 'p-skewer', title: 'Skewer', icon: '🍢', category: 'puzzles', side: 'w',
    blurb: 'Attack the king, and win the piece behind it.',
    fen: '7R/8/4k3/8/8/8/4q3/6K1 w - - 0 1',
    lines: [{ title: 'Win the queen', moves: [
      { san: 'Re8+', prompt: 'Check the king along the e-file. What\'s hiding behind it?', note: 'Skewer! When the king moves, the queen behind it is exposed.' },
      { san: 'Kd5' },
      { san: 'Rxe2', prompt: 'Take the queen!', note: 'You won the queen with a rook. Skewers are like forks in a straight line!' },
    ] }],
  },
  {
    id: 'p-pin', title: 'Pin and win', icon: '📌', category: 'puzzles', side: 'w',
    blurb: 'The knight is pinned to its king. Attack it!',
    fen: '4k3/8/5p2/4n3/8/8/3P4/4R1K1 w - - 0 1',
    lines: [{ title: 'Win the knight', moves: [
      { san: 'd4', prompt: 'The knight can\'t move because your rook would give check. Don\'t take it with the rook (the f6 pawn guards it). Attack it with a pawn!', note: 'The pinned knight can\'t run away.' },
      { san: 'Kd7', note: 'The king steps aside, but it\'s too late.' },
      { san: 'dxe5', prompt: 'Take the knight!', note: 'Pins win pieces!' },
    ] }],
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
