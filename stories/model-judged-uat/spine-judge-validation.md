---
id: "spine-judge-validation"
tier: capability
story: model-judged-uat
arc: model-uat-promotion
title: "The spine admits a model judgment only when shape, eligibility, tier, and hash are clean"
outcome: "The spine admits a result only when shape, registered eligibility, criterion tier, fresh detail-hash anchor, and evidence bindings all hold — and builds a signable model-UAT payload the model itself cannot sign."
status: proposed
proof_mode: integration-test
depends_on: [judge-result-shape]
decisions: [209, 20, 192, 82]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-judged-uat` package: AUTHOR_TEST writes spine-validation.test.ts; IMPLEMENT
# authors spine-validation.ts. Consumes `@storytree/model-uat` + `@storytree/uat-criterion` as
# package dependencies (story depends_on); does not squat their source.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-judged-uat", "test"]
  scope:
    testGlobs: ["packages/model-judged-uat/src/spine-validation.test.ts"]
    sourceGlobs: ["packages/model-judged-uat/src/spine-validation.ts"]
  real:
    testFile: "packages/model-judged-uat/src/spine-validation.test.ts"
    sourceFile: "packages/model-judged-uat/src/spine-validation.ts"
    scope:
      testGlobs: ["packages/model-judged-uat/src/spine-validation.test.ts"]
      sourceGlobs: ["packages/model-judged-uat/src/spine-validation.ts"]
    install: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-judged-uat", "typecheck"]
---

# The spine admits a model judgment only when shape, eligibility, tier, and hash are clean

**Outcome —** The spine admits a result only when shape, registered eligibility, criterion tier,
fresh detail-hash anchor, and evidence bindings all hold — and builds a signable model-UAT payload
the model itself cannot sign.

## Guidance

- Author validation in `packages/model-judged-uat/src/spine-validation.ts`. Inputs: a structured
  judge result, the criterion's required tier + witness (from `@storytree/model-uat`), a
  `resolveJudge` eligibility decision, and a detail-hash freshness classification (from
  `@storytree/uat-criterion`). Output: either a **signable model-UAT payload** (judge id, tier,
  detail hash, structured outcome, evidence) or a typed **refusal** reason (ADR-0209 D3/D6).
- **Admit only the honest conjunction.** Refuse when any of: result fails schema; witness is not
  `model`; eligibility is HOLD / ineligible; required tier not satisfied by the named judge; detail
  hash is stale/missing; evidence bindings do not cover the criterion id.
- **Signable ≠ signed.** This capability builds the payload the spine *may* sign; it does not mint
  cryptographic signatures or write store rows. Persistence/signing ceremony stays in orchestrator
  consumer glue (ADR-0020 — spine signs; this port supplies the validated payload).
- **Model cannot self-sign.** The signable payload has no model-authored seal; only the spine
  principal may later attach a signature.
- Test-author ≠ code-author (`spine-validation.test.ts` → `spine-validation.ts`).

## Contracts (3)

1. **`spine-admits-eligible-fresh-pass`** — the happy path yields a signable payload
   - **asserts —** an eligible judge at/above required tier + fresh detail hash + well-shaped PASS
     (with evidence) produces a signable payload recording judge id, tier, detail hash, and
     structured outcome.
2. **`spine-refuses-ineligible-or-stale`** — dishonest inputs never admit
   - **asserts —** each of bad shape, non-model witness, HOLD/ineligible judge, insufficient tier,
     stale/missing detail hash, and missing evidence bindings yields a typed refusal — never a
     signable payload (ADR-0209 D3/D6).
3. **`spine-payload-is-not-a-model-signature`** — admission is not self-green
   - **asserts —** the admitted payload carries no model signature field and is explicitly marked
     signable-for-spine (or equivalent); calling validation never returns a finished signed verdict
     the model could have minted alone (ADR-0209 D3 / ADR-0020).
