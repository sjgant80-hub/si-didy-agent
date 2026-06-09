// ◊·κ=1 · fall-euaiact · Ed25519 signing helper · libsodium-wasm via dynamic import
// MIT · zero hard deps · libsodium lazy-loaded only when sign() is called

let _sodiumPromise = null;

/**
 * Lazy-load libsodium-wrappers from esm.run. Re-uses the same promise across calls.
 * @internal
 */
async function getSodium() {
  if (!_sodiumPromise) {
    _sodiumPromise = (async () => {
      const mod = await import('https://esm.run/libsodium-wrappers@0.7.13');
      const sodium = mod.default || mod;
      await sodium.ready;
      return sodium;
    })();
  }
  return _sodiumPromise;
}

/**
 * Generate a fresh Ed25519 keypair · for callers that don't already have one.
 * The Konomi master key (per the estate doctrine) is generated once and stored
 * in IndexedDB by the consumer tool. This helper is for one-off testing or
 * for callers building their own identity layer.
 *
 * @returns {Promise<{ publicKey: string, privateKey: string }>} hex-encoded keypair
 */
export async function generateKeypair() {
  const s = await getSodium();
  const kp = s.crypto_sign_keypair();
  return {
    publicKey: s.to_hex(kp.publicKey),
    privateKey: s.to_hex(kp.privateKey),
  };
}

/**
 * Sign a message with an Ed25519 private key.
 *
 * @param {string} message - the message to sign (UTF-8 string · usually JSON-stringified envelope)
 * @param {string} privateKeyHex - hex-encoded Ed25519 private key (64-byte / 128 hex chars)
 * @returns {Promise<string>} hex-encoded detached signature
 */
export async function sign(message, privateKeyHex) {
  if (!privateKeyHex) throw new Error('sign() requires a privateKeyHex');
  const s = await getSodium();
  const msgBytes = typeof message === 'string' ? s.from_string(message) : message;
  const skBytes = s.from_hex(privateKeyHex);
  const sigBytes = s.crypto_sign_detached(msgBytes, skBytes);
  return s.to_hex(sigBytes);
}

/**
 * Verify an Ed25519 detached signature against a message + public key.
 *
 * @param {string} message - the original message
 * @param {string} signatureHex - hex-encoded signature
 * @param {string} publicKeyHex - hex-encoded public key
 * @returns {Promise<boolean>} true if signature is valid for this (message, key) pair
 */
export async function verify(message, signatureHex, publicKeyHex) {
  if (!signatureHex || !publicKeyHex) return false;
  const s = await getSodium();
  try {
    const msgBytes = typeof message === 'string' ? s.from_string(message) : message;
    const sigBytes = s.from_hex(signatureHex);
    const pkBytes = s.from_hex(publicKeyHex);
    return s.crypto_sign_verify_detached(sigBytes, msgBytes, pkBytes);
  } catch (_) {
    return false;
  }
}
