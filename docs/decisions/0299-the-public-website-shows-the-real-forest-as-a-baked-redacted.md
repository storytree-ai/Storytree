---
status: accepted
decided: 2026-08-03
amends: [93, 215, 237]
---
# ADR-0299: The public website shows the real forest as a baked, redacted projection — map and legend only

## Status

accepted (2026-08-03) — decided/directed by the owner in conversation on 2026-08-03. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md):** its
two-act frame, experience-is-the-site shape, a11y fallback and replay-only posture stand. Its
**fictional-data boundary** is narrowed: a published artifact may now carry allow-listed REAL corpus
data for the forest observation view described here. The no-live-access half of that boundary is
untouched and restated in D1.

**Amends [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md):** its
shared-app-surface decision stands for the Chapter 2 teaching walk. Two clauses are scoped rather
than reversed. **D6's** "may not own a substitute world mapper" binds the teaching path, where a
visitor is shown real product interactions and must see the real ones; it does not bind the passive
observation view (D4 below). **D7's** "staged/fictional" clause is amended by D1: the observation
view is real and redacted. D7's read-only clause is unchanged and strengthened by D3.

**Amends [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) in one
clause only, while relying on the rest.** D4's renderer seam — "shared = the LOOK only by default",
the framework-neutral root, the artifacts-not-source boundary — is what D4 below RETURNS to, and is
untouched. What is narrowed is the same decision's data prohibition, "Never the live data, the store,
the corpus, or operable actions": three of those four stand verbatim, but corpus-DERIVED data may now
reach the site as a redacted, published artifact. The live data and the store are still never
received, and operable actions are still never exposed. ADR-0093's own summary of ADR-0237 ("the site
still supplies fictional data") is likewise narrowed to the teaching path.

## Context

The owner asked, while attesting the Act 2 intro regrow on 2026-08-02, that the website grow OUR
forest rather than a mock one — "then people can watch us while we build" — and named the security
implications as needing a conversation first. That was captured as the Library open question
`oq-public-live-forest-on-the-website` and deferred to its own initiative. This ADR is the outcome of
that conversation, held 2026-08-03.

Four facts, all measured during the conversation rather than assumed, frame the decision.

**The rendering half is already built.** The Act 2 intro regrows the whole forest app-native from
the real story graph, proven at 40 islands (ADR-0282/0283/0285). Nothing here is about whether the
forest can be drawn.

**Hiding a panel is not a boundary.** `GET /api/tree` returns ONE unprojected document covering all
45 stories ([`readTree`](../../apps/studio/server/apiRouter.ts)), enriched in place with
live verdicts, build state, assets and UAT summaries, then `JSON.stringify`'d out. There is no zod
schema, no runtime shaping and no field filtering anywhere in the read path. Already on the wire for
every story regardless of what any panel renders: `adoptGates[].command` (the literal shell command
the spine observes), `adoption` (the covered/uncovered "what still owes real work" diff), `error`
(raw spec-load strings, i.e. filesystem-shaped messages), full `outcome` prose for every story and
capability, and `uatCriteria` with per-criterion pass/fail state. A `claims` field is documented in
the wire type and never set by the server — evidence the shape is not actively curated.

**The route table is all-or-nothing.** The only access control in the studio's read path is
route-level membership ([`createMembersPolicy`](../../apps/studio/server/guestPolicy.ts)); a member
then receives every GET in the corpus, whole. There is no per-field or per-story scoping anywhere.
The same table also serves `/api/docs/content` (the full markdown body of any doc under `docs/`,
i.e. the entire ADR corpus), `/api/assets` (whole artifact rows), `/api/comments` (including author
email), `/api/users` (every member's email), and `/api/activity` + `/api/claims` (session ids,
branch names, free-text intent). A public deployment is therefore not "the studio with panels
switched off"; it is a different artifact.

**The map surface carries write paths.** Three of them sat inside the story detail panel when this was
decided: Build and Adopt (`POST /api/build`, `POST /api/adopt`, `BuildSection.tsx:208`) and UAT signing
(`api.signUat`, [`TreeView.tsx:4891`](../../apps/studio/src/components/TreeView.tsx)).
*(Overtaken 2026-08-22: ADR-0404 retired the Build and Adopt affordances outright — `BuildSection.tsx`
is deleted and both route pairs are gone from the studio and desktop backends — so only UAT signing
remains of the three. This STRENGTHENS the decision below rather than weakening it: the write surface a
public deployment would have to strip is smaller, and the reasoning that a public site is a different
artifact is unchanged.)* The terminal
dock, which the owner named first, turns out to be inert in any browser build by construction — it
runs over an Electron `contextBridge` and renders a disabled panel without one
([`TerminalDock`](../../apps/studio/src/components/TerminalDock.tsx)) — so it was never the
risk it appeared to be.

Two forces stand unchanged and are not in question: the website does not connect to the private
corpus, store, backend or operable app actions (ADR-0056/0066), and the experience remains 2.5D
isometric and read-only (ADR-0237 D7).

## Decision

**The public website's forest is a projection of the real corpus, generated at publish time and
shipped as a static artifact.** Six decisions make that enforceable.

### D1 — Real data, redacted, published as an artifact; never a live read

The forest data becomes a projection of the real corpus, generated at publish time and committed or
deployed as a static file the website imports at build. There is no public API, no endpoint, no
database connection and no runtime fetch. The website remains `output: 'static'`.

The ADR-0056/0066 no-live-connection boundary stands **verbatim**. What this ADR changes is narrower
than it first appears: a published artifact may carry allow-listed real data instead of only fiction.
The constraint that moves is *fictional → real*, not *private → public*.

The projection regenerates on merge to `main` through the existing CD. Merge cadence is the event
cadence: the forest updates every time work lands, which is the beat worth watching, and a forest
does not meaningfully change faster than that.

### D2 — The projection is an allow-list, enforced by a test that fails on an unclassified field

The public shape is an explicit schema, populated by field-by-field assignment from the internal
tree — never a spread, a pick-by-omission or a deny-list. A test enumerates the internal story and
capability keys and FAILS when a key is neither allow-listed nor explicitly excluded.

This is the load-bearing clause. The durable risk is not the first release; it is the tenth field
someone adds upstream six months from now. `TreePayload` has no zod schema today, so the failing
test is the only mechanism that can hold the line.

First-release scope — per story: `id`, `title`, `status`, `dependsOn`; per capability: only what the
renderer needs to place flora. Explicitly excluded: outcome prose, verdicts and their timestamps,
UAT criteria and witness state, proof mode, `adoptGates[].command`, `adoption` gaps, spec file
paths, spec-load error strings, ADR references, session claims, comments and member identity.

Recorded so a later scope change is not re-litigated from scratch: the owner considered ADR titles
and judged them non-sensitive ("theres not much you can do with just adr titles"). They are absent
from the first release because the panel that renders them is out of scope under D3, not because
they were ruled unsafe.

### D3 — Map and legend only

The public view renders the forest map and the legend. Not present: the story detail panel, the
library drawer and open overlay, the terminal dock and repo picker, the session dock and claim rows,
the HUD/avatar menu, and every build, adopt or attest control.

The reasoning is scope elimination rather than scope management. Cutting to map and legend removes
the three write paths, the entire comment surface (comments are wired only into the Library doc
views, never into the story panel), and every field in D2's exclusion list, in one move — instead of
maintaining a per-field argument about a panel that carries them.

The legend is kept because it is functional, not decorative: its status fan doubles as the map's
status filter.

### D4 — The website keeps its own renderer for this view; the scene graph stays shared

The seam is ADR-0093's original one. The **scene graph is shared**: `packages/forest-world` is
synced into `web/src/lib/forest-world/` as never-hand-edited generated files, held byte-fresh by
`check:web-engine`. The **paint is the website's own**: `web/src/lib/worldSvg.ts`, the string-SVG
twin of the studio's React `SceneView`.

ADR-0237 D6 narrowed that ceiling for Chapter 2 because a teaching walk shows a visitor real product
interactions, and an imitation there can "look plausible while showing yesterday's art, interactions
and semantics." A passive observation view teaches no interactions and has none to get wrong, so the
narrowing does not apply to it. Consuming `@storytree/app-surface` would additionally bundle React
and the full product surface into a public static site, enlarging precisely the exposure D5 closes.

Recorded as found, so this reads as a deliberate seam rather than a standing unmet obligation: D6's
website-side migration was never performed. `chapter2-real-app-surface-arc` delivered the
parent-side surface (PR #892, #958) and closed on 2026-07-30 on an owner verdict to retire that
route. The website imports zero `@storytree` packages today; the only `@storytree` strings under
`web/src` are comments inside generated files.

If the public view is ever used to TEACH interactions rather than to be watched, ADR-0237 D6
reasserts and the migration is owed.

### D5 — Bundle exposure is pinned, not left to a default

`web/astro.config.mjs` sets `vite.build.sourcemap: false` explicitly, and the deploy workflow asserts
that no `.map` file reaches `dist/`.

Measured 2026-08-03: the build emits no sourcemaps and no `sourceMappingURL` — but only because
Vite's default is off. Nothing in the repo pins it, and the deploy workflow's assert step checks only
that seven expected files exist. The exposure this guards is specific and real: the website's modules
carry 15–50 line ADR-citing headers, `@generated` banners naming parent-repo paths, roughly thirty
ADR numbers, capability names and private package names (`@storytree/app-surface`,
`@storytree/drive`, `@storytree/notice-board`, `@storytree/library`). Minification strips all of it;
sourcemaps would restore every byte verbatim.

Given the owner's call in D2 that ADR titles are not sensitive, this is defence-in-depth rather than
the primary boundary. It is two lines, and a default is not a guarantee.

### D6 — What stands

- **No live or private connection from the website.** ADR-0056/0066, verbatim.
- **Act 1, the inflection and the Chapter 2 teaching walk keep their fictional data.** This decision
  covers the forest observation view only; `act2-script.ts` and `act2-studio.ts` remain site-owned
  fiction.
- **Read-only.** No operable action reaches the public surface, and the public controller receives
  no mutation callback (ADR-0237 D2).
- **2.5D isometric.** R3F does not return (ADR-0237 D7).
- **a11y fallback, reduced motion and the replay-only posture** stand (ADR-0215).

## Consequences

**Good.**

- The public forest cannot leak what the artifact does not carry. The boundary is a file a human can
  read in full before it publishes — not an emergent property of a bundler, a route table or a
  policy layer.
- No public endpoint means no enumeration surface, no rate limiting, no cache or CDN tier, no cost
  exposure to scraping, and no dependency on a database that is deliberately asleep 01:00–07:00
  Australia/Sydney (ADR-0114). A live endpoint would have been down for six hours a day.
- The store's access model keeps exactly one class of reader. No feature added later has to answer
  "is this public-visible?", a question that does not currently exist anywhere in the codebase.
- "Watch us build" survives the choice: regenerating on merge means the forest moves whenever work
  lands.
- The upgrade path stays open. If a live read is ever wanted, the website consumer does not change.

**Costs / risks.**

- The projection is a second shape to maintain, and every field added to the story or capability
  schema upstream must be classified. D2's failing test is what makes that non-optional rather than
  a thing someone remembers.
- The forest is stale between merges. Accepted deliberately.
- The website's paint and the studio's can drift in appearance. Accepted for a passive view; D4
  names the condition under which that acceptance expires.
- Two hardening items surfaced during this conversation are NOT part of this decision and remain
  open. (1) `web/public/.herenow/data.json` ships to production declaring a publicly-writable
  `submissions` collection (`"insert": "public"`, rate-limited 8/hour/IP) with no consumer anywhere
  in `web/src` — residue of the retired contact page, which now redirects to `/`. Removing it also
  requires editing the deploy workflow's assert list, which currently requires the file to exist.
  (2) The site preconnects to Google Fonts on every page load, its only third-party egress.

**Rejected.**

- **A live public read endpoint.** Its stated advantage — reusing the ADR-0259 `HttpStore` wire
  contract — does not survive inspection: that contract is document-granular with `doc: unknown`
  passthrough, `queryDocs` without a `kind` is a whole-store dump, its server half states in its own
  source that mounting it unauthenticated would expose the store to anyone who can reach it, and it
  is wired to no deployment. A live endpoint would need a brand-new projection anyway, and would then
  additionally pay for a public origin.
- **Serving the studio's route table publicly with panels hidden client-side.** Hiding a panel does
  not stop the data shipping; see Context.
- **An anonymised shape with no names or ids.** The names are what makes a forest legible; without
  them it is pretty and meaningless.
- **Deferring.** The security conversation the owner gated this on has now been held.

## References

- [ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md) — public site frame
  and fictional-data boundary; amended here at the fictional clause only.
- [ADR-0237](0237-chapter-2-is-a-scripted-mode-of-the-real-app-share-product-u.md) — Chapter 2 as a
  scripted mode of the real app; D6 and D7 scoped here.
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared
  scene graph and the shared-is-the-look seam this view returns to.
- [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
  [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) — the public
  grounding and no-private-data boundary that stands verbatim.
- [ADR-0259](0259-every-client-reaches-the-store-through-an-http-front-door-di.md) — the HTTP store
  front door; assessed and rejected as the transport for this view.
- [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) — the app-native
  forest regrow whose website port this decision unblocks; D7 there deferred the port to a
  successor initiative.
- [ADR-0114](0114-hosted-db-sleeps-on-a-fixed-1am-7am-sydney-window-replacing.md) — the nightly
  database sleep window that a live endpoint would have collided with.
- Library open question `oq-public-live-forest-on-the-website` — the captured owner intent this
  decision answers. **RETIRED on answering (2026-08-03), in the same PR as this ADR.** Retirement is
  a delete-with-rationale, never a status flip — `lifecycleOf("open-question")` returns `open`
  unconditionally, so a settled question left live keeps rendering as open. The delete event carries
  the rationale and a `supersededBy` edge to this file, and the full body is recoverable from
  `git log -p` on `apps/studio/data/knowledge.json`. Its non-binding recommendation — an allow-list
  with a test that fails on an unclassified field — is adopted verbatim as D2; the false claim in
  its Option B, that a live endpoint "reuses built machinery", is corrected in Rejected above.
