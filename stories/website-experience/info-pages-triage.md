---
id: "info-pages-triage"
tier: capability
story: website-experience
title: "The info-page triage — every legacy page folded, discarded, or kept, and the CMS question answered"
outcome: "Every legacy informational page (how-it-works, roadmap, landscape, constitution, contact, get-involved — and the 404) carries an explicit, EXECUTED disposition: folded into Act 2 where natural, discarded, or kept as a plain static page; kept pages are reachable from the calm world with no orphan links anywhere; check:web-grounding stays green over every surviving claim; and the disposition set answers whether Keystatic survives — recorded as its own ADR when decided."
status: proposed
proof_mode: operator-attested
depends_on: [act2-guided-walkthrough, act2-guided-forest]
decisions: [134, 148]
# OPERATOR-ATTESTED, human witness — owner decision 5 (2026-07-02) names the triage itself as
# owner-attested CONTENT work: which page folds, which dies, and which stays is editorial judgement
# about the site's voice, not a machine call. The machine floor it must leave green already exists:
# check:web-grounding (every surviving data-grounds claim resolves to a live ADR) and the site's own
# build (no orphan links/routes). NO `proof:` block — witnessed, not `--real`-built. This is a HALT
# point for the driving session: per-page dispositions are proposed to the owner, never decided
# unilaterally.
---

# The info-page triage — every legacy page folded, discarded, or kept, and the CMS question answered

**Outcome —** Every legacy informational page (`how-it-works`, `roadmap`, `landscape`,
`constitution`, `contact`, `get-involved` — and the `404`) carries an explicit, **EXECUTED**
disposition: **folded into Act 2** where natural, **discarded**, or **kept as a plain static page**;
kept pages are reachable from the calm world with no orphan links anywhere; `check:web-grounding`
stays green over every surviving claim; and the disposition set answers whether **Keystatic
survives** — recorded as its own ADR when decided.

**Depends on —** [`act2-guided-walkthrough`](act2-guided-walkthrough.md) (increment G) — you cannot
fold a page into an Act 2 that is not there; the fold targets (which beat absorbs which page's job)
only become concrete once the beats exist on the site. Also
[`act2-guided-forest`](act2-guided-forest.md) (increment H, ADR-0148) — the roadmap-class fold
targets ("what's coming" behind the pull-back / "what's next") live in H's upstream-forest reveal, so
they are only concrete once the guided forest exists.

> **Proof status (honest) — `proposed`, operator-attested.** The current pages exist today in the
> web repo (`web/src/pages/*.astro`); nothing about their fate is decided beyond the triage FRAME
> (owner decision 5: per-page — fold / discard / keep-static). ADR-0134 flags the surrounding-pages
> scope as load-bearing for the build shape precisely because it decides the CMS's fate — so the
> outcome is deliberately a decision-plus-execution unit, not a build-only one.

## Guidance

THE FRAME (owner decision 5). Per page, exactly one of:

- **Fold into Act 2** — the page's job is absorbed by a beat or the CTA state (candidates: the
  how-it-works narrative IS the five beats; the roadmap's "what's coming" may live behind the
  pull-back / CTA). Folding means the page's URL redirects or retires WITH its inbound links
  updated — never a dead route.
- **Discard** — the page's job no longer exists post-experience. Discard is honest deletion (plus
  redirect where external links are known), not an unlinked zombie.
- **Keep as a plain static page** — the page earns its keep as calm reference (candidates:
  constitution, contact, get-involved as the CTA target). Kept pages stay reachable from the calm
  world (a quiet, findable place — footer of the calm land / the CTA cluster; never a demand inside
  the storm), keep their `data-grounds` attributes, and stay inside `check:web-grounding`.

THE CMS CONSEQUENCE (ADR-0134 §5 — decided BY this triage, not before it). If no surviving page
needs CMS editing, Keystatic retires with the discarded pages; if kept pages remain CMS-edited, it
stays for exactly those. Either way the call is recorded as its own ADR when the disposition set is
accepted (`storytree adr new --pg`, born of this owner sign-off) — story open call 4.

THE PROCESS IS THE PROOF SHAPE. The driving session PREPARES the triage (a per-page disposition
table with rationale + the fold-target mapping), the owner ATTESTS it (a HALT point — dispositions
are proposed, never decided unilaterally), then the session EXECUTES it on the web repo's rail and
the owner witnesses the executed result. Machine sub-legs ride existing gates: the site builds
clean (no orphan routes/links) and `check:web-grounding` is green over the survivors — this
capability adds no new gate machinery.

FENCES: do not redesign kept pages here (keep-static means KEEP — restyling is its own later call);
do not move claim-bearing copy out from under its `data-grounds` attribute; do not decide the
Keystatic ADR inside this capability — record it separately once the owner has signed the
dispositions.

## UAT (operator-attested)

1. **The disposition table exists and is owner-signed.** _(witness: human)_ Every page listed above
   carries exactly one disposition with a one-line rationale; the owner has attested the set (the
   HALT point) before execution.
2. **The dispositions are executed, not declared.** _(witness: human)_ Folded pages' jobs are
   findable in Act 2 and their old URLs resolve sensibly; discarded pages are gone with no dangling
   inbound links; kept pages render as plain static pages reachable from the calm world.
3. **The machine floor stayed green.** _(witness: machine)_ The web repo builds clean and
   `check:web-grounding` passes over every surviving claim — no grounding was silently lost in the
   shuffle.
4. **The CMS question has an answer.** _(witness: human)_ The disposition set states whether any
   surviving page still needs Keystatic; the follow-up ADR recording that call is drafted (accepted
   or proposed per the owner's direction at the HALT).
