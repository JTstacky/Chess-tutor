# Teng Games high scores

Global high-score tables for Revenge of the Demon Dragon. A small Cloudflare Worker with one
SQLite Durable Object holds every board; Cloudflare's free plan is enough. It is separate from
the multiplayer relay, so changes here never touch multiplayer.

- `GET /scores?board=<board>&limit=10` lists the top scores.
- `POST /scores` submits a result and answers with its rank.
- Board: `quest2`, a whole story run (all five dragons) on one quest clock that also runs in
  the open world, with deaths costing points. Only `quest2` takes new scores; the older boards
  (`quest` before the clock, and one per dragon from when Trials were scored) stay readable.

Each entry also carries the knight's look (three digits from the game's character creator),
shown as portraits of the top three. Names go through `src/names.js`, a copy of the game's
`js/names.js` (keep them identical): rude names are stored as "Knight".

The server recomputes every score from the fight records, the quest clock and the deaths with
the game's formulas (`fightScore` and `questScore` in the game's `js/data.js`), so the two must
stay in step. It keeps the top 200 per board and limits each
address to a few submissions a minute. This stops casual tampering, not a determined cheat:
the game runs in the browser.

## Deploying

`.github/workflows/scores.yml` deploys it whenever `scores/` changes, using the same
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets as the relay (see `relay/README.md`).
The game posts to `https://tenggames-scores.justintengyz.workers.dev`; a page can use another
server with `?scores=<url>`.

## Local development

```bash
cd scores
npm install
npm run dev   # http://localhost:8788
```
