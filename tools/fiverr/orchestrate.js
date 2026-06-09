// ◊·κ=1 · fiverr-autopilot · ORCHESTRATOR · composes 7 strands at depth-12 · φ home
// One call: rawBrief → parsed → classified → drafted → rendered → signed → verified → queued
// Returns the full envelope · ready for Simon to one-click approve in the dashboard.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { parse, validate } from './parse.js';
import { classify, bottomLine } from './classify.js';
import { renderGig1PDF } from './render.js';
import { signDeliverable, loadOrGenerateKonomiMaster } from './sign.js';
import { draftFindings, buildDeliveryMessage } from './draft.js';
import { verifyDraft } from './verify.js';
import { emit } from './signal.js';
import { log as auditLog } from './audit.js';

const QUEUE_DIR = path.resolve('queues/fv-awaiting-review');
fs.mkdirSync(QUEUE_DIR, { recursive: true });

/**
 * Full end-to-end fulfillment of one Fiverr order.
 * 90% AI · 10% human · Simon reviews + approves in dashboard.
 *
 * @param {string} rawBrief - the raw email body or pasted intake brief
 * @returns {Promise<{ status, orderId, packagePath, verdict, summary }>}
 */
export async function fulfill(rawBrief) {
  const t0 = Date.now();

  // STRAND 1 · PARSE
  const order = await parse(rawBrief);
  if (!order) return { status: 'parse_failed', orderId: null };

  const v = validate(order);
  if (!v.ok) {
    await emit({ kind: 'fv:parse_failed', payload: { orderId: order.orderId, missing: v.missing } });
    return { status: 'needs_human', orderId: order.orderId, reason: 'parse', missing: v.missing };
  }

  await emit({ kind: 'fv:order_received', payload: { orderId: order.orderId, gigId: order.gigId, tier: order.tier } });

  // Only auto-fulfill GIG-1 (classification) for now · others land in human-review queue
  if (order.gigId !== 1) {
    const packagePath = path.join(QUEUE_DIR, `${order.orderId}-manual.json`);
    fs.writeFileSync(packagePath, JSON.stringify({ order, status: 'manual_required', reason: `GIG-${order.gigId} not auto-fulfilled` }, null, 2));
    await emit({ kind: 'fv:awaiting_review', payload: { orderId: order.orderId, gigId: order.gigId, reason: 'manual' } });
    return { status: 'manual_required', orderId: order.orderId, gigId: order.gigId, packagePath };
  }

  // STRAND 2 · CLASSIFY
  const classification = await classify(order);

  // STRAND 5 · DRAFT (findings first · feeds into render)
  const findings = await draftFindings({ order, classification });

  // STRAND 4 · SIGN (envelope first so PDF can embed sig)
  const master = await loadOrGenerateKonomiMaster();
  let signed = await signDeliverable({ order, classification, pdfHash: 'pending' });

  // STRAND 3 · RENDER (PDF + markdown)
  const rendered = await renderGig1PDF({
    order,
    classification,
    envelope: signed.envelope,
    signature: signed.signature,
    publicKey: signed.publicKey,
    findings,
  });

  // Re-sign with the actual pdfHash so the envelope is tamper-evident against the artifact
  if (rendered.pdfPath) {
    const pdfBytes = fs.readFileSync(rendered.pdfPath);
    const pdfHash = crypto.createHash('sha256').update(pdfBytes).digest('hex');
    signed = await signDeliverable({ order, classification, pdfHash });
    // write canonical envelope alongside the PDF
    fs.writeFileSync(
      path.join(QUEUE_DIR, `${order.orderId}-envelope.json`),
      JSON.stringify({ envelope: signed.envelope, signature: signed.signature, publicKey: signed.publicKey }, null, 2)
    );
  }

  // STRAND 5 (continued) · build delivery message
  const deliveryMessage = buildDeliveryMessage({
    order,
    classification,
    findings,
    envelope: signed.envelope,
  });
  fs.writeFileSync(path.join(QUEUE_DIR, `${order.orderId}-delivery.txt`), deliveryMessage);

  // STRAND 7 · VERIFY (3-vote adversarial)
  const verdict = await verifyDraft({ order, classification, findings, deliveryMessage });

  // Final review package
  const reviewPackage = {
    orderId: order.orderId,
    status: verdict.verdict === 'auto-ship' ? 'awaiting_approval' : 'flagged_for_review',
    order,
    classification,
    findings,
    deliveryMessage,
    envelope: signed.envelope,
    signature: signed.signature,
    publicKey: signed.publicKey,
    rendered,
    verdict,
    elapsedMs: Date.now() - t0,
    estateSignals: ['fall-signal', 'kcc-signal', 'konomi-bloom', 'fiverr-queue'],
  };

  const packagePath = path.join(QUEUE_DIR, `${order.orderId}.json`);
  fs.writeFileSync(packagePath, JSON.stringify(reviewPackage, null, 2));

  await emit({
    kind: 'fv:awaiting_review',
    payload: {
      orderId: order.orderId,
      gigId: order.gigId,
      tier: classification.tier,
      verdict: verdict.verdict,
      flags: verdict.flags.length,
      elapsedMs: reviewPackage.elapsedMs,
    },
  });

  await auditLog({
    type: 'orchestrated',
    orderId: order.orderId,
    gigId: order.gigId,
    meta: { elapsedMs: reviewPackage.elapsedMs, verdict: verdict.verdict, tier: classification.tier },
  });

  return {
    status: reviewPackage.status,
    orderId: order.orderId,
    gigId: order.gigId,
    packagePath,
    verdict: verdict.verdict,
    summary: bottomLine(classification),
    elapsedMs: reviewPackage.elapsedMs,
  };
}

/**
 * Mark a queued package as approved + shipped (after Simon clicks Approve).
 * Moves the artifact from awaiting-review → shipped + emits final signals.
 */
export async function approveAndShip(orderId) {
  const src = path.join(QUEUE_DIR, `${orderId}.json`);
  if (!fs.existsSync(src)) throw new Error('package not found: ' + orderId);
  const pkg = JSON.parse(fs.readFileSync(src, 'utf8'));

  const SHIP_DIR = path.resolve('queues/fv-shipped');
  fs.mkdirSync(SHIP_DIR, { recursive: true });
  const dst = path.join(SHIP_DIR, `${orderId}.json`);
  fs.renameSync(src, dst);

  // also move sidecar files
  for (const ext of ['delivery.txt', 'envelope.json', 'classification.md', 'classification.pdf']) {
    const sFile = path.join(QUEUE_DIR, `${orderId}-${ext}`);
    if (fs.existsSync(sFile)) {
      fs.renameSync(sFile, path.join(SHIP_DIR, `${orderId}-${ext}`));
    }
  }

  await emit({
    kind: 'fv:shipped',
    payload: { orderId, gigId: pkg.order.gigId, tier: pkg.classification.tier, shippedAt: new Date().toISOString() },
  });
  await auditLog({ type: 'shipped', orderId, gigId: pkg.order.gigId, meta: { tier: pkg.classification.tier } });

  return { status: 'shipped', orderId, shipDir: SHIP_DIR };
}

/**
 * List all packages currently in the awaiting-review queue.
 * Used by the dashboard to render the watchlist.
 */
export function listQueue() {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs.readdirSync(QUEUE_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-envelope') && !f.includes('-manual'))
    .map(f => {
      const p = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, f), 'utf8'));
      return {
        orderId: p.orderId,
        gigId: p.order?.gigId,
        tier: p.classification?.tier,
        verdict: p.verdict?.verdict,
        flags: p.verdict?.flags?.length || 0,
        buyer: p.order?.buyerName,
        elapsedMs: p.elapsedMs,
        path: f,
      };
    });
}
