// Recognises engine log lines that mean the game has stopped for good (a crash or a fatal error),
// so the page can say so instead of leaving a blank canvas.
const FAILURE = /Pthread .* sent an error|RuntimeError:|worker: onmessage\(\) captured an uncaught exception|FATAL ERROR|^Aborted\(|^VCMI stopped:/;
const strip = line => String(line).replace(/\x1b\[[0-9;]*m/g, '');
export function isEngineFailure(line) {
  return FAILURE.test(strip(line));
}
// The player chose Quit: VCMI ends its main loop and the runtime reports a clean exit.
export function isEngineExit(line) {
  return /program exited \(with status: 0\)/.test(strip(line));
}
