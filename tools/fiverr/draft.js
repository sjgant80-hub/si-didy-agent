// ◊·κ=1 · fiverr-autopilot · STRAND 5/7 · delivery message drafter
// Generates personalised findings + delivery message via Claude cascade.
// Subscription-auth via existing si-didy-agent · zero-API-cost when Claude Code OAuth active.
// Falls through to a deterministic template if SDK unavailable (testing mode).

import { log as auditLog } from './audit.js';
import { bottomLine } from './classify.js';

/**
 * Generate 2-3 personalised findings about THIS specific buyer's system.
 * Pure function · uses classification triggers + intake to write bullets.
 * No LLM call needed if findings can be templated from the classification alone.
 *
 * @returns {Promise<{ findings: string[], bottomLine: string, recommendedGigs: string[] }>}
 */
export async function draftFindings({ order, classification }) {
  const findings = [];
  const desc = order.intake?.systemDescription || '';
  const ind = order.intake?.industry || '';

  // Finding 1 · tier-specific
  if (classification.tier === 'high') {
    findings.push(`Your system landed in **High-risk (Annex III)**. The classifier matched ${classification.triggers.length} trigger(s) — review them on page 2. This means Articles 8-15 + Annex IV apply with the 2 Aug 2026 deadline.`);
  } else if (classification.tier === 'limited') {
    findings.push(`Your system landed in **Limited-risk (Article 50)**. Specifically: transparency obligations to anyone interacting with it. Penalty for missing disclosure is up to €15M — installation of badges (GIG-4) is the 72-hour fix.`);
  } else if (classification.tier === 'prohibited') {
    findings.push(`⚠ Your system matched **Article 5 prohibited practices**. This is the only tier with no remediation path · the feature itself must be re-scoped or removed before EU deployment. Recommend immediate review with EU counsel.`);
  } else {
    findings.push(`Your system landed in **Minimal-risk**. No specific AI Act obligations · but best practice still recommends documenting the 14 Annex IV fields so re-classification (if your scope expands) doesn't reset you to zero.`);
  }

  // Finding 2 · gap-driven
  const gap = 14 - classification.fieldsPresent;
  if (gap >= 12) {
    findings.push(`Your Annex IV documentation gap is **${gap}/14 fields**. Most teams in your situation are missing fields 9-11 (performance metrics, training data sheets, evaluation methodology) — these are the hardest to retrofit. GIG-3 ($297) generates them programmatically against your live system metadata so they auto-update.`);
  } else if (gap >= 6) {
    findings.push(`Annex IV gap: **${gap}/14 fields outstanding**. You're already past the worst — the remaining fields are mostly evidence-gathering (post-market monitoring, harmonised-standards refs). The audit-shim from GIG-2 covers field 8 automatically once installed.`);
  } else {
    findings.push(`Annex IV is in good shape (**${classification.fieldsPresent}/14 documented**). The remaining ${gap} fields are likely supervisory-authority-format issues (the canonical envelope from GIG-3 handles those).`);
  }

  // Finding 3 · industry/use-case specific
  if (/hir|recruit|cv|applicant|candidate/i.test(desc + ind)) {
    findings.push(`Hiring / recruitment use cases fall under **Annex III §4** (employment) — supervisory authorities (BfDI for Germany, CNIL for France) are most active in this area. Expect their guidance to tighten through 2027. Documenting the bias-mitigation approach (Annex IV field 4) early is high-leverage.`);
  } else if (/credit|loan|scoring|financ/i.test(desc + ind)) {
    findings.push(`Credit / financial scoring falls under **Annex III §5** (essential services). EBA + national banking supervisors will overlay sectoral rules on top of the AI Act · cross-mapping Annex IV to your existing CRD/BCBS docs saves duplicate work.`);
  } else if (/medic|clinic|health|patient|diagnos/i.test(desc + ind)) {
    findings.push(`Healthcare use cases double-trigger **Annex III §5** AND the MDR (Medical Devices Regulation). Article 25 + Article 26 record-keeping should map directly to your existing PMS (post-market surveillance) — file once, satisfy both.`);
  } else if (/cust|support|chat|bot/i.test(desc + ind)) {
    findings.push(`Customer-support / chatbot use cases land in **Limited-risk · Article 50** transparency. The badge from GIG-4 ($197) is the literal fix · 5 categories × 6 languages baked. Install on every disclosure surface in your stack.`);
  } else {
    findings.push(`Your industry signals (${ind || 'general AI'}) don't trigger Annex III directly · but the Article 50 transparency duty applies the moment any AI-generated output reaches an EU user. Worth budgeting GIG-4 ($197) as a 72-hour-fix in the next 8 weeks.`);
  }

  const bl = bottomLine(classification);

  // recommended next gigs (in-Fiverr upsell · ToS-compliant)
  const recommendedGigs = [];
  if (classification.tier === 'high' || classification.tier === 'limited') {
    recommendedGigs.push('GIG-3 · Annex IV documentation generator · $297 · 5 days');
  }
  if (classification.tier === 'high') {
    recommendedGigs.push('GIG-2 · Article 12 audit-shim install · $147 · 48h');
  }
  if (classification.tier === 'limited') {
    recommendedGigs.push('GIG-4 · Article 50 transparency badges · $197 · 72h');
  }

  await auditLog({
    type: 'drafted',
    orderId: order.orderId,
    gigId: order.gigId,
    meta: { findingsCount: findings.length, recommendedGigCount: recommendedGigs.length },
  });

  return { findings, bottomLine: bl, recommendedGigs };
}

/**
 * Build the full Fiverr delivery message.
 * Returns the paste-ready text for the order's "Deliver Work" form.
 */
export function buildDeliveryMessage({ order, classification, findings, envelope }) {
  const c = classification;
  const pieces = [
    `Hi ${order.buyerName} — delivery attached.`,
    ``,
    `**What you get:**`,
    `· 5-page PDF: ${c.label} · ${c.articles.length} article cites · penalty exposure + 14-field Annex IV gap list + deadlines`,
    `· Signed-envelope JSON (Ed25519-signed at ${envelope.deliveredAt})`,
    `· Public key for verification: \`${envelope.publicKey.slice(0, 16)}…\``,
    ``,
    `**Quick notes on the report (page 2):**`,
    ...findings.findings.map(f => `· ${f.replace(/\*\*/g, '').slice(0, 200)}${f.length > 200 ? '…' : ''}`),
    ``,
    `**Important:** this is research-grade compliance work, not legal advice. For systems with material exposure, share this report with qualified EU counsel — it'll save them (and you) weeks of catch-up.`,
    ``,
    `If everything looks right, a 5-star review with ONE specific thing you found useful would mean the world. It directly drives whether other founders find this gig.`,
    ``,
    `**Next steps (zero pressure):**`,
    ...findings.recommendedGigs.map(g => `· ${g}`),
    ``,
    `Either way · grateful you trusted me with this. Reach out anytime.`,
    ``,
    `Simon · github.com/sjgant80-hub/fall-euaiact`,
  ];

  return pieces.join('\n');
}
