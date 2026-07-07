---
status: accepted
decided: 2026-07-06
supersedes: [101]
amends: [134]
---
# ADR-0167: Info-page triage: the signed disposition set and the Keystatic retirement

## Status

accepted (2026-07-06) — decided/directed by the owner in conversation on 2026-07-06. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. The owner signed the per-page
disposition table at the gate, attested the executed result the same session (UAT 2), and the set
is live (web main `be960873`, PR #28).

## Context

`stories/website-experience/info-pages-triage.md` is the website-experience arc's last capability:
every legacy informational page must carry an explicit, EXECUTED disposition — folded into Act 2,
discarded, or kept as a plain static page — and the disposition set decides whether the Keystatic
CMS survives (the question ADR-0134 §5 deliberately deferred to this triage). Owner decision 5
(2026-07-02) made the triage itself operator-attested CONTENT work: which page folds, dies, or
stays is editorial judgement about the site's voice, not a machine call.

Forces at the gate: the shipped Act 1 + Act 2 experience is now the front door and carries the
site's job itself (ADR-0148/0153/0157/0165); ADR-0153 §3 had already deprecated the static pages as
capable-visitor ESCAPES while the walk's done-state CTA names `/get-involved/` and `/how-it-works/`
as real onward product pages — the triage formalizes exactly that split. The hand-authored
`/roadmap/` data had not moved since 2026-06-18 (the ADR-0066 D4(c) generate-from-source follow-on
was never wired) — a stale public roadmap is precisely the over-claim the site bans. `/landscape/`
was a June-2026 point-in-time survey — the fastest-rotting page — and was not in the Nav. ADR-0165
§8 (accepted default) assigns `/how-it-works/` a live forward job: the ONE place the industry terms
the experience embodies are named + cited. And every copy change since the CMS wiring landed
(2026-06-24, ADR-0101) had come through agent PRs, not the editor.

## Decision

**1. The signed disposition set (owner-approved as proposed, executed 2026-07-06):**

| Page | Disposition |
|---|---|
| `/how-it-works/` | **KEEP static** + two decided riders (below) |
| `/get-involved/` | **KEEP static** — the walk's done-state primary CTA |
| `/contact/` | **KEEP static** — the only interactive door (here.now form) |
| `/constitution/` | **KEEP static** — founder's voice verbatim |
| `/roadmap/` | **DISCARD** → redirect to `/get-involved/` |
| `/landscape/` | **DISCARD** → redirect to `/how-it-works/` |
| `/404` | **KEEP as-is** |

Discards are honest deletion with meta-refresh redirect stubs at the old URLs (Astro
`redirects` config; here.now has no server redirects), never unlinked zombies. Nav after: How it
works · Get involved · Front door (+ "Ask to come in"). Footer after: Home · How it works · Get
involved · Constitution · Front door.

*(The four KEEP rows — `/how-it-works/`, `/get-involved/`, `/contact/`, `/constitution/` — are RETIRED
by [ADR-0172](0172-retire-the-remaining-brochure-pages-the-experience-is-the-en.md), 2026-07-07: the
owner re-decided at the same surface the next day to retire the four kept pages too, so the public site
is now exactly the Act 1 + Act 2 experience, the a11y fallback, and the 404. Every retired URL redirects
to the experience at `/`; the salvage pattern this triage set (below, §3) extends to
`docs/research/retired-web-info-pages-2026-07.md`. What STANDS from this table: the two DISCARDS
(`/roadmap/`, `/landscape/`) and the `/404` keep. Noted in place per ADR-0139.)*

**2. The two how-it-works riders (already-decided corpus, executed with the keep):** (a) the
ADR-0165 §8 industry-terms section — the generation–verification loop Karpathy described, the
verification gap (Sonar Jan-2026, "fully" kept), second brain (Forte's term) — named + cited once,
marked `data-grounds="ADR-0165"`, §9 honesty rules binding (a date error riding the same copy was
corrected: the page said "mid-2026" for the Sonar survey; the verified source is January 2026);
(b) the `mockSystem.json` networking-jargon scrub flagged in ADR-0157's de-storm scoping —
"Reconnect storm handling" → "Recovering dropped connections", "Backpressure tuning" → "Keeping up
under load", the rowan session → "fixing the Monday outage" @ `fix/monday-outage`; Cohoot fiction,
statuses, and DAG shape intact.

*(Rider (a) — the ADR-0165 §8 industry-terms section — RETIRED WITH the page by
[ADR-0172](0172-retire-the-remaining-brochure-pages-the-experience-is-the-en.md), 2026-07-07: there is
no `/how-it-works/` page to name the terms on. The terms' framing is preserved in the ADR-0172 salvage
doc `docs/research/retired-web-info-pages-2026-07.md`, and the terms live embodied in the experience's
own plain-language copy; ADR-0165 §9's honesty rules still bind that copy. Rider (b), the
`mockSystem.json` jargon scrub, retired with the demo assets the deleted pages used. Noted in place per
ADR-0139.)*

**3. Content salvage before deletion (owner rider at the sign-off):** the owner directed the
discarded pages' substance be preserved in the corpus — "still useful and might come back to life
later" — then the page code deleted fully so future sessions aren't confused. Executed:
`docs/research/retired-web-roadmap-2026-07.md` and `docs/research/retired-web-landscape-2026-07.md`
carry the authored prose + rendered data, with pointers to the surviving source research
(`docs/research/three-surfaces-landscape/`). If `/roadmap/` returns, the honest shape is ADR-0066
D4(c)'s: generated from source, never hand-authored again.

**4. The constitution's roadmap sentence (owner call A):** the clause "— the roadmap lays out
what's built, what's being built now, and what's honestly still ahead" is REMOVED from
`src/content/constitution.md` — a pure deletion directed by the owner (no new words in the
founder's voice; the body's do-not-rewrite standing rule holds).

**5. Keystatic RETIRES (owner call B — this supersedes ADR-0101).** Every surviving page is
low-churn reference and copy changes were already landing as ordinary file-edit PRs. Removed
web-side: `keystatic.config.ts`, the `/keystatic` dev route, `@keystatic/*` + `@astrojs/react` +
`@astrojs/node` + `cross-env` deps, the editor scripts, `scripts/publish-content.mjs`,
`.env.example`, the editor image (`Dockerfile`, `web-editor-cloudbuild.yaml`) and its CD
(`.github/workflows/deploy-editor.yml`). The `src/data/*.json` content files STAY — pages read
them directly; editing is plain file edits + a push (every push to web main deploys). The LIVE
hosted editor — Cloud Run service `storytree-web-editor` (ADR-0101) — was decommissioned
post-merge with explicit owner approval at the same gate (`gcloud run services delete`, verified
gone; `storytree-studio` untouched). Residue deliberately left in place: the Keystatic GitHub App,
its Secret Manager entries, and the parent `infra/` editor files (`web-editor-cd.tf` WIF/SA
declarations, `deploy-web-editor.sh` runbook, `web-editor-cd.md`, `web-editor-cloud.md`) — all
inert without the service and the workflow (no GCP build triggers exist); cleaning them is a small
follow-up infra pass, not part of this decision.

**6. Parked web PRs closed as superseded (owner call C):** #8 (content freshness — targeted the
pre-experience homepage + a roadmap refresh) and #15 (home FAQ drawers — its below-map home-intro
surface retired with the classic front page, ADR-0148 §5), each with a disposition comment;
branches kept for salvage.

## Consequences

- The public site is exactly the experience plus four kept reference pages and the 404 — every
  page has a live job; nothing left to rot on a schedule (the two rot-prone pages are gone).
- `check:web-grounding`'s claim surface concentrates on `/how-it-works/` (now including the
  ADR-0165 terms section); the site builds with zero orphan links to the discarded routes — both
  held green at execution and at the pin bump.
- ADR-0134 §5's deferred surrounding-pages scope is CLOSED by this set (amends edge); story open
  call 4 (the CMS question) is answered.
- ADR-0066 D4(c) (regenerate the public roadmap from source) is OVERTAKEN in its web-page
  expression: there is no public roadmap page to regenerate. The idea survives as the named shape
  any future roadmap page must take (salvage doc §"if it comes back to life").
- ADR-0101 (the hosted web editor) is SUPERSEDED: its service is deleted, its CD removed, its
  config gone. Content editing is repo file edits.
- The old URLs keep resolving (meta-refresh stubs with canonical + noindex) — external links land
  somewhere sensible; search engines drop the dead routes.
- Editing-surface trade-off accepted with eyes open: the owner loses the browser CMS (wired only
  2026-06-24) — if in-browser editing is ever wanted again it is a new decision, not a revert.

## References

- The capability: `stories/website-experience/info-pages-triage.md` (BUILT + OWNER-ATTESTED, this
  triage).
- The execution: storytree-web PR #28 (squash-merged → web main `be960873`; owner attestation
  relayed verbatim on the PR, ADR-0044 §4 / ADR-0082). Owner calls signed 2026-07-06 in-session.
- Salvage: `docs/research/retired-web-roadmap-2026-07.md`,
  `docs/research/retired-web-landscape-2026-07.md`.
- Related decisions: ADR-0134 §5 (deferred the CMS call to this triage — amended), ADR-0101 (the
  hosted editor — superseded), ADR-0066 D4(c) (roadmap generate-from-source — overtaken in prose,
  corrected in place by the librarian), ADR-0165 §8/§9 (the terms rider + honesty rules),
  ADR-0157 (the de-storm scoping that flagged the mock-data jargon), ADR-0153 §3 / ADR-0148 (the
  deprecate-the-escapes context this formalizes).
