# The judge-panel procedure

How a contested lint rule gets adjudicated on `anti-slop-adoption-arc`. Established by increment
`inc-04` and proved on `no-unsafe-dictionary-type`; `inc-05`, `inc-06`, `inc-08` and `inc-09` follow
it rather than inventing their own.

Authority: **ADR-0407 D3**, from the owner's direction on 2026-08-21 — *"if we find something want to
push back on i think we just do a panel of llm judges to decide, if we find something our codebase
fights against then we do a small panel to figure out if theres a viable refactor that fits and still
passes"* — and *"We dont use llm judge panels much because they are expensive but in this case i
think its viable."*

---

## When you need a panel, and when you do not

**ADOPTING NEEDS NO PANEL.** A panel exists to justify a REJECTION. A lane that agrees with a rule
and refactors to satisfy it simply adopts and refactors, and records the migration on the arc. Since
the owner narrowed the rejection bar on 2026-08-21, this is the expected shape of most remaining
lanes.

**THE REJECTION BAR IS A CLOSED LIST OF TWO** — the arc's words, not this document's:

1. Adopting the rule would **lose functionality**.
2. There is a **genuine exceptional set** the rule cannot express — bounded and nameable, not a broad
   seam we would rather not touch.

Volume, house style, effort, churn and review surface are **explicitly not grounds**. A panel
convened to reject must find one of the two above; the others are answered before the panel sits.

Then:

| Situation | Panel | Size |
|---|---|---|
| A session wants to REJECT or NARROW a rule | **RULE panel** — "is this rule right for this house?" | 5 judges |
| The rule is agreed correct but the architecture resists it | **REFACTOR panel** — "is there a shape that satisfies both?" | 3 judges |

The refactor panel runs **only after** a rule panel upholds. It hunts for a shape; it does not hand
out exemptions. **"No viable refactor found" is a legitimate result** and is the strongest available
reason to turn a rule off — stronger than any rejection reached without one.

---

## The four properties, and which are enforced

The arc names four properties a panel must have. Three of them are refusals in
`packages/cli/src/lint-panel.ts`; the fourth cannot be checked by a program and is on you.

### 1. BLIND — *enforced*

Judges are not told which rule we want rejected, nor what compliance would cost.

- Rules are labelled `Rule A`, `Rule B`, … by a **seeded shuffle**, so authoring order is not a tell.
- `renderPacket` reads only `label`, `statement` and `sites`. The role and the expected answer are
  structurally unreachable from the judges' text.
- The packet is **refused** if any rule's name appears in any specimen's statement or evidence —
  including another rule's, because identifying one rule identifies the others by elimination.
- The packet is **refused** if a violation count appears in a rule statement or in the shared
  codebase context. *How much code a rule touches is our input to the decision, not the panel's.*

### 2. CONTROLLED — *enforced*

- The packet is **refused** with fewer than two rules: a one-rule packet cannot be blind however
  carefully it is worded.
- The packet is **refused** with no `control-uphold` / `control-reject` specimen, and **refused** with
  no `target`.
- A control's `expected` field must carry the **independent** reason we hold that answer — evidence
  from outside the panel, never the panel's own output.

A control whose answer we merely *assume* is not a control. `inc-04` used two that were held
independently: `no-chained-type-assertions`, whose expected UPHOLD is ground truth from the
**compiler** (reducing all 33 production chains to single assertions made three of them fail to
compile, because the claims were false), and a **synthetic** rule authored for the panel and expected
to be REJECTED because `verbatimModuleSyntax` makes complying with it break the build.

**Write a synthetic negative control when no real rule fits.** Every rule in an expert-authored set is
defensible, so a reject-control usually has to be built. Give it a plausible rationale and real sites,
prefix its id with `synthetic/` so no later reader mistakes it for an upstream rule, and say in the
record that it was synthetic.

**The REFACTOR panel needs controls too, and the role names carry over with a shifted meaning.** The
question is no longer "is this rule right" but "does a compliant shape exist", so `control-uphold`
means *a viable refactor exists* and `control-reject` means *none does*. Both still need ground truth
from outside the panel. `inc-04` used: a rule whose refactor **had already been performed** — 33
sites driven to zero with the typecheck green afterwards, so "a shape exists" is on disk rather than
predicted — and the same synthetic rule as the negative, because `verbatimModuleSyntax` makes every
compliant form of it emit a runtime import that did not exist, which is a build break rather than a
matter of taste.

**Give every specimen the same number of sites.** An uneven count is itself a tell about which rule
the packet is really asking about.

### 3. PERSPECTIVE-DIVERSE — *enforced by construction*

Five identical prompts are one judge with a louder voice. The lenses are declared in
`lint-panel.ts` and each judge gets exactly one:

**Rule panel** — `rule-merits`, `codebase-architecture`, `future-maintainer`, `skeptic`,
`false-positive`.
**Refactor panel** — `refactor-shape`, `functionality-loss`, `boundary-integrity`.

Two seats are adversarial **by assignment**, and that is deliberate: four judges asked in good faith
whether an expert-authored rule is correct will tend to agree, and a unanimous verdict reached that
way means nothing. `skeptic` is told to build the strongest honest case against each rule;
`false-positive` is told these rules are syntactic and type-blind and asked what share of the firings
are noise.

### 4. COSTED — *on you*

Record what the panel spent: wall clock, and token cost if the harness reports it. The owner
authorised panels on the explicit basis that they are normally too expensive, so the actual number is
what tells the next lane whether it can afford the same treatment. **Report what you actually
measured and name what you could not** — a cost line that quietly omits the judges' own token spend
because it was not visible is the same failure this instrument exists to prevent.

---

## Running one

### 1. Measure the rule

```
cp oxlint.config.ts .oxlint.measure.ts
# set the rules you want measured to "error" in the copy
pnpm exec oxlint -c .oxlint.measure.ts --format=json > report.json
```

⚠ **Do not use `-A all` with `-D anti-slop/<rule>`.** The CLI's `-D` flags do not enable JS-plugin
rules, and that combination silently reports a near-empty run instead of failing (measured, `inc-01`).

### 2. Write the spec

One JSON file per panel, committed under `tools/oxlint/panels/`. See
`no-unsafe-dictionary-type.rule-panel.json` for the worked example. The target's sites are sampled
live from the report; controls carry inline sites, because neither kind can be sampled from a run at
HEAD — one was already driven to zero, the other is synthetic and no linter implements it.

**State each rule in its own voice, arguing FOR itself.** This is the one leak no refusal can catch: a
statement hedged toward the answer you want will produce the answer you want, and nothing in the tool
will tell you.

### 3. Build the packet

```
pnpm storytree lint-panel packet --spec tools/oxlint/panels/<name>.json --report report.json --out-dir <dir>
```

You get one `brief-<lens>.md` per judge and one `key.md`. **The key never goes to a judge.**

### 4. Run the judges

One independent agent per brief, each with **no shared context** and told to read its brief and
nothing else. That last instruction is load-bearing: a judge that explores the repository will find
`oxlint.config.ts`, which names every rule, its adjudication status and its lane. One curious judge
un-blinds the whole panel.

### 5. Read the controls FIRST

Before you look at the target verdict at all. A panel that answers the controls as expected has
demonstrated it can discriminate, and its verdict on the target is evidence. **A panel that misses a
control has not** — record the miss and treat the target verdict as unreliable, rather than quietly
reporting the part you liked.

**A control's expected answer is a claim YOU have to get right, and a panel more precise than its
control is evidence the control was sloppy — not that the panel drifted.** Both of `inc-04`'s
refactor-panel controls came back one notch off the predicted label, and in both cases the judges
were right: the negative control had a small subset where a free refactor genuinely does exist, which
the expected answer had flattened to "none". Record the correction against the control, and do not
quietly restate the expected answer as though it had been met.

Three outcomes, and they are different: **PASS** (the control's answer came back), **PASS WITH A
FINDING** (the direction is right, the label is not — say what moved and why), and **FAIL** (the
control's answer was contradicted, which invalidates the target verdict). Never collapse the middle
one into the first.

### 5a. Batch, if you have several rules to adjudicate

The builder takes N specimens, and **the blinding gets stronger with more rules in the packet, not
weaker.** A panel adjudicating five target rules against two controls costs one panel rather than
five, amortises the controls across all of them, and makes the target harder to pick out. `inc-05`
has seven rules to settle and should batch rather than convene seven panels — see the cost section of
`panels/no-unsafe-dictionary-type.md` for the arithmetic.

### 6. Write the record

`tools/oxlint/panels/<rule>.md`, and it must carry:

- every judge's verdict and confidence, **by seat**;
- **the dissent, in its own words.** A unanimous panel and a 3-2 panel are different evidence and
  must not be recorded identically. Where a split panel is resolved, say what resolved it;
- the controls' outcome, as a pass or fail of the instrument;
- the measured cost;
- the resulting terminal state for the rule, and — if a narrowing — the narrowing precisely enough
  to implement.

---

## What the sampler does, and why

`lint-panel-sites.ts` does not take the first N findings. Two rules, both learned the hard way in
`inc-04`:

**Areas are visited densest-first, then round-robin, one site per file per pass.** Ordering areas
alphabetically *looked* neutral and was not: with ~20 areas and a handful of sites, round-robin over
an alphabetical list reaches exactly the alphabetically-first areas every time. The first packet built
for `inc-04` drew `apps/desktop` through `packages/context-traversal-capture` and never reached
`packages/storage-protocol` — **the document-store seam carrying the strongest architectural argument
against the rule being adjudicated.** A sample that systematically omits the best case for the code is
not a neutral sample, it is a favourable one.

**Test files are excluded by default.** ADR-0407 D4 already put tests on a laxer bar by owner
decision, so a panel shown test sites is being asked a question the house answered separately, and its
verdict would silently blend the two. Set `includeTests: true` only in the lanes whose subject
genuinely *is* the test architecture (`inc-06`, `inc-09`).

---

## Traps

**oxlint span offsets are BYTES, not string indices.** `String.prototype.slice` indexes UTF-16 code
units, and every non-ASCII character before a span pushes the two apart — in this codebase, that is
every em-dash in every comment, three bytes against one code unit. On `inc-04`'s first run the
excerpt for `arc-rollup.ts:307` rendered as `v === "string" ? v : ""` instead of
`Record<string, unknown>`, and every site was similarly displaced. `readSite` now slices the file's
`Buffer`; `lint-panel-sites.test.ts` holds it there with a fixture containing em-dashes ahead of the
span.

**Read that trap for its shape, not just its fix.** The context window was built from the diagnostic's
`line` and was correct, so the packet *looked* right and the panel still reasoned about real code.
What the defect corrupted was the one line claiming what the rule objected to — and two judges
reported it, one of whom **counted the apparently-broken diagnostics as evidence against the rule**.
A flaw in the instrument was read as a flaw in the subject, and it pushed the verdict toward the
answer the operator already expected. **If a panel reports something odd about the evidence, treat it
as a finding about the packet before you treat it as a finding about the rule** — and if the evidence
was wrong, fix it and re-run rather than keeping a verdict you now know was reached on bad input.

**Do not run the judges inside the repository's own context.** A judge that explores will find
`oxlint.config.ts`, which names every rule, its status and its lane.

## What is deliberately kept out of the codebase context

**That this codebase is model-authored.** It is true, it is the arc's founding premise, and it is
still left out of the shared context handed to judges — because it tilts uniformly toward *adopt*
without helping any seat do its job. None of the five lenses needs it: the architecture and
maintainer seats need the design, the false-positive seat needs the rule's mechanics. Telling the
panel the code is suspect would buy agreement, and agreement is exactly what a control exists to
distinguish from judgment.

**The migration's size**, for the same reason, and this one is a refusal rather than a convention.

Everything else the judges need to weigh the rules — compiler settings, the store seam, the schema
tier, the shape of the applications — belongs in and should be stated plainly. Under-informing the
panel is its own way of rigging it.

---

## The standing failure mode

An instrument that is not blind, has no control, and does not report its own cost produces a number
that reads as evidence and is not one. The refusals above exist because a session under time pressure
that "ran a panel" without a control has produced exactly that, and nothing downstream can tell the
difference.
