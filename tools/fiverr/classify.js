// ◊·κ=1 · fiverr-autopilot · STRAND 2/7 · EU AI Act classification
// Runs fall-euaiact classifier + Annex IV gap + deadlines + penalty table.
// Lazy-imports the vendored SDK · pure-function · sync where possible.

import { log as auditLog } from './audit.js';

let _sdk = null;
async function getSDK() {
  if (!_sdk) {
    _sdk = await import('../../lib/fall-euaiact/index.js');
  }
  return _sdk;
}

const PENALTY_TABLE = {
  prohibited: '€35M or 7% global turnover (Article 99(3))',
  high:       '€15M or 3% global turnover (Article 99(4))',
  limited:    '€15M or 3% global turnover (Article 99(4) · Article 50 breach)',
  minimal:    '€7.5M or 1% global turnover (Article 99(5) · incorrect info to authorities)',
};

const DEADLINE_TABLE = {
  prohibited: '2 Feb 2025 (already in force)',
  high:       '2 Aug 2026',
  limited:    '2 Aug 2026',
  minimal:    'No fixed deadline · best practice now',
};

/**
 * Run the EU AI Act classification pipeline on an order's intake.
 *
 * @param {object} order
 * @returns {Promise<{
 *   tier, label, articles, confidence, triggers,
 *   annexGap, fieldsPresent, penalty, deadline
 * }>}
 */
export async function classify(order) {
  const { classify: classifyT0, createAnnexIV } = await getSDK();
  const desc = order.intake?.systemDescription || '';

  // T0 keyword classifier · <1ms · zero LLM cost
  const result = classifyT0(desc);

  // Annex IV factory · compute fields present + missing from intake
  const initialSpec = {};
  if (desc) initialSpec['1_general_description'] = desc;
  if (order.intake?.intendedPurpose) initialSpec['2_intended_purpose'] = order.intake.intendedPurpose;
  if (order.intake?.industry) initialSpec['14_intended_purpose_risks'] = `Industry: ${order.intake.industry}`;

  const doc = createAnnexIV(initialSpec);
  const annexGap = doc.missing();
  const fieldsPresent = 14 - annexGap.length;

  const classification = {
    tier: result.tier,
    label: result.label,
    articles: result.articles,
    confidence: result.confidence,
    triggers: result.triggers,
    annexGap,
    fieldsPresent,
    penalty: PENALTY_TABLE[result.tier],
    deadline: DEADLINE_TABLE[result.tier],
  };

  await auditLog({
    type: 'classified',
    orderId: order.orderId,
    gigId: order.gigId,
    meta: { tier: result.tier, confidence: result.confidence, articles: result.articles.length },
  });

  return classification;
}

/**
 * Build a one-line bottom-line · used in PDF execsum + delivery message.
 */
export function bottomLine(c) {
  if (c.tier === 'prohibited') return `STOP · this system is prohibited under Article 5 · do not deploy in the EU. Re-scope before any further work.`;
  if (c.tier === 'high') return `High-risk · ${c.articles.length} articles apply · Annex IV due 2 Aug 2026 · ${14 - c.fieldsPresent} fields outstanding.`;
  if (c.tier === 'limited') return `Limited-risk · Article 50 transparency required · ${14 - c.fieldsPresent} Annex IV fields outstanding · 2 Aug 2026 deadline.`;
  return `Minimal-risk · no specific AI Act obligations · best-practice docs recommended (${14 - c.fieldsPresent} fields).`;
}

export { PENALTY_TABLE, DEADLINE_TABLE };
