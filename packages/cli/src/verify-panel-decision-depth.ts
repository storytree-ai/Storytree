// A ONE-SHOT LIVE CHECK for `traversal-panel-draws-the-decision-depth`, kept out of `check:`/`probe:`
// on purpose: it answers "did the panel's reading actually move on real data", which is a question
// about a landing, not a standing invariant. `probe:depth-from-work` is the durable verb.
//
// It reads the LIVE corpus exactly as the studio's wire does (`renderStoredDoc`), replays one real
// local trace, and reports what the panel's own adapter functions come to BEFORE and AFTER the
// resolver — so the claim in the increment is measured rather than asserted.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { renderStoredDoc } from "@storytree/library/store";
import {
  depthFromWorkNodes,
  depthFromWorkOf,
  evaluateDepthFromWork,
} from "@storytree/library/knowledge-depth";
import { decisionSupportResolver } from "@storytree/library/decision-support";
import { adrNumberOfArtifactId } from "@storytree/library/decision-pointer";

import { openCorpusStore } from "@storytree/drive";

const TAG = "verify-panel-decision-depth";

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** The newest local traces, newest first — the same index the panel's picker offers. */
function newestTraces(limit: number): string[] {
  const dir = path.join(homedir(), ".storytree", "traces");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => path.join(dir, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
    .slice(0, limit);
}

/** The distinct artifact ids one trace READ — the panel's own `reportKnowledgeDepth` denominator. */
function readNodeIds(file: string): Set<string> {
  const ids = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    // The line is an ENVELOPE — `{v, event, grade, slot}` — so the read fields are one level down.
    // Reading the envelope's own keys finds no `kind` at all and reports an honest-looking zero.
    let envelope: { event?: { kind?: unknown; nodeId?: unknown } };
    try {
      envelope = JSON.parse(line) as { event?: { kind?: unknown; nodeId?: unknown } };
    } catch {
      continue;
    }
    const event = envelope.event;
    if (event === undefined) continue;
    if (event.kind !== "front_matter_read" && event.kind !== "full_payload_read") continue;
    if (typeof event.nodeId === "string" && event.nodeId !== "") ids.add(event.nodeId);
  }
  return ids;
}

async function main(): Promise<void> {
  const corpus = await openCorpusStore(TAG);
  try {
    const docs = await corpus.store.queryDocs();
    // The WIRE's view, not the raw row: the panel reads `renderStoredDoc`, so this must too.
    const wire = docs.map((stored) => {
      const rendered = renderStoredDoc(stored) as { dependsOn?: unknown; cites?: unknown };
      return {
        id: stored.id,
        doc: { dependsOn: strings(rendered.dependsOn), cites: strings(rendered.cites) },
      };
    });
    const nodes = depthFromWorkNodes(wire);

    const decisions = wire.flatMap((rowValue) => {
      const number = adrNumberOfArtifactId(rowValue.id);
      return number === null ? [] : [{ number, dependsOn: rowValue.doc.dependsOn }];
    });

    const before = evaluateDepthFromWork(nodes);
    const after = evaluateDepthFromWork(nodes, decisionSupportResolver(decisions));

    console.log(`${TAG} — ${wire.length} artifacts on the wire, ${decisions.length} of them decisions.`);
    console.log("");
    console.log(
      `  CORPUS maxDepth: before=${before.maxDepth} after=${after.maxDepth} · ` +
        `artifact-only after=${after.maxArtifactDepth} · ` +
        `reached before=${before.reached} after=${after.reached}+${after.decisionsReached} decisions`,
    );

    // WHAT THE CHANGE ACTUALLY BUYS, counted rather than claimed: how many decisions read
    // DIFFERENTLY once the walk continues through them. An `asset:adr-NNNN` pointer already landed
    // on the artifact twin before, so those were reachable all along; the gain is the decisions
    // reachable ONLY through a `doc:decisions/...` pointer, which used to be bedrock.
    let gained = 0;
    let deeper = 0;
    let shallower = 0;
    let unchanged = 0;
    for (const { number } of decisions) {
      const id = `adr-${String(number).padStart(4, "0")}`;
      const b = depthFromWorkOf(before, id);
      const a = depthFromWorkOf(after, id);
      if (b.state !== "reached" && a.state === "reached") gained += 1;
      else if (b.state === "reached" && a.state === "reached" && a.depth > b.depth) deeper += 1;
      else if (b.state === "reached" && a.state === "reached" && a.depth < b.depth) shallower += 1;
      else unchanged += 1;
    }
    console.log(
      `  DECISION READINGS that move: ${gained} newly reached, ${deeper} deeper, ` +
        `${shallower} shallower, ${unchanged} unchanged (of ${decisions.length})`,
    );
    console.log("");

    let scanned = 0;
    for (const file of newestTraces(40)) {
      const ids = readNodeIds(file);
      if (ids.size === 0) continue;
      const adrIds = [...ids].filter((id) => adrNumberOfArtifactId(id) !== null);
      if (adrIds.length === 0) continue;
      scanned += 1;
      if (scanned > 5) break;

      const tally = (verdict: ReturnType<typeof evaluateDepthFromWork>) => {
        let reached = 0;
        let unreachable = 0;
        let absent = 0;
        let maxDepth: number | null = null;
        for (const id of ids) {
          const reading = depthFromWorkOf(verdict, id);
          if (reading.state === "reached") {
            reached += 1;
            if (maxDepth === null || reading.depth > maxDepth) maxDepth = reading.depth;
          } else if (reading.state === "unreachable") unreachable += 1;
          else absent += 1;
        }
        return { reached, unreachable, absent, maxDepth };
      };

      const b = tally(before);
      const a = tally(after);
      console.log(`  ${path.basename(file, ".jsonl")} — ${ids.size} distinct reads, ${adrIds.length} of them decisions`);
      console.log(
        `    BEFORE (no resolver): ${b.reached} on-chain, ${b.unreachable} unreachable, ` +
          `${b.absent} not-an-artifact, deepest ${b.maxDepth ?? "none"}`,
      );
      console.log(
        `    AFTER  (resolver)   : ${a.reached} on-chain, ${a.unreachable} unreachable, ` +
          `${a.absent} not-an-artifact, deepest ${a.maxDepth ?? "none"}`,
      );
      const sample = adrIds.slice(0, 4);
      for (const id of sample) {
        console.log(
          `      ${id}: before=${JSON.stringify(depthFromWorkOf(before, id))} ` +
            `after=${JSON.stringify(depthFromWorkOf(after, id))}`,
        );
      }
    }
    if (scanned === 0) console.log("  no recent trace read a decision — nothing to compare.");
  } finally {
    await corpus.close();
  }
}

await main();
