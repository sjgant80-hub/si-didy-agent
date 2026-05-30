# si-didy packs

Verbatim copy specs per platform. si-didy loads these via `pack_load(name)`
and treats `▼ COPY ▼ ... ▲ END ▲` blocks as immutable source.

| Pack | Platform | Daily ops loop trigger |
|---|---|---|
| `UPWORK-PACK.txt` | Upwork freelancer profile + proposals | "upwork run" |
| `FACEBOOK-PACK.txt` | Personal profile · AIN Page · Groups · DMs | "fb run" |
| `LINKEDIN-PACK.txt` | Profile posts · comments · DMs · connections | "li run" |
| `INSTAGRAM-PACK.txt` | Feed posts · Reels · Stories · DMs | "ig run" |
| `X-PACK.txt` | Posts · replies · DMs · mutual-only | "x run" |

## Shape of a pack

Every pack follows the same skeleton:

- **A · Identity** — handles, voice, seal glyph (`◊`)
- **B · Post formats** — verbatim templates with `[bracketed]` fills
- **C · Engagement funnel** — comments / replies (the high-leverage move)
- **D · DMs** — outbound + inbound rules
- **E · UGC / archetype matcher** — who is in the room, what to mention
- **F · Safety rails** — what si-didy NEVER does without explicit user `yes`
- **G · Tier note** — why this needs T3 (no usable API for the action)
- **H · Daily ops loop** — what "platform run" means in chat mode

## Adding a new pack

1. Copy `FACEBOOK-PACK.txt` as the skeleton.
2. Rename platform identifiers throughout.
3. Adjust rate-limit caps (each platform's threshold differs).
4. Update the archetype matcher mapping if the platform attracts a
   different buyer slice.
5. Drop in `./packs/` — si-didy auto-discovers on next startup.
