# Doc-vs-implementation precedence

**Rule:** implementation is ground truth; doc text is a hypothesis about implementation. When investigation surfaces a gap between what a doc claims (an ADR, a glossary entry, a guideline, a story spec) and what the code actually does, *the gap itself is the load-bearing surface* — not metadata to a downstream decision that took the doc's claim at face value.

## Why this matters

It is easy to author the next move — "extend the code so the doc holds", "tighten the invariant", "add the enforcement" — on top of a doc claim that a recent finding has already shown does not match the code. The downstream framing is built on a phantom premise. The honest first question is not "how do I make the doc's framing go through" but "does the doc need correcting to match the code (most common), or does the code need extending to make the doc's claim hold (rarer, and an operator call)?"

## The discriminator

Does a recent investigation name a gap between a doc's claim and observed code, *and* does the move you are about to make reference that same doc as load-bearing for its framing?

- **Yes on both** → the gap is the load-bearing surface. Reshape any framing that takes the doc's claim at face value. Surface the gap to the operator.
- **Yes on the gap, no on the doc reference** → the gap is still real and may warrant its own correction, but the current move is not blocked by it. Proceed; track the gap as a separate follow-up.
- **No gap** → standard path; this guideline does not fire.

## What to do

When the gap is the surface, present to the operator: the doc, its exact claim, the observed code behaviour, and one question — does the doc text need correcting, or does the code need extending? Do not pre-decide.

Three resolutions:

1. **Doc needs correction (most common).** The doc overstated an invariant or described behaviour never built. Correct the doc. Any downstream move premised on the old claim is now invalidated — usually it never needed to exist; it was confusion that fell out of taking overstated text at face value.

2. **Code needs extending to match the doc (rarer; operator-directed).** The doc described an intended invariant the code only partially carries, and closing the gap is worth it. Route the gap-closure as its own bounded unit through the normal build flow. It is a contract in its own right, not a foot-in-the-door for the prior framing. Do not bundle it with the original move.

3. **Defer.** The operator may judge the gap not worth closing now.

Composes with [assess-tradeoffs-by-naming-both-sides](assess-tradeoffs-by-naming-both-sides.md): that rule governs *how* a surfaced tradeoff is framed; this rule governs *whether* the surface should exist at all when its premise is a doc claim the code contradicts. This one is more foundational — a wrong-premise surface fails here before its tradeoff prose is even worth interrogating.
