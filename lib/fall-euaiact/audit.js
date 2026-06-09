// ◊·κ=1 · Article 12 audit shim · SHA-256 prevHash chain · works in browser AND Node 18+

/**
 * Create an audit logger that satisfies Article 12 record-keeping requirements.
 *
 * Browser: uses IndexedDB
 * Node: uses in-memory + flush(fileHandle) for export
 *
 * @param {{ dbName?: string, retention_days?: number, sink?: 'indexeddb' | 'memory' }} opts
 * @returns {{ log: Function, exportAll: Function, clear: Function, verifyChain: Function }}
 */
export function createAuditShim(opts = {}) {
  const dbName = opts.dbName || 'eu-aiact-audit';
  const sink = opts.sink || (typeof indexedDB !== 'undefined' ? 'indexeddb' : 'memory');
  let prevHash = '0'.repeat(64);
  let db = null;
  let memoryStore = [];

  async function sha256(s) {
    const buf = new TextEncoder().encode(s);
    const subtle = typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle
                 : (await import('node:crypto')).webcrypto.subtle;
    const h = await subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function openDb() {
    if (sink !== 'indexeddb' || db) return db;
    return new Promise((res, rej) => {
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('log')) d.createObjectStore('log', { keyPath: 'id', autoIncrement: true });
      };
      r.onsuccess = e => { db = e.target.result; res(db); };
      r.onerror = e => rej(e.target.error);
    });
  }

  /**
   * Append an event to the audit chain
   * @param {{ type: string, input?: string, output?: string, operator?: string, metadata?: object }} event
   * @returns {Promise<{ ts: string, event_type: string, hash: string, prev_hash: string }>}
   */
  async function log(event) {
    const entry = {
      ts: new Date().toISOString(),
      event_type: event.type || 'unknown',
      input_summary: typeof event.input === 'string' ? event.input.slice(0, 200) : null,
      output_summary: typeof event.output === 'string' ? event.output.slice(0, 200) : null,
      operator_id: event.operator || null,
      metadata: event.metadata || null,
      prev_hash: prevHash,
    };
    entry.hash = await sha256(JSON.stringify(entry));
    prevHash = entry.hash;
    if (sink === 'indexeddb') {
      await openDb();
      const tx = db.transaction('log', 'readwrite');
      tx.objectStore('log').add(entry);
      await new Promise(r => tx.oncomplete = r);
    } else {
      memoryStore.push(entry);
    }
    return entry;
  }

  /**
   * Export all log entries (use for Article 26 6-month retention or audit handover)
   * @returns {Promise<Array>}
   */
  async function exportAll() {
    if (sink === 'indexeddb') {
      await openDb();
      const tx = db.transaction('log', 'readonly');
      return new Promise((res, rej) => {
        const r = tx.objectStore('log').getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = e => rej(e.target.error);
      });
    }
    return memoryStore.slice();
  }

  /**
   * Verify the prevHash chain is intact (no tampering)
   * @returns {Promise<{ valid: boolean, broken_at?: number, total: number }>}
   */
  async function verifyChain() {
    const all = await exportAll();
    let expected = '0'.repeat(64);
    for (let i = 0; i < all.length; i++) {
      const entry = all[i];
      if (entry.prev_hash !== expected) {
        return { valid: false, broken_at: i, total: all.length };
      }
      const { hash, ...rest } = entry;
      const computed = await sha256(JSON.stringify(rest));
      if (computed !== hash) {
        return { valid: false, broken_at: i, total: all.length };
      }
      expected = hash;
    }
    return { valid: true, total: all.length };
  }

  /**
   * Clear all entries (only after export · use with caution)
   */
  async function clear() {
    if (sink === 'indexeddb') {
      await openDb();
      const tx = db.transaction('log', 'readwrite');
      tx.objectStore('log').clear();
      await new Promise(r => tx.oncomplete = r);
    } else {
      memoryStore = [];
    }
    prevHash = '0'.repeat(64);
  }

  return { log, exportAll, verifyChain, clear };
}
