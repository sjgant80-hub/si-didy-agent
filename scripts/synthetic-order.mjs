// ◊·κ=1 · synthetic Fiverr order · end-to-end pipeline smoke test
// Runs the full orchestrator with a realistic brief · proves all 7 strands wire.
// Usage: node scripts/synthetic-order.mjs

import { fulfill, approveAndShip, listQueue, auditStats, auditLog } from '../tools/fiverr/index.js';

const SYNTHETIC = `You got a new order from JaneDoe - GIG-1

Order #FO9SYNTH001 · Basic Package

1. Description: An AI-powered tool that screens job applications and ranks candidates based on CV content, education, and prior experience. We serve EU companies in tech recruitment, processing about 5,000 CVs per month. The system uses an LLM to extract structured data + a custom scoring model.

2. Industry / use-case: Hiring / recruitment / HR-tech

3. EU users: yes

4. Existing classification or compliance docs: We have a draft Article 6 self-assessment but no Annex IV yet.
`;

console.log('◊·κ=1 · synthetic Fiverr fulfillment test\n');

const result = await fulfill(SYNTHETIC);
console.log('--- pipeline result ---');
console.log(JSON.stringify(result, null, 2));

const queue = listQueue();
console.log('\n--- queue state ---');
console.log(`${queue.length} packages awaiting review`);
for (const q of queue) {
  console.log(`  · ${q.orderId} · GIG-${q.gigId} · tier=${q.tier} · verdict=${q.verdict} · flags=${q.flags}`);
}

const stats = auditStats();
console.log('\n--- audit chain ---');
console.log(`total events: ${stats.total} · last 24h: ${stats.last24h}`);
console.log('events by type:', stats.byType);

console.log('\n◊ done · open dashboards/fiverr-review.html to review');
console.log('  (or run `node agent.mjs --server` first for live mode)');
