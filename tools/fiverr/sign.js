// ◊·κ=1 · fiverr-autopilot · STRAND 4/7 · Konomi Ed25519 signing
// Loads or generates the master keypair · signs every deliverable envelope.
// Master key lives at memory/konomi-master.json · NEVER commits to git
// (verify .gitignore in repo root excludes memory/konomi-master.json)

import fs from 'node:fs';
import path from 'node:path';
import { log as auditLog } from './audit.js';

const KEY_PATH = path.resolve('memory/konomi-master.json');
fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });

// Server-side uses node:crypto Ed25519 (libsodium path is browser-only via esm.run).
// Same hex envelope shape · cross-verifies with the browser SDK.
let _sdk = null;
async function getSDK() {
  if (!_sdk) _sdk = await import('./_node-ed25519.js');
  return _sdk;
}

/**
 * Load or generate the master Ed25519 keypair.
 * The first call ever generates · subsequent calls reuse.
 * @returns {Promise<{publicKey: string, privateKey: string, createdAt: string}>}
 */
export async function loadOrGenerateKonomiMaster() {
  if (fs.existsSync(KEY_PATH)) {
    return JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  }
  const { generateKeypair } = await getSDK();
  const kp = await generateKeypair();
  const stored = { ...kp, createdAt: new Date().toISOString() };
  fs.writeFileSync(KEY_PATH, JSON.stringify(stored, null, 2));
  console.log('◊·κ=1 · Konomi master keypair generated · stored at memory/konomi-master.json');
  console.log('  publicKey: ' + kp.publicKey);
  console.log('  ⚠ NEVER commit · ensure .gitignore excludes memory/konomi-master.json');
  return stored;
}

/**
 * Sign a deliverable envelope with the Konomi master key.
 * Returns { envelope, signature, publicKey } · ready to ship in PDF + JSON.
 *
 * @param {object} args
 * @param {object} args.order
 * @param {object} args.classification
 * @param {string} args.pdfHash    SHA-256 of the rendered PDF bytes
 * @returns {Promise<{envelope, signature, publicKey, hash}>}
 */
export async function signDeliverable({ order, classification, pdfHash }) {
  const { sign } = await getSDK();
  const master = await loadOrGenerateKonomiMaster();

  const envelope = {
    kind: 'fall-euaiact-fiverr-deliverable-v1',
    orderId: order.orderId,
    buyerName: order.buyerName,
    gigId: order.gigId,
    tier: order.tier,
    classification: {
      tier: classification.tier,
      label: classification.label,
      articles: classification.articles,
      confidence: classification.confidence,
      annexGapCount: classification.annexGap.length,
    },
    pdfHash: pdfHash || null,
    deliveredAt: new Date().toISOString(),
    publicKey: master.publicKey,
  };

  const signature = await sign(JSON.stringify(envelope), master.privateKey);

  // small content-addressable hash for cross-reference in the dashboard
  const crypto = await import('node:crypto');
  const hash = crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex');

  await auditLog({
    type: 'signed',
    orderId: order.orderId,
    gigId: order.gigId,
    meta: { envelopeHash: hash.slice(0, 16), publicKey: master.publicKey.slice(0, 16) },
  });

  return { envelope, signature, publicKey: master.publicKey, hash };
}

/**
 * Verify a signed deliverable · used by the dashboard and post-market audit.
 */
export async function verifyDeliverable({ envelope, signature, publicKey }) {
  const { verify } = await getSDK();
  return verify(JSON.stringify(envelope), signature, publicKey);
}
