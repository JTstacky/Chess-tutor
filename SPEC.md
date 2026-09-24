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

### Coaching (all can be switched off in Settings)
- Hint button: Phase 1
- Blunder warnings ("Are you sure? That hangs your queen!"): Phase 2
- Opening name display ("You're playing the Italian Game!"): Phase 2
- Post-game review: each move labelled Brilliant / Good / Inaccuracy / Mistake / Blunder, with the better move shown: Phase 2
- **Consequence explanations** ("If you play this, you lose your knight in 3 moves"): engine-generated during games and review, hand-written in lessons

### Learn (Phase 3)
- **Guided play-along lessons**: a kid-friendly explanation for each move, then the child plays it; hints when stuck; stars and badges
- Openings: Italian, Ruy Lopez, London, Queen's Gambit, Sicilian, Caro-Kann, …
- Gambits and traps: King's Gambit, Evans, Fried Liver, Stafford, Scholar's Mate (and its defence), Légal's Mate, …
  - shows the **recommended replies** in each gambit and explains the consequences of the tempting wrong moves
- Tactics puzzles: forks, pins, skewers, discovered attacks, mate in 1 and 2
- Basics and endgames: how the pieces move, checkmate patterns, K+Q vs K, pawn endgames

## Out of scope for v1
- Accounts and cloud save, online play vs other people, PGN/FEN import/export, board and piece themes
