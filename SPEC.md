# Teng Games – Chess Tutor: Requirements

A web chess tutor for a 9-year-old, hosted at **tenggames.com.au**.

## Decisions (from requirements Q&A)

| Topic | Decision |
|---|---|
| Hosting | Static site on **GitHub Pages**, custom domain `tenggames.com.au` (DNS at GoDaddy) |
| Site layout | `tenggames.com.au` = Teng Games landing page with a games menu; Chess is the first game (`/chess/`) |
| Devices | **iPad/tablet and phone first** (touch: tap-to-move and drag), desktop works too |
| Bots | Stockfish (WASM, runs in the browser), graded levels from "just learned the rules" to strong |
| Rating | Estimated rating that moves with results vs bots + **bot ladder** (beat a bot to unlock the next) |
| Saving | Progress saved **on the device** (localStorage), no accounts |
| Style | Bright and playful: mascot coach, stars, badges, confetti |

## Features

### Play (Phase 1)
- Legal-move board: tap-to-move and drag, legal move dots, last-move and check highlights, promotion picker, flip board
- Play vs bot (choose level, colour, time control) or **two players on one device** (pass-and-play)
- Chess clocks: none, bullet, blitz, rapid (with increments)
- Takeback, resign, offer draw, move list with stepping back through the game
- Hint button (best move arrow)
- Sounds (toggle)

### Fun (Phase 2.5) ✅
- Every piece type has its own move animation (hop, leap, glide, rumble, teleport, waddle)
- Battle-Chess-style capture battles on the board (the camera tilts the board into a floor and the pieces fight on the victim's square), 2D and kid friendly: a unique cartoon attack for each of the 30 attacker/victim pairs, tap to skip, toggle in Settings (or a cartoon arena instead)
- Battle Arena menu to watch any battle
- Themes chosen when starting a game, each with its own White and Black team: Classic, Fantasy, Space, Ocean, Candy, Dino

### Coaching (all can be switched off in Settings)
- Hint button ✅
- Blunder warnings ("Are you sure? Sprout can take your bishop on a6") with a red arrow showing the threat ✅
- Danger alerts ("Watch out! Your knight on f3 is under attack by a pawn") ✅
- Opening name display ("This is the Italian Game!"), from the lichess opening list ✅
- Post-game review ✅: accuracy %, each move graded Brilliant / Best / Good / Book / Inaccuracy / Mistake / Blunder, explanations, green arrow for the better move (or how to punish the bot's mistake), jumps to your first big mistake
- **Consequence explanations** ("If you play this, you lose your knight in 3 moves"): engine-generated during games and review, hand-written in lessons

### Learn (Phase 3) ✅
- **Guided play-along lessons**: a kid-friendly explanation for each move, then the child plays it; hints when stuck; stars and badges
- **Branching variations**: at key moments Hoot asks which way to go ("Black can accept or decline the gambit, which do you want to learn?"), with buttons for each main reply and 🎲 Surprise me. Each branch teaches what to play next against that reply
- **Trap demos** ("🪤 Show me the trap"): play the tempting wrong moves on purpose to see how the trap works (Elephant, Lasker, Blackburne Shilling, Stafford, Caro-Kann smothered mate)
- A lesson is complete when every variation has been explored; explored variations are saved on the device
- **🎯 Test yourself** ✅: replay a learned lesson with no prompts or hints; the computer picks the opponent's replies (preferring ones you've learned), you pick your own plans by playing them; wrong moves are corrected (why, the right move with an arrow, then you play it); a perfect run earns 🏅 Mastered
- Openings: Italian, Ruy Lopez, London, Queen's Gambit, Sicilian, Caro-Kann, …
- Gambits and traps: King's Gambit (accepted, declined, Falkbeer), Evans (accepted, declined), Fried Liver (all Black defences), Stafford, Scholar's Mate (and its defence), Légal's Mate, Blackburne Shilling
  - shows the **recommended replies** in each gambit and explains the consequences of the tempting wrong moves
- Tactics puzzles: forks, pins, skewers, discovered attacks, mate in 1 and 2
- **Keep playing** ✅: after an opening or gambit variation, "Play on" shows an opening report card (development, king safety, centre, material, Stockfish's verdict and winning chances, plus the line's key idea), then continues the game from that position against a bot of your choice

### Puzzle trainer ✅
- Hundreds of tactics puzzles generated with Stockfish (`scripts/gen-puzzles.mjs`, same method as lichess: find blunders in imperfect games where exactly one reply wins), merged by `scripts/build-puzzles.mjs` into `public/puzzles.json`
- Themed sets: my level, mate in 1 / 2 / 3+, forks, pins and skewers, discovered attacks, free pieces, win material
- Puzzle rating (Elo vs each puzzle's rating), streaks, best streak; opponent's move is played first, then you find the reply
- Wrong moves are explained (engine consequence), two-step hints, "Solution" button, a tip about the theme after solving
- Endgames: practise vs the computer: K+Q vs K and K+R vs K checkmate, K+P promotion (with stalemate and hanging-queen checks)
- Stars (1–3) per lesson based on mistakes and hints; every lesson line and puzzle is checked by `npm run check:lessons` (legal moves + Stockfish)

## Out of scope for v1
- Accounts and cloud save, online play vs other people, PGN/FEN import/export
