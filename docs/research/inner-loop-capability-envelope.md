# The inner loop's capability envelope — what it can build today, the gaps, and the expansions to raise

**Status:** findings + proposal for owner review. Authored 2026-06-14 in the exploration chip the
owner steer [[inner-loop-for-everything]] opened. This is **exploration/design — no change is
built here**; the deliverable is the map, the deduped gap list, the ADR→story bridge analysis, and
prioritized expansions framed as owner calls.

## The directive (what prompted this)

> "The outer loop was permissible while we were building the infrastructure. The infrastructure is
> now built — we are dogfooding the system and iterating. The **inner loop should be used for
> EVERYTHING**. If the inner loop doesn't have the capability for some work, that is a PROBLEM to be
> RAISED WITH ME so we can expand the inner loop's capabilities. If everything can be written as an
> ADR, then it should be possible to evolve it into the story corpus." — owner, 2026-06-14

- **Outer loop** = the session/merge ceremony (edit → `pnpm gate` → commit → push → non-draft PR →
  CI auto-merge; ADR-0022/0030, the generated `session-orchestrator` discipline). Proven by gate/CI
  but produces **no story node, no signed verdict, no wisp**.
- **Inner loop** = the leaf-driven prove-it-gate: a *registered* node driven through
  `node build <id> --real` / (chained) `story build`, the SDK leaf authors red→green, the spine
  walks `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`, and a **signed verdict**
  lands in `events.verdict` (ADR-0020/0030). Wisps + verdicts come *only* from here (ADR-0048).

### The bootstrap paradox (named, not stalled)

Authoring this doc, the proposal, the ADR, and the new story nodes that *expand* the inner loop is
itself work only the **outer loop** can land today — the inner loop cannot yet build the thing that
would let it build more. This is the accepted paradox in [[inner-loop-for-everything]], not an
excuse to fall back silently. The first expansions (below) are exactly what let later work move
inside. This doc lands via the outer loop on purpose.

---

## 1. The inner loop's capability envelope, precisely

### 1.1 The mechanical core (`proveUnit`, [prove-it-gate.ts](../../packages/orchestrator/src/prove-it-gate.ts))

A unit earns a signed verdict by walking exactly this ladder, every transition owned by the spine:

1. **AUTHOR_TEST** — the leaf writes the **test file only** (write-scoped, fail-closed).
2. **CONFIRM_RED** — the spine *observes* a real red by spawning the proof command and reading its
   exit code ([shell-test-executor.ts](../../packages/orchestrator/src/shell-test-executor.ts));
   the model never reports it.
3. **IMPLEMENT** — the leaf writes the **source file only** (never the test it must satisfy).
4. **CONFIRM_GREEN** — the spine *observes* the green itself.
5. **GATE** — on a **clean committed tree** + a **resolved signer**, the spine builds and appends
   the signed `Verdict` (`events.verdict`). `healthy` is reachable *only* through this append.

The leaf is the live **Claude Agent SDK** ([sdk-author.ts](../../packages/agent/src/sdk-author.ts))
with a fixed tool surface — `Read, Write, Edit, Glob, Grep` and **no Bash** (a shell write would
bypass the scope hook). Write scope is enforced by a `PreToolUse` deny hook over workspace-relative
paths. The leaf may *check* its work via bounded `mcp__spine__run_proof` / `run_typecheck` feedback
doorbells (fixed commands, zero leaf-controlled args), but the attested red/green is always the
spine's own out-of-band run.

### 1.2 The three modes — only one builds *real* work

| Mode | Leaf | What is built | Verdict persists? |
|---|---|---|---|
| `--dry-run` | scripted owned loop | synthetic `add(2,3)` in a temp dir | no (in-memory; `--store pg` refused) |
| `--live` | real SDK leaf | **still** synthetic `add(2,3)` in a temp dir | optional, but proves the *loop*, not real work |
| `--real` | real SDK leaf | the node's **real** test+source at real repo paths, in a fresh git worktree | yes (`--store pg` → `events.verdict`) + **promoted** |

Only **`--real`** turns actual repository change into a signed, persistable, promotable verdict
([node-build.ts](../../packages/cli/src/node-build.ts), [resolve-prove-spec.ts](../../packages/orchestrator/src/resolve-prove-spec.ts)).
`--dry-run`/`--live` are smoke tests of the machinery.

### 1.3 What `--real` structurally requires (the gate on the envelope)

A node is `--real`-buildable **only** if it is hand-registered in `NODE_BUILD_REGISTRY`
([test-command-registry.ts](../../packages/orchestrator/src/test-command-registry.ts)) **with a
`real: RealProofConfig`**:

- `testFile` — **one** repo-relative TS test file (the only file AUTHOR_TEST may write).
- `sourceFile` — **one** repo-relative implementation file (the only file IMPLEMENT may write).
- `scope` — per-phase write globs (test-glob, source-glob).
- optional `install: true` + `typecheck` for workspace-dependency-bearing single files.

The proof command is effectively fixed: `node --import tsx --test <testFile>` — i.e. **`node:test`
over TypeScript via tsx**. The red is expected to be "missing implementation"; the shape is a
**net-new (or single-file) behaviour**. `package.json`/`pnpm-lock.yaml` sit outside every scope, so
**the leaf can never add a dependency**. Integration/dispatch wiring is *explicitly* deferred to the
human after promotion — the registry comments repeat "*the spine wires `commands.ts` dispatch AFTER
promotion; the leaf's walls deliberately exclude it*".

### 1.4 The envelope in one sentence

> The inner loop can drive **a single net-new TypeScript behaviour, proven by one `node:test` file
> that goes red→green, after a human hand-registers its test/source/scope in the orchestrator** — and
> nothing else. Even then, *landing* it still rides the outer-loop PR/CI merge (§4 below).

The 7 nodes that carry a `real:` config today (`verdict-line`, `declare-presence`, `presence-store`,
`noticeboard-cli`, `tree-view`, `ambient-integration`, `verdict-glyphs`) are all **already built and
landed** — the buildable set is historical, not a forward queue. There is **no `story build --real`**:
`story build --live` chains *live-smoke* (synthetic `add(2,3)`) per node, so a whole story cannot be
grown to signed verdicts in one dependency-ordered chain (chaining real builds is named as later
work in the live framing). The `drive-machinery` story already records this in its own words:
"*Buildability is separate from authoredness … of these nodes only `verdict-line` carries a registry
entry … registering them … would make the machinery self-driveable*"
([stories/drive-machinery/story.md](../../stories/drive-machinery/story.md), Honest status + Open
modeling call #5).

---

## 2. Gap inventory against real recent work

Each of the last ~13 landed PRs, asked: *could this have gone through the inner loop to a signed
verdict?* "Core only" means a net-new TS module+test pair at the heart **could** be `--real`-built
*if registered*, but the PR also carries surfaces the inner loop structurally cannot touch.

| PR | What it changed | Inner-loop? | Blocking surface(s) |
|---|---|---|---|
| #131 worktree-safe presence hook | `scripts/presence-hook.sh`, `.claude/settings.json`, `ambient-presence.ts`+tests | **No** | shell script + JSON config; multi-file (G1, G2) |
| #130 author the `ci-cd` story | 8× `stories/ci-cd/*.md` | **No** | story authoring — prose, no red→green (G7) |
| #129 reconcile seed↔live | `knowledge.json`, `assets.json`, generated `.claude/agents/*.md` | **No** | library/knowledge data + generated artifacts (G6) |
| #128 `sync-agents` | `sync-agents.ts`+test, `commands.ts`, `index.ts`, an ADR, `CLAUDE.md` | **Core only** | dispatch wiring + ADR + CLAUDE.md (G4, G5, G7) |
| #127 disposable test DB (ADR-0054) | `test-db.ts`+test, **edits to 3 existing test files**, an ADR | **Core only** | multi-file edits to existing source + ADR (G2, G3, G7) |
| #126 render `.claude/agents` (ADR-0052) | `agents.ts`/`build-agents.ts`+test, `ci.yml`, `package.json`, generated md, ADR | **Core only** | CI yaml + package.json + generated outputs + ADR (G1, G7) |
| #132 web-grounding gate (ADR-0056) | `check-web-grounding.ts`+test, `ci.yml`, `package.json`, ADR | **Core only** | CI yaml + package.json + ADR (G1, G7) |
| #135 submodule bump | `web` pointer | **No** | git/submodule op, no test (G10) |
| #122 EOL-robust region check | edits to `build-claude-md.ts`, `claude-region.ts`+test | **No** | bug fix across **existing** multi-file source (G2, G3) |

**Result: 0 of the recent PRs could have gone through the inner loop end-to-end as-is.** The closest
four (#128/#127/#126/#132) have a clean net-new TS module+test at their *core* the inner loop could
prove — but **every one** also carries dispatch wiring, an ADR, CLAUDE.md, CI yaml, package.json, or
generated artifacts that are outer-loop-only. The rest have no inner-loop-expressible core at all.

### The deduped gap list

- **G1 — Non-TS / non-`node:test` proof surfaces.** The only proof mechanism is
  `node --import tsx --test` exit code. Shell scripts, JSON/YAML config (settings.json, ci.yml,
  package.json), SQL, Terraform, Markdown (docs/ADRs/stories), and the studio's vitest/Playwright UI
  have no proof mode.
- **G2 — Multi-file changes.** Registry + scope are single test-file + single source-file pairs.
  More than one source file, or several edited files, is inexpressible.
- **G3 — Editing existing source (bug fixes / refactors).** The gate's "right red" is a *missing*
  symbol; a regression test against code that already exists, or a no-behaviour-delta refactor,
  doesn't fit the AUTHOR_TEST→IMPLEMENT split. Cross-package refactor is wholly out.
- **G4 — Integration / dispatch wiring.** By design, wiring a proven module into the CLI/app is done
  by the human *after* promotion — structurally outside the loop.
- **G5 — Registration is itself outer-loop.** A node becomes buildable only by hand-editing
  `NODE_BUILD_REGISTRY` in `packages/orchestrator` — an outer-loop code PR, and one the registry
  cannot non-circularly register to build itself.
- **G6 — Library / knowledge edits.** Artifact edits are transactional `--pg` upserts, not red→green
  builds; not expressible as a contract.
- **G7 — Docs / ADR / story authoring.** Prose authoring has no test. This is the **bootstrap
  surface** — the very work that expands the inner loop (and this doc).
- **G8 — No whole-story REAL chain.** No `story build --real`; `--live` chains synthetic tasks.
- **G9 — Story-UAT & operator-attested proof don't flow through the build loop.** A story node is
  *withheld* unless `uat_witness: machine` (a human must witness, ADR-0040), and `operator-attested`
  has **no path in `proveUnit`** at all — the gate is always red→green; attestation is a *separate*
  surface (`storytree attest`, `events.attestation`, ADR-0044).
- **G10 — No dependency changes, no shell, no infra/git ops.** No new deps (package.json out of
  scope), no Bash (only bounded doorbells), so migrations, gcloud, terraform, submodule bumps are out.
- **G11 — Landing still rides the outer loop.** Even a perfect `--real` PASS is *parked* on a
  `claude/real/<id>-<run>` branch and pushed → it still needs a non-draft PR → CI auto-merge to land
  on `main`. The inner loop proves+signs+promotes; the *trunk landing* is the same outer-loop
  ceremony (see §4).

---

## 3. The ADR → story-corpus bridge

The owner's hypothesis: *an ADR-able change should be evolvable into the story corpus.* The
would-be pipeline is **decision (ADR) → story-author → registered REAL-buildable node → leaf build →
signed verdict.** Today **every joint is manual**, and one joint is a structural break:

| Joint | Exists? | Reality today |
|---|---|---|
| ADR authoring | ✅ | `storytree adr new --pg` atomically allocates + scaffolds (ADR-0050); frontmatter CI-validated (ADR-0037). |
| ADR ↔ story binding | ⚠️ partial | ADR-0037: a story *declares* `decisions: [N]`; CI checks drift + gates OQ hygiene. It is a **drift check, not a generator** — it never *produces* a node. |
| story-author → story node | ⚠️ manual | `story-author` is a role/agent that hand-writes `stories/<x>/*.md` via the live Library boundary — prose authoring, outer-loop (G7). No mechanical "ADR → node" transform. |
| story node → REAL-buildable | ❌ **break** | Requires hand-editing `NODE_BUILD_REGISTRY` in `packages/orchestrator` with single testFile/sourceFile/scope (G5). Only single-TS-file-pair nodes qualify (G1/G2). |
| leaf build → signed verdict | ✅ (narrow) | Works for the §1.4 envelope only. |

**The structural break is the registry (G5):** "how to prove a node" lives in orchestrator code,
*separate from* the node's own spec, and must be hand-added per node. So even a perfectly authored
story can't be built without an orchestrator PR — and only if it happens to be a single-TS-file pair.
The bridge is real but every plank is hand-laid.

---

## 4. Important framing: "inner loop for everything" cannot mean "no PR" (yet)

Even with every expansion below, a `--real` PASS is **promoted, not landed** — parked on a branch,
pushed, and merged onto `main` by the *existing* PR/CI ceremony (ADR-0031/0022; G11). So
"inner loop for everything" today realistically means:

> **every change becomes a registered node driven to a signed verdict + a wisp, and *then* the thin
> PR/CI rail lands it** — the outer loop demoted to a landing rail, not the place work is proven.

Whether the owner also wants *trunk landing itself* pulled inside the loop (the glossary's
**approval-gated trunk** — a human admits a green result directly, no PR) is a separate, larger call
(Expansion F). This doc does not assume it.

---

## 5. Proposed inner-loop expansions — framed as owner calls

Ordered by leverage ÷ cost. Each is an owner decision (the owner asked for gaps raised *as
decisions*). The natural home for the build-machinery expansions is new capabilities under the
existing **`drive-machinery`** story — "*machinery is ordinary work in the ordinary tree*"
(ADR-0031 §3) — which is itself the cleanest demonstration of the bridge once A/B land.

### A — Self-registering nodes (proof config lives in the spec) **[keystone]**

Move the per-node proof config (proof command + write scope, the `RealProofConfig`) **out of the
hand-maintained orchestrator registry and into the node's own frontmatter/spec.** Then *authoring a
node makes it buildable* — no orchestrator PR. Dissolves **G5**, and is the keystone of the §3
bridge. *Cost: medium* — schema + loader + resolver change; the registry becomes a
validation/fallback layer. **This is the first expansion: it's what lets later work move inside.**

### B — A proof-mode vocabulary beyond `node:test` **[breadth]**

Let a node declare its **proof command** (`pnpm --filter x test`, `pnpm vitest`, a `check:*` gate, a
shell test) + its write scope, so the *same* gate drives non-TS and multi-tool work red→green. The
gate already abstracts `TestExecutor` over a `ShellCommand`; the registry already stores a `command`.
Dissolves most of **G1** (and the studio's vitest path). *Cost: medium.* Pairs with C.

### C — Multi-file & existing-source builds **[depth]**

Widen write scope from single-pair to a declared *set* of globs, and support the "edit existing
source + add a regression test" red→green (the bug-fix/refactor shape, where the red is a new failing
*assertion*, not a missing symbol) while keeping the test-author-≠-code-author honesty wall.
Dissolves **G2 + G3**. *Cost: medium-high* — loosens the "right-kind red" and single-file
assumptions; the walls must still hold.

### D — `story build --real` (whole-story real chain) **[the bridge, end to end]**

Chain `--real` node builds in topo order over one store/run so a whole story grows to signed
verdicts. `story build` already chains live-smoke; the work is swapping per-node mode to `real`
(worktree reuse, promotion strategy, budget). Dissolves **G8**, and makes the §3 bridge demonstrable
end to end (decision → story → built story). *Cost: medium.*

### E — Authoring nodes as proof-bearing work **[bootstrap surface — own ADR]**

The hardest and most owner-laden: make docs/ADR/library/story authoring (G6/G7) *produce a node + a
signed mark + a wisp*, even though prose isn't red→green. Two framings to choose between:

1. **Gate-as-proof** — an authoring node's "proof" is the structural gate that guards it staying
   green (an ADR's proof = `check:adr-health`; a library edit's = zod-validate + reconcile; a story's
   = decision-binding/frontmatter check). The inner loop *can* observe these. Makes the owner's
   "ADR → story corpus" hypothesis literal.
2. **Attest-as-proof** — route authoring through an `operator-attested` build node that yields a
   signed *attestation* (the surface exists: ADR-0044, `events.attestation`), so authoring gets a
   node + signed mark + wisp without a test.

*Cost: high / most design.* Deserves its own ADR + a `drive-machinery` (or new) story.

### F — Approval-gated trunk (landing inside the loop) **[pure owner call]**

Whether to pull *trunk landing* inside the loop (the glossary's approval-gated trunk — human admits a
green result directly) or keep the thin PR/CI rail as the landing step (§4, G11). Pure owner
decision; surfaced, not designed here.

---

## 6. Open questions for the owner

1. **Prioritization** — is A (self-registering nodes) the right first expansion, and what's the order
   of B/C/D after it? (My recommendation: **A → B → D → C → E**, with F decided up front because it
   reframes what "done inside the loop" means.)
2. **Landing framing (§4/F)** — does "inner loop for everything" mean "registered node → signed
   verdict → *then* the PR/CI rail lands it", or do you want trunk landing itself inside the loop?
3. **Authoring proof (E)** — gate-as-proof, attest-as-proof, both, or keep prose authoring as an
   accepted outer-loop carve-out for now?
4. **Home** — author the expansions as new capabilities under `drive-machinery`, or a fresh story?

The next mechanical step on a yes is to allocate an ADR (`storytree adr new --pg`) for the chosen
expansion(s) and author the `drive-machinery` capability node(s) — itself the first piece of
outer-loop bootstrap work that lets the rest move inside.
