# Persistent private game invites

Prepared locally, 26 October 2026, branch `games/shared-invites`. Not deployed. Replaces the browser-host prototype.

Chess: Play a Friend → Invite a friend online → Create invite → Copy invite link or Share. A second signed-in profile joins once. Player 1 is White; Player 2 is Black. The relay validates chess moves, promotion, castling, en passant and results, and supports resign/mutual draw. No clock. Take your turn with the opponent offline, leave and return later. Game links, seats and move history persist on the server without a 24-hour expiry.

Heroes II uses the same invite flow, saved-game list and profile seats. Choose 2–6 humans before creating. The separate **non-player server** runs the native Hot Seat engine and owns its save. Player 1 chooses the original scenario/options. The native engine switches human ownership automatically, including battles; no player has a Pass control or host override. Only the active player receives pixels and can send input. Full profiles are required for everyone. Waiting players get no opponent frames, and their old canvas is erased. No player browser downloads the native online save or original commercial data. No player needs to keep a tab open.

Open the same link later, or use Your saved games under the same profile on another device. Heroes pauses at offline human turns. A service interruption covers all screens and retains cloud saves. An engine crash during battle/modal work returns to the last stable adventure checkpoint; disconnecting a player retains the live battle/dialog on the server.

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
