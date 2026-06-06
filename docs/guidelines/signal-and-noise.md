# Signal and noise

**Rule:** judge any piece of guidance an agent reads by its **discriminatory power**. Signal lets the agent distinguish the correct action from a sea of possibilities; noise consumes the agent's limited attention without adding that power. Author for high signal and ruthlessly cut noise.

## Why this matters

An agent — an owned-loop session, the orchestrator's own routing prompt, a guideline doc like this one — operates inside a finite attention window. Every sentence that does not help it choose the right next move is competing with the sentences that do. Low-signal guidance does not just fail to help; it actively crowds out the content that would.

## Signal

High-signal content is:

- **Actionable** — can be directly applied to make a decision or perform an operation.
- **Specific** — points to concrete files, patterns, or decisions, not abstractions.
- **Verifiable** — has a clear success criterion that can be tested or observed.
- **Evidence-based** — grounded in the codebase as it actually is (real paths, existing patterns, real constraints).

Examples: "the orchestrator is the sole fan-out point — owned-loop nodes never schedule child nodes"; "a contract reaches healthy by its isolated unit test passing"; "events are the only thing written; the rollup is a projection."

## Noise

Noise causes **attentional drift**:

- **Meta-talk** — commentary about the process rather than the task ("this is important because…", "let me explain why…").
- **Stale context** — paths, patterns, or decisions that no longer apply.
- **Generic philosophy** — abstract principles with no concrete application ("write maintainable code", "follow best practices").
- **Structural redundancy** — the same definition repeated across several places, so a correction in one drifts from the others.

## The evaluation checklist

Per sentence:

- Can I remove it without lowering the probability of the task completing? If yes → noise.
- Does it point to a specific action, file, or decision criterion? If no → likely noise.
- Is this duplicated elsewhere in the agent's context? If yes → redundancy noise; link to the single source instead.
- Will it still be true and useful much later? If no → potential stale context.

Aim for content that is overwhelmingly signal. To raise signal: name concrete surfaces over vague gestures, state exact success criteria over "make it work," give decision checkpoints over "handle it appropriately," and link to a single source of truth rather than restating a definition.

Composes with [guidance-quality](guidance-quality.md), which names the specific authoring moves that add signal (path / signpost / fence) and the anti-patterns that add noise (caps, repetition, strong language, negative framing).
