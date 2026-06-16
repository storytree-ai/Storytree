---
status: proposed
decided: 2026-06-16
---
# ADR-0066: Wire the website into the system: a tracked, corpus-grounded story with inner-loop-proven logic

## Status

proposed — designed 2026-06-16 by the orchestrator session at the owner's request ("the website is
out of date; I wonder if there's a way to wire the website to our system and build it within the inner
loop"). The owner chose "design it fully (ADR)" over building any one slice first. The **material-routing
model** (the Decision) is the recommended direction; the **load-bearing boundary call** (§Decision 3 —
where provable web logic physically lives) is recommended here but surfaced as Open modeling call #1
for the owner to confirm before the home story (`stories/website`) is authored by the `story-author`
role. Nothing is built by this ADR; it decides the shape.

**Refined 2026-06-17** — the owner set the **content register** (Open call #6, now RESOLVED): the
load-bearing facts/claims become **citable library artifacts cited via native library-id references**,
and the explainer **prose stays hand-authored in the repo** in its crafted public voice. The more
ambitious option floated this session — lifting the public copy into a new `narrative` library *kind*
so the site renders its pages from the library — was weighed and **declined**: keep the library a
*knowledge* tier (doctrine register) rather than a marketing-copy store, and keep the site's voice
human. Decision 4 below is sharpened accordingly.

## Context

The public website — **`storytree-web`**, a separate *public* repo vendored as the (uninitialised)
[`web/`](../../.gitmodules) submodule — is almost entirely **decoupled** from the system, and as a
result it silently goes out of date. The forces:

- **It is untracked work.** No story in `stories/` covers it; it has no capabilities, no deciding
  ADRs, no place on the notice board or in the studio. It is invisible to the system that is supposed
  to grow software as a watched DAG of stories ([ADR-0010](0010-organism-model-story-bounded-context.md)).
- **Its content is hand-authored prose plus a *fictional* demo.** The explainer copy, the
  `roadmap.json`, and the interactive demo (the fictional "Cohoot" system in
  `web/src/data/mockSystem.json`, rendered by a deterministic build-time engine in
  `web/src/lib/world.ts` + `web/src/lib/worldSvg.ts`) are frozen at the mid-June rebuild. None of it
  is derived from the real system, so as the project moves (and it has moved a great deal this week)
  the site drifts.
- **There is exactly one wire today** — [`check:web-grounding`](../../packages/cli/src/check-web-grounding.ts)
  ([ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)). Load-bearing
  claims carry an invisible `data-grounds="ADR-NNNN"` attribute; the parent gate reddens when a cited
  ADR goes missing or fully superseded. But it covers only *ADR-cited* claims (≈3 today), validates
  only the `ADR-NNNN` scheme (library-id resolution is a named follow-up), and runs only at
  submodule-bump granularity. Everything else drifts uncaught.
- **It has zero tests** and its own deploy rail: the web repo's `deploy.yml` redeploys here.now on
  every push to its own `main` (merge = publish), independent of the parent's CI/CD
  ([`stories/ci-cd`](../../stories/ci-cd/story.md)).

The owner's two asks pull in different directions, and naming that honestly is the heart of this ADR:

1. **"Wire it to our system"** — stop it drifting; make it a first-class, corpus-grounded node.
2. **"Build it within the inner loop"** — drive its changes through the prove-it-gate
   ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) to signed red→green verdicts, the
   default for all work ([ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)).

**These are partly orthogonal, and the inner loop is *not* the primary cure for staleness.** The
inner loop proves *logic* red→green; staleness is *content* drift, whose cure is
generation-from-source plus a drift gate — the `check:claude` / `check:agents` pattern
([ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
[ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md)), of which
`check:web-grounding` is already an instance. And a website is fundamentally a **visual** artifact;
visual proof is deliberately *not* built (the orchestrator + human own it). So a single "build the
website in the inner loop" framing would over-claim. The website is three different *materials*, and
each wants a different proof:

| Material | Examples on the site | The proof that fits |
|---|---|---|
| **Deterministic logic** | the demo layout/SVG engine (`world.ts` / `worldSvg.ts`); mock-data schema validation | The **inner loop** — pure, build-time, *untested today*; exactly red→green `node:test` shaped. |
| **Generated-from-source content** | `roadmap.json` ← real story statuses; grounded claims ← the corpus | The **drift-gate** pattern (generate + `check:*`); what actually stops staleness. Gate-shaped, not red→green. |
| **Visual / copy / design** | the Astro pages, the prose voice, the SVG aesthetics | **Human + orchestrator** (owner-screenshot-nod). Out of scope by design, not a gap. |

There is also a **structural boundary**. Inner-loop `--real` proofs
([ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) widened the
envelope, but) run in a fresh git worktree of *this* (private) repo, writing parent-repo-relative
`testFile` / `sourceFile` paths under a phase write-scope. The website is a *separate public* repo.
So inner-loop-provable web logic cannot be authored into the submodule as-is — it must live in the
parent workspace. That collides with [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)'s
load-bearing decoupling intent: *no private source is vendored into the public site.* Reconciling
those two is the central design problem.

## Decision

Adopt a **route-by-material model**: the website becomes a tracked story, and each of its three
materials is routed to the proof that fits it. Concretely:

1. **The website is a story (`stories/website`).** Author it (via the `story-author` role, through the
   live Library write boundary — not improvised here) so the site becomes first-class: capabilities,
   deciding ADRs (this one), drift checks, and a presence on the notice board / studio. Its would-be
   story UAT: *the deployed public site honestly reflects the current system — every load-bearing
   claim resolves to a live decision, the roadmap matches real story statuses, and the demo renders
   from a proven engine.* Dependency direction is an Open call (#5), but `library` (the trunk) is the
   minimum — the grounded content reads from the corpus the library tier owns.

2. **Logic → a parent workspace package, proven in the inner loop.** Graduate the deterministic demo
   engine (the `world.ts` / `worldSvg.ts` layout + SVG render and the mock-data zod schema) out of the
   public repo into a normal parent package (a `packages/web-engine`, name TBD). It gets spec-borne
   proof config ([ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) A —
   self-registering nodes) and is driven through the prove-it-gate to signed verdicts: determinism
   (same input → same SVG), longest-path ranking correctness, tree-size ∝ contract count, cycle
   detection, schema validation. This is the genuine "build it in the inner loop" — bounded to the
   logic, which today has no tests at all.

3. **The boundary principle (RECOMMENDED — Open call #1).** *The public site may consume parent-built
   **artifacts** (the engine's published/copied build output, generated content) but never vendors
   private **source**.* This reconciles inner-loop proving with
   [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)'s decoupling: what
   crosses the boundary is a purpose-built public rendering package's *output*, not the private spine,
   store, or decision corpus. The provable logic lives and is proven parent-side; the public repo
   stays a thin presentation shell. (Alternatives — keep the engine in the public repo and prove it
   via a parent gate that runs the web tests at submodule-bump time, *or* keep the site logic-light
   and forgo engine-proving — are weaker on the "inner loop" ask; weighed in Open call #1.)

4. **Content → corpus-grounded, drift-gated; prose stays human (the real anti-staleness fix).** The
   owner's register call (§Status, 2026-06-17) scopes this to **facts and structure, not prose**.
   Three moves, all the existing generated-view + drift-gate pattern
   ([ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) /
   [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md)) pointed parent-side:
   - **(a) Load-bearing claims get a citable library home.** Each factual claim the site stands on
     resolves to an *existing* doctrine artifact (a `principle` / `definition` / ADR) where one exists,
     or is authored as the appropriate **existing kind** where it doesn't — **no new `narrative` /
     copy kind** (the declined option). The library stays doctrine-pure.
   - **(b) Grounding becomes a native library edge.** Extend the `data-grounds` gate
     ([`check-web-grounding.ts`](../../packages/cli/src/check-web-grounding.ts)) to resolve library
     `asset:` ids against the live library — not just `ADR-NNNN` — the follow-up
     [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) named. A cited
     unit that goes missing or is retired reddens the gate; the **prose itself stays hand-authored in
     the repo**, citing these ids, in the site's public voice.
   - **(c) The roadmap is generated from the story tier.** `roadmap.json` becomes a projection of the
     real story DAG + statuses (public subset) behind a `check:web-roadmap` drift gate — the sharpest
     drift-kill, and literally the corpus rendering itself.

   Generation widens the *grounded* surface and the gate keeps it honest; the crafted explainer copy
   remains a human deliverable (Decision 5). Authoring these gates is itself inner-loop-shaped
   (gate-as-proof, the [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
   E pattern) — the check is the proof.

5. **Visual / copy / design stay human + orchestrator — explicitly fenced.** The Astro pages, the
   prose register (the constitution is rendered byte-for-byte verbatim by owner standing rule), and the
   SVG aesthetics land through the merge ceremony with an owner-screenshot-nod, not a red→green leaf.
   This is the correct boundary under [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the human owns
   the outer loop), not a capability gap to close.

6. **Deploy stays on the web repo's here.now CD for now.** The public repo's `deploy.yml` (merge =
   publish) remains the deploy rail; the parent-side gates run at **submodule-bump granularity** (the
   model `check:web-grounding` already uses — the web repo can't see the private corpus, so the parent
   validates when it bumps its pointer). Folding web deploy into [`stories/ci-cd`](../../stories/ci-cd/story.md)
   is deferred (Open call #2).

## Consequences

**Good.**
- The website stops being invisible: it becomes a tracked story with deciding ADRs, drift checks, and
  a studio/notice-board presence — the system can finally *watch* its own front door.
- Staleness gets a structural cure, not a manual chore: generated-from-source content + drift gates
  mean a doctrine change can't silently leave the public copy overclaiming (the same guarantee
  [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) gave for ADR-cited
  claims, now extended to the roadmap and library-id-cited claims).
- The demo engine — pure, deterministic, and completely untested today — becomes a clean inner-loop
  dogfood: a real, non-trivial body of logic earning signed verdicts.
- The honest split is named once, so future website work routes itself: logic to the loop, content to
  the gate, look-and-feel to the human — no more "should this go through the inner loop?" per change.

**Bad / costs.**
- **The boundary re-couples public ↔ private** (Decision 3). Graduating the engine into the parent and
  having the public site consume its output reverses some of the decoupling
  [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) was built to
  preserve. The principle ("artifacts, not source") keeps the private corpus out of the public repo,
  but a real publish/sync edge now exists, with its own freshness and tooling cost. This is the load-
  bearing trade and is escalated (Open call #1).
- **Generation has a register cost.** The site's voice is deliberately hand-crafted and honest; over-
  generating prose would flatten it. The cure (Decision 4) is scoped to *structured* content (roadmap,
  cited claims), leaving prose human — but drawing that line precisely is judgement, surfaced in Open
  call #6.
- **Two render engines exist** (the studio's forest world,
  [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md), and the web demo's
  independent re-implementation). Graduating the web engine parent-side invites — but this ADR does
  not decide — a *shared* render core consumed by both (Open call #4): real leverage, real coupling.
- **The work is multi-material and cannot be one atomic unit.** It decomposes into: author the story
  (story-author); the engine package + its inner-loop proofs; the generation + drift gates; and the
  human content/visual refresh — sequenced, landed separately, per the slow-growth discipline.

## Open modeling calls (for the owner)

Surfaced rather than guessed — the load-bearing forks this design leaves open.

1. **The boundary (the load-bearing call).** Confirm Decision 3 — *provable web logic graduates into a
   parent package; the public site consumes its built artifact* — versus (a) keeping the engine in the
   public repo and proving it via a **parent gate over the submodule** (full decoupling, but the proof
   is a conventional test at bump-time, *not* a red→green leaf inner-loop build, so it does not satisfy
   "build it in the inner loop"), or (b) keeping the site **logic-light** and forgoing engine-proving
   entirely. The recommendation is Decision 3; the alternatives trade the inner-loop ask for stricter
   decoupling.
2. **Deploy unification.** Keep the web repo's independent here.now CD (Decision 6), or fold web deploy
   into [`stories/ci-cd`](../../stories/ci-cd/story.md) so one pipeline lands both? Per
   [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md), unifying would make
   `website` depend on `ci-cd`'s delivered outcome — check the direction is acyclic before adopting.
3. **Fictional vs. sanitised demo data.** The demo renders the fictional "Cohoot" system. Keep it
   fictional (safe, no private-tree exposure), or export a *sanitised* real-tree snapshot so the demo
   shows the actual system? Recommendation: stay fictional unless a sanitisation pass is itself a
   gated capability (the real tree is private).
4. **A shared render core for studio + web.** The studio
   ([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)) and the web demo
   independently render the same forest-world metaphor. Should the graduated engine be the *one* core
   both consume, or stay a web-only package? Leverage vs. coupling — a follow-on decision, not this ADR.
5. **Story dependencies.** `library` (the trunk) is the minimum (grounded content reads the corpus).
   Does `website` also depend on `ci-cd` (if deploy unifies, #2) and/or `drive-machinery` (where the
   inner-loop engine machinery is homed)? Direction per
   [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md), settled when the
   story is authored.
6. **RESOLVED (owner, 2026-06-17).** Generation register: **facts/claims only.** The load-bearing
   claims become citable library artifacts cited via native library-id references, and the public
   roadmap is generated from the story tier; the explainer **prose stays hand-authored in the repo**.
   The more ambitious option — lifting the public copy into a new `narrative` library *kind* and
   rendering the site's pages from the library — was weighed and **declined** (keep the library a
   knowledge tier, not a copy store; protect the crafted voice). Folded into Decision 4 (a/b/c).

## References

- [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) — `data-grounds` web-grounding gate; the single existing wire this ADR extends (and the decoupling intent it must reconcile).
- [ADR-0010](0010-organism-model-story-bounded-context.md) — story › capability › contract; what "track it as a story" means.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate (the red→green honesty the engine proofs ride).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the live SDK leaf; the human owns the outer loop (why visual/copy stays human).
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — inner loop as the default; node-borne proof config (A); gate-as-proof (E).
- [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) — the widened proof envelope (`--real` runs in a parent-repo worktree — the boundary constraint).
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) / [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) — generated-from-source + drift gate; the pattern Decision 4 reuses.
- [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) — cross-story dependency direction / no-cycle (for the home story's `depends_on`).
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — the studio forest world (the second render engine; the shared-core Open call).
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — decision binding (the story will declare this ADR in its `decisions:`).
- [ADR-0050](0050-adr-number-allocation.md) — how this ADR's number (0066) was allocated.
- [`packages/cli/src/check-web-grounding.ts`](../../packages/cli/src/check-web-grounding.ts) — the parent-side gate; the template for `check:web-roadmap` and the library-id extension.
- `web/src/lib/world.ts`, `web/src/lib/worldSvg.ts`, `web/src/data/mockSystem.json` — the deterministic engine + mock data to graduate (in the public submodule).
- [`stories/ci-cd/story.md`](../../stories/ci-cd/story.md) — the delivery process (deploy-unification Open call).
