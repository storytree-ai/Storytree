---
status: accepted
decided: 2026-07-07
amends: [134, 165, 167]
---
# ADR-0172: Retire the remaining brochure pages: the experience is the entire public site

## Status

accepted (2026-07-07) — decided/directed by the owner in conversation on 2026-07-07. Design-time
alignment IS the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md));
no second end-of-flow ask. Recorded verbatim (the direction, then the confirmed scope):

> *"retire all of these, if there is useful content turn it into an ADR that can be revived later."*

Scope confirmed the same conversation (does the interactive contact door go too?):

> *"retire everything we can add that back in later."*

The owner then walked the staged retired site and attested it to land (a look/feel verdict, agent-relayed
per [ADR-0044](0044-per-uat-test-human-attestation.md) §4):

> *"feels good, land this and close off."*

This is a NEW ADR, not an in-place edit of the ADRs it amends (copy-on-write, ADR-0086/0139): the bodies
of 134/165/167 stay as history, with a dated forward pointer added at each amended point by the librarian
pass (checklist below). It carries **no `supersedes` edge** — ADR-0101 (the hosted editor) was already
superseded by ADR-0167; this ADR re-decides the KEEP rows of ADR-0167's disposition set and overtakes one
accepted default of ADR-0165, while the rest of both stand.

## Context

[`stories/website-experience/info-pages-triage.md`](../../stories/website-experience/info-pages-triage.md)
is the website-experience arc's last capability: every legacy informational page carries an explicit,
EXECUTED disposition. [ADR-0167](0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md)
(2026-07-06) executed a per-page triage that KEPT four pages (`how-it-works`, `get-involved`, `contact`,
`constitution`), DISCARDED two (`roadmap`, `landscape`), and retired Keystatic. That landed live.

The next day the owner re-decided at the same surface: retire the four kept pages as well. The standing
intent since 2026-07-02 was "disable the static pages"; [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md)
§3 had already deprecated them as capable-visitor escapes; and the Act 1 + Act 2 **experience**
(ADR-0134/0148/0153/0157/0165) is now the whole front door and carries the site's job itself. The four
kept pages were low-churn reference whose substance is worth preserving but whose page code is not worth
maintaining alongside the experience. The one genuinely functional survivor — the `/contact/` "ask to
come in" form — the owner explicitly chose to retire too, revivable later ("we can add that back in
later"), so the interim onward path is none rather than a form.

The forces the redesign already resolved carry the weight here: the walk's honest close is the site's
call to action; the a11y / no-JS fallback (gate-enforced by `check:web-experience`) is the only
non-experience surface that must remain.

## Decision

**Retire all four remaining brochure pages — `how-it-works`, `get-involved`, `contact`, `constitution`.
The public site is now exactly the Act 1 + Act 2 experience, the no-JS / reduced-motion accessibility
fallback, and the 404.** Six points:

1. **Delete the four pages and their data** (`src/pages/{how-it-works,get-involved,contact,
   constitution}.astro`, `src/data/{how-it-works,get-involved,contact,constitution-page}.json`,
   `src/content/constitution.md`), plus the demo assets only they used (`TreeWorld.astro`,
   `AgentMaze.astro`, `mockSystem.json`). The Act 2 walk keeps `tree-world-map.css` (it is now its sole
   consumer).

2. **Every retired URL redirects to the experience at `/`** — meta-refresh stubs (Astro `redirects`;
   here.now has no server redirects), extending the ADR-0167 pattern. The two ADR-0167 discards
   (`/roadmap`, `/landscape`) repoint from the now-deleted pages to `/`. Inbound links from the
   inner-circle preview never 404.

3. **The survivors are rewired to point nowhere retired.** Brand-only Nav; minimal Footer (no page
   links); the a11y fallback and 404 carry no onward brochure links; the Act 2 walk's done card drops
   its `/get-involved/` + `/how-it-works/` CTA — the honest close stands alone and focus lands on the
   close card (a dangling `ctaNext` focus reference the deletion left was repointed to the card). The
   three `data-experience-*` markers stay physically in `index.astro` (`check:web-experience` green).

4. **The contact door is retired, revivable.** The interim public site has no inbound form; the owner
   directed it can be added back later (a here.now form or any path). Not a permanent decision — a
   scoped-out surface.

5. **Useful content is salvaged into the corpus, revivably** (the owner's "turn it into an ADR that can
   be revived later"): [`docs/research/retired-web-info-pages-2026-07.md`](../research/retired-web-info-pages-2026-07.md)
   preserves the how-it-works three-surface explainer (the clearest plain-language statement of the
   map/library/harness thesis the project has written), the get-involved bet, the contact copy, and the
   constitution manifesto verbatim — with a pointer to web-repo git for byte-exact revival. This extends
   the ADR-0167 salvage docs (`retired-web-{roadmap,landscape}-2026-07.md`).

6. **ADR-0165 §8's "name the industry terms once, on how-it-works" is overtaken** (that page is gone).
   The obligation is discharged: the terms (the generation–verification loop Karpathy described, the
   verification gap, the second brain) live embodied in the experience's own plain-language copy and are
   preserved with their honest framing in the salvage doc; there is no brochure page to name them on. The
   copy-honesty rules of ADR-0165 §9 still bind any visitor-facing copy the experience ships.

The engine is untouched by this decision (pure content retirement); the web pin bumps to the retire
commit, which carries the same ADR-0169 trail engine the web already had.

## Consequences

**Good.**

- The public site is exactly the experience plus the a11y fallback and 404 — one thing to maintain, one
  coherent pitch, nothing left to rot on a brochure schedule. `check:web-grounding`'s claim surface drops
  to zero refs (the grounded claims lived on how-it-works); the build has no orphan links to any retired
  route; the three experience markers and the fallback stay gate-green.
- The content most worth keeping — the thesis explainer and the constitution — is preserved in a
  discoverable, revivable doc rather than only in git history.
- ADR-0134 §5's deferred surrounding-pages scope is now fully CLOSED: every legacy page has an executed
  disposition (folded/discarded/retired), and none survive as static brochure.

**Costs / risks (named).**

- **No inbound contact path in the interim.** Retiring the only "ask to come in" door while the owner is
  showing the site to an inner circle means feedback comes through other channels until the door is added
  back. Accepted deliberately by the owner (revivable, point 4).
- **The constitution is no longer a live public page.** It was framed as "the one thing we won't change
  quietly — you'll see it change." Retiring the page removes that public-visibility promise; the manifesto
  is preserved verbatim in the salvage doc and can be revived. A future revival should restore that
  visibility if the promise still holds.
- **The experience is now the sole front door with no fallback brochure.** A visitor who dislikes the
  guided experience has only the plain a11y page; there is no explanatory page to fall back to. This is
  the intended all-in posture (ADR-0148/0153), now complete.
- **Operator-attested, not machine-provable.** Which pages die is editorial judgement (ADR-0167's frame);
  the machine floor it left green (build, the three web gates, no orphan routes) is the only automated
  guarantee. The owner attested the executed result before it went live.

## Librarian correction-in-place checklist (copy-on-write; the librarian pass does these, NOT this ADR)

- **ADR-0167 §Decision 1 (the disposition table):** add a dated forward pointer — the four KEEP rows
  (`how-it-works`, `get-involved`, `contact`, `constitution`) are RETIRED per ADR-0172; the two discards
  and the Keystatic retirement stand. Its §2 how-it-works riders (the ADR-0165 §8 terms section, the
  mock-data scrub) retired WITH the page; the salvage doc preserves the terms' framing.
- **ADR-0165 §8 (accepted default: name the industry terms once on how-it-works):** add a dated forward
  pointer — OVERTAKEN by ADR-0172 §6 (the page is retired); the terms are embodied in the experience copy
  and preserved in the salvage doc; §9's honesty rules still bind.
- **ADR-0134 §5 (surrounding-pages scope):** add a dated note — the scope is now FULLY closed (0167
  discarded two + retired Keystatic; 0172 retires the last four); no static brochure survives.

## References

- [ADR-0167](0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md) — AMENDED: its KEEP
  rows are re-decided to RETIRE; its discards + Keystatic retirement + salvage pattern stand. No new
  `supersedes` (0101 already superseded there). (Librarian: forward-point §Decision 1.)
- [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) — AMENDED: §8's
  name-terms-on-how-it-works default is overtaken (page retired); §9 honesty rules stand. (Librarian:
  forward-point §8.)
- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) — AMENDED: §5's
  surrounding-pages scope fully closed. (Librarian: dated note at §5.)
- [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md) — §3 already
  deprecated the static pages as escapes; this completes the retirement. Context, not amended.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment IS
  ratification (this ADR born accepted).
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) /
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — copy-on-write: a
  re-decision is a new ADR, not an in-place body edit of the amended ADRs.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the operator-attested
  proof for the visual/content result; the owner attested the staged retired site before it shipped.
- [`docs/research/retired-web-info-pages-2026-07.md`](../research/retired-web-info-pages-2026-07.md) — the
  content salvage (revival material) this decision points to.
- [`stories/website-experience/info-pages-triage.md`](../../stories/website-experience/info-pages-triage.md)
  — the capability this executes (full-retire disposition; BUILT + OWNER-ATTESTED).
- Live: storytree-web PR #32 → web main `a779e7b` (CD published; the four routes redirect to `/`, the old
  page content gone). The website-experience arc is delivered with this decision.
