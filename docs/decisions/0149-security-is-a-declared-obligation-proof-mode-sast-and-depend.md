---
status: accepted
decided: 2026-07-03
amends: [20, 64]
---
# ADR-0149: Security is a declared-obligation proof mode: SAST and dependency reputation, gated where declared

## Status

accepted (2026-07-03) — decided/directed by the owner in conversation on 2026-07-03. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md), [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) — the prove-it-gate (ADR-0020) gains a **security dimension where a unit declares one** (the [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) precedent of adding a gate check; the tier-based red→green machinery is untouched), and the spine-driven dependency add (ADR-0064 §2, `real.addDeps`) gains the **provenance/reputation check it explicitly noted it lacked** ("nothing checks a package name is real / non-malicious" before the add). Neither decision is overturned; both are extended.

## Context

storytree's center of gravity is the **verification gap** — "done" means *a signed, spine-observed proof*, not the agent's word (ADR-0020). But the prove-it-gate proves **functional** red→green only: a vulnerability that *passes the author's tests* lands green. Security is precisely an *unstated way* the code can be wrong.

The 2026 evidence makes this the most strongly-evidenced **new** pain (full citations + reliability flags: [`vibe-coding-coverage-map-2026.md`](../research/vibe-coding-coverage-map-2026.md) § "The gaps — raised to the owner", gaps 1–2, both RESOLVED 2026-07-03; [`vibe-coding-gripes-2026.md`](../research/vibe-coding-gripes-2026.md) § 2026 refresh):

- **Authored-code vulnerability.** ~**45%** of AI-generated code introduces an OWASP Top-10 flaw, and the security pass-rate has stayed **flat at ~55%** across two years of model releases even as functional correctness climbed **~50%→95%** — a *widening* functional-vs-secure gap; reasoning models reach only 70–72% (Veracode 2025 / Spring 2026). *Scoped honestly:* the 45% is a vendor-SAST fail-rate on deliberately security-sensitive tasks with no security prompting — not "45% of all AI code in the wild."
- **Dependency supply-chain (folded in — owner call 2026-07-03).** LLMs still hallucinate non-existent package names at **4.62–6.10%** on the 2026 frontier cohort ([arXiv:2605.17062](https://arxiv.org/abs/2605.17062), "The Range Shrinks, the Threat Remains") — down from Spracklen 2025's 5.2–21.7% (the *worst* case collapsed; the floor barely moved), with **127 names invented identically across five models, 53 still registrable**, 43% repeatable, and a real Jan-2026 npm incident (`react-codeshift`, 237 repos). The threat is **smaller but live**. The spine can add declared deps (ADR-0064 §2); nothing verifies the package is non-malicious first. **An existence check is not enough — a slopsquatted package *does* exist;** the effective defense is a **reputation/provenance** signal (Socket.dev-class).

The corpus is **security-silent as proof**: a body grep of `docs/decisions/` for "security" returns only storytree's own *op-sec* (per-phase write-scope, IAP, keyless Cloud SQL IAM, injection-safe `execFile` arg vectors) — never a *proof* dimension over the code the agent writes.

The fork this resolves is the **honesty boundary**. storytree's load-bearing principle is *"green = proven against **declared** obligations, not correct in every unstated way."* Two failure modes bracket the design:

- A **blanket** security gate would impose an **undeclared external obligation on all code** and elevate a (false-positive-prone) machine security claim to the same proof-status as the red→green observation — which the corpus is deliberately careful *not* to do (it refuses to let a machine claim "the look is right"; ADR-0044/0064 §3).
- A **pure advisory signal** collapses back to "the human weighs it" — the pre-storytree world the whole thesis rejects.

The owner directed the resolution below (2026-07-03), ratifying the mechanism in-session — so this ADR is born `accepted` ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)).

## Decision

A **security proof mode**, computed spine-side, machine-gated **only where a unit declares the obligation**. Four legs:

1. **Security is a new proof *mode*, not a new gate.** A `security` verdict mode joins the proof vocabulary (proof-protocol's `ProofMode`) **alongside** the tier-based modes (contract / capability / story) and `operator-attested`. It is **computed by the spine** by wrapping external tools — a SAST engine over authored code, a reputation/provenance service over deps — and reuses the existing verdict / signer / anchor / rollup machinery (ADR-0020's `proof/`): storytree owns the *signed verdict and its place on the map*, not the scanner. The mode is **orthogonal to the tier ladder** ([ADR-0002](0002-work-hierarchy-story-capability-contract.md)/[ADR-0010](0010-organism-model-story-bounded-context.md)) — a story, capability, or contract of any tier may carry a security obligation; security is a **cross-cutting dimension, not a fourth tier**. *(Shape — owner's call: a new proof mode, over a separate gate or thin tool-wiring.)*

2. **Declared-obligation, then gated — this is how it stays honest.** Security is machine-gated **only against a unit's declared security obligation**. A unit opts in through its spec — a `security:` arm on the node's `proof:` block (ADR-0057/0064), e.g. `{ sast: <ruleset / severity floor>, deps: <reputation floor> }`. **Where declared**, a finding blocks green exactly like a red test — because it now *is* a declared obligation, so *"green = proven against declared obligations"* holds **by construction**. **Where not declared**, the scan may still run and surface a **signal** (on the map and at the merge-ceremony review) but never blocks the gate. The machine only ever *proves what the author declared*; it never invents an obligation — and a noisy scanner can never red a unit that did not sign up for the check. *(Honesty boundary — owner's call: declared-obligation then gated, over blanket-gate or signal-only.)*

3. **Scope: authored-code SAST *and* dependency reputation, one dimension.** The `security` mode covers both halves of the one code-and-supply-chain surface: **(a)** SAST/vuln scanning of **authored** code, and **(b)** **provenance/reputation** on spine-driven dependency adds (ADR-0064 §2). The dep half is a **reputation** signal — typosquat/edit-distance to popular names, maintainer/age/download and known-malware signal (Socket.dev-class) — **not a mere existence check** (a slopsquatted package exists; existence proves nothing). When a unit's `real.addDeps` runs under a declared `deps` obligation, each added package must clear the reputation floor or the add **fails closed**, the same posture as ADR-0064's failed-`pnpm add` (tear down, throw, never look buildable). *(Scope — owner's call: both, one dimension.)*

4. **The human backstop is unchanged and remains the final word.** Security-as-proof does not replace the human — it **feeds** them. The signed security verdict and the surfaced signal are **auditable evidence** the owner weighs at the story UAT node and the merge-ceremony review ([ADR-0044](0044-per-uat-test-human-attestation.md) per-test attestation; the merge ceremony). A machine security **PASS means "no finding against the *declared* obligation," never "secure in every unstated way"** — the identical honest limit the functional gate carries (ADR-0020; the coverage-map's "honest limit"). The human stays the backstop for the *unstated*; the mode makes the *declared* cheap, signed, and auditable.

## Consequences

- **Additive and zero-cost by default.** The tier ladder (ADR-0002/0010) and the functional prove-it-gate (ADR-0020) are untouched for any unit that declares no security obligation; the mode only engages on opt-in. Honesty stays calibrated — a `security` verdict must render **distinctly** from a functional red→green pass (as ADR-0044's attestation marks do), so no one mistakes "SAST-clean against the declared ruleset" for "provably secure."
- **The ADR-0064 dep-add gap closes.** A declared `deps` obligation makes a slopsquatted / low-reputation add **fail closed before it reaches the lockfile diff** — the provenance check ADR-0064 §2 flagged as missing.
- **Tool choice is deferred to the build (a boundary, not this decision).** *Which* SAST engine (Semgrep / CodeQL-class) and *which* reputation source (Socket.dev-class / OSV / registry signal) are implementation calls the building story makes; this ADR fixes the **shape** (a spine-computed, signed `security` mode, gated where declared), not the vendor.
- **Cost.** A declared obligation adds a spine step (run the scanner / query the reputation service) to that unit's build; undeclared units pay nothing. Reputation lookups touch the **network** — a build affordance to wire (an offline / air-gapped build either skips the dep-reputation half or fails closed against a declared `deps` obligation; a build detail).
- **This is a shape decision; it does not build the mode.** A future story authors the `security` proof mode, the SAST/reputation wrappers, and the `security:` schema arm — routed through the inner loop like any other capability. It closes gap 1 (and folds in gap 2) of the 2026 vibe-coding coverage map; the website's Act-2 walkthrough may then honestly add a security beat (today it claims none).

## What this does NOT decide

- The exact **SAST engine** and **dependency-reputation source** (deferred to the building story).
- The exact **schema of the `security:` obligation** — severity floors, ruleset selection, the reputation threshold — a build detail.
- Whether the **undeclared-unit signal** runs on every build by default or is itself opt-in (a scanning-cost tradeoff for the build to settle).

## References

- **Evidence:** [`vibe-coding-coverage-map-2026.md`](../research/vibe-coding-coverage-map-2026.md) (§ "The gaps — raised to the owner", gaps 1–2, RESOLVED 2026-07-03) and [`vibe-coding-gripes-2026.md`](../research/vibe-coding-gripes-2026.md) (§ 2026 refresh). Primary sources: Veracode GenAI Code Security 2025 / Spring 2026; [arXiv:2605.17062](https://arxiv.org/abs/2605.17062) ("The Range Shrinks, the Threat Remains" — 2026 frontier-cohort slopsquatting); USENIX Security 2025 (Spracklen et al.).
- **Amended:** [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (prove-it-gate — gains the security dimension where declared), [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) (spine-driven dep-add — gains the provenance/reputation check).
- **Stands on / extends orthogonally:** [ADR-0002](0002-work-hierarchy-story-capability-contract.md) / [ADR-0010](0010-organism-model-story-bounded-context.md) (the proof-mode vocabulary + tier ladder), [ADR-0044](0044-per-uat-test-human-attestation.md) / [ADR-0082](0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) (the human backstop, unchanged), [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) (the precedent for adding a gate dimension), [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) (the spec-borne `proof:` block the `security:` arm joins), [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (design-time ratification).
- **Code the mode reuses / touches:** `packages/proof-protocol/src/proof.ts` (`ProofMode` — the mode vocabulary), `packages/orchestrator/src/prove-it-gate.ts` + `proof/` (the gate + signer this reuses), `packages/orchestrator/src/proof-config.ts` (the `real:` arm schema the `security:` obligation joins), `packages/orchestrator/src/build-worktree.ts` (the ADR-0064 `pnpm add` seam the provenance check guards).
