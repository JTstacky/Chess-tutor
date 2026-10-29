# Turn games: on-device turns, save passed through the relay

30 October 2026. Used by Heroes II (`heroes2`). Written so other turn-based
games, first Heroes III (VCMI), reuse the same server code without copying it.
Code: `relay/src/persistent-invites.js` (`TURN_GAMES`, `InviteRoom.turnMessage`,
`uploadPart`, `notify`) and `public/tg-invite.js` (lobby). Checks:
`scripts/check-heroes-local-turns.mjs`.

## The idea

- Each player's own browser runs the game for their turn. The relay never runs
  or reads the game. It stores the latest save as an opaque blob and hands it
  to the next player.
- At any moment exactly one seat is the **holder**: the seat whose device runs
  the match now. The holder has a **lease** number. Every write must carry the
  current lease, so a stale tab cannot overwrite a newer save.
- Passing the turn (**handoff**) uploads the save and names the next seat in
  one step. The relay stores it, makes that seat the holder, raises the lease
  and tells that seat it is their turn.

## Registering a game

Add one entry to `TURN_GAMES` in `relay/src/persistent-invites.js`. Nothing
else in the relay is game-specific.

```js
export const TURN_GAMES = {
  heroes2: { players: [2, 6], maxSave: 4 * 1024 * 1024, files: 'heroes2', stream: true },
  // e.g. heroes3: { players: [2, 8], maxSave: 16 * 1024 * 1024, files: 'heroes3', stream: false },
};
```

| Field | Meaning |
|---|---|
| `players` | `[min, max]` seats the creator may choose. |
| `maxSave` | Largest save in bytes. Saves travel in parts of 512,000 bytes, so several MB is fine. Relay storage is 64,000-byte chunks in the match's Durable Object. |
| `files` | The game's Retro Archive files id. A profile may create or join a match only if the accounts Worker lets it fetch `/api/retro/data/<files>/manifest`. The relay just asks; it has no tier rules of its own. So if a game's files are owner-only, its matches are owner-only, with no relay change. |
| `stream` | `true` lets the holder stream screens to one other seat and take that seat's input (Heroes II uses it for battles). `false` disables `control`, frames and `input`. |

## Match

- **Match id:** 32 lowercase hex characters, made by the creator's browser.
  The address is `wss://<relay>/invite/<game>/<id>`.
- **Socket:** WebSocket subprotocols `tg-invite` and `tg-auth.<session token>`.
  The page origin must be on `ALLOWED_ORIGINS`.
- **Create:** add `?host=1&players=<n>&bot=<wait|minutes>`. `bot` is the
  away-bot setting, a whole number from 0 to 1440, or `wait` (the default).
  The creator is seat 0 and holds the match first, with no save yet.
- **Join:** the same address without a query. Seats are given in join order and
  kept per profile. The same profile on another device gets the same seat and
  closes its old socket (code 4001).
- **Saved-games list:** `GET /games` with `Authorization: Bearer <token>`.
  Each match the profile is in comes back with `{ id, game, seat, active, yourTurn, turnSince, result }`.

## Messages

### State (relay → everyone, after every change)

```json
{ "type": "room", "game": "heroes2", "mode": "local", "capacity": 2,
  "players": [{ "seat": 0, "online": true }, { "seat": 1, "online": false, "offlineSince": 1793290000000 }],
  "holder": 1, "lease": 7, "active": 1, "order": [0, 1], "turnSince": 1793291000000,
  "checkpointPhase": 0, "savedAt": 1793291000000, "botMinutes": 5,
  "viewer": -1, "controller": -1, "now": 1793291234567, "result": "Blue wins." }
```

- `active`: the seat whose turn it is.
- `order`: the turn order the holder last sent. It's display only; the relay
  doesn't enforce it.
- `checkpointPhase`: `null` before the first save. Otherwise the phase of the
  stored save (see Phases).
- `offlineSince` and `now`: let a client work out how long a seat has been
  away, allowing for clock differences.
- `result`: only once the match has ended.

### Saves (holder → relay), binary

Each part is `[2][u32 big-endian header length][header JSON ≤ 2048 bytes][bytes]`.

```json
{ "type": "save | handoff", "id": "<≤40 chars, new per attempt>", "lease": 7,
  "phase": 0, "seat": 1, "next": 1, "order": [0, 1], "meta": { },
  "part": 0, "parts": 7, "size": 3157573 }
```

| Field | Rule |
|---|---|
| `part` | Counts 0 to `parts - 1`. Every part is 512,000 bytes except the last. |
| `parts` | Must equal `ceil(size / 512000)`. |
| `size` | At most the game's `maxSave`. |
| `seat` | The seat the save's turn belongs to, or -1 if no human's turn (for example, computer players moving). |
| `next` | `handoff` only. The seat that plays next. It cannot be the sender's own seat. |
| `meta` | Optional. Any JSON up to 1,024 bytes, stored with the save and returned only to whoever downloads it. Heroes II keeps its player colours here. |
| `order` | Optional. Distinct seats, at most `capacity` of them. |

Replies, matched by `id`:

| Reply | When |
|---|---|
| `{type:"part", id, part}` | After each part except the last. Send the next part only after this arrives. |
| `{type:"saved", id, revision}` | The last part arrived and the new save replaced the old one. |
| `{type:"refused", id, error}` | Wrong seat, wrong lease, too big, bad header, or a part out of order. On "start again", resend from part 0 with a new id. |

A new save is written beside the old one and only replaces it when the last
part arrives. So a broken upload never damages the match.

### Other holder messages (JSON)

| Message | Effect |
|---|---|
| `{type:"control", lease, viewer, controller}` | Only if `stream` is on. `viewer` gets the holder's frames; `controller` is the seat whose input the relay forwards. Use -1 for none. |
| `[1][JPEG bytes]` (binary) | A frame for `viewer`. At most 200 KB, 15 per second. |
| `{type:"complete", lease, result?}` | Ends the match. `result` is at most 200 characters. |

### Any seat (JSON)

| Message | Effect |
|---|---|
| `{type:"load"}` | Holder only. The relay sends the save in parts: `[2][len][{type:"save", lease, part, parts, checkpoint:{phase, seat, meta, size, revision}}][bytes]`. Put the parts back together in order. |
| `{type:"claim"}` | Makes the sender the holder, but only if the stored save has phase 2 and the holder is offline. Used so computer players' moves don't wait for an absent player. |
| `{type:"input", ...}` | Only when `stream` is on and the sender is both `viewer` and `controller`. The relay forwards it to the holder with `seat` added. Heroes II validates pointer and key events; another game reusing streaming would need its own input check. |

### Relay → one seat

| Message | When |
|---|---|
| `{type:"welcome", seat}` | On connecting. |
| `{type:"your-turn", game, id}` | When a handoff makes that seat the holder. |
| `{type:"input", seat, ...}` | Forwarded input, to the holder. |

## Phases

| Phase | Meaning | Who may continue from it |
|---|---|---|
| 0 | Start of the turn of `seat`, before any start-of-turn processing. Handoffs are always phase 0. | `seat` |
| 1 | Partway through `seat`'s turn. | The holder only. If they leave, the match waits for them. |
| 2 | The human's turn is over; computer players still to move. | The holder, or any seat that claims it while the holder is offline. |

## Turn handover rules (client side)

1. If `holder` is your seat and there is a save: send `load`, start the game
   from it, and play. With no save, you are the creator: start a new game.
2. Upload a phase 1 save now and then (Heroes II: at most every 3 minutes, and
   when the tab is hidden). That way a closed tab loses little.
3. When your game reaches another human's turn, send a `handoff` with phase 0
   and `next` = their seat. Then stop running the game until you are holder
   again.
4. When your turn ends and computer players move next, upload phase 2 first if
   that takes long (Heroes II: after 5 seconds). Then someone else can carry
   on if you leave.
5. If another seat is the holder, show a waiting screen. If the stored save is
   phase 2 and the holder is offline, send `claim`.
6. If a newer lease appears while your game is running, your copy is out of
   date. Stop it and reload from the server when it is your turn again.

## Absent players and the away bot

- The bot setting is chosen when the match is created and appears as
  `botMinutes` in the state (`null` means wait).
- The relay only reports who is online and since when. The holder's game
  decides what to do when it needs an absent seat (a battle, a choice):
  - **wait** (`botMinutes` is null): pause. The server keeps the last save, so
    the holder may close the tab and the match continues when both are back.
  - **N minutes**: once that seat has been offline N minutes (`now`,
    `offlineSince`), let the game's own AI play that part for them.
- A seat that has never joined counts as away since the match was created.

## Notifications

- **Open tab:** the relay sends `your-turn` to the next seat. The lobby
  (`tg-invite.js`) shows a browser notification if the tab is in the
  background and the player allowed notifications (it asks on Create or
  Join). It also marks the tab title until the player looks.
- **Any device:** `GET /games` returns `yourTurn` and `turnSince`, so a games
  page can show "Your turn".
- **Closed tabs:** not built yet. A Web Push channel would hook into
  `InviteRoom.notify(seat, event)`. It needs VAPID keys, a subscription store
  per profile, and the owner's go-ahead to deploy.

## Lobby options (`tg-invite.js`)

`TengInvite.mount({ game, parent, turn: { players: [min, max], awayBot: true }, title, onState, onMessage, onFrame, onDisconnect })`.

- Binary messages reach `onFrame` with the tag byte still in front.
- JSON other than `room` and `welcome` reaches `onMessage`.
- `api.send(obj | ArrayBuffer)` returns `false` when the socket is closed or busy.

## Not covered

- Simultaneous turns: one holder at a time.
- Hiding the save from other players: the holder can read it.
- Spectators.
- Web Push to closed tabs.
