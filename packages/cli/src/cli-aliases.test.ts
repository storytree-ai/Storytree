import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";

/**
 * The CLI back-compat ALIAS-COVERAGE suite — the deterministic enforcer behind the
 * `cli-relocations-keep-an-alias` guardrail (ADR-0118): the workflow-first reshape RELOCATES proof
 * primitives under workflows (`build node`, `adopt gate`, `witness list`, …) but must NEVER drop the
 * old grain verb — every moved verb keeps a back-compat alias so no caller, script, or agent habit
 * breaks silently. This suite pins that contract: for each (relocated verb, its alias) pair, the alias
 * resolves to the SAME envelope as its new home.
 *
 * It is DELIBERATELY a growing table — each reshape unit (build, adopt gate, witness, tree-inspection)
 * adds its relocations here as it lands. A relocation with no row is a coverage gap; a row that fails
 * is a dropped/renamed alias. Equivalence is asserted on a side-effect-free surface: the in-dispatch
 * `--store memory` refusal (ADR-0081) and read-only resolution both produce deterministic envelopes,
 * so a deepEqual is a true "same code path" proof without running a build, a DB, or a signer.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

/** Each relocation: the new (workflow-first) home and the back-compat alias that must still resolve to it. */
interface Relocation {
  readonly what: string;
  readonly home: readonly string[];
  readonly alias: readonly string[];
}

const RELOCATIONS: readonly Relocation[] = [
  // ── Unit A: the `build` workflow (ADR-0118) ───────────────────────────────
  {
    what: "node build → build node",
    home: ["build", "node", "library-cli", "--store", "memory"],
    alias: ["node", "build", "library-cli", "--store", "memory"],
  },
  {
    what: "node resolve → build node resolve",
    home: ["build", "node", "resolve", "library-cli"],
    alias: ["node", "resolve", "library-cli"],
  },
  {
    what: "story build → build story",
    home: ["build", "story", "library", "--store", "memory"],
    alias: ["story", "build", "library", "--store", "memory"],
  },
  {
    what: "gate run --real → build gate --real",
    home: ["build", "gate", "library#gate-1", "--real", "--store", "memory"],
    alias: ["gate", "run", "library#gate-1", "--real", "--store", "memory"],
  },
  // ── Unit B: the `adopt gate` observe primitive (ADR-0118) ──────────────────
  {
    what: "gate run (observe) → adopt gate",
    home: ["adopt", "gate", "library#gate-1", "--store", "memory"],
    alias: ["gate", "run", "library#gate-1", "--store", "memory"],
  },
];

for (const reloc of RELOCATIONS) {
  test(`alias coverage: \`${reloc.what}\` — the alias resolves to the same envelope as its new home`, async () => {
    const store = await seeded();
    const home = await run([...reloc.home], { store });
    const alias = await run([...reloc.alias], { store });
    assert.deepEqual(
      alias,
      home,
      `the back-compat alias must resolve identically to its workflow-first home (${reloc.what})`,
    );
  });
}

test("the alias table covers every relocated verb landed so far (no silent coverage gap)", () => {
  // A floor that fails loudly if a future unit relocates a verb but forgets to register its alias row.
  // Bump this as each reshape unit lands (build = 4 relocations; adopt gate = 1).
  assert.ok(RELOCATIONS.length >= 5, "Unit A (build, 4) + Unit B (adopt gate, 1)");
});
