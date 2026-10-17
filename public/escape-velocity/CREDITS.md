# EV Online credits

A browser recreation of Escape Velocity (1996) and Escape Velocity Override (1998).

## Original games

From each game's own About box, which this recreation also shows unchanged (with the full lists, the
Ambrosia crew and the beta testers):

- **Escape Velocity** (1996) by **Matt Burch**, © 1996 Ambrosia Software, Inc.
  Programming, game and sprite artwork, and scenario design: Matt Burch. Logos, titles and main screen art:
  Mark W. Lewis. Additional graphics: Adam Burch. Music: Killer Tracks & Ambrosia Labs. Sprite Animation Toolkit:
  Ingemar Ragnemalm. Ambrosia Sound Tool & Monitor Tool: Andrew Welch. Additional missions: Jeremy Condit,
  Doug Hempel, Tim Aldrich. Vocal talent: Patrick Delahanty.
- **Escape Velocity: Override** (1998) by **Matt Burch**, © 1996-2000 Ambrosia Software, Inc.
  Programming: Matt Burch. Game and sprite artwork: Matt Burch, Chris West, Peter Cartwright. Scenario design:
  **Peter Cartwright**. Logos, titles and main screen art: Mark W. Lewis, Steve Kody. Music: Killer Tracks &
  Ambrosia Labs. Sprite Animation Toolkit: Ingemar Ragnemalm. Ambrosia Sound Tool & Monitor Tool: Andrew Welch.
  Vocal talent: Patrick Delahanty.

All game data, pictures, sprites, sounds and text are theirs. These games have been released under an open
licence (confirmed 2026-10-14). The original data files are used unchanged, apart from conversion to PNG, WAV and
JSON. The game's own fonts embedded in the original data (`gamedata/<game>/ui/font-*.ttf`) come from the same
release. This recreation is an unofficial fan project and is not affiliated with Ambrosia Software or the original
authors.

## Fonts

- **Geneva 9** by Kelsey Higham, made with FontStruct (https://fontstruct.com/fontstructions/show/349277).
  Licensed under Creative Commons Attribution 3.0 (CC BY 3.0); see `licenses/geneva-9-CC-BY-3.0.txt`.
  The font ships with its own `license.txt` and `readme.txt` in `game/fonts/geneva-9/`, as its licence requires.
- **EVSys, EVTimes and EVGeneva**: stand-ins for the Mac system font, Times and Geneva 7. They are Modified Versions
  of the Liberation fonts 2.1.5 (Copyright (c) 2012 Red Hat, Inc.; digitized data copyright (c) 2010 Google
  Corporation), licensed under the SIL Open Font License 1.1; see `licenses/stand-in-fonts-OFL.txt` and
  `game/fonts/standins/README.txt`. They are renamed because the licence reserves the names "Liberation", "Arimo",
  "Tinos" and "Cousine".

## HD art (optional)

- The HD pictures (the "art: HD / Original" switch above the game) are AI upscales of the original pictures and
  ship sprites. They were made with OpenAI gpt-image-2 (through Codex) and Venice's upscaler, from the original art, and
  checked against it. They are derived from the original game art and share its licence. The original art is always
  kept and used for gameplay (hit boxes, timing).

## Software

- The game engine and client are written for this project, with no third-party code in the browser.
- The multiplayer prototype server (not part of this release) uses `ws` (MIT licence).
