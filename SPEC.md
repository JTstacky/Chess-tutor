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
- Battle-Chess-style capture battles, 2D and kid friendly: a unique cartoon attack for each of the 30 attacker/victim pairs, tap to skip, toggle in Settings
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
- Openings: Italian, Ruy Lopez, London, Queen's Gambit, Sicilian, Caro-Kann, …
- Gambits and traps: King's Gambit, Evans, Fried Liver, Stafford, Scholar's Mate (and its defence), Légal's Mate, …
  - shows the **recommended replies** in each gambit and explains the consequences of the tempting wrong moves
- Tactics puzzles: forks, pins, skewers, discovered attacks, mate in 1 and 2
- Endgames: practise vs the computer: K+Q vs K and K+R vs K checkmate, K+P promotion (with stalemate and hanging-queen checks)
- Stars (1–3) per lesson based on mistakes and hints; every lesson line and puzzle is checked by `npm run check:lessons` (legal moves + Stockfish)

## Out of scope for v1
- Accounts and cloud save, online play vs other people, PGN/FEN import/export
