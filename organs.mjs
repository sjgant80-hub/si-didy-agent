// ════════════════════════════════════════════════════════════════
// organs.mjs · opt-in organ wiring for si-didy-agent
//
// The five si-didy organs (cascade · close · memory · signer · stance) ship as sovereign
// sibling repos. Until now none was attached to the running agent, so their benefits —
// warm-boot memory, identity signing, token cascade, session sealing, mesh stance — were
// unrealised. This is the attachment layer.
//
// CONTRACT — read before changing anything here:
//   1. INERT BY DEFAULT. With SIDIDY_ORGANS unset, nothing is imported, nothing is
//      constructed, no file is touched, no handler is registered. The agent behaves exactly
//      as it did before this module existed. Opt in with SIDIDY_ORGANS=1.
//   2. FAILURE IS CONTAINED. Each organ attaches independently inside a try/catch. Two of
//      the five (close, stance) are browser-first — they expect IndexedDB / BroadcastChannel
//      and may not run under Node. An organ that cannot attach is recorded as unavailable
//      and the agent continues. Nothing here may ever throw into the agent.
//   3. NO SILENT NETWORK. Organs are constructed but not asked to broadcast or resolve
//      unless their own defaults do so; sealing is best-effort and swallowed.
//
// Organ sources default to sibling directories (../si-didy-<organ>); override with
// SIDIDY_ORGAN_DIR. Status is readable at any time via organs.status().
// ════════════════════════════════════════════════════════════════

const FLAG = process.env.SIDIDY_ORGANS;
const ENABLED = FLAG === '1' || FLAG === 'true' || FLAG === 'yes';
const ORGAN_DIR = process.env.SIDIDY_ORGAN_DIR || '..';

const state = {
  enabled: ENABLED,
  booted: false,
  sessionId: null,
  attached: [],
  unavailable: {},
  identity: null,
  memory: null,
  signer: null,
  cascade: null,
  stance: null,
  closer: null,
};

const organUrl = (name) => new URL(`${ORGAN_DIR}/si-didy-${name}/si-didy-${name}.js`, import.meta.url).href;

// attach one organ; never throws. Records why an organ is unavailable so status() is honest.
async function attach(name, fn) {
  try {
    const value = await fn();
    state.attached.push(name);
    return value;
  } catch (err) {
    state.unavailable[name] = String(err && err.message ? err.message : err).split('\n')[0];
    return null;
  }
}

export const organs = {
  get enabled() { return state.enabled; },

  status() {
    return {
      enabled: state.enabled,
      booted: state.booted,
      sessionId: state.sessionId,
      attached: [...state.attached],
      unavailable: { ...state.unavailable },
      identity: state.identity,
    };
  },

  // Boot every organ. Safe to call once per process; a second call is a no-op.
  // Returns the status object. NEVER throws.
  async boot(sessionId) {
    if (!state.enabled || state.booted) return this.status();
    state.booted = true;
    state.sessionId = sessionId || `sididy-${process.pid}-${state.enabled}`;

    // ── signer · Ed25519 identity for outbound envelopes
    state.signer = await attach('signer', async () => {
      const { SiDidySigner } = await import(organUrl('signer'));
      const s = new SiDidySigner({});
      if (typeof s.loadKey === 'function') await s.loadKey();
      if (typeof s.pubB64u === 'function') state.identity = await s.pubB64u();
      return s;
    });

    // ── memory · warm boot from the persistent cube
    state.memory = await attach('memory', async () => {
      const { SiDidyMemory } = await import(organUrl('memory'));
      const m = new SiDidyMemory({ dbPath: process.env.SIDIDY_ORGAN_DB || './memory/organ-cube.db' });
      if (typeof m.open === 'function') await m.open();
      if (typeof m.warmUp === 'function') await m.warmUp();
      return m;
    });

    // ── cascade · token routing / local-first tiering
    state.cascade = await attach('cascade', async () => {
      const { SiDidyCascade } = await import(organUrl('cascade'));
      return new SiDidyCascade({});
    });

    // ── stance · mesh presence (browser-first; may be unavailable under Node)
    state.stance = await attach('stance', async () => {
      const { SiDidyStance } = await import(organUrl('stance'));
      return new SiDidyStance({});
    });

    // ── close · session audit chain (browser-first; may be unavailable under Node)
    state.closer = await attach('close', async () => {
      const { SiDidyClose } = await import(organUrl('close'));
      return new SiDidyClose({});
    });

    // seal on the way out — registered only when organs are enabled
    const onExit = () => { this.seal().catch(() => {}); };
    process.once('beforeExit', onExit);
    process.once('SIGINT', () => { onExit(); process.exit(130); });

    return this.status();
  },

  // Record a turn into the memory cube. No-op unless memory attached. Never throws.
  async remember(role, text) {
    if (!state.enabled || !state.memory || typeof state.memory.remember !== 'function') return false;
    try { await state.memory.remember(role, text); return true; } catch { return false; }
  },

  // Sign an outbound payload with the agent identity. Returns null if the signer is absent.
  async sign(payload) {
    if (!state.enabled || !state.signer || typeof state.signer.sign !== 'function') return null;
    try { return await state.signer.sign(payload); } catch { return null; }
  },

  // Close the session: flush memory, finalise the audit chain. Best-effort, never throws.
  async seal(summary) {
    if (!state.enabled || !state.booted) return false;
    let sealed = false;
    try {
      if (state.closer && typeof state.closer.finalise === 'function') {
        await state.closer.finalise({ sessionId: state.sessionId, summary: summary || '' });
        sealed = true;
      }
    } catch { /* browser-first organ under Node — expected, contained */ }
    try {
      if (state.memory && typeof state.memory.close === 'function') await state.memory.close();
    } catch { /* contained */ }
    return sealed;
  },
};

export default organs;
