// PeerJS 1.5.5 (MIT, see peerjs-LICENSE.txt) is loaded as a classic script (vendor/peerjs.min.js, which sets
// window.peerjs). The shared engine does `import { Peer } from 'peerjs'`; index.html's import map points that here,
// so the engine files stay byte-for-byte the shared copy with no build step.
export const Peer = globalThis.peerjs?.Peer;
