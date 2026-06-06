# Recursive decomposition patterns

**Rule:** when a context genuinely exceeds the model's window, do not summarise lossily or hope a bigger window saves you — decompose. Hold the large context *as an environment* the agent queries programmatically, filter to the sparse relevant slice, and recurse with a bounded depth. Reserve this for contexts that actually exceed the limit; for anything that fits, plain loading is simpler and faster.

## Why this matters

Most tasks do not need all of a large context at once. Loading everything wastes the attention budget and degrades reasoning; summarising upfront loses the details the task needs. The alternative is to treat the context as data the agent searches — loading only the slice each sub-step requires — so it can work over a corpus far larger than its window without lossy compression.

(Source: *Recursive Language Models*, Zhang/Kraska/Khattab, MIT CSAIL. This is a context-engineering principle for agent sessions, not a Storytree code spec.)

## Core patterns

- **Context as environment.** Store the large input as named, queryable state rather than pasting it into the prompt. The agent issues queries (filter for a pattern, navigate to a section, find usages of a symbol) and pulls only what each step needs. This is the same pull-not-push stance as [pull-based-context-architecture](pull-based-context-architecture.md), applied to oversized inputs.
- **Filter over chunk.** Prefer extracting the semantically relevant slice (pattern match, structural navigation, dependency trace) over blind size-based splitting. Filtering preserves coherence and achieves far larger reductions than chunking; reserve chunking for genuinely unstructured content.
- **Recursive decomposition.** Break the task into sub-tasks, process each over its own slice, accumulate results, and aggregate. Patterns: filter-then-process, hierarchical extraction (process a tree level by level), map-reduce (process chunks independently, then synthesise).
- **Search/execution firewall.** Separate context *curation* from task *execution*. A curation pass searches and prepares the minimal relevant slice; an execution pass then works with *only* that curated slice and does no further searching. This keeps the executing step focused and the trail auditable.

## Discipline and anti-patterns

- **Measure before activating.** Do not reach for decomposition when the context fits comfortably — the setup overhead is not justified. If it fits, load it.
- **Bound the recursion.** Always pass and decrement a max depth; fail gracefully with partial results at the limit. Unbounded recursion risks runaway cost.
- **Name the accumulators.** Use hierarchical, descriptive names for stored context and results; cap the number of active variables. Generic names and uncleaned state make it impossible to track what is live.
- **Hold the firewall.** The executing step must not reach back into the full context store or re-search. If it does, the separation is broken and focus is lost.
- **Aggregate before completing.** Signal completion only after every branch has finished and results are combined — never inside a loop or branch.

In Storytree terms, the natural homes for this are oversized exploration (see [exploration-principles](exploration-principles.md)), large owned-loop-event-stream or evidence analysis, and reasoning over big spec inputs during decomposition — wherever a single context would blow the window.
