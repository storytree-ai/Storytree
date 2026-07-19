---
status: accepted
decided: 2026-07-19
supersedes: [134, 167, 172]
---
# ADR-0215: Public website story frame: two-act experience is the entire site

## Status

accepted (2026-07-19) — decided/directed by the owner in conversation on 2026-07-19, where the
owner approved consolidating the website-story frame stack into one readable authority and directed
allocate-and-write for this chip (Act 1 consolidating ADR was a separate session — now
[ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md)). Design-time
alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second end-of-flow ask.

**Supersedes** [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md),
[ADR-0167](0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md), and
[ADR-0172](0172-retire-the-remaining-brochure-pages-the-experience-is-the-en.md) — the site-frame
stack (two-act pitch, brochure triage, experience-is-the-entire-site). Keystatic was already dead
via 0167→0101; this ADR carries that retirement forward without reopening it. Their bodies stay as
history; **this ADR is the sole current authority for the public website's story frame.**

It does **not** supersede [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md)
(Act 2 experience — cite, do not restate),
[ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md) (Act 1 experience —
cite, do not restate), or the renderer/boundary ADRs
[0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) /
[0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) /
[0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
[0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md).

## Context

The public site's frame was decided correctly in pieces: the two-act pitch (0134), the info-page
disposition set + Keystatic retirement (0167), then the full brochure retirement so the experience
is the entire site (0172). Each later ADR amended earlier ones in place. The result: three accepted
bodies plus nested forward pointers. A session cannot calibrate to "what the public site *is*"
without reconstructing history — the same unreadable-stack failure
[ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md) closed for Act 2. That
fails the spirit of [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md):
the accepted set must be true in full for a reader, not only locally true per file.

This ADR is copy-on-write consolidation
([ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md)): one current-state
decision, no archaeology in the body. Act 2 detail stays on ADR-0213; Act 1 choreography stays on
[ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md).

## Decision

**The public website is a two-act experience that *is* the entire site.** Seven points:

### D1 — Two-act pitch

One calm gesture per act — **same input, opposite outcome.** In Act 1 the visitor's single tap
(send a prompt) breeds chaos; in Act 2 the visitor's single tap (advance) grows order. The visitor
never works harder in either act — the difference isn't effort, it's whether the result is legible.
**That contrast IS the argument.**

Act-level choreography is not restated here: Act 1 →
[ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md); Act 2 →
[ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md).

### D2 — Experience is the site

The public site is exactly:

1. Act 1 + Act 2 (the experience),
2. the no-JS / `prefers-reduced-motion` accessibility fallback,
3. the 404.

No brochure pages. Every retired URL redirects to `/`. The contact door is **retired and
revivable** — not a permanent "no inbound path" decision; add it back when the owner wants it.

### D3 — Salvage, not delete

Brochure substance that was worth keeping lives in research salvage docs
([`docs/research/retired-web-info-pages-2026-07.md`](../research/retired-web-info-pages-2026-07.md),
plus the earlier roadmap/landscape salvage docs) — revivable material, not live pages. **Keystatic
stays retired** (0167 already superseded [ADR-0101](0101-host-the-keystatic-cms-editor-on-cloud-run.md);
no reopen).

### D4 — Diorama / boundary

The experience is a stylized teaching diorama over **fictional / staged data**. The site consumes
parent-built **artifacts**, never private source or live store data. The close stays honest about
that boundary. Cite — do not restate —
[ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
[ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
[ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md).

### D5 — A11y-only escapes

The only non-experience exits for a capable visitor are **none**. Escapes that remain are
accessibility only: persistent **skip** and the **calm / reduced-motion / no-JS fallback**. No
capable-visitor brochure hatch. Gate-enforced by `check:web-experience` markers
([`experience-rollout-guardrails`](../../stories/website-experience/experience-rollout-guardrails.md)).

### D6 — Replay-only

Every visit replays the experience. Skip is **not** remembered. Act 2 has **no** standalone
deep-link — there is no anchor URL that lands mid-walk as a first-class entry.

### D7 — Authority split

| Slice | Authority |
|---|---|
| Site frame (this ADR) | **ADR-0215** |
| Act 2 visitor experience | [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md) |
| Act 1 choreography (felt overwhelm → finale → transform) | [ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md) |
| Renderer / shared core / grounding | [0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) / [0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) / [0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) / [0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) — cite |
| LOOK proof | Stays [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) operator-attested — appearance and feel never self-signed |

## Consequences

**Good.**

- One document is the website-story current state — sessions stop reconstructing 0134→0167→0172.
- Act 2 stays on ADR-0213; Act 1 stays on ADR-0216 — this ADR does not become a god-doc.
- The live site shape (experience + a11y fallback + 404) has a single readable authority matching
  what ships.

**Costs / risks.**

- **Caps and prose may still cite superseded ADR numbers** until a follow-on pass finishes
  citation cleanup. Citation drift is curation debt, not a re-decision.
- **No inbound contact path in the interim** — accepted deliberately (D2); revive when wanted.

## Out of scope

- Act 2 walk phases, diagram, BaaS diamond, chips, studio zoom-out → [ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md).
- Act 1 terminal swarm / finale / transform choreography →
  [ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md).
- R3F / shared render core / sync / grounding rail mechanism → ADR-0123 / 0093 / 0056 / 0066 (cite).
- `act2-beat-director` engine contracts → the LEAF cap.
- Act 2 LOOK iteration → ADR-0213 §Open iteration (do not reopen that amend stack here).

## References

- Superseded (history): [0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md),
  [0167](0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md),
  [0172](0172-retire-the-remaining-brochure-pages-the-experience-is-the-en.md).
- Sibling Act 2 (not superseded here): [0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md).
- Sibling Act 1 (not superseded here): [0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md).
- Cited: [0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md),
  [0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md),
  [0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md),
  [0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md),
  [0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md),
  [0101](0101-host-the-keystatic-cms-editor-on-cloud-run.md) (already superseded by 0167),
  [0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md),
  [0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md),
  [0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).
- Caps: [`website-experience`](../../stories/website-experience/story.md),
  [`info-pages-triage`](../../stories/website-experience/info-pages-triage.md),
  [`experience-rollout-guardrails`](../../stories/website-experience/experience-rollout-guardrails.md).
- Salvage: [`docs/research/retired-web-info-pages-2026-07.md`](../research/retired-web-info-pages-2026-07.md).
