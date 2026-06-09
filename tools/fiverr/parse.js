// ◊·κ=1 · fiverr-autopilot · STRAND 1/7 · intake brief parser
// Maps raw Fiverr order email / requirements form into a structured order envelope.
// Pure heuristic · zero LLM cost · falls through to Claude T1 if regex misses.

import { log as auditLog } from './audit.js';

/**
 * Parse a raw Fiverr email body or requirements-form dump into a structured order.
 * Expects strings like:
 *   "You got a new order from JaneDoe - GIG-1"
 *   "1. Description: My AI tool ranks job applicants..."
 *
 * @param {string} raw - the email body or pasted brief
 * @returns {Promise<{ orderId, buyerName, gigId, tier, intake } | null>}
 */
export async function parse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Order ID · Fiverr format: "Order #FO12345ABCDE"
  const orderId = (raw.match(/#?(FO[A-Z0-9]{6,})/i) || [])[1] || `ORD-${Date.now()}`;

  // Buyer name · "from {name}"
  const buyerName = (raw.match(/from[\s:]+([A-Za-z0-9_-]{2,40})/i) || [])[1] || 'buyer';

  // Gig ID · "GIG-N" or "Package: Basic/Standard/Premium · GIG N"
  const gigMatch = raw.match(/GIG[\s\-_]?(\d)/i);
  const gigId = gigMatch ? parseInt(gigMatch[1], 10) : null;

  // Tier · keyword scan
  let tier = 'basic';
  if (/premium|gold/i.test(raw)) tier = 'premium';
  else if (/standard|silver/i.test(raw)) tier = 'standard';

  // Structured intake fields · numbered list pattern "1. {field}:" or "Q1:"
  const intake = {};
  const fieldMap = {
    systemDescription: /(?:1\.|Q1:?|description:?)\s*([^\n]{20,800})/i,
    intendedPurpose:   /(?:2\.|Q2:?|purpose:?|use[- ]?case:?|industry:?)\s*([^\n]{5,300})/i,
    euUsers:           /(?:3\.|Q3:?|eu[- ]?users?:?)\s*(yes|no|some|all)/i,
    existingDocs:      /(?:4\.|Q4:?|existing:?|current[- ]?docs?:?)\s*([^\n]{0,400})/i,
    liveUrl:           /(https?:\/\/[^\s]+)/,
    industry:          /industry:?\s*([A-Za-z][^\n]{3,80})/i,
  };
  for (const [key, re] of Object.entries(fieldMap)) {
    const m = raw.match(re);
    if (m && m[1]) intake[key] = m[1].trim();
  }

  // If no systemDescription found · the brief is malformed · downstream
  // orchestrator will route to Claude T1 for fuzzy extract.
  const order = { orderId, buyerName, gigId, tier, intake, rawLength: raw.length };

  await auditLog({
    type: 'order_received',
    orderId,
    gigId,
    meta: { buyerName, tier, fieldsExtracted: Object.keys(intake).length },
  });

  return order;
}

/**
 * Validate a parsed order has the minimum fields needed for auto-fulfillment.
 * Returns { ok, missing } · auto-route uses ok=false → human-review queue.
 */
export function validate(order) {
  const missing = [];
  if (!order) return { ok: false, missing: ['order'] };
  if (!order.orderId) missing.push('orderId');
  if (!order.gigId || order.gigId < 1 || order.gigId > 8) missing.push('gigId');
  if (!order.intake?.systemDescription || order.intake.systemDescription.length < 20) {
    missing.push('systemDescription');
  }
  return { ok: missing.length === 0, missing };
}
