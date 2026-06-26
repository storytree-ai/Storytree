---
id: "cli-resident-corpus-tools"
tier: capability
story: cli
title: "The CLI-resident authoring primitives the gates build on"
outcome: "The CLI-resident authoring primitives the gates build on: the stories/ YAML corpus guard and the ADR frontmatter parser."
status: mapped
proof_mode: integration-test
depends_on: []
---

# The CLI-resident authoring primitives the gates build on

**Outcome —** The CLI-resident authoring primitives the gates build on: the `stories/` YAML corpus
guard (`packages/cli/scripts/validate-corpus.ts`) and the ADR frontmatter parser
(`packages/drive/src/adr-frontmatter.ts`).

## Guidance

- The corpus guard refuses any standalone `.yaml`/`.yml` unit under `stories/` (a relapse into the
  retired ADR-0013 pure-YAML representation, ADR-0039); it runs in the CLI's `test`.
- The ADR frontmatter parser is the pure primitive the adr-health gate (ci-cd's `adr-health-gate`)
  and the `adr new` allocator (ADR-0050) build on — parsing/validation lives here; the gating
  POLICY is ci-cd's, not duplicated here.
- The corpus guard is genuinely CLI-resident (it rides the CLI's test surface, not another
  organism's). The ADR frontmatter parser moved to `@storytree/drive` (ADR-0112) but is driven by the
  CLI's ADR commands/gates — so the `cli-resident` framing now spans two packages; a reframe/re-home
  is a story-author follow-up.

## Contracts (2)

1. **`stories-yaml-guard`** — a stray YAML unit under `stories/` is refused
   - **asserts —** the guard exits non-zero listing any `.yaml`/`.yml` offender and exits zero on a
     clean tree.
2. **`adr-frontmatter-parses`** — a well-formed ADR frontmatter block parses to a typed value
   - **asserts —** the parser yields the typed `status`/`decided`/edge fields for a valid block and
     throws a located error on a malformed one (the adr-health gate's input contract).
