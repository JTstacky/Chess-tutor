# Teng Games high scores

Global high-score tables for Revenge of the Demon Dragon. A small Cloudflare Worker with one
SQLite Durable Object holds every board; Cloudflare's free plan is enough. It is separate from
the multiplayer relay, so changes here never touch multiplayer.

- `GET /scores?board=<board>&limit=10` lists the top scores.
- `POST /scores` submits a result and answers with its rank.
- Boards: `quest` (a whole story run) and one per dragon for Trials (`thunder`, `water`,
  `fire`, `earth`, `demon`).

The server recomputes every score from the fight records with the game's formula (`fightScore`
in the game's `js/data.js`), so the two must stay in step. Trials boards accept only the
standard Trials knight, so they compare fairly. It keeps the top 200 per board and limits each
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
