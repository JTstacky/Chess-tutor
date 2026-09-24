# Teng Games: Hoot's Chess Club

A chess tutor for kids, hosted at **tenggames.com.au**. See [SPEC.md](SPEC.md) for the requirements and roadmap.

- `/`: Teng Games landing page (games menu)
- `/chess/`: the chess app (play bots, pass-and-play, clocks, takeback, hints, coaching, game review, lessons and puzzles, themes, battle animations)

## Battles and themes

- **Fun piece moves** (`src/chess/moveanim.ts`): pawns hop, knights leap, bishops glide with a sparkle trail,
  rooks rumble and land with a thud, queens teleport, kings waddle.
- **Capture battles** (`src/chess/battle.ts`): every capture opens a little 2D arena on the board. Each of the
  30 attacker/victim pairs has its own cartoon attack (Pillow Fight, Frog Spell, Tower Sumo, Dance-Off, Royal
  Trapdoor…). Tap to skip. Clocks pause while a battle plays. Pick any pair in the **Battle Arena** menu.
- **Themes** (`src/chess/themes.ts`): Classic, Fantasy (Unicorn Kingdom vs Dragon Clan), Space (Robot Squad vs
  Alien Crew), Ocean (Dolphin Reef vs Shark Squad), Candy (Cupcake Crew vs Choco Gang) and Dino (Tricera-Team vs
  T-Rex Gang). Chosen when starting a game. Pieces are recoloured versions of the cburnett set
  (`src/chess/pieceart.ts`).
- Both animation types can be switched off in Settings (they default to off if the device asks for reduced motion).

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

- Piece set "cburnett" by Colin M.L. Burnett, CC BY-SA 3.0 (`public/pieces`)
- Opening names from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0 (`data/*.tsv`, built into `public/openings.json` by `scripts/build-openings.mjs`)
- Stockfish engine, GPLv3 (`public/stockfish`, see `COPYING.txt`); source: https://github.com/nmrugg/stockfish.js
