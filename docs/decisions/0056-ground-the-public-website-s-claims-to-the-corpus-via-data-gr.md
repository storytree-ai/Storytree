---
status: accepted
decided: 2026-06-14
---
# ADR-0056: Ground the public website's claims to the corpus via data-grounds and a parent-repo drift gate

## Status

accepted (2026-06-14) — direct owner decisions made 2026-06-14 in conversation (the owner spotted
that the public site overclaimed human sign-off) and recorded the same day.

## Context

The public front door (`storytree-web`, a **separate public repo** vendored here as the `web`
submodule, hosted on here.now) makes load-bearing factual claims about *how storytree actually
works*. Those claims were hand-written and bound to nothing in the corpus, so they drift silently.

Concretely: the site said a node goes green when **"a person signs off"** and that humans are
**"in charge of what's true"** (`index.astro`, `how-it-works.astro`, three spots). That contradicts
the current doctrine — [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md):
capability green derives from a **signed verdict, with no human sign-off at capability grain**, and
stories declare `uat_witness: human | machine` so machine-witnessed stories go green with no human
at all. The honesty property is **adversarial separation of duties**
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) — no single actor authors the test,
implements against it, and signs off the verdict — with humans owning the **outer loop**
([ADR-0030](0030-all-in-on-claude-agent-sdk.md), [ADR-0022](0022-ci-green-gate-and-auto-merge.md)),
not per-node truth. The page had no link back to any of this, so the doctrine moved and the copy
didn't.

The obvious fix — hyperlink each claim to the ADR that grounds it — runs into a firewall: the site
vendors no private source, and the ADR/Library corpus is invite-only. But the owner's reframe is the
key: **a reference is not its content.** A citation like `ADR-0040` is an opaque, stable handle;
putting it in the public repo exposes nothing private. References route around the firewall entirely.

A second, coupled problem surfaced: the site's `publish-herenow.mjs` only ever did **anonymous 24h**
publishes (no auth), so the corrected copy couldn't even reach the claimed live site — each run made
a throwaway URL.

## Decision

Owner calls, 2026-06-14:

1. **Load-bearing claims carry a `data-grounds` reference.** Each factual claim about how storytree
   works gets `data-grounds="ADR-NNNN[,…]"` (extensible to library artifact ids) naming the recorded
   decision(s) it paraphrases. The reference is a handle, not content — it crosses the firewall
   safely. This mirrors the established **generated-view-bound-to-the-library, drift-gated** family:
   `check:claude` ([ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md)) and `check:agents`
   ([ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md)) — applied here to a new surface.

2. **References are discoverable in the repo, NOT rendered on the page.** Owner call: a citation a
   reader can't yet follow is just noise, and keeping ourselves honest is our discipline, not
   something to perform on the marketing surface. So no visible "ADR-0040" tags and no public
   decision-ledger — the page stays clean prose; the references live in the source for tooling and
   for anyone who reads the repo.

3. **The drift gate lives in the PARENT repo.** `pnpm check:web-grounding`
   (`packages/cli/src/check-web-grounding.ts`, in the `gate` and in CI) reads the `web` submodule's
   `data-grounds` refs and **fails when a cited ADR is missing or fully `superseded`** (a
   *partially* superseded ADR still stands and is fine — it reuses `loadAdrMetas`). `storytree-web`
   can't self-check: only this repo sees the corpus. CI clones the **pinned** web SHA over HTTPS
   first — `storytree-web` is public, so no creds are needed (unlike the private `legacy/Agentic`,
   which is why the main checkout still takes no submodules). Absent `web/` is a **local SKIP** and a
   **CI hard-fail** (the clone step must have run).

4. **Scope today:** `ADR-NNNN` references are validated strictly; any other scheme (a library
   artifact id) is flagged as *unvalidated* rather than silently trusted — resolving library ids is
   named follow-up.

5. **Publish in place.** `publish-herenow.mjs` gains an authenticated path: with `HERENOW_API_KEY`
   (+ the slug, remembered in `publish-info.json`) it does `PUT /api/v1/publish/:slug` to update the
   claimed live site in place; no key falls back to the anonymous preview. (A `storytree-web` change,
   recorded here as the coupled enabler.)

## Consequences

- The **"a person signs off" class of drift fails CI** the next time the submodule is bumped — the
  doctrine and the public copy can no longer silently diverge.
- Validation is at **submodule-bump granularity**: parent CI validates the pinned web SHA, so a
  web-side edit that adds a bad reference is caught when the parent bumps its pointer to that commit.
  The `storytree-web` repo has no CI of its own for this (it can't see the corpus) — the parent is
  the enforcement point, on bump.
- The gate is **vacuously green until the submodule is bumped** to the web commit that carries the
  `data-grounds` refs (the first such commit is [storytree-web#6](https://github.com/HuaMick/storytree-web/pull/6));
  it activates real validation on that bump.
- Small, deliberate cost: CI clones a public repo, and claim authors maintain the references — light,
  intentional friction (the same shape as the manifest/`enforcedBy` anchors).
- **Forward-compatible:** when the public "ask the record" surface exists (the unbuilt `library
  search` keystone, ADR-0047, proposed — not yet on `main`), these same handles become
  reader-resolvable links with no rework.

## References

- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — the green/witness
  doctrine the site had drifted from (the motivating bug).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md),
  [ADR-0030](0030-all-in-on-claude-agent-sdk.md),
  [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — separation of duties + the human outer loop, the
  doctrine the corrected copy now states.
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md),
  [ADR-0052](0052-render-delegatable-agents-to-claude-agents-subagent-files.md) — the generated-view drift-gate pattern this
  mirrors (`check:claude` / `check:agents`).
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — decision binding (stories ↔ ADRs); this
  is the same idea for the public site.
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — choose-your-own-adventure CLI guidance;
  ADR-0047 (proposed) is the future public ask-the-record surface where these references resolve.
- Code: `packages/cli/src/check-web-grounding.ts` (+ `.test.ts`), the `check:web-grounding` gate
  step in `.github/workflows/ci.yml`; `storytree-web` carries the `data-grounds` refs and the
  publish-in-place script.
