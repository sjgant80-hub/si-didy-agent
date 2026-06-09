// ◊·κ=1 · fiverr-autopilot · STRAND φ · estate-wide BroadcastChannel mesh
// Every fulfillment event broadcasts to the estate so AIN hub, fall-bloom,
// konomi-bloom, kcc-signal, fall-signal all see the live metric in real-time.
// In Node 22+ BroadcastChannel is native · in older runtimes we polyfill.

import { log as auditLog } from './audit.js';

let _channels = null;
async function getChannels() {
  if (_channels) return _channels;

  // Native in Node 18+ via `--experimental-broadcast-channel` flag, stable in 22+.
  // Fallback: file-write to a queue dir that the dashboard tails.
  let Channel;
  if (typeof BroadcastChannel !== 'undefined') {
    Channel = BroadcastChannel;
  } else {
    // shim · writes JSONL to queues/fv-signals/<channel>.jsonl
    const fs = await import('node:fs');
    const path = await import('node:path');
    const SIGNALS_DIR = path.resolve('queues/fv-signals');
    fs.mkdirSync(SIGNALS_DIR, { recursive: true });
    Channel = class {
      constructor(name) { this.name = name; }
      postMessage(payload) {
        const line = JSON.stringify({ channel: this.name, ts: new Date().toISOString(), payload }) + '\n';
        fs.appendFileSync(path.join(SIGNALS_DIR, `${this.name}.jsonl`), line);
      }
      close() {}
    };
  }

  _channels = {
    fallSignal: new Channel('fall-signal'),
    kccSignal:  new Channel('kcc-signal'),
    konomiBloom: new Channel('konomi-bloom'),
    fiverrQueue: new Channel('fiverr-queue'),
  };
  return _channels;
}

/**
 * Broadcast a fulfillment event across the estate mesh.
 * Fires to multiple channels so existing AIN-hub, fall-bloom, kcc-ledger all
 * pick up the signal without changes to their code.
 *
 * @param {object} event
 * @param {string} event.kind   e.g. 'fv:order_received' | 'fv:awaiting_review' | 'fv:shipped'
 * @param {object} event.payload
 */
export async function emit(event) {
  const ch = await getChannels();
  const stamped = { ...event, ts: new Date().toISOString(), source: 'si-didy-fiverr' };

  // fall-signal · the estate mesh
  ch.fallSignal.postMessage({ tool: 'fiverr-autopilot', ...stamped });

  // kcc-signal · κ-ledger broadcast (any kcc-aware tool tallies it)
  ch.kccSignal.postMessage({ kind: 'kcc:fv-event', detail: stamped });

  // konomi-bloom · bloom visualisation pulses on every mint
  if (event.kind === 'fv:shipped') {
    ch.konomiBloom.postMessage({ kind: 'konomi:mint', source: 'fiverr', detail: stamped });
  }

  // fiverr-queue · the dashboard subscribes to this one specifically
  ch.fiverrQueue.postMessage(stamped);

  await auditLog({
    type: 'signal_emitted',
    orderId: event.payload?.orderId,
    gigId: event.payload?.gigId,
    meta: { kind: event.kind, channels: 4 },
  });
}

/**
 * Subscribe to fiverr-queue events (used by the dashboard).
 * Returns an unsubscribe function.
 */
export async function subscribe(handler) {
  const ch = await getChannels();
  if (typeof ch.fiverrQueue.addEventListener === 'function') {
    const wrapped = (e) => handler(e.data);
    ch.fiverrQueue.addEventListener('message', wrapped);
    return () => ch.fiverrQueue.removeEventListener('message', wrapped);
  }
  return () => {};
}

export async function close() {
  if (!_channels) return;
  Object.values(_channels).forEach(c => c.close && c.close());
  _channels = null;
}
