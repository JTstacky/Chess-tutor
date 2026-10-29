# Persistent private game invites

Chess and Heroes II invitations are enabled. The private Cloudflare Heroes host was deployed and accepted on 27 October 2026. Replaces the browser-host prototype.

Chess: Play a Friend → Invite a friend online → Create invite → Copy invite link or Share. A second signed-in profile joins once. Player 1 is White; Player 2 is Black. The relay validates chess moves, promotion, castling, en passant and results, and supports resign/mutual draw. No clock. Take your turn with the opponent offline, leave and return later. Game links, seats and move history persist on the server without a 24-hour expiry.

Heroes II uses the same invite flow, saved-game list and profile seats. Choose 2–6 humans and what happens when a player is away during their battle (wait, or the computer fights after 0–60 minutes) before creating. Since 30 October 2026 **each player's turn runs on their own device** (no lag); the relay keeps the native save and passes it to the next human at each turn change (about 257 KB each way). Full profiles are required for everyone, and every player downloads the original game files as in solo play (owner approved). A battle against another human streams to that player only for the battle. Design and checks: Retro Archive `docs/HEROES-INVITES.md`; relay rules: `scripts/check-heroes-local-turns.mjs`.

Open the same link later, or use Your saved games under the same profile on another device. The game waits at an offline human's turn. Closing the tab mid-turn resumes from the last save (backups at most every 3 minutes, and when the page is hidden). Games started on the old cloud host continue from their last save.

## Managed Heroes host

**Retired 30 October 2026.** The relay no longer wakes this host for Heroes; the notes below are history. The container can be removed from Cloudflare when convenient.

The host runs at https://tenggames-heroes-server.justintengyz.workers.dev and connects to the existing relay through a private service binding. One basic instance runs one native game context. Offline adventure games park after a short grace period; complete cloud checkpoints survive container replacement. Battles and dialogs retain their live context. Waiting games load as the engine slot becomes available. Cold starts can take a minute.

The image uses Debian chromium-headless-shell and contains no original commercial data or credentials. Originals are fetched and hash-verified through the existing private service route. The host exposes only authenticated aggregate health/wake and administrative restart, with no renderer, save or data proxy. Wake retries survive cold starts and container rollouts. Renderer crashes and stalled cleanup recover from cloud adventure checkpoints.

The owner approved an automatic runtime cutoff for a US$10 monthly target. Heroes reserves at most 60 server-hours in a rolling 31 days, in prepaid 15-minute leases that include startup/idle time and are not refunded on restart. Six hours initially cover earlier deployment/testing. Cloud and Node deadlines stop the server at expiry; exhausted runtime blocks starts without deleting saves. The relay stops frequent retries and shows the next availability time. Chess is unaffected. Cloudflare's existing alert is lowered to US$3 usage (about US$8 with the US$5 plan). This is a Heroes runtime guard, not an account-wide billing cap: other services, ancillary charges and taxes remain outside it.

## Implementation

- `public/tg-invite.js` supplies the common lobby, 128-bit fragment invite links, sharing, persistent profile-private game list and reconnect/leave controls. There is no email, directory, public room listing or chat. Share sends through the user's own browser share sheet.
- `/invite/{chess|heroes2}/{32-hex}` uses `InviteRoom` Durable Objects; `/games` returns only the authenticated profile's games. `HeroesJobs` indexes rooms for the non-player service and saved-game list. Migrations `v2-invites` and `v3-nonplayer-server` are additive. The existing four-letter relay remains separate.
- Existing profile sessions validate through `/api/me`. Guest/account-stage sessions are refused; Heroes also requires full tier. Browser origins and production relay URLs are restricted. Player tokens travel in WebSocket subprotocol headers, never invite URLs or room storage. Generic seat labels expose no profile names/IDs.
- `/service/heroes2/jobs` and `/service/heroes2/<id>` require a separate server-only `HEROES_SERVICE_TOKEN`. Player credentials never grant this access. Service-only turn generations prevent stale pixels/input crossing ownership. Browser frame, checkpoint and ownership uploads are ignored.
- Full native saves persist atomically in Durable Object storage as 64,000-byte chunks. Players see saved timestamps only. Source and separate-host deployment instructions live in `Retro Archive/server/README.md`. No accounts Worker or D1 migration is required.

## Local validation and release

`node scripts/check-persistent-invites.mjs` uses isolated fixture profiles and a mock service: ten suites cover profile/origin/service credentials, creator restrictions, native ownership, pixel/input isolation, multi-chunk saves, reconnect, offline chess, profile-private index, native-only completion and the existing relay protocol. Stop the real Heroes service before running the mock-service suite.

Browser scripts `check-persistent-chess-browser.js`, `check-nonplayer-browser.js` and `check-nonplayer-return.js` exercise desktop/phone/tablet UI with local accounts and relay services. Additional private native movement/restart checks live in `Retro Archive/server/check-async.mjs`. Old browser-host tests have been removed; they no longer describe the product. Current detailed results/gaps are in `Retro Archive/docs/NONPLAYER-SERVER-CHECKPOINT.md`.

Run `node scripts/provision-invite-fixtures.mjs` to initialize isolated local fixture accounts and local secret files; it explicitly uses only Wrangler `--local`. Start the isolated accounts Worker with `--config wrangler.retro-dev.toml --port 8812 --persist-to ../../invite-test-db` and the relay with `--port 8810 --var ACCOUNTS_API:http://127.0.0.1:8812 --persist-to ../.persistent-relay-state` before integration tests. Local fixtures remain ignored under `.qa/`; relay local test secret is ignored under `relay/.dev.vars`; local persistent state is ignored under `.persistent-relay-state/`. Never publish any of those files. Test ports: relay8810, fixture site8811, isolated accounts8812, production preview8814. Existing8805/8806 belong to other work.

Run `npm run build` and `node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir ../.persistent-worker-build` from `relay/` for the Worker bundle. Dry run does not deploy.

The Accounts project's AGENTS.md requires explicit approval for pushes/deployments/live changes. After approval: review/rebase the feature branch, deploy the relay migrations and server secret, install and validate the service on the selected separate always-on host, then release the site through its normal PR workflow. Do not release the Heroes UI until that server is healthy. Original game data remains private; preserve existing `/api/retro/data` access checks.

Rollback the site to its prior version if needed; preserve Durable Object classes, bindings and saved storage in a compatible forward Worker deployment. Never try to undo a deployed migration or delete game volumes as a rollback.
