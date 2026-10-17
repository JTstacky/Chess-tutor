// EV 1.0.5 random number generator, transcribed from FUN_100653a4 (research deep-ai-spawn §1):
// a 16-bit-split Park-Miller step followed by an unconditional +0x80000001 fold.
//   state' = (16807 * state mod (2^31-1)) + 0x80000001   (mod 2^32)
//   Rand(n) = (n * (state' & 0xFFFF)) >> 16, low word 0x8000 forces 0
export class EvRandom {
  constructor(seed = 1) { this.state = seed >>> 0; }
  step() {
    this.state = (((16807 * this.state) % 2147483647) + 0x80000001) >>> 0;
    return this.state;
  }
  // Rand(n): integer 0..n-1
  rand(n) {
    const low = this.step() & 0xffff;
    if (low === 0x8000 || n <= 0) return 0;
    return Math.floor((n * low) / 65536);
  }
}
