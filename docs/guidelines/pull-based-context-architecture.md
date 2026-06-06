# Pull-based context architecture

**Rule:** give an agent a thin bootstrap and let it *pull* exactly the context its current step needs, rather than *pushing* a large static brief at session start. Minimise the initial token load; fetch on demand; always read the live source so the context is fresh.

This is a context-engineering principle for how agents are briefed — **not** a code spec for any Storytree subsystem.

## Why this matters

The push model — pre-loading a big static brief covering every situation the agent might hit — has three costs paid on every turn:

- **Context tax.** A large brief consumes the attention budget even when most of it is irrelevant to the step at hand. This is the [signal-and-noise](signal-and-noise.md) problem at the briefing layer.
- **Staleness.** A brief loaded at session start does not reflect changes made after. The agent reasons over a snapshot, not reality.
- **One-size-fits-all.** Every step gets the whole brief; no step gets context tailored to it.

The pull model inverts this: the agent starts with a minimal bootstrap (who it is, how to fetch context, the loop to run) and pulls the rest just-in-time. The result is a large reduction in initial token load, context that is always current because it is read fresh, and per-step specificity.

## The pattern

1. **Thin bootstrap.** The agent's starting brief is small: its role, its current objective, and how to fetch more. It carries pointers, not payloads.
2. **Pull on demand.** The agent fetches its operational context when it needs it — and what it fetches is *paths to read*, not embedded blobs. Compact to transmit; the agent reads only the files the step actually requires; it can discover related files nearby; and it always reads the current state, never a cached copy.
3. **Progressive disclosure.** Each step's result points at the next thing to fetch, so the agent walks into detail only as far as the task demands, instead of front-loading everything.

## What to do

- Keep agent briefs lean: name the surface and link to its authoritative source instead of inlining it. (Self-contained still matters for a subagent with no memory of the conversation — but self-contained means *complete pointers*, not *complete payloads*.)
- Prefer handing an agent a path to read over pasting the content into its prompt.
- When a single context to pull would still exceed the window, escalate to [recursive-decomposition-patterns](recursive-decomposition-patterns.md) — query the context as an environment rather than loading it whole.

In Storytree, the event store is the single source of truth and the orchestrator briefs each owned-loop node; this principle argues for those briefs to be pointers into live state read just-in-time, keeping initial load minimal and context fresh, rather than fat static snapshots.
