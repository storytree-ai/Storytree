# Guidance quality

**Rule:** when guidance is not being followed, fix its *structure* — add the missing path, signpost, or fence — rather than adding emphasis. Effective guidance puts the right instruction at the point it is needed; ineffective guidance shouts an instruction the agent reads in the wrong place or not at all.

## Why this matters

Agents do not respond to visual or emotional emphasis the way a human skimming a page might. Capitalising a sentence, repeating it three ways, or marking it CRITICAL does not raise the chance it gets followed — it just adds noise (see [signal-and-noise](signal-and-noise.md)). If guidance is being ignored, the cause is almost always structural: the instruction is absent at the moment of decision, has no concrete example, or lacks a constraint that removes the ambiguity. Emphasis treats the symptom; structure treats the cause.

## Effective patterns

- **Path** — add a concrete step at the point in the process where it is needed. ("Before proving the story, run the full suite across sibling capabilities.")
- **Signpost** — add a concrete example showing correct usage, ideally a link to one that already exists.
- **Fence** — add a constraint that makes the wrong move structurally hard or measurable. ("Only writes within the unit's declared write-ownership scope.")
- **Offload** — move a deterministic, error-prone step out of prose and into code the spine sequences, so the agent cannot get it wrong by free-handing it.

## Anti-patterns

- **Caps emphasis** — using capitals to signal importance. Adds noise; agents do not weight visual emphasis. Prefer a structured field or a placed step.
- **Repetition** — restating the same instruction in different words. Adds context without adding information. State it once, at the right place, and link.
- **Strong language** — urgent or emotional framing. If everything is critical, nothing is prioritised. Prefer a plain priority marker.
- **Emphasis escalation** — adding emphasis to guidance that was already ignored, instead of asking *why* it was ignored. Move it to the step where it bites instead.
- **Negative framing** — telling the agent what *not* to do with no positive alternative. The agent needs to know what to do. Replace "do not write outside the scope" with a positive boundary: "writes land only within the declared scope."

## What to do

When an instruction is not landing, ask: is it present at the decision point? Is there a concrete example? Is there a constraint that makes the wrong move hard? Add whichever is missing. Reach for emphasis only after structure has genuinely failed — which is rare.
