// Player commands, one per entry in the original key-configuration dialog (EV PICT 132).
// Every input device (keyboard now; touch, gamepad or a network client later) produces
// the same commands, so the engine never sees raw keys.
export const CMD = {
  // navigation
  ACCELERATE: 'accelerate', REVERSE: 'reverse', RIGHT: 'right', LEFT: 'left', AFTERBURNER: 'afterburner',
  AUTOPILOT: 'autopilot', HYPER_MODE: 'hyperMode', HYPER_SELECT: 'hyperSelect', JUMP: 'jump', NAV_OFF: 'navOff',
  // escorts
  RETARGET: 'retarget', RECALL: 'recall', RECALL_FIGHTERS: 'recallFighters', HOLD: 'hold',
  // weapons
  FIRE_PRIMARY: 'firePrimary', FIRE_SECONDARY: 'fireSecondary', SELECT_SECONDARY: 'selectSecondary',
  WEAPON_SAFETY: 'weaponSafety', TARGET_SELECT: 'targetSelect', CLOSEST_TARGET: 'closestTarget',
  // misc
  PAUSE: 'pause', ACKNOWLEDGE: 'acknowledge', COMMUNICATE: 'communicate', LAND: 'land', JETTISON: 'jettison', JETTISON_NONMISSION: 'jettisonNonMission',
  BOARD: 'board', EJECT: 'eject', DESTRUCT: 'destruct', MAP: 'map', PLAYER_INFO: 'playerInfo',
  MISSION_INFO: 'missionInfo', CLOAK: 'cloak', HAIL_PLANET: 'hailPlanet',
  // the fixed stellar keys (not in the Prefs dialog): nav stellar 1-4, and the nearest landable one
  NAV1: 'nav1', NAV2: 'nav2', NAV3: 'nav3', NAV4: 'nav4', NAV_NEAREST: 'navNearest',
};

// Commands that act while held (sampled every step); all others act on press.
export const HELD = new Set([CMD.ACCELERATE, CMD.REVERSE, CMD.RIGHT, CMD.LEFT, CMD.AFTERBURNER,
  CMD.FIRE_PRIMARY, CMD.FIRE_SECONDARY, CMD.AUTOPILOT, CMD.NAV1, CMD.NAV2, CMD.NAV3, CMD.NAV4, CMD.NAV_NEAREST]);

// One step of input: `held` = commands down this step, `pressed` = commands that went down.
export const emptyInput = () => ({ held: new Set(), pressed: new Set() });
