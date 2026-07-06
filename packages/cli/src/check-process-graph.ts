// Fail-closed process branch-edge GRAPH integrity gate (ADR-0161 decision 5), wired into `pnpm gate`.
//
// A `process` artifact's `branchEdges` are the outbound edges of a process NODE in the Library context
// DAG (ADR-0154 follow-on / ADR-0161). This gate is the graph-integrity fence — the dangling-ref fence
// (check:agents' step→refs integrity) extended to the process tier's structured edges. It runs the
// library compute `processGraphViolations` over the seed corpus and FAILS the build (exit 1) on any
// violation, so the process graph cannot silently grow a dangling branch or a cycle.
//
// SCOPED to (a) every branch-edge RESOLVES + (b) no CYCLE. ADR-0161 dec 5 also names "unreachable
// nodes", but the process graph has no declared root and reachability is undefined without one — the
// scoping is documented in processGraphViolations' header (render-process.ts); this gate does not
// invent a root semantics the corpus does not settle.
//
// Offline by construction (reads the seed corpus via loadCorpus into an InMemoryStore — pure file
// reads, no DB), so it runs identically in the gate and CI — the build-agents.ts --check pattern. A
// NO-OP today: no seed process carries branchEdges, so the graph is empty and the gate stays green.

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus, processGraphViolations } from "@storytree/library/store";

async function main(): Promise<void> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  const violations = await processGraphViolations(store);
  if (violations.length > 0) {
    console.error(
      "check:process-graph — the process branch-edge GRAPH is UNSOUND (ADR-0161 decision 5); fix the " +
        "process artifact(s):\n  " + violations.join("\n  "),
    );
    process.exit(1);
  }
  const count = (await store.queryDocs({ kind: "process" })).length;
  console.log(`check:process-graph — process branch-edge graph sound: resolve + acyclic (${count} processes).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
