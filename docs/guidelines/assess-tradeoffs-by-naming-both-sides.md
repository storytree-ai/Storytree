# Assess tradeoffs by naming both sides

**Rule:** every tradeoff surfaced — to the operator, in an ADR, in a brief, in a scope decision, in an implementation choice — must explicitly answer "what are we trading? A vs B" with **both** sides stated in concrete, observable terms (latency, blast radius, contract strength, observability, security posture, recoverability, portability). Generic phrasings like "this is more work" or "this is more complex" do not satisfy the rule.

## Why this matters

A tradeoff is two named sides. If you cannot complete the sentence "we lose X to gain Y" — with both X and Y in concrete terms the operator adjudicates from a project-lead seat — you are not surfacing a tradeoff. You are listing options, and you are asking the operator to do the assessment work the surfacing party should have done first.

Concrete terms are observable properties of the system. "We lose contract strength to gain latency" is concrete. "We lose author convenience to gain cleaner specs" is concrete. "This is more complex" is not — it names neither side.

## The "more work" trap

In an agent-driven corpus, "this option is more work upfront" is a **misframed cost** and does not count as a named side. The owned loop does the work at agent speed; upfront effort (re-speccing a contract, retiring tests, threading a new field through callers, amending sibling stories) is a one-time cost that amortises across every future invocation of the cleaner shape.

The only durable cost from "more work" is **maintenance complexity an agent cannot legibly carry forward** — concurrency edge cases needing cross-file human-style reasoning, hidden contracts spread across many surfaces with no central home, load-bearing-but-undocumented mutation order. And even most of that is solvable by adding guidance (a doc naming the rule) or tooling (a check that enforces it). That solvable subset is also not a durable cost.

So when an option's apparent cost is "more work" or "more complex," either (a) reframe it in concrete observable terms, or (b) demonstrate it introduces durable, agent-illegible complexity that neither guidance nor tooling can address — a high bar. Without one, the cost is not a cost, and the option list usually collapses to the move you should have just made.

## The discriminator

When you find yourself listing options, ask:

1. Can I complete "we lose X to gain Y" for each option, X and Y both concrete?
2. If "more work" / "more complex" appears as a cost, have I either reframed it concretely or shown durable, agent-illegible complexity?

Both yes → surface. Either no → the assessment is not finished. Complete it, or reshape the question — it may be a routing decision the agent should resolve, not a tradeoff for the operator.

Composes with [doc-vs-implementation-precedence](doc-vs-implementation-precedence.md): that rule governs *whether* a surface should exist when its premise is a doc claim the code contradicts; this rule governs *how* a surface that should exist is framed.
