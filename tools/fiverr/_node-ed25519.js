// ◊·κ=1 · Node-native Ed25519 · server-side equivalent of fall-euaiact/sign.js
// Browser path stays libsodium (esm.run dynamic import).
// Server path uses node:crypto Ed25519 (native since Node 14).
//
// Hex encoding is identical across both paths · same envelope verifies
// regardless of whether it was signed in browser or server.

import { generateKeyPairSync, sign as nodeSign, verify as nodeVerify, createPrivateKey, createPublicKey } from 'node:crypto';

const ED25519_PRIV_HEX_LEN = 64;  // 32 bytes
const ED25519_PUB_HEX_LEN  = 64;  // 32 bytes

/** Generate a fresh Ed25519 keypair · returns hex-encoded raw key bytes (libsodium-compatible). */
export async function generateKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  // Export raw 32-byte private key (Ed25519 seed)
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  // PKCS8 Ed25519 = SEQUENCE(version=0, algId, OCTET-STRING wrapping 32-byte private key)
  // Last 32 bytes of the DER are the private key seed
  const privBytes = privDer.slice(-32);

  // Export raw 32-byte public key
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  // SPKI Ed25519: last 32 bytes are the public key
  const pubBytes = pubDer.slice(-32);

  return {
    publicKey:  Buffer.from(pubBytes).toString('hex'),
    privateKey: Buffer.from(privBytes).toString('hex'),
  };
}

/** Sign a UTF-8 message with an Ed25519 private key (hex) · returns hex signature. */
export async function sign(message, privateKeyHex) {
  if (!privateKeyHex || privateKeyHex.length !== ED25519_PRIV_HEX_LEN) {
    throw new Error(`sign() requires a ${ED25519_PRIV_HEX_LEN}-char hex privateKey (got ${privateKeyHex?.length})`);
  }
  const privKey = privHexToKeyObject(privateKeyHex);
  const msgBytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message);
  const sigBytes = nodeSign(null, msgBytes, privKey); // Ed25519 needs null algorithm
  return sigBytes.toString('hex');
}

/** Verify an Ed25519 signature · returns boolean. */
export async function verify(message, signatureHex, publicKeyHex) {
  if (!signatureHex || !publicKeyHex) return false;
  try {
    const pubKey = pubHexToKeyObject(publicKeyHex);
    const msgBytes = typeof message === 'string' ? Buffer.from(message, 'utf8') : Buffer.from(message);
    const sigBytes = Buffer.from(signatureHex, 'hex');
    return nodeVerify(null, msgBytes, pubKey, sigBytes);
  } catch (_) {
    return false;
  }
}

// ─── internal: hex → KeyObject ───────────────────────────────────────────

const PRIV_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const PUB_SPKI_PREFIX   = Buffer.from('302a300506032b6570032100', 'hex');

function privHexToKeyObject(hex) {
  const der = Buffer.concat([PRIV_PKCS8_PREFIX, Buffer.from(hex, 'hex')]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function pubHexToKeyObject(hex) {
  const der = Buffer.concat([PUB_SPKI_PREFIX, Buffer.from(hex, 'hex')]);
  return createPublicKey({ key: der, format: 'der', type: 'spki' });
}
