# Controller settings in pause menus

The site controller service (`public/tg-controller.js`, loaded by `tg-profile.js`)
owns the controller preferences. It no longer creates a floating controller-help
button. Settings (which includes the controller) is an item inside each game's
pause/options menu.

## Teng Games standard (28 October 2026)

Every game shares these, from the two site scripts; no game was rebuilt.

- **Pause menu** (games using the shared menu): Resume · Settings · Original game
  menu (keen, jazz, cosmo, pop, tyrian, omf only) · Quit to Teng Games, or Leave
  match online. Quitting asks first; Cancel or B goes back.
- **Games with their own menus** keep them. The shared item is named
  **Settings**, or **More settings** where the game already has its own
  settings screen (Chess, Arcane Arena, Hammerguy's Party, Mission Mars).
  "Keep playing" reads "Resume" everywhere. Zeliard's canvas item is renamed by
  the build hook.
- **Settings page**: Volume (0–100 %, Off at 0), Full screen (where the browser
  allows it; not iPhone), Vibration (where supported), game-only options
  (Battle Bots: mouse look speed, invert), then Controller: status, the game's
  button help, enable, stick dead zone.
- **Stored per device**, like the controller settings: `tg.settings`
  `{volume, vibration}` next to `tg.controller.settings`. Site keys are never
  part of a profile's game data.
- **Volume and vibration** are applied by `tg-profile.js` before any game code
  runs. Every Web Audio graph connected to the speakers goes through one gain
  node per audio context (offline contexts are left alone). `<audio>`/`<video>`
  play at the game's own volume times the site volume, and games read back their
  own value. `navigator.vibrate` does nothing while Vibration is off. Games keep
  their own mute and music switches; the site volume multiplies them.
- **Arcane Arena and Hammerguy's Party** share an engine and used to share the
  `aa-muted`/`aa-volume` keys, so muting one muted the other. On Hammerguy's
  pages `tg-profile.js` maps them to `hp-muted`/`hp-volume`.
- **Metal Slug** (all seven pages): Settings in the header, styled like the
  header buttons; Esc presses the game's Pause. Start stays the arcade Start and
  Select inserts a coin. The page's own pad reading gets the site dead zone and
  the controller on/off switch (`navigator.getGamepads` returns filtered pads).
- **Profile script guard**: `npm run build` re-adds `/tg-profile.js` as the
  first element of `<head>` on every game page (`public/<game>/index.html`,
  `public/<game>/game/index.html`, `public/retro/web/<id>/index.html`) and fails
  if any page still lacks it. A Mission Mars refresh on 27 October had dropped
  it, which turned off profile saves and the controller there.

Not standardised yet (each needs changes inside a game build, so it needs
that game's own project):
- **Pause button position.** Demon Dragon, Battle Bots and Escape Velocity keep
  their offsets, which avoid their HUDs.
- **Rotate prompts and touch layouts.** These stay per game.
- **Stacked dead zones.** The Arcane Arena and Battle Bots bundles add their own
  dead zone (radial 0.25 and 0.18) on top of the site slider.

| Published game | Integration |
| --- | --- |
| Revenge of the Demon Dragon | Pause menu; freezes simulation, quest clock, rendering and tweens; clears held keyboard/touch input |
| Hoot's Chess Club | Pause and settings dialog; pauses the chess clock |
| Beast Binder | Existing Menu / Paused panel, including rebuilt panels |
| Arcane Arena | Existing Options menu |
| Hammerguy's Party | Existing Options menu |
| Mission Mars | Existing Pause and Settings menus; portrait prompt can open Pause |
| Ninja Nab | Existing Pause screen; menus remain accessible in portrait |
| Battle Bots | Game menu; explicitly says online matches keep running |
| Zeliard | Item in the native canvas PauseScene, usable by touch, keys and pad |
| Escape Velocity and Override | Shared pause menu; existing touch Pause opens it; Resume clears a native/visibility pause |
| Commander Keen, Jazz Jackrabbit, Cosmo, Prince of Persia, Tyrian 2000, One Must Fall 2097 | Shared pause menu; Original game menu preserves access to native menus and save/load |
| ZZT | Shared pause menu; native keyboard Escape/quit remains available |
| Heroes II Gold, ScummVM Adventure Classics, OpenTTD, The Incredible Machine | Shared pause menu; native pointer controls and Escape remain available |
| Lemmings and Oh No! More Lemmings | Existing pause overlay; native game timer stays suspended while changing settings |

Settings include controller gameplay enable/disable and stick dead zone. Menu
navigation continues to work when controller gameplay is disabled. Back returns
to the paused game menu; Resume resumes. Inputs must return to neutral after
opening a menu, blur, disconnect, or dismissal, preventing held actions from
leaking into gameplay. Settings dialogs scroll at small landscape sizes, have
44px targets, and use native modal focus containment.

Mouse-oriented games retain their touch/mouse gameplay. The controller settings
explain that limitation rather than claiming unsupported gameplay controls.

## Build integration

`npm run build` runs `scripts/controller-pause-engines.mjs` before TypeScript and
Vite. This idempotent integration reapplies the loose-file game hooks and the
vendored retro engine guards if an upstream game publisher refreshes the site.
It does not rebuild unrelated game projects or touch private game data.

Emscripten loops resume only when this menu paused a running loop. Asyncify/JSPI
sleep and frame continuations wait on a resume promise. ZZT and TIM have guards
in their own frame functions. Updating an incompatible TIM/ZZT bundle fails the
build with a request to review its adapter.

## Verification (23 October 2026)

- 93 browser checks: 23 entries/variants at desktop (1280×800), tablet
  (820×1180), phone (390×844), landscape phone (844×390), plus gameplay/input
  checks in Demon Dragon. Native options navigation is checked against its
  foreground menu, including settings toggles, dead-zone adjustment, input
  release, disabled gameplay, Back and Resume, and Escape Velocity's native pause.
- All twelve retro engines booted with isolated local game-data fixtures. Their
  pause/settings/resume flows passed, with frozen canvas comparisons and frame
  counters where available. Native save/load-menu forwarding also passed.
- Actual touch events, keyboard input and a virtual standard gamepad were used.
  Physical USB/Bluetooth pairing was not tested.
- TypeScript, Vite production build, JavaScript parse checks and diff whitespace
  checks passed. Phone screenshots for every entry and representative landscape
  screenshots were visually inspected.

Run the browser checks against a local dev server:

```sh
node scripts/check-controller-menus.mjs
node scripts/check-controller-engines.mjs
```

They require an existing Playwright installation (optionally selected with
`PLAYWRIGHT_PACKAGE`) and installed Chrome. `QA_URL` selects the local server;
it defaults to `http://127.0.0.1:8836`. The engine check also requires
`RETRO_PRIVATE_ROOT`, pointing at existing local private fixtures. Fixtures are
fulfilled directly into the isolated test browser and never copied into the
public site. Test results and screenshots are written under ignored `.qa/`.
All account API requests are stubbed; these tests do not use a live identity or
write to production services.
