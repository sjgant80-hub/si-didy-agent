// ◊·κ=1 · fiverr-autopilot · STRAND 7/7 · adversarial verify
// 3-vote adversarial check on the draft BEFORE it lands in Simon's review queue.
// Catches the "plausible but wrong" tier: classifier disagrees with description,
// or findings make unsupported claims, or upsell doesn't fit the tier.
// All checks are pure-logic · no LLM calls · zero token cost · runs in <10ms.

import { log as auditLog } from './audit.js';

/**
 * 3-vote adversarial verification.
 * Each vote is a SEPARATE skeptical check against a SEPARATE failure mode.
 * Need 2-of-3 PASS to ship · otherwise → human review queue with flags.
 *
 * @returns {Promise<{ passes: number, flags: string[], verdict: 'auto-ship' | 'needs-review' }>}
 */
export async function verifyDraft({ order, classification, findings, deliveryMessage }) {
  const flags = [];
  let passes = 0;

  // VOTE 1 · SKEPTIC · is the classification internally consistent?
  // Failure modes: tier doesn't match articles, confidence too low, no triggers but tier is high.
  const vote1 = (() => {
    if (classification.tier === 'high' && classification.articles.length === 0) {
      flags.push('classifier flagged HIGH but returned 0 articles · inconsistent');
      return false;
    }
    if (classification.tier === 'high' && classification.triggers.length === 0) {
      flags.push('HIGH tier with 0 Annex III triggers · classifier hit threshold but rationale missing');
      return false;
    }
    if (classification.confidence < 30) {
      flags.push(`confidence ${classification.confidence}/100 below 30 threshold · needs Claude T2 deep-classify`);
      return false;
    }
    return true;
  })();
  if (vote1) passes++;

  // VOTE 2 · SUPPORTIVE · do findings make claims supported by the classification?
  // Failure modes: findings cite articles that aren't in classification.articles,
  // findings reference deadlines that don't match the tier.
  const vote2 = (() => {
    const findingsText = findings.findings.join(' ');
    // Hard claim: if findings say "high-risk" the classification must be high
    if (/high[- ]?risk/i.test(findingsText) && classification.tier !== 'high') {
      flags.push('findings text mentions "high-risk" but classification tier is ' + classification.tier);
      return false;
    }
    if (/article 50/i.test(findingsText) && !['limited', 'high'].includes(classification.tier)) {
      flags.push('findings cite Article 50 but tier is ' + classification.tier + ' · only limited/high need it');
      return false;
    }
    if (findings.findings.length < 2) {
      flags.push('fewer than 2 findings drafted · personalisation thin');
      return false;
    }
    return true;
  })();
  if (vote2) passes++;

  // VOTE 3 · NEUTRAL · is the upsell appropriate to the tier?
  // Failure modes: recommending GIG-3 for prohibited (pointless), recommending GIG-4 for high-risk only system (wrong remediation).
  const vote3 = (() => {
    const rec = findings.recommendedGigs.join(' ');
    if (classification.tier === 'prohibited' && rec.length > 0) {
      flags.push('prohibited-tier recommended additional gigs · should recommend legal counsel only');
      return false;
    }
    if (classification.tier === 'minimal' && /GIG-3|GIG-4/.test(rec)) {
      flags.push('minimal-risk recommended high-tier compliance gigs · upsell over-reach');
      return false;
    }
    if (!deliveryMessage || deliveryMessage.length < 200) {
      flags.push('delivery message under 200 chars · too thin to ship');
      return false;
    }
    return true;
  })();
  if (vote3) passes++;

  const verdict = passes >= 2 ? 'auto-ship' : 'needs-review';

  await auditLog({
    type: 'verified',
    orderId: order.orderId,
    gigId: order.gigId,
    meta: { passes, flagsCount: flags.length, verdict, votes: { vote1, vote2, vote3 } },
  });

  return { passes, flags, verdict, votes: { vote1, vote2, vote3 } };
}
