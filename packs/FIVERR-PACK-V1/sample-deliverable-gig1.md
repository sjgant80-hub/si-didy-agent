# EU AI Act Risk Classification Report
### {{system_name}} · for {{buyer_name}}
**Prepared by:** Simon Gant · sjgant80-hub
**Delivered:** {{delivery_date}}
**Engine:** fall-euaiact SDK v1.1.0 · classifier + human review
**Signed envelope:** `{{envelope_hash}}` ([verify](https://sjgant80-hub.github.io/fall-euaiact/cdn/audit-shim.js))

---

> **Honest framing.** This report is research-grade engineering work, not legal advice. For any system with material EU exposure, share this with qualified EU counsel before relying on it operationally. The Act's supervisory authority guidance is still being clarified through 2027.

---

## 1. Executive Summary

**Risk Tier:** {{tier}}
**Label:** {{label}}
**Confidence:** {{confidence}}/100
**Annex IV fields you owe:** 14 of 14 (you currently have **{{fields_present}}** documented · gap: **{{gap}}**)
**Hard deadline:** {{deadline}}
**Maximum penalty exposure:** {{penalty}}

**Bottom line:** {{one_sentence_bottom_line}}

---

## 2. Why This Classification

System description (your words, verbatim):
> {{system_description}}

The fall-euaiact classifier matched these specific Annex III triggers:
{{trigger_list}}

Triggers determine tier per Article 6 (high-risk) and Article 50 (limited-risk) of Regulation (EU) 2024/1689.

---

## 3. Articles You're On The Hook For

| Article | Title | What it requires of you |
|---|---|---|
{{articles_table}}

---

## 4. Penalty Exposure

| Breach Type | Max Fine |
|---|---|
| Prohibited AI practice (Article 5) | €35M or 7% global turnover |
| Non-compliance with high-risk obligations | €15M or 3% global turnover |
| Incorrect info to authorities | €7.5M or 1% global turnover |

Your specific exposure: **{{specific_penalty}}**

---

## 5. The 14 Annex IV Fields You Owe

Below is the Article 11 Annex IV checklist. Mark each with your current state:

| # | Field | Article | Status |
|---|---|---|---|
| 1 | General description of the AI system | Art 11(1)(a) | ☐ Documented ☐ Drafted ☐ Missing |
| 2 | Detailed elements + development process | Art 11(1)(b) | ☐ |
| 3 | Monitoring, functioning, control | Art 11(1)(c) | ☐ |
| 4 | Risk management system | Art 9 | ☐ |
| 5 | Modifications through lifecycle | Art 11(1)(d) | ☐ |
| 6 | Harmonised standards applied | Art 40 | ☐ |
| 7 | EU declaration of conformity | Art 47 | ☐ |
| 8 | Post-market monitoring system | Art 72 | ☐ |
| 9 | Performance metrics (accuracy, robustness, cybersec) | Art 15 | ☐ |
| 10 | Data sheets describing training methodologies | Art 10 | ☐ |
| 11 | Evaluation technique | Art 15 | ☐ |
| 12 | Cybersecurity measures | Art 15 | ☐ |
| 13 | Compliance with this Regulation | Art 16 | ☐ |
| 14 | Intended purpose and risks | Art 11(1)(e) | ☐ |

**Most common gaps in similar systems:** fields 9, 10, 11 (performance metrics, training data, evaluation method) — install the **Article 12 audit-shim** to auto-generate field 8 (post-market monitoring).

---

## 6. Hard Deadlines

| Date | What enforces |
|---|---|
| 2 Feb 2025 | Prohibited practices ban (already active) |
| 2 Aug 2025 | GPAI rules for new foundation models |
| **2 Aug 2026** | High-risk obligations (Annex III) **← your hard deadline if tier=high** |
| 2 Aug 2027 | Safety-component high-risk + GPAI legacy |

---

## 7. Recommended Next Steps

In order of priority:

1. **{{step_1}}**
2. **{{step_2}}**
3. **{{step_3}}**
4. **{{step_4}}**

---

## 8. The Tools You Already Have Access To (Free, MIT)

The fall-euaiact SDK that powers this report is open source · MIT · forever:

- **Classifier:** `npm install fall-euaiact` then `classify(description)` → returns tier + articles in <1ms
- **Audit-shim:** drop-in vanilla JS · SHA-256 prevHash chain · IndexedDB persistence
- **Annex IV generator:** `createAnnexIV(spec).export({format:'pdf', language:'de'})`
- **Article 50 badges:** `createTransparencyBadge({category:'chatbot'})`
- **Signing:** `generateKeypair()` / `sign()` / `verify()` Ed25519 envelopes

Repo: github.com/sjgant80-hub/fall-euaiact
Live demo: sjgant80-hub.github.io/fall-euaiact/

---

## 9. Signed Audit Evidence

This classification ran at `{{timestamp}}` and was Ed25519-signed for tamper-evidence:

```
envelope:  {{envelope_json}}
signature: {{signature_hex}}
public key: {{public_key_hex}}
```

Anyone can verify the signature by calling `verify(JSON.stringify(envelope), signature, publicKey)` from the fall-euaiact SDK.

---

*Report v1.0 · prime 607 · ◊·κ=φ⁴*
*Simon Gant · github.com/sjgant80-hub · For the people not the few.*
