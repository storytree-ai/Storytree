# Exploration principles

**Rule:** when an agent explores a codebase to inform a decision, it discovers patterns rather than enumerating files, loads the minimum context for its scope, works independently of other explorers, and never modifies anything. Exploration is read-only reconnaissance, not implementation.

## Why this matters

Exploration feeds a decision — a decomposition, a scope call, an implementation plan. The risk is that exploration over-reads (burning the attention budget on exhaustive cataloguing), over-reaches (analysing surfaces another agent owns), or quietly mutates code it was only meant to read. Disciplined exploration keeps findings sharp, cheap, and safe to act on.

## Principles

1. **Discover and experiment first.** Use glob to learn the structure and sample representative files. Use search for patterns rather than reading whole files. Test an assumption with a quick probe before committing to deep analysis. Favour pattern discovery over exhaustive enumeration.
2. **Context-minimal.** Stay inside the assigned scope. Do not analyse surfaces another explorer owns; note them briefly and move on. Include only relevant discoveries — minimise noise.
3. **Less is more.** Identify the high-level patterns and conventions that matter for the decision. Sample representative examples, not every file. Prioritise actionable insight over comprehensive documentation. Keep findings concise.
4. **Parallel and independent.** Work without waiting on or cross-referencing other explorers' findings. Produce a self-contained result that synthesis can consolidate later. Independence is what lets the orchestrator fan exploration out.
5. **Read-only.** Never modify code while exploring. Use read-only tools (glob, search, read). Flag risks and unknowns in the findings; leave the building to the building session.

## What good findings look like

- Specific and actionable, with concrete file paths.
- Focused on patterns relevant to the current objective, with a note on *why* each pattern matters.
- Risks and unknowns flagged explicitly.
- No redundancy with another explorer's scope.
- Just enough detail to inform the decision — not a file dump.

Low-quality findings: exhaustive listings with no pattern identified, generic observations unrelated to the objective, overlap with another scope, or so much detail the key insight is buried.

When a context to explore genuinely exceeds the model's window, escalate to the decomposition discipline in [recursive-decomposition-patterns](recursive-decomposition-patterns.md) rather than reading everything at once.
