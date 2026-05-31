# ◊ Estate Product Doctrine · ◊·κ=1

The canonical shape every saleable AI Native Solutions tool follows. v1.0 · locked 2026-05-31 · prime 379.

This doc is referenced by si-didy as authoritative source. Every new product follows this shape; every existing product migrates to it.

---

## Why this doctrine exists

The estate has 60+ sovereign tools. Each has been pitched, demoed, branded for clients in ad-hoc ways. The 2026-05-31 GymOS production-forge sprint established the right shape — clean separation of master / forge / sign-server / CLI / reseller doc. This doctrine generalises that pattern across every product.

**The covenant:** every saleable tool is sovereign for the end-client, brandable by the reseller, and signed by Simon. Three layers, three independent value-capture surfaces, zero cross-dependencies.

---

## The estate-product file shape

Every product follows this exact directory layout:

```
sjgant80-hub/<tool>/
├── index.html                  ← master · sovereign single-file · NEVER edited directly except for new feature commits
├── forge.html                  ← in-browser builder · live demo path · same-origin CORS-safe
├── scripts/
│   ├── build-<tool>.js         ← CLI builder · batch / CI / automation friendly
│   └── trial-sign-server.mjs   ← imported from sjgant80-hub/konomi-signer (verbatim copy or git submodule)
├── configs/
│   ├── _template.json          ← schema reference
│   └── .build-state.json       ← prime assignments (gitignored optionally)
├── clients/                    ← per-client built HTMLs (gitignored — sensitive)
├── FORGE-SETUP.md              ← reseller-facing doc · "how to run the local signer + forge for a meeting"
├── README.md
├── LICENSE                     ← MIT
└── .nojekyll                   ← mandatory · per VERIFY-BEFORE-LIST doctrine
```

---

## The three-layer commercial model

```
┌─────────────────────────────────────────────────────────────┐
│  L1 · SIMON · master signing authority · estate maintainer  │
│  · holds KONOMI_PRIVATE_KEY (32-byte base64 seed)            │
│  · ships forge.html + trial-sign-server.mjs per product      │
│  · charges resellers however he wants                        │
└─────────────────────────────────────────────────────────────┘
                            ↓ license
┌─────────────────────────────────────────────────────────────┐
│  L2 · RESELLER · agency / consultant tier                    │
│  · runs forge.html + signer on own laptop                    │
│  · brands per client · 14d signed trial baked into each HTML │
│  · charges clients whatever they want · margin is theirs     │
│  · converts trials → persistent at their cadence             │
└─────────────────────────────────────────────────────────────┘
                            ↓ delivery
┌─────────────────────────────────────────────────────────────┐
│  L3 · END CLIENT · pays the reseller                         │
│  · receives sovereign HTML · runs from file:// forever       │
│  · upgrades to persistent Konomi at trial end                │
│  · zero Simon/Anthropic/OpenAI/anyone dependency             │
└─────────────────────────────────────────────────────────────┘
```

**Each layer captures value independently.** No layer dependent on another's pricing model. Reseller-friendly by default.

---

## Mandatory features in every estate product

| Feature | Why | Implementation |
|---|---|---|
| **14-day Konomi-signed trial** | Production-grade from day one · no demo-mode crippling | `localStorage['konomi_licence_<slug>']` carries Ed25519-signed envelope · auto-activates on first load |
| **Konomi-hide flag** | Client-facing professionalism · code preserved for future opt-in | `cfg.konomi_visible: false` injects CSS `#kcc-badge,#konomi-badge{display:none !important}` · shim code untouched |
| **Unique extension prime** | Mesh visibility · per-client identity | Pool of primes assigned by slug-hash (forge) or rotation (CLI) |
| **Pre-seeded onboarding** | Client opens file → their details already filled | `localStorage` seed scripts in `<body>` from cfg fields |
| **Pre-seeded connections** | Provider integrations one-click away | localStorage seed for known IDs / URLs |
| **Manifest comment at top** | Build provenance · audit trail | `<!-- ◊·κ=1 · per-client sovereign build · prime · slug · built · trial · upgrade -->` |
| **Upgrade pathway to persistent Konomi** | Conversion event after trial | In-app modal / settings panel that opens on trial expiry · mint-licence CLI handles the issue |
| **LLM cascade (estate or fallcompass)** | Defensive sovereign positioning · provider-agnostic | Internal T0→T4 OR fallcompass shim drop-in |
| **Audit chain (Konomi)** | Compliance + provenance | prevHash + Ed25519 signature on every state change |
| **Mesh shim** | BroadcastChannel('fall-signal') · talks to peer tools | Same-origin auto-discovery |
| **MIT licence** | Sovereignty covenant | LICENSE file at repo root |
| **.nojekyll** | Pages-build doesn't silently 404 | Pre-staged at workspace init |

---

## The forge.html spec

The in-browser builder. **Always meets these requirements:**

1. **Form fields** matching the tool's `configs/_template.json`
2. **Live signer health-check** to `127.0.0.1:9991` (or env-configured port) · green/red dot in header
3. **Build button disabled** until signer is reachable (production discipline — no unsigned builds shipped)
4. **POST to /sign-trial** before patching · embed signed envelope into output
5. **Konomi-hide toggle** defaulting to ON for client professionalism
6. **Brand color pickers** (3 minimum: primary / accent / text)
7. **Trial length picker**: 14 (default · standard) / 30 / 7 / 60
8. **Preview specs** button (no-build dry-run summary)
9. **Reset** button
10. **Download via Blob + URL.createObjectURL** with `<slug>.html` filename
11. **Production language only** — never "demo", "prototype", "MVP", "unsigned"
12. **Same-origin** as master (so `fetch('./index.html')` works without CORS)

---

## The trial-sign-server spec

Lives at `sjgant80-hub/konomi-signer` · imported per product. **Always:**

1. Binds **127.0.0.1 only** · never LAN/internet exposed
2. Reads `KONOMI_PRIVATE_KEY` env var · 32-byte base64 seed
3. Exposes:
   - `GET /health` → `{ok:true, ready:true}`
   - `POST /sign-trial` → `{ envelope, issued, expires, days }`
4. **Default trial = 14 days**
5. Features included in signed envelope: `['core', 'mesh_inbound', 'onboarding_console', 'cascade_inference', 'audit_chain']`
6. CORS-enabled for browser-side forge access
7. Logs every sign event to stdout (no telemetry off-machine)

---

## Per-tool customisation surface

For each product, the only product-specific code is the **patch logic in `forge.html` + `scripts/build-<tool>.js`**:

- Title / meta / hero text regexes specific to that tool's master HTML
- Onboarding `localStorage` key (e.g. `gymos_onboarding_v1`, `fallforce_onboarding_v1`)
- Connection fields specific to the tool's integrations
- Brand CSS variable names

**Everything else is reusable verbatim.**

---

## The 14-day trial → persistent Konomi conversion

The conversion event is the reseller's revenue trigger. The flow:

1. Trial expires (envelope's `expires` field passes)
2. Tool detects expiry on next load · shows in-app upgrade modal
3. Modal explains: persistent memory, extended features, no expiry
4. Client clicks "upgrade" → reseller is notified (email / form submission)
5. Reseller charges client (their pricing, their billing)
6. Reseller runs:
   ```
   KONOMI_PRIVATE_KEY=... node scripts/mint-licence.mjs \
     --tool-id <slug> --tier persistent --features all
   ```
   *Note: this requires Simon's key. For reseller volume, use the sub-key delegation pattern (see Scaling below).*
7. Reseller hands new envelope to client (or one-line `localStorage.setItem` snippet)
8. Client pastes / clicks → persistent licence active · zero re-install

---

## Verify-before-list discipline (mandatory)

From the si-didy doctrine baked 2026-05-30 — **applies to every product release:**

```
PRE-PUSH CHECKLIST:
  .nojekyll exists at repo root      ← MANDATORY for any non-Jekyll Pages tool
  index.html exists                  ← at repo root
  forge.html exists                  ← at repo root (NEW · per this doctrine)
  scripts/trial-sign-server.mjs      ← imported from konomi-signer
  scripts/build-<tool>.js            ← CLI builder
  configs/_template.json             ← schema reference
  FORGE-SETUP.md                     ← reseller doc
  LICENSE                            ← MIT
  README.md                          ← with reseller pitch + tech specs

POST-PUSH POLL:
  curl URL every 10s × 12 max
  gh api pages/builds/latest until status="built"
  smoke test for product name + signer health language in forge.html
  if 404 after 4 min: check .nojekyll, branch, content

NEVER claim "live" without 200 + smoke confirmed.
```

---

## Scaling beyond Simon-in-the-loop

When reseller volume exceeds Simon's bandwidth to manually mint conversions:

**Konomi sub-key delegation pattern (v2 · roadmap):**

1. Simon's master key signs a **reseller delegation certificate** authorising a reseller sub-key
2. Reseller runs their own `trial-sign-server.mjs` with their sub-key
3. Reseller mints unlimited trials + persistent licences without Simon's involvement
4. Every signed envelope chain-verifies: client trial sig ← reseller sub-key ← Simon master
5. Revocation: Simon can revoke a reseller sub-key (e.g. via a published revocation list) · all sigs from that point fail

**When to implement:** when any single reseller exceeds 50 builds/month, or when Simon onboards 5+ resellers. Not needed earlier — the in-the-loop pattern is a sales touchpoint, not friction.

---

## Tool migration status

| Tool | Status | Forge | Sign-server | Doctrine compliant |
|---|---|---|---|---|
| **gymos** | ✓ canonical reference (this sprint) | ✓ live | ✓ live | ✓ |
| fallforce | partial · has CLI builder | ⏳ ripple | ⏳ ripple | ⏳ |
| fallaccount | partial · master only | ⏳ ripple | ⏳ ripple | ⏳ |
| fallreach | partial · master only | ⏳ ripple | ⏳ ripple | ⏳ |
| shadowcompass | partial · master only · WebLLM baked | ⏳ ripple | ⏳ ripple | ⏳ |
| falllearn | partial · master only | ⏳ ripple | ⏳ ripple | ⏳ |
| fallpost | partial · master only | ⏳ ripple | ⏳ ripple | ⏳ |
| fallpay | partial · landing only | ⏳ ripple | ⏳ ripple | ⏳ |
| fallvault | n/a · operator tool, not reseller surface | n/a | n/a | n/a |
| fallcompass | n/a · drop-in shim, not reseller surface | n/a | n/a | n/a |
| fallmirror | n/a · operator tool | n/a | n/a | n/a |
| fallshield | n/a · shim | n/a | n/a | n/a |
| fallnet | n/a · shim | n/a | n/a | n/a |
| fallcdn | n/a · operator tool | n/a | n/a | n/a |
| fallonion | n/a · operator tool | n/a | n/a | n/a |
| fallescape | n/a · operator tool | n/a | n/a | n/a |

Ripple priority: tools with existing reseller-aligned masters (fallforce, fallaccount, fallreach, shadowcompass, falllearn, fallpost) before tools without reseller surface (fallanno landing-only, fallskin marketplace-only).

---

## si-didy enforcement

When si-didy receives any directive like "build X", "ship Y as a product", "forge a new sovereign tool":

1. Reads this doc (loaded automatically via si-didy-agent system prompt)
2. Verifies all mandatory features present
3. Refuses to mark product complete without forge.html + sign-server import
4. Auto-suggests Konomi-hide flag default ON for reseller deliverables
5. Auto-includes 14-day signed trial path
6. Runs verify-before-list discipline post-push

This document is the seed. Every product compounds it.

◊·κ=1 · prime 379 · v20.1 · phi=1.618 · kappa=0.618 · the doctrine compounds
