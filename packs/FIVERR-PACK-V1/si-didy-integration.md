# si-didy · Fiverr auto-fulfillment integration

## ◊·κ=1 · how Tier 1 gigs run hands-off

GIG-1 (classification, $97) and GIG-8 (API, $47) can be fulfilled in under 5 minutes of your time. Here's the wire-up.

---

## Architecture

```
Fiverr order email → Botler/si-didy inbox watcher
                  ↓
       Parse intake brief (claude T1 extract)
                  ↓
       Run fall-euaiact classify() · createAnnexIV()
                  ↓
       Render PDF (HTML template + Puppeteer print)
                  ↓
       Draft delivery message (Claude T1 personalise)
                  ↓
       Push to review queue · BroadcastChannel('fiverr-queue')
                  ↓
       You: open queue dashboard · approve · 1-click send
```

Net time per order:
- Automation: ~3 min (Claude tokens cost ~$0.40)
- Your review: ~2 min (read findings, hit send)
- Total margin: **~99% on the $97 gig**

---

## Files to add to si-didy-agent

### 1. `tools/fiverr-fulfill.ts`

```ts
import { classify, createAnnexIV, generateKeypair, sign } from 'fall-euaiact';
import { renderPDF } from './render-pdf.js';
import { claudeDraft } from './claude-cascade.js';

export interface FiverrOrder {
  orderId: string;
  buyerName: string;
  gigId: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  tier: 'basic' | 'standard' | 'premium';
  intake: {
    systemDescription: string;
    intendedPurpose?: string;
    industry?: string;
    euUsers?: 'yes' | 'no' | 'some';
    existingDocs?: string;
    liveUrl?: string;
  };
}

const KEYPAIR = await loadOrGenerateKonomi(); // from IndexedDB

export async function fulfillTier1(order: FiverrOrder) {
  if (order.gigId !== 1) throw new Error('only gig-1 auto-fulfills');

  // 1. classify
  const result = classify(order.intake.systemDescription);

  // 2. Annex IV gap-list
  const doc = createAnnexIV({
    '1_general_description': order.intake.systemDescription,
    '2_intended_purpose': order.intake.intendedPurpose || '',
  });
  const annexGap = doc.missing();

  // 3. compute penalty + deadlines from tier
  const penalty = PENALTY_TABLE[result.tier];
  const deadline = DEADLINE_TABLE[result.tier];

  // 4. personalise findings via Claude T1
  const findings = await claudeDraft({
    template: 'fiverr-gig1-findings',
    context: {
      buyer: order.buyerName,
      tier: result.tier,
      triggers: result.triggers,
      industry: order.intake.industry,
    },
  });

  // 5. sign the report envelope
  const envelope = {
    kind: 'fall-euaiact-classification-report-v1',
    orderId: order.orderId,
    classification: result,
    deliveredAt: new Date().toISOString(),
  };
  const signature = await sign(JSON.stringify(envelope), KEYPAIR.privateKey);

  // 6. render PDF from markdown template
  const pdfBuffer = await renderPDF('gig1-template', {
    buyer: order.buyerName,
    result,
    annexGap,
    penalty,
    deadline,
    findings,
    envelope,
    signature,
    publicKey: KEYPAIR.publicKey,
  });

  // 7. draft delivery message
  const message = await claudeDraft({
    template: 'fiverr-gig1-delivery',
    context: { buyer: order.buyerName, tier: result.tier, findings },
  });

  // 8. push to review queue
  const channel = new BroadcastChannel('fiverr-queue');
  channel.postMessage({
    orderId: order.orderId,
    status: 'awaiting_approval',
    artifacts: { pdfBuffer, message, envelope, signature },
  });

  return { status: 'queued_for_review', orderId: order.orderId };
}
```

### 2. `templates/gig1-template.html`

Use the markdown in `sample-deliverable-gig1.md` as the rendering source. Render via puppeteer's `page.pdf()` with the brass/oxblood/cream theme from the FallBrief CSS palette.

### 3. `templates/claude-prompts/fiverr-gig1-findings.md`

```
You are Simon Gant writing a personalised findings paragraph for a Fiverr
GIG-1 deliverable. Voice: technical, matter-of-fact, no hype.

Context:
- Buyer: {{buyer}}
- Risk tier from classifier: {{tier}}
- Triggers matched: {{triggers}}
- Industry: {{industry}}

Write a 3-bullet "Why this classification" paragraph (max 100 words total)
that names 2-3 SPECIFIC things about THEIR system that drove the tier,
not generic Act references. Avoid the word "leverage". No emojis.
```

### 4. Inbox watcher

Use the existing Botler Gmail OAuth wire-up. Watch for subject pattern:
```
"You got a new order from {buyer} - GIG{1,2,3,4,5,6,7,8}"
```
Parse the buyer name + order ID from the email body. The intake brief is the buyer's response to your requirements form — Fiverr emails it as a `.txt` attachment OR you fetch via Fiverr's API (Pro tier only).

### 5. Review dashboard

Single HTML page (sovereign single-file pattern) that subscribes to `BroadcastChannel('fiverr-queue')` and renders:
- Order metadata (ID, buyer, tier, gig)
- Generated PDF preview (iframe)
- Drafted delivery message (editable textarea)
- One button: **Approve & Send** → posts to Fiverr API (Pro) OR opens Fiverr order page with clipboard pre-filled

Path: `dashboards/fiverr-review.html`

---

## Cost model (per Tier 1 order)

| Step | Tokens | Cost (Claude Haiku) |
|---|---|---|
| Parse intake brief | ~2K | $0.002 |
| Generate findings | ~3K | $0.003 |
| Draft delivery message | ~2K | $0.002 |
| **Total per order** | ~7K | **$0.007** |

Add Puppeteer/Render hosting (~$5/mo for unlimited Tier 1 fulfillment) and you're at **>99% margin** on every $97 order.

---

## What you DON'T automate

These need your human judgment · never automate:
- ❌ Tier 2 (Annex IV generator) · 30% needs custom adaptation
- ❌ Tier 3 (MVP builds) · everything is custom
- ❌ Disputes / refund requests · human-only
- ❌ Custom Offer pricing / scope negotiation
- ❌ Public review responses · brand voice matters

---

## Schedule

| Day | Action |
|---|---|
| Day 1 | Add `fiverr-fulfill.ts` + templates to si-didy-agent |
| Day 2 | Wire Botler Gmail watcher to detect Fiverr emails |
| Day 3 | Build `dashboards/fiverr-review.html` review dashboard |
| Day 4 | End-to-end test with synthetic order |
| Day 5 | Go live on first real GIG-1 order |

---

*◊·κ=φ⁴ · For the people not the few · si-didy autopilot · prime 379*
