// Heroes II turn-game wire format, shared by the Heroes III relay registration.
import { Sha256 } from './sha256.js';
import { importSave } from './saves.js';

export const PART_BYTES = 512000;
const MAX_SAVE_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const digestPattern = /^[a-f0-9]{64}$/;
const matchPattern = /^[a-f0-9]{32}$/;

const seatOK = seat => Number.isInteger(seat) && seat >= 0 && seat < 8;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function encodePart(header, bytes) {
  const json = encoder.encode(JSON.stringify(header));
  if (json.length > 2048) throw Error('Turn-save header is too large.');
  const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const frame = new Uint8Array(5 + json.length + body.length);
  frame[0] = 2;
  new DataView(frame.buffer).setUint32(1, json.length);
  frame.set(json, 5);
  frame.set(body, 5 + json.length);
  return frame.buffer;
}

export function decodePart(buffer) {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (view.length < 6 || view[0] !== 2) throw Error('Invalid turn-save frame.');
  const length = new DataView(view.buffer, view.byteOffset, view.byteLength).getUint32(1);
  if (!length || length > 2048 || 5 + length > view.length) throw Error('Invalid turn-save header.');
  let header;
  try { header = JSON.parse(decoder.decode(view.subarray(5, 5 + length))); }
  catch { throw Error('Invalid turn-save header JSON.'); }
  return { header, bytes: view.subarray(5 + length) };
}

async function hashBlob(blob) {
  const hash = new Sha256();
  for await (const chunk of blob.stream()) hash.update(chunk);
  return hash.hex();
}

function checkedColors(colors, capacity) {
  if (!Array.isArray(colors) || colors.length !== capacity ||
      colors.some(color => !seatOK(color)) || new Set(colors).size !== colors.length)
    throw Error('Invalid seat-to-colour map.');
  return colors;
}

function newId() {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class TurnRelayClient {
  constructor({ send, seat, onStale = () => {}, timeoutMs = 30000, idFactory = newId }) {
    if (typeof send !== 'function' || !seatOK(seat)) throw Error('Invalid relay client.');
    this.send = send;
    this.seat = seat;
    this.onStale = onStale;
    this.timeoutMs = timeoutMs;
    this.idFactory = idFactory;
    this.room = null;
    this.runningLease = null;
    this.uploading = null;
    this.loading = null;
    this.claiming = null;
  }

  onState(room) {
    this.room = room;
    if (this.runningLease != null && room.lease !== this.runningLease) {
      this.runningLease = null;
      this.failPending(Error('A newer lease replaced this game.'));
      this.onStale(room);
    }
    if (this.claiming && room.holder === this.seat && room.lease > this.claiming.lease) {
      this.claiming.resolve(room);
      this.claiming = null;
    }
  }

  onMessage(message) {
    const job = this.uploading;
    if (!job || message?.id !== job.id) return;
    if (message.type === 'refused') {
      job.reject(Error(message.error || 'Relay refused the save.'));
      this.uploading = null;
    } else if (message.type === 'part') {
      if (message.part !== job.nextPart - 1) {
        job.reject(Error('Relay acknowledged the wrong save part.'));
        this.uploading = null;
      } else {
        this.sendUploadPart(job).catch(error => {
          job.reject(error);
          this.uploading = null;
        });
      }
    } else if (message.type === 'saved') {
      if (job.nextPart !== job.parts || !Number.isSafeInteger(message.revision) || message.revision < 1)
        job.reject(Error('Relay returned an invalid save confirmation.'));
      else job.resolve({ revision: message.revision, sha256: job.sha256 });
      this.uploading = null;
    }
  }

  onFrame(frame) {
    const job = this.loading;
    if (!job) return;
    try {
      const { header, bytes } = decodePart(frame);
      if (header.type !== 'save' || header.lease !== job.lease ||
          !Number.isInteger(header.part) || header.part !== job.partsReceived ||
          !Number.isInteger(header.parts) || header.parts < 1 ||
          header.parts > Math.ceil(MAX_SAVE_BYTES / PART_BYTES))
        throw Error('Relay sent out-of-order turn-save data.');
      if (job.partsReceived === 0) {
        const cp = header.checkpoint;
        if (!cp || !Number.isInteger(cp.phase) || ![0, 1, 2].includes(cp.phase) ||
            !Number.isSafeInteger(cp.revision) || cp.revision < 1 ||
            !Number.isInteger(cp.size) || cp.size < 1 || cp.size > MAX_SAVE_BYTES ||
            header.parts !== Math.ceil(cp.size / PART_BYTES) ||
            (cp.phase === 2 ? !(job.allowPhase2 && cp.seat === -1) : cp.seat !== this.seat) ||
            !cp.meta || !digestPattern.test(cp.meta.sha256) ||
            !checkedColors(cp.meta.colors, this.room.capacity) ||
            (cp.phase !== 2 && job.expectedColor !== undefined && cp.meta.colors[this.seat] !== job.expectedColor))
          throw Error('Relay save does not belong to this seat.');
        job.checkpoint = cp;
        job.parts = header.parts;
      } else if (header.parts !== job.parts) {
        throw Error('Relay changed the turn-save part count.');
      }
      const expected = header.part === job.parts - 1
        ? job.checkpoint.size - header.part * PART_BYTES : PART_BYTES;
      if (bytes.length !== expected) throw Error('Relay sent a corrupt turn-save part.');
      job.hash.update(bytes);
      job.chunks.push(bytes.slice());
      job.partsReceived++;
      if (job.partsReceived === job.parts) {
        if (job.hash.hex() !== job.checkpoint.meta.sha256)
          throw Error('Turn save failed SHA-256 verification.');
        job.resolve({ checkpoint: job.checkpoint, save: new Blob(job.chunks) });
        this.loading = null;
      }
    } catch (error) {
      job.reject(error);
      this.loading = null;
    }
  }

  failPending(error) {
    for (const key of ['uploading', 'loading', 'claiming']) {
      this[key]?.reject(error);
      this[key] = null;
    }
  }

  ensureHolder(lease) {
    if (!this.room || this.room.holder !== this.seat || this.room.lease !== lease)
      throw Error('This device does not hold the current lease.');
  }

  async sendReady(message, lease) {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      this.ensureHolder(lease);
      if (this.send(message) !== false) return;
      await delay(50);
    }
    throw Error('Relay socket stayed busy.');
  }

  async sendUploadPart(job) {
    if (this.uploading !== job) return;
    const part = job.nextPart;
    if (part >= job.parts) throw Error('Relay requested too many save parts.');
    const start = part * PART_BYTES;
    const bytes = new Uint8Array(await job.save.slice(start, start + PART_BYTES).arrayBuffer());
    const header = {
      type: job.nextSeat == null ? 'save' : 'handoff', id: job.id,
      lease: job.lease, phase: job.phase, seat: job.saveSeat,
      ...(job.nextSeat == null ? {} : { next: job.nextSeat }),
      order: job.order, meta: job.meta,
      part, parts: job.parts, size: job.save.size,
    };
    await this.sendReady(encodePart(header, bytes), job.lease);
    job.nextPart++;
  }

  async upload({ save, lease, phase, saveSeat, nextSeat = null, colors, order }) {
    this.ensureHolder(lease);
    if (!(save instanceof Blob) || !save.size || save.size > MAX_SAVE_BYTES ||
        ![0, 1, 2].includes(phase) || !(saveSeat === -1 || seatOK(saveSeat)) ||
        (saveSeat >= this.room.capacity) ||
        (phase === 2 && saveSeat !== -1) ||
        (phase === 1 && saveSeat !== this.seat) ||
        (nextSeat != null && (!seatOK(nextSeat) || nextSeat >= this.room.capacity ||
          nextSeat === this.seat || phase !== 0 || saveSeat !== nextSeat)) ||
        (nextSeat == null && phase === 0 && saveSeat !== this.seat))
      throw Error('Invalid turn-save request.');
    checkedColors(colors, this.room.capacity);
    if (!Array.isArray(order) || order.length !== colors.length ||
        order.some(seat => !seatOK(seat) || seat >= this.room.capacity) ||
        new Set(order).size !== order.length)
      throw Error('Invalid human turn order.');
    if (this.uploading) throw Error('A save upload is already running.');
    const sha256 = await hashBlob(save);
    const meta = { colors, sha256 };
    if (JSON.stringify(meta).length > 1024) throw Error('Turn-save metadata is too large.');
    const id = this.idFactory();
    if (typeof id !== 'string' || !id || id.length > 40) throw Error('Invalid upload ID.');
    return new Promise((resolve, reject) => {
      const job = { id, save, lease, phase, saveSeat, nextSeat, order, meta,
        sha256, parts: Math.ceil(save.size / PART_BYTES), nextPart: 0,
        resolve, reject };
      this.uploading = job;
      const timer = setTimeout(() => {
        if (this.uploading === job) { this.uploading = null; reject(Error('Relay save confirmation timed out.')); }
      }, this.timeoutMs);
      const done = result => { clearTimeout(timer); resolve(result); };
      const fail = error => { clearTimeout(timer); reject(error); };
      job.resolve = done; job.reject = fail;
      this.sendUploadPart(job).catch(error => {
        if (this.uploading === job) this.uploading = null;
        fail(error);
      });
    });
  }

  async load({ lease, expectedColor, allowPhase2 = false }) {
    this.ensureHolder(lease);
    if ((expectedColor !== undefined && !seatOK(expectedColor)) || this.loading) throw Error('Invalid turn load.');
    return new Promise((resolve, reject) => {
      const job = { lease, expectedColor, allowPhase2, chunks: [],
        hash: new Sha256(), partsReceived: 0, resolve, reject };
      this.loading = job;
      const timer = setTimeout(() => {
        if (this.loading === job) { this.loading = null; reject(Error('Relay turn load timed out.')); }
      }, this.timeoutMs);
      job.resolve = result => { clearTimeout(timer); resolve(result); };
      job.reject = error => { clearTimeout(timer); reject(error); };
      this.sendReady({ type: 'load' }, lease).catch(error => {
        if (this.loading === job) this.loading = null;
        job.reject(error);
      });
    });
  }

  async claim() {
    const room = this.room;
    if (!room || room.holder === this.seat || room.checkpointPhase !== 2 ||
        room.players.find(player => player.seat === room.holder)?.online || this.claiming)
      throw Error('This phase-two save cannot be claimed.');
    return new Promise((resolve, reject) => {
      const job = { lease: room.lease, resolve, reject };
      this.claiming = job;
      const timer = setTimeout(() => {
        if (this.claiming === job) { this.claiming = null; reject(Error('Relay claim timed out.')); }
      }, this.timeoutMs);
      job.resolve = result => { clearTimeout(timer); resolve(result); };
      job.reject = error => { clearTimeout(timer); reject(error); };
      if (this.send({ type: 'claim' }) === false) {
        this.claiming = null;
        job.reject(Error('Relay socket is unavailable.'));
      }
    });
  }
}

export async function importRelaySave({ save, matchId, revision }) {
  if (!matchPattern.test(matchId) || !Number.isSafeInteger(revision) || revision < 1)
    throw Error('Invalid match save name.');
  return importSave(new File([save], `TurnPass-${matchId}-r${revision}.vsgm1`));
}
