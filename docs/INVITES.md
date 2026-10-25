# Private game invites

Prepared 25 October 2026 on `games/shared-invites`. Not published yet.

Chess: Play a Friend → Invite a friend online → Create invite → Copy invite link (or Share). The second signed-in profile opens it and selects Join game. Host plays White, invitee Black. Moves are validated by chess.js in the relay, with castling, promotion, en passant, game-over detection, resign and mutual draw agreement. No online clock. Reload and rejoin restores the same seat and move history, for the invite's 24-hour lifetime. Play pauses while either player is offline.

Heroes II: open Heroes II, create the same kind of invite, and start the native game. Choose New Game → Multiplayer → Hot Seat → 2–6 players and a scenario. The host runs the existing fheroes2 engine. At the game's handover prompt, use Pass control for the intended player. Pass control during human battles as needed too. Only the active invited player receives screen frames and can send game input. The host always sees the screen. Other waiting players see a cover. Everyone must have an approved full-account profile; the invite does not grant access. Sound and native saves stay on the host device. Keep the host tab open and visible.

The host can resume a saved game after reloading: rejoin the link, press Play, then Load Game → Multiplayer → Hot Seat. After an invite expires, create a new one and load the saved game. A host disconnection covers the invited players' screens and returns control to the host seat. Player seats cannot be taken over by adding `host=1` to a link. Host can end an invite; this invalidates the room for everyone and preserves the device save.

## Implementation

- `public/tg-invite.js` / CSS provide the same lobby, private-link sharing, seats, reconnect, leave and end controls for both games. The invite is 128 random bits in the URL fragment, preserved through the existing sign-in flow. No usernames, email, directory, public room listing or chat are added.
- `/invite/{chess|heroes2}/{32-hex}` is a separate relay namespace, in a new `InviteRoom` Durable Object. The existing four-letter room protocol remains unchanged. The additive `v2-invites` migration creates this class; no accounts D1 migration, auth-code change or game-data route change is needed.
- Every connection validates the existing profile token against `/api/me`; Heroes requires tier `full`, and account-stage/guest/invalid sessions are refused. The token travels in the WebSocket subprotocol header, never in the invite URL, room state or persisted room data. Browser origins are checked. The browser uses only the configured production relay; a relay override is accepted only on localhost for testing.
- Room storage contains internal profile IDs, seat assignment, chess moves/result and expiry. Clients receive generic seat labels, never other families' profile names or IDs. Rejoining the same profile replaces its prior socket. The 24-hour alarm clears expired room data and retains an ended tombstone so an old link cannot be revived.
- Heroes transmits bounded 640×480 JPEG snapshots and validated pointer/key events. Native WebGL pixels are copied at the engine's presentation callback before its drawing buffer is cleared. Identical JPEGs are deduplicated, with a periodic refresh, and outgoing congestion is bounded. Screen bytes are never stored by the relay. Input and frames are routed only to/from the assigned controller; local host game input is blocked while a guest controls it.

## Validation

- `npm run build`: TypeScript and production Vite build pass, including existing controller/pause integration.
- Relay `wrangler deploy --dry-run --outdir ../.invite-worker-build`: bundles both Durable Objects and additive migration successfully. This does not deploy.
- `node scripts/check-invites.mjs`: 10 local API suites pass. Includes missing/invalid/guest/account-stage tokens, origin and full-account checks, room capacity, host takeover attempts, illegal/out-of-turn/stale chess moves, checkmate, draw agreement, offline pause, seat recovery, Heroes active-only frames/input, host/controller disconnection, ending rooms, and the old relay protocol.
- `scripts/check-invites-browser.js` via Playwright: 19 checks pass against the **production build**, using isolated local fixture profiles. Desktop 1280×900, phone 390×844 and 844×390, tablet 820×1180. Both-direction chess moves, reload, draw; Heroes real rendered pixels, two-human Hot Seat setup, touch hero movement with movement-point reduction, native `.savh` quick save, next-human turn handover, screen covering, reconnect and native reload restoring the same hero/tile/movement. No browser exceptions. Profile state sync is stubbed during this game test; real session checks go to the isolated local accounts Worker.
- Local animated adventure-screen sample (5.00 s): 4.00 transmitted frames/s, 327.4 KiB/s to the active guest. This measures a local relay, not Internet latency or physical-device speed. Slow networks can add delay. Sound is host-only.
- Original `Retro Archive/tools/check-heroes2.mjs`: desktop/tablet/phone native movement, save/reload and phone zoom/pan pass. Simulated phone 4× CPU benchmark: native cursor input/presentation median 24.6 ms, max 31.7 ms, ~60 display fps. Online service is intentionally absent in that standalone test; solo play continues successfully.
- `Retro Archive/tools/stage-heroes-invites.mjs`: stages only the Heroes page and its referenced assets, checks the static output against private Heroes data hashes, and regenerates the corresponding-source tarball. No commercial game files in the staged output. All other games' tracked files are preserved.

## Local test setup

Existing local services on ports 8805/8806 belong to other work; do not stop or reuse them.

1. From `work/ev-online/cloud`, initialize an isolated schema with Wrangler D1 `--local --config wrangler.retro-dev.toml --persist-to ../../invite-test-db --file schema.sql`, then `wrangler dev --config wrangler.retro-dev.toml --port 8812 --persist-to ../../invite-test-db`.
2. From `site/relay`, `node node_modules/wrangler/bin/wrangler.js dev --port 8810 --var ACCOUNTS_API:http://127.0.0.1:8812 --persist-to ../.invite-relay-state`.
3. From `site`, run Vite dev on 8811 (test fixtures only), `node scripts/check-invites.mjs`, and `npm run build`. Preview the production build on 8814.
4. From Retro Archive, preview `tools/_work/invites-heroes-dist` on 8813 with `RETRO_PUBLISH=heroes2`. The browser suite routes original files through this local private-data middleware; they are never copied into the site.
5. Run the browser suite with the Playwright tool. Its fixtures live only in ignored `.qa/`; never publish them.

## Release, after explicit approval

The Accounts project's AGENTS.md requires an explicit go-ahead for pushes/deploys/live database changes. Everything here is local and reviewable first.

Review/rebase `games/shared-invites` against current site main, keep the feature on a branch, then publish through the site's normal PR/release workflow after approval. Deploy the relay with its additive `InviteRoom` binding/migration **before** serving the updated game pages. No accounts Worker deploy or production D1 schema migration is required. The existing relay workflow also deploys on approved changes merged to main. Keep the full-account-only original-data service as-is. Verify the live sign-in → invite → two-player flow with approved disposable test profiles; never log real profile tokens.

Rollback: return site pages to the prior site version; the existing relay class remains present and unchanged. Keep the new Durable Object class/binding in a compatible forward deployment rather than attempting to undo a Cloudflare migration.
