// ◊·κ=1 · fiverr-autopilot · STRAND 6/7 · meta-audit chain
// Every fulfillment event chained · SHA-256 prevHash · JSONL persistence
// Article 12 of OUR OWN production process · provenance forever

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AUDIT_PATH = path.resolve('memory/fv-audit.jsonl');

fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Append a fulfillment event to the audit chain.
 * Each entry hashes the previous · the whole file is verifiable.
 *
 * @param {object} event
 * @param {string} event.type       e.g. 'order_received' | 'classified' | 'pdf_rendered' | 'signed' | 'drafted' | 'verified' | 'queued' | 'approved' | 'shipped' | 'disputed'
 * @param {string} [event.orderId]  Fiverr order ID
 * @param {string} [event.gigId]    1-8
 * @param {object} [event.meta]     arbitrary structured payload
 * @returns {Promise<object>}       the chained entry
 */
export async function log(event) {
  const lines = fs.existsSync(AUDIT_PATH)
    ? fs.readFileSync(AUDIT_PATH, 'utf8').split('\n').filter(Boolean)
    : [];
  const prevHash = lines.length === 0
    ? '0000000000000000000000000000000000000000000000000000000000000000'
    : JSON.parse(lines[lines.length - 1]).hash;

  const entry = {
    ts: new Date().toISOString(),
    type: event.type,
    orderId: event.orderId || null,
    gigId: event.gigId || null,
    meta: event.meta || null,
    prevHash,
  };
  entry.hash = sha256(JSON.stringify(entry));

  fs.appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n');
  return entry;
}

/**
 * Walk the chain · verify integrity end-to-end.
 * Returns { valid, total, brokenAt? }
 */
export async function verifyChain() {
  if (!fs.existsSync(AUDIT_PATH)) return { valid: true, total: 0 };
  const lines = fs.readFileSync(AUDIT_PATH, 'utf8').split('\n').filter(Boolean);
  let prev = '0000000000000000000000000000000000000000000000000000000000000000';
  for (let i = 0; i < lines.length; i++) {
    const e = JSON.parse(lines[i]);
    if (e.prevHash !== prev) return { valid: false, total: lines.length, brokenAt: i };
    const expected = sha256(JSON.stringify({ ts: e.ts, type: e.type, orderId: e.orderId, gigId: e.gigId, meta: e.meta, prevHash: e.prevHash }));
    if (expected !== e.hash) return { valid: false, total: lines.length, brokenAt: i };
    prev = e.hash;
  }
  return { valid: true, total: lines.length };
}

/** Export full chain as array (for the dashboard) */
export function exportChain() {
  if (!fs.existsSync(AUDIT_PATH)) return [];
  return fs.readFileSync(AUDIT_PATH, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
}

/** Stats for the dashboard · counts by event type, last 24h volume */
export function stats() {
  const chain = exportChain();
  const byType = {};
  const dayAgo = Date.now() - 86400000;
  let last24h = 0;
  for (const e of chain) {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (new Date(e.ts).getTime() > dayAgo) last24h++;
  }
  return { total: chain.length, byType, last24h };
}
