import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { renderCodexAgentFile } from "@storytree/library/store";
import { InMemoryStore } from "@storytree/storage-protocol";

import {
  NO_DRIFT_DIAGNOSIS,
  diagnoseDrift,
  essentialsGateFailures,
  explainAgentCheckFailure,
} from "./build-agents.js";

/** This file sits at packages/cli/src/ — three levels up is the repo root (the gate-run.ts pattern). */
const repoRootForTest = (): string =>
  path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

// ---------- the failure REPORT: a remedy that does not work is not printed alone ----------
//
// `gate-checks-name-the-remedy-that-works` (gate-self-report-honesty-arc). `check:agents` failed on
// drift the instant it found any, so the essentials gate ran only on runs where drift was empty.
// The combined case therefore printed `stale: <file>` — the routine sibling-race signature whose
// documented remedy is `pnpm build:agents` + commit — while the check ALREADY HELD the fact that
// regenerating would hand back a different, unfixable red. Neither predicate changed; only what the
// run is allowed to claim about itself.

test("drift alone carries the WHICH-SIDE-MOVED diagnosis, unqualified by any other finding", () => {
  const message = explainAgentCheckFailure({
    drift: ["stale:   .claude/agents/planner.md"],
    essentialsFailures: [],
    diagnosis: {
      ok: true,
      mainRef: "abc1234",
      files: [{ label: "stale:   .claude/agents/planner.md", side: "branch-behind" }],
    },
  });
  assert.ok(message);
  assert.match(message, /harness agent views are STALE/);
  assert.match(message, /planner\.md/);
  // The diagnosis reaches the message — the whole point of wiring it into this branch.
  assert.match(message, /WHICH SIDE MOVED/);
  assert.match(message, /git merge origin\/main/);
  assert.doesNotMatch(message, /WILL NOT CLEAR/, "nothing here says the remedy fails — it works");
});

test("an essentials breach alone reads as itself, not as a stale view", () => {
  const message = explainAgentCheckFailure({
    drift: [],
    essentialsFailures: ["claude: planner exceeds the essentials budget"],
    diagnosis: NO_DRIFT_DIAGNOSIS,
  });
  assert.ok(message);
  assert.match(message, /essentials gate FAILED/);
  assert.doesNotMatch(message, /STALE/);
  assert.doesNotMatch(message, /WHICH SIDE MOVED/, "there is no drift to attribute a side to");
});

test("drift PLUS a breach says regenerating will not clear it, and whose it is", () => {
  const message = explainAgentCheckFailure({
    drift: ["stale:   .claude/agents/planner.md"],
    essentialsFailures: ["claude: planner exceeds the essentials budget"],
    diagnosis: {
      ok: true,
      mainRef: "abc1234",
      files: [{ label: "stale:   .claude/agents/planner.md", side: "branch-behind" }],
    },
  });
  assert.ok(message);
  // The whole point: the routine remedy is named as INSUFFICIENT rather than offered bare.
  assert.match(message, /REGENERATING WILL NOT CLEAR THIS RUN/);
  assert.match(message, /replaces\s+this red with a different one/);
  // …and the owner is named, because no other session can clear a live-store breach for you.
  assert.match(message, /LIVE STORE/);
  assert.match(message, /whoever holds the live agent edit/);
  assert.match(message, /storytree library artifact edit/, "it names the write that actually helps");
  // Both findings survive into the report — the session should not have to run it twice to see them.
  assert.match(message, /planner\.md/);
  assert.match(message, /exceeds the essentials budget/);
});

test("a clean run reports nothing to fail on", () => {
  assert.equal(
    explainAgentCheckFailure({
      drift: [],
      essentialsFailures: [],
      diagnosis: NO_DRIFT_DIAGNOSIS,
    }),
    null,
  );
});

// The COMBINED case keeps its own remedy rather than the side-of-the-merge one: there the essentials
// breach dominates, its owner is already named, and regenerating is already declared insufficient,
// so a merge-vs-regenerate ordering would be advice for a step the session cannot reach yet.
test("the combined message does not dilute itself with a merge-first ordering", () => {
  const message = explainAgentCheckFailure({
    drift: ["stale:   .claude/agents/planner.md"],
    essentialsFailures: ["claude: planner exceeds the essentials budget"],
    diagnosis: {
      ok: true,
      mainRef: "abc1234",
      files: [{ label: "stale:   .claude/agents/planner.md", side: "branch-behind" }],
    },
  });
  assert.ok(message);
  assert.doesNotMatch(message, /git merge origin\/main/);
});

// ---------- WIRING: the drift the loop finds is the drift the diagnosis is asked about ----------
//
// The module could be perfect and the command still print the old message. `diagnoseDrift` is the
// exact seam `main()` calls, so exercising it over a real repo-shaped input proves the composition:
// an unusable origin/main must fail WIDE (never a guessed side), and every drifted file must come
// back carrying a verdict, orphans included.

test("diagnoseDrift fails wide with a named reason when origin/main cannot be read", () => {
  const diagnosis = diagnoseDrift(
    [{ label: "stale:   .claude/agents/planner.md", rel: ".claude/agents/planner.md", expected: "x", onDisk: "y" }],
    // A directory that is not a git repository at all — the fresh-clone / detached shape.
    tmpdir(),
  );
  assert.equal(diagnosis.ok, false);
  if (diagnosis.ok) return;
  assert.match(diagnosis.reason, /origin\/main/);
});

test("diagnoseDrift returns one verdict per drifted file, orphans included", () => {
  const diagnosis = diagnoseDrift(
    [
      { label: "stale:   .claude/agents/a.md", rel: ".claude/agents/a.md", expected: "fresh", onDisk: "old" },
      { label: "orphan:  .claude/agents/b.md", rel: ".claude/agents/b.md", expected: null, onDisk: null },
    ],
    repoRootForTest(),
  );
  if (!diagnosis.ok) {
    // A checkout with no origin/main (a fresh clone, CI on a tag) legitimately cannot answer. The
    // fail-wide contract is asserted above; there is nothing further to prove here.
    return;
  }
  assert.equal(diagnosis.files.length, 2);
  assert.deepEqual(
    diagnosis.files.map((file) => file.label),
    ["stale:   .claude/agents/a.md", "orphan:  .claude/agents/b.md"],
  );
  for (const file of diagnosis.files) {
    assert.ok(
      ["branch-behind", "main-equally-stale", "branch-diverged", "absent-on-main"].includes(file.side),
      `every drifted file must carry a side, got ${file.side}`,
    );
  }
});

test("build:agents checks Codex TOML content for essentials prompt violations", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "codex-agent",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Codex Agent",
      description: "a Codex projection whose prompt leaks a full referenced body",
      oneLine: "The Codex agent proves its native TOML is gated.",
      role: "### Leaked Principle  [principle]\n\nThis full body must fail the essentials gate.",
      outcome: "Codex receives only the thin essentials prompt.",
      context: [],
      tools: "none",
      workflow: "orient, then stop.",
      references: [],
    },
  });

  const rendered = await renderCodexAgentFile(store, "codex-agent");
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.match(rendered.content, /^name = "codex-agent"/);
  assert.match(
    rendered.content,
    /^# Storytree model policy: inherit; no Codex model is pinned \(Library model tier: unset\)\.$/m,
  );
  assert.doesNotMatch(rendered.content, /^model(?:_reasoning_effort)?\s*=/m);
  assert.match(rendered.content, /^## Codex runtime$/m);
  assert.match(rendered.content, /^### Leaked Principle  \[principle\]$/m);

  const failures = await essentialsGateFailures(store, ["codex-agent"], [
    {
      label: ".codex/agents",
      extension: "toml",
      files: new Map([["codex-agent.toml", rendered.content]]),
    },
  ]);

  assert.ok(
    failures.some(
      (failure) => failure.startsWith(".codex/agents:") && failure.includes("inlines a full ref BODY"),
    ),
    `expected the Codex TOML prompt violation to fail the gate, got: ${failures.join("\n")}`,
  );
});
