# Teng Games: Hoot's Chess Club

A chess tutor for kids, hosted at **tenggames.com.au**. See [SPEC.md](SPEC.md) for the requirements and roadmap.

- `/`: Teng Games landing page (games menu)
- `/chess/`: the chess app (play bots, pass-and-play, clocks, takeback, hints, coaching, game review, lessons and puzzles, themes, battle animations)

## Battles and themes

- **Fun piece moves** (`src/chess/moveanim.ts`): pawns hop, knights leap, bishops glide with a sparkle trail,
  rooks rumble and land with a thud, queens teleport, kings waddle.
- **Capture battles** (`src/chess/battle.ts`), Battle Chess style: on every capture the camera swoops down,
  the board tilts into a floor, the other pieces stand up on their squares, and the two pieces fight on the
  victim's square. Each of the 30 attacker/victim pairs has its own cartoon attack (Pillow Fight, Frog Spell,
  Tower Sumo, Dance-Off, Royal Trapdoor…). Tap to skip. Clocks pause while a battle plays. Settings can move
  the battles into a cartoon arena scene instead. Pick any pair in the **Battle Arena** menu.
- **Themes** (`src/chess/themes.ts`): Classic, Fantasy (Unicorn Kingdom vs Dragon Clan), Space (Robot Squad vs
  Alien Crew), Ocean (Dolphin Reef vs Shark Squad), Candy (Cupcake Crew vs Choco Gang) and Dino (Tricera-Team vs
  T-Rex Gang). Chosen when starting a game (lessons use the last one picked). Each team's pieces are drawn as
  its own characters (`src/chess/characters.ts`): robots, aliens, fairy-tale royals, dragons, reef fish,
  sharks, cupcakes, bonbons and dinosaurs, with a unicorn, dragon, seahorse… as the knight. Every piece
  type keeps its signature headgear so it stays easy to read: cross crown (king), ball crown (queen),
  battlements (rook), mitre (bishop).
- Battles also play in lessons. Both animation types can be switched off in Settings.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run check:lessons  # validate lesson/puzzle content with chess.js + Stockfish
node scripts/gen-puzzles.mjs <seed> <minutes> data/puzzles/gen-<seed>.jsonl  # generate puzzles with Stockfish
node scripts/build-puzzles.mjs  # merge generated puzzles into public/puzzles.json
```

Built with Vite + TypeScript, [chess.js](https://github.com/jhlywa/chess.js) for the rules and
[Stockfish.js](https://github.com/nmrugg/stockfish.js) (lite, single-threaded WASM) for the bots.
All state is saved in the browser's localStorage.

## Deploy (GitHub Pages + GoDaddy DNS)

Every push to `main` builds and deploys via `.github/workflows/deploy.yml`.

One-time setup:
1. GitHub → repo **Settings → Pages** → Source: **GitHub Actions**. Custom domain: `tenggames.com.au` (the `public/CNAME` file sets this too), then tick **Enforce HTTPS** once the certificate is issued.
2. GoDaddy → **My Products → tenggames.com.au → DNS**:
   - Delete any existing `A` records for `@` (and GoDaddy "Parked"/forwarding).
   - Add four `A` records, name `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Set `CNAME` `www` → `jtstacky.github.io`
3. DNS can take up to a few hours to take effect.

## Credits and licences

- Piece set "cburnett" by Colin M.L. Burnett, CC BY-SA 3.0 (`public/pieces`, and the knight outline the themed knights in `src/chess/characters.ts` are built on)
- Opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0 (`data/*.tsv`, built into `public/openings.json` by `scripts/build-openings.mjs`)
- Puzzles: 2,100 from the [lichess.org puzzle database](https://database.lichess.org/#puzzles) (CC0), via the 50k sample in [mcognetta/lichess-combined-puzzle-game-db](https://github.com/mcognetta/lichess-combined-puzzle-game-db) (`scripts/import_lichess_puzzles.py` → `data/puzzles/lichess.jsonl`); the rest are generated with Stockfish (`scripts/gen-puzzles.mjs`)
- Stockfish engine, GPLv3 (`public/stockfish`, see `COPYING.txt`); source: https://github.com/nmrugg/stockfish.js
