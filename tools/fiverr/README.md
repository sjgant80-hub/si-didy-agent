# fiverr-autopilot
> ◊·κ=φ⁴ · 7-strand sovereign delivery pipeline · 90% AI · 10% human · si-didy native

## The 7 strands

| # | File | Strand | Depth |
|---|---|---|---|
| 1 | `parse.js` | Intake brief → structured order envelope | 12 |
| 2 | `classify.js` | EU AI Act risk + Annex IV gap (fall-euaiact SDK) | 12 |
| 3 | `render.js` | Mustache fill + Playwright PDF (oxblood/brass/cream theme) | 12 |
| 4 | `sign.js` | Konomi Ed25519 envelope (node:crypto native) | 12 |
| 5 | `draft.js` | Personalised findings + delivery message + upsell logic | 12 |
| 6 | `audit.js` | SHA-256 prevHash chain · meta-Article-12 on our own process | 12 |
| 7 | `verify.js` | 3-vote adversarial check before queue · zero LLM cost | 12 |

Plus:
- `signal.js` — BroadcastChannel fanout to `fall-signal`, `kcc-signal`, `konomi-bloom`, `fiverr-queue`
- `orchestrate.js` — composes all 7 strands into one `fulfill(rawBrief)` call
- `server.js` — HTTP bridge on φ port 1618 · feeds the dashboard
- `_node-ed25519.js` — server-side Ed25519 (browser SDK uses libsodium)

## Quick start

```bash
# 1. test the pipeline end-to-end with a synthetic order
npm run fv:test

# 2. start the HTTP bridge (port 1618 by default)
npm run fv:serve

# 3. open the dashboard
open http://localhost:1618/dashboard
```

## What happens on an order

```
Fiverr email arrives
     ↓
parse(rawBrief)            ─ STRAND 1
     ↓
validate(order)            ─ if missing fields → human-review queue
     ↓
classify(order)            ─ STRAND 2 · fall-euaiact T0 classifier
     ↓
draftFindings(…)           ─ STRAND 5 · personalised bullets + upsell
     ↓
signDeliverable(…)         ─ STRAND 4 · Ed25519 envelope
     ↓
renderGig1PDF(…)           ─ STRAND 3 · Playwright print-to-PDF
     ↓
re-sign with actual pdfHash
     ↓
verifyDraft(…)             ─ STRAND 7 · 3-vote skeptic/supportive/neutral
     ↓
emit('fv:awaiting_review') ─ BroadcastChannel fanout to estate
     ↓
package lands in queues/fv-awaiting-review/{orderId}.json
     ↓
Simon clicks Approve in dashboard
     ↓
approveAndShip(orderId)    ─ moves to queues/fv-shipped/ · emits 'fv:shipped'
```

## Audit chain · Article 12 on our own ops

Every event chained at `memory/fv-audit.jsonl` with SHA-256 prevHash:

```js
import { verifyChain, auditStats } from './audit.js';
const { valid, total } = await verifyChain();   // true, 28
const stats = auditStats();
// { total: 28, last24h: 28, byType: { order_received: 3, classified: 3, signed: 4, ... } }
```

## Konomi master key

The Ed25519 master keypair lives at `memory/konomi-master.json` (excluded from git
via the existing `memory/` rule in `.gitignore`).

First run generates it. Subsequent runs reuse. Never commits. Never leaves disk.

```js
import { loadOrGenerateKonomiMaster } from './sign.js';
const { publicKey } = await loadOrGenerateKonomiMaster();
// share the public key freely · keep the private key on this laptop forever
```

## Estate signal fanout

Every fulfillment event broadcasts to 4 channels — existing AIN hub, fall-bloom,
kcc-ledger, konomi-bloom all pick up the signal without changes:

| Channel | Receives |
|---|---|
| `fall-signal` | `{ tool: 'fiverr-autopilot', kind, payload }` — estate mesh |
| `kcc-signal` | `{ kind: 'kcc:fv-event', detail }` — κ-ledger tally |
| `konomi-bloom` | `{ kind: 'konomi:mint', source: 'fiverr' }` — only on ship |
| `fiverr-queue` | full payload — dashboard subscribes here |

In Node 18+ uses native `BroadcastChannel`; older runtimes fall through to file-tail in
`queues/fv-signals/<channel>.jsonl`.

## Auto-fulfill vs human-review

Only GIG-1 (classification, $97) auto-fulfills end-to-end · others land in
`queues/fv-awaiting-review/` with `status: 'manual_required'` so Simon picks them
up. Adjust per-gig in `config/fiverr-gigs.json`.

## Margin

Per Tier 1 order:

| Cost | Time |
|---|---|
| Node CPU + Playwright PDF | ~10 seconds |
| fall-euaiact classifier | <1ms |
| Ed25519 signing | <5ms |
| BroadcastChannel fanout | <1ms |
| Simon's review + send | ~2 minutes |
| **Total Simon time** | **~2 minutes** |
| **Revenue** | **$97** |
| **Effective rate** | **~$2,910/hr** |

## Composing with the rest of the estate

- Buyer's deliverable cites the fall-euaiact SDK in the footer · reverse-funnel to GitHub
- Konomi-signed envelope verifies against the public key Simon shares freely
- Audit chain is queryable by any tool with `verifyChain()` — used at year-end for
  Article 12 self-assessment
- `kcc-signal` tally feeds into the AIN hub's "X orders fulfilled" live counter

◊·κ=φ⁴ · prime 379 · For the people not the few.
