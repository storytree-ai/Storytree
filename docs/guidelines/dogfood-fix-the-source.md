# Dogfood: fix the source

**Rule:** when your own tooling errors block progress, stop and fix the tool or its source — do not paper over it with a one-off workaround. A symptom-masking patch leaves the root cause live to resurface, usually in a more confusing state, and the next session inherits the same wall.

## Why this matters

Storytree builds the very kind of agent-driven system it is built *with* — the orchestrator, the spine, the owned agent loop (`packages/agent`), studio. When that tooling errors mid-task, the tempting move is to route around it: a null guard, a hardcoded value, a swallowed exception, a shell fallback, just enough to get unblocked. Every such workaround is technical debt that hides a real defect. The problem does not go away; it goes quiet, and re-emerges later, harder to diagnose because a layer of masking now sits on top of it.

Because we dogfood, a defect in our own tooling is a *first-class bug*, not an environmental annoyance to be tiptoed around. Fixing it at the source improves the platform for every future session; working around it degrades the platform and the trust in it.

## What to do

1. **Reproduce and trace.** Reproduce the failure first. Trace it back to the earliest failing signal — the precise cause, not a downstream side effect.
2. **Validate the test first.** Before changing production code, confirm a test genuinely captures the failure, so you are fixing the real thing and not a phantom.
3. **Fix at the source.** Resolve the root cause where it lives. Ensure the bad state cannot occur, rather than adding a guard that hides it after the fact.
4. **Prefer a single correct path.** When a fix tempts you to add a flag or option, ask whether one behaviour is simply correct. If so, make it the only behaviour. Options add cognitive and maintenance load; reserve them for genuinely orthogonal preferences.

## Anti-patterns

- Masking an error with a catch-all that does not handle it.
- Hardcoding a value to silence a dynamic failure.
- Adding a narrow edge-case handler for a problem that should be fixed generically.
- Falling back to a workaround tool *without recording that the primary one failed* — see [verify-edit-write-persisted-or-escalate](verify-edit-write-persisted-or-escalate.md), which permits a recovery fallback only after the failure is made visible.

The discriminator: if the blocker is a defect in tooling we own, the default is to fix it, not route around it. Surface it as the bug it is.
