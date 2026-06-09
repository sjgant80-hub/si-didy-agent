// ◊·κ=1 · fiverr-autopilot · barrel export
// 7 strands + orchestrator + signals + audit
// φ home · prime 379 · si-didy-agent autopilot

export { parse, validate } from './parse.js';
export { classify, bottomLine, PENALTY_TABLE, DEADLINE_TABLE } from './classify.js';
export { renderGig1PDF } from './render.js';
export { loadOrGenerateKonomiMaster, signDeliverable, verifyDeliverable } from './sign.js';
export { draftFindings, buildDeliveryMessage } from './draft.js';
export { verifyDraft } from './verify.js';
export { emit, subscribe, close as closeSignals } from './signal.js';
export { log as auditLog, verifyChain, exportChain, stats as auditStats } from './audit.js';
export { fulfill, approveAndShip, listQueue } from './orchestrate.js';

export const FIVERR_AUTOPILOT_VERSION = '1.0.0';
export const PRIME = 379; // si-didy estate prime
