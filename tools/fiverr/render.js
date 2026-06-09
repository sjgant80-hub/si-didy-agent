// ◊·κ=1 · fiverr-autopilot · STRAND 3/7 · PDF renderer
// Reads the templated markdown deliverable · substitutes mustache-style vars ·
// renders via Playwright headless print-to-PDF in oxblood/brass/cream theme.

import fs from 'node:fs';
import path from 'node:path';
import { log as auditLog } from './audit.js';

const TPL_DIR = path.resolve('packs/FIVERR-PACK-V1');
const OUT_DIR = path.resolve('queues/fv-awaiting-review');
fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Replace {{key}} tokens in a string with values from a context map.
 * Missing keys render as italic placeholders so reviewer sees what's unfilled.
 */
function fill(tpl, ctx) {
  return tpl.replace(/\{\{([\w_.]+)\}\}/g, (_, k) => {
    const v = k.split('.').reduce((o, p) => (o == null ? null : o[p]), ctx);
    if (v == null) return `_{{${k}}}_`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });
}

/**
 * Build the article + Annex IV markdown tables from a classification object.
 */
function tablesFromClassification(c) {
  const articleRows = c.articles.length
    ? c.articles.map(a => `| ${a} | (cross-ref Act text) | apply to your system |`).join('\n')
    : '| (none specific) | — | minimal-risk · best-practice only |';

  const triggerList = c.triggers && c.triggers.length
    ? c.triggers.map(t => `- **${t.article}** · ${t.note}`).join('\n')
    : '- (no specific Annex III triggers · classifier returned minimal-risk)';

  const stepList = (() => {
    if (c.tier === 'prohibited') return [
      'Cease EU deployment immediately',
      'Engage EU counsel for Article 5 review',
      'Re-scope or sunset the feature triggering prohibition',
      'Document the re-scope decision for supervisory record',
    ];
    if (c.tier === 'high') return [
      `Install the Article 12 audit-shim (drop-in vanilla JS) — see GIG-2`,
      `Generate the Annex IV documentation (${14 - c.fieldsPresent} fields outstanding) — see GIG-3`,
      `Wire post-market monitoring per Article 72`,
      `Submit Annex IV pack to your supervisory authority before 2 Aug 2026`,
    ];
    if (c.tier === 'limited') return [
      `Install Article 50 transparency badges on every AI surface — see GIG-4`,
      `Document the disclosure mechanism in Annex IV field 1`,
      `Add impression logging for Article 26 record-keeping`,
      `Verify badge renders across all 6 EU locales you serve`,
    ];
    return [
      'Maintain best-practice documentation for field 8 (post-market monitoring)',
      'Re-classify if material features change',
      'Monitor supervisory authority guidance through 2027',
      'Annual classification refresh recommended',
    ];
  })();

  const stepBullets = stepList.map((s, i) => `${i + 1}. **${s}**`).join('\n');

  const triggers = triggerList;
  return { articleRows, triggerList: triggers, stepBullets };
}

/**
 * Render a GIG-1 classification report as PDF.
 * Returns { pdfPath, mdPath, fileSize }
 */
export async function renderGig1PDF({ order, classification, envelope, signature, publicKey, findings }) {
  await auditLog({ type: 'render_started', orderId: order.orderId, gigId: 1 });

  const tplPath = path.join(TPL_DIR, 'sample-deliverable-gig1.md');
  const tpl = fs.readFileSync(tplPath, 'utf8');
  const tables = tablesFromClassification(classification);

  const ctx = {
    system_name:        order.intake?.systemDescription?.slice(0, 60) || 'Your AI System',
    buyer_name:         order.buyerName,
    delivery_date:      new Date().toISOString().slice(0, 10),
    envelope_hash:      (envelope?.hash || '').slice(0, 16) + '…',
    tier:               classification.tier,
    label:              classification.label,
    confidence:         classification.confidence,
    fields_present:     classification.fieldsPresent,
    gap:                14 - classification.fieldsPresent,
    deadline:           classification.deadline,
    penalty:            classification.penalty,
    one_sentence_bottom_line: findings?.bottomLine || '(see Section 2)',
    system_description: order.intake?.systemDescription,
    trigger_list:       tables.triggerList,
    articles_table:     tables.articleRows,
    specific_penalty:   classification.penalty,
    step_1: '(see step list)', step_2: '(see step list)', step_3: '(see step list)', step_4: '(see step list)',
    timestamp:          new Date().toISOString(),
    envelope_json:      JSON.stringify(envelope).slice(0, 80) + '…',
    signature_hex:      signature?.slice(0, 32) + '…',
    public_key_hex:     publicKey?.slice(0, 32) + '…',
  };

  // Override the bullet section directly · the template has hardcoded step_N
  // markers we replace with the dynamic stepBullets:
  let md = fill(tpl, ctx);
  md = md.replace(/1\. \*\*\(see step list\)\*\*[\s\S]*?4\. \*\*\(see step list\)\*\*/m, tables.stepBullets);

  // Save raw markdown · always useful for review
  const mdPath = path.join(OUT_DIR, `${order.orderId}-classification.md`);
  fs.writeFileSync(mdPath, md, 'utf8');

  // Try Playwright PDF · fall back to markdown-only if not installed
  let pdfPath = null;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const html = mdToStyledHtml(md, order, classification);
    await page.setContent(html, { waitUntil: 'networkidle' });
    pdfPath = path.join(OUT_DIR, `${order.orderId}-classification.pdf`);
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
      printBackground: true,
    });
    await browser.close();
  } catch (err) {
    console.warn('[render] Playwright unavailable · markdown only · ' + err.message);
  }

  const fileSize = pdfPath ? fs.statSync(pdfPath).size : fs.statSync(mdPath).size;

  await auditLog({
    type: 'pdf_rendered',
    orderId: order.orderId,
    gigId: 1,
    meta: { mdPath, pdfPath, fileSize },
  });

  return { pdfPath, mdPath, fileSize };
}

/**
 * Wrap markdown in the estate's oxblood/brass/cream print-CSS shell.
 */
function mdToStyledHtml(md, order, c) {
  // crude but effective markdown → HTML for delivery PDFs
  let html = md
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\|([^\n]+)\|\s*\n\|([\s-:|]+)\|\s*\n((?:\|[^\n]+\|\s*\n?)+)/g, (_, h, _s, rows) => {
      const ths = h.split('|').map(s => s.trim()).filter(Boolean).map(s => `<th>${s}</th>`).join('');
      const trs = rows.trim().split('\n').map(r =>
        '<tr>' + r.split('|').slice(1, -1).map(s => `<td>${s.trim()}</td>`).join('') + '</tr>'
      ).join('');
      return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
    })
    .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n/g, '</p><p>');

  html = '<p>' + html + '</p>';
  // collapse stray paragraph wrappers around headings/blocks
  html = html.replace(/<p>(<h\d>)/g, '$1').replace(/(<\/h\d>)<\/p>/g, '$1');
  html = html.replace(/<p>(<blockquote>)/g, '$1').replace(/(<\/blockquote>)<\/p>/g, '$1');
  html = html.replace(/<p>(<table>)/g, '$1').replace(/(<\/table>)<\/p>/g, '$1');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${order.orderId}</title>
<style>
  :root { --ox:#8b1a1a; --brass:#b8974a; --cream:#fafaf6; --void:#11131a; --grey:#666; }
  body { font: 11pt/1.55 'Georgia', 'Libre Baskerville', serif; color: #1a1a22; background: var(--cream); padding: 8mm 0; max-width: 170mm; margin: 0 auto; }
  h1 { font-size: 22pt; color: var(--ox); margin: 0 0 8pt; border-bottom: 2pt solid var(--brass); padding-bottom: 6pt; }
  h2 { font-size: 14pt; color: var(--void); margin: 18pt 0 6pt; border-left: 3pt solid var(--brass); padding-left: 8pt; }
  h3 { font-size: 12pt; color: var(--ox); margin: 12pt 0 4pt; font-style: italic; }
  p { margin: 0 0 6pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; font-size: 9.5pt; }
  th { background: var(--void); color: var(--cream); padding: 4pt 6pt; text-align: left; font-weight: 700; }
  td { padding: 3pt 6pt; border-bottom: 0.5pt solid #ccc; }
  blockquote { background: rgba(184,151,74,0.08); border-left: 3pt solid var(--brass); padding: 8pt 12pt; margin: 8pt 0; font-style: italic; color: #444; }
  code { background: #f0eee5; padding: 1pt 4pt; border-radius: 2pt; font: 9pt 'IBM Plex Mono', monospace; color: var(--ox); }
  strong { color: var(--void); }
  em { color: var(--brass); }
  .footer { margin-top: 24pt; padding-top: 12pt; border-top: 1pt solid var(--brass); color: var(--grey); font-size: 8pt; text-align: center; }
</style></head><body>
${html}
<div class="footer">◊·κ=φ⁴ · prime 607 · classified by fall-euaiact v1.1 · si-didy autopilot · github.com/sjgant80-hub</div>
</body></html>`;
}

export { fill, tablesFromClassification };
