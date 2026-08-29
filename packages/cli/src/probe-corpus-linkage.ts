/**
 * `pnpm probe:corpus-linkage` — WHO IS IN THE JOINED DEPENDENCY GRAPH, WHO IS NOT, AND WHO READS THEM.
 *
 * `unlinked-corpus-half-arc` increment 01: the cohort split must be reproducible from a committed
 * verb rather than quoted from a session's transcript (end state 1), and every cohort must carry a
 * MEASURED read record with its floors declared (end state 2). This is that verb.
 *
 * **A DIAGNOSTIC, NOT A GATE RUNG.** An unlinked artifact is not a defect — its disposition
 * (LINK / RETIRE / LEAVE AND FIX THE DENOMINATOR) is the owner's call. Nothing here is a repo
 * invariant, so this is a `probe:` and must never be renamed to `check:`, which the gate plan's
 * unplanned-check guard picks up by prefix. Its read half is also a property of ONE LAPTOP's
 * history, which is `probe:decision-baseline`'s stated reason for the same choice: wiring it into
 * the gate would turn "this box has a short history" into a red.
 *
 * ## THIS FILE IS THE ONLY HALF THAT TOUCHES THE WORLD
 *
 * Every number is computed by `corpus-linkage.ts`, `corpus-read-record.ts` and `corpus-cohorts.ts`,
 * which are pure. This half gathers four populations and hands them over: the live corpus, the
 * traversal trace store, the host transcripts, and the agent manifests.
 *
 * ## IT CROSS-CHECKS ITSELF AGAINST THE JUDGE, AND SAYS SO
 *
 * The classification is trustworthy only if it reads the same graph `evaluateDepthFromWork` reads.
 * So this runs that judge in the SAME process over the SAME rows with the same
 * `decisionSupportResolver`, prints its headline denominators, and asserts the invariant that ties
 * the two together: a node the judge reached at depth >= 1 was reached THROUGH an authored edge, so
 * it must carry an in-edge here. A violation voids every cohort figure, so it exits 1.
 *
 * `--json <path>` writes the full per-node record for a downstream join.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { openCorpusStore } from "@storytree/drive";
import { resolveTranscriptDir } from "@storytree/context-traversal-transcript";
import {
  adrDocId,
  decisionSupportResolver,
  depthFromWorkNodes,
  evaluateDepthFromWork,
  isDecisionNodeId,
  parseDecisionPointer,
  renderCombinedNodeId,
} from "@storytree/library";
import { renderStoredDoc } from "@storytree/library/store";

import { buildCohorts, coReadNeighbours, RECORD_TIERS } from "./corpus-cohorts.js";
import { evaluateCorpusLinkage, linkageNodeId, type LinkageSource } from "./corpus-linkage.js";
import {
  foldReadObservations,
  readFloorNotes,
  scrapeArtifactReads,
  type ReadObservation,
} from "./corpus-read-record.js";
import { loadProbeDecisions } from "./probe-decisions.js";

const TAG = "probe:corpus-linkage";

/** One gathered read population, plus the denominators that say whether it read anything. */
interface GatheredReads {
  readonly observations: readonly ReadObservation[];
  /** Session id → every artifact that session read. The co-occurrence substrate. */
  readonly bySession: ReadonlyMap<string, ReadonlySet<string>>;
  readonly filesScanned: number;
  readonly filesCarrying: number;
  readonly declined: ReadonlyMap<string, number>;
}

/**
 * A read event's artifact id, with a decision canonicalised onto its row.
 *
 * The trace store records a decision read under whichever spelling the reader used —
 * `doc:decisions/NNNN-….md` from a file read, `adr-NNNN` from a store read — and
 * `decision-reads.ts` deliberately does not unify them at write time (rewriting historical ids
 * would break the ingest's idempotence). A join against the corpus must therefore unify them HERE,
 * or one decision's reads land on two keys and both look thinner than the decision is.
 */
function canonicalReadId(nodeId: string): string {
  const pointer = nodeId.startsWith("doc:") || nodeId.startsWith("asset:") ? nodeId : `asset:${nodeId}`;
  const decision = parseDecisionPointer(pointer);
  return decision === null ? nodeId : adrDocId(decision.number);
}

/** THE TRAVERSAL TRACE STORE — the live CLI observer's record, reaching furthest back. */
function gatherTraceReads(): GatheredReads {
  const dir = path.join(os.homedir(), ".storytree", "traces");
  const observations: ReadObservation[] = [];
  const bySession = new Map<string, Set<string>>();
  let filesScanned = 0;
  let filesCarrying = 0;
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((file) => file.endsWith(".jsonl"));
  } catch {
    return { observations, bySession, filesScanned: 0, filesCarrying: 0, declined: new Map() };
  }
  for (const file of files) {
    filesScanned += 1;
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    let carried = false;
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const event = (parsed as { event?: Record<string, unknown> } | null)?.event;
      if (event === undefined || event === null) continue;
      const kind = event["kind"];
      if (kind !== "front_matter_read" && kind !== "full_payload_read") continue;
      const nodeId = event["nodeId"];
      const at = event["at"];
      const sessionId = event["sessionId"];
      if (typeof nodeId !== "string" || typeof at !== "string" || typeof sessionId !== "string") continue;
      const id = canonicalReadId(nodeId);
      observations.push({ id, at, sessionId });
      (bySession.get(sessionId) ?? bySession.set(sessionId, new Set()).get(sessionId)!).add(id);
      carried = true;
    }
    if (carried) filesCarrying += 1;
  }
  return { observations, bySession, filesScanned, filesCarrying, declined: new Map() };
}

/** THE HOST TRANSCRIPTS — reads recovered by argv shape, the general form of the decision scraper. */
function gatherTranscriptReads(): GatheredReads {
  const root = resolveTranscriptDir();
  const observations: ReadObservation[] = [];
  const bySession = new Map<string, Set<string>>();
  const declined = new Map<string, number>();
  let filesScanned = 0;
  let filesCarrying = 0;
  const files: string[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(root);
  } catch {
    return { observations, bySession, filesScanned: 0, filesCarrying: 0, declined };
  }
  for (const entry of entries) {
    const full = path.join(root, entry);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
      for (const file of fs.readdirSync(full)) if (file.endsWith(".jsonl")) files.push(path.join(full, file));
    } catch {
      continue;
    }
  }
  for (const file of files) {
    filesScanned += 1;
    let raw: string;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // The cheap prefilter, and it must stay WIDER than the scraper's own rule — a prefilter narrower
    // than its matcher is a green that verified nothing.
    if (!raw.includes("library artifact")) continue;
    filesCarrying += 1;
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim() === "") continue;
      let parsed: { message?: { content?: unknown }; timestamp?: unknown; sessionId?: unknown } | null;
      try {
        parsed = JSON.parse(line) as typeof parsed;
      } catch {
        continue;
      }
      const content = parsed?.message?.content;
      if (!Array.isArray(content)) continue;
      const at = parsed?.timestamp;
      if (typeof at !== "string") continue;
      // The line's OWN id is the host CONTEXT WINDOW — the grain a "how many sittings" question
      // needs, and the one `decision-reads.ts` uses for the same reason.
      const windowId = typeof parsed?.sessionId === "string" ? parsed.sessionId : "(unlabelled)";
      for (const block of content) {
        const typed = block as { type?: unknown; input?: { command?: unknown } } | null;
        if (typed?.type !== "tool_use") continue;
        const command = typed.input?.command;
        if (typeof command !== "string") continue;
        const scrape = scrapeArtifactReads(command);
        for (const read of scrape.reads) {
          const id = canonicalReadId(read.id);
          observations.push({ id, at, sessionId: windowId });
          (bySession.get(windowId) ?? bySession.set(windowId, new Set()).get(windowId)!).add(id);
        }
        for (const verb of scrape.declinedVerbs) declined.set(verb, (declined.get(verb) ?? 0) + 1);
      }
    }
  }
  return { observations, bySession, filesScanned, filesCarrying, declined };
}

/**
 * Every artifact an AGENT MANIFEST injects — the three refList fields the assembled agent view is
 * built from, plus the per-step refs.
 *
 * READ OFF THE RAW ROW, because that is where `renderAgentDigest` reads them: the RENDERED wire
 * nests a structured kind's per-kind fields under `fields`, so a reader taking the wire's top level
 * finds none of them and reports a confident, plausible zero. Measured here first — the wire read
 * found 24 manifest targets where the raw row holds 116.
 */
function agentManifestTargets(stored: readonly { id: string; kind: string; doc: unknown }[]): {
  readonly targets: ReadonlyMap<string, ReadonlySet<string>>;
  readonly agents: number;
} {
  const targets = new Map<string, Set<string>>();
  let agents = 0;
  const add = (raw: unknown, agent: string): void => {
    if (typeof raw !== "string") return;
    const id = raw.replace(/^asset:/, "");
    (targets.get(id) ?? targets.set(id, new Set()).get(id)!).add(agent);
  };
  for (const row of stored) {
    if (row.kind !== "agent") continue;
    agents += 1;
    const top = (typeof row.doc === "object" && row.doc !== null ? row.doc : {}) as Record<string, unknown>;
    const nested = (top["fields"] ?? {}) as Record<string, unknown>;
    const bag: Record<string, unknown> = { ...nested, ...top };
    for (const field of ["context", "rules", "antiPatterns"]) {
      const value = bag[field];
      if (Array.isArray(value)) for (const entry of value) add(entry, row.id);
    }
    const steps = bag["stepRefs"];
    if (Array.isArray(steps)) {
      for (const step of steps) {
        const refs = (step as Record<string, unknown> | null)?.["refs"];
        if (Array.isArray(refs)) for (const entry of refs) add(entry, row.id);
      }
    }
  }
  return { targets, agents };
}

function jsonPathArg(argv: readonly string[]): string | null {
  const index = argv.indexOf("--json");
  if (index === -1) return null;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? null : value;
}

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const jsonPath = jsonPathArg(process.argv.slice(2));
  const corpus = await openCorpusStore(TAG);
  try {
    // ONE bulk read for a whole-corpus question — ADR-0345's ~10x shape.
    const stored = await corpus.store.queryDocs();

    // The RENDERED wire: what a reader actually meets. A field that does not survive rendering is
    // invisible to a reader too, so an edge that does not cross it is not a link anyone can follow.
    const rows: LinkageSource[] = stored.map((row) => ({
      id: row.id,
      kind: row.kind,
      doc: renderStoredDoc(row),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
    const rawRows: LinkageSource[] = stored.map((row) => ({
      id: row.id,
      kind: row.kind,
      doc: row.doc,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    const verdict = evaluateCorpusLinkage(rows);
    const rawVerdict = evaluateCorpusLinkage(rawRows);
    const trace = gatherTraceReads();
    const transcript = gatherTranscriptReads();
    const traceReads = foldReadObservations(trace.observations);
    const transcriptReads = foldReadObservations(transcript.observations);
    const manifest = agentManifestTargets(stored);

    console.log(`${TAG} — ${verdict.rowsScanned} stored rows, read through the RENDERED wire.`);
    console.log("");
    console.log("THE POPULATION — the denominator, stated rather than assumed");
    console.log(
      `  ${verdict.rowsScanned} rows collapse to ${verdict.population} joined nodes: ` +
        `${verdict.decisionRows} are \`adr-NNNN\` rows, which ARE the decision nodes (ADR-0403 dec 1) ` +
        `rather than a tier standing beside them.`,
    );
    console.log(
      `  ⚠ A census reporting "${verdict.population - verdict.decisionRows} artifacts + ` +
        `${verdict.decisionRows} decisions = ${verdict.population + verdict.decisionRows} nodes" counts ` +
        `the decision tier TWICE, and understates every ratio over it by ` +
        `${pct(verdict.decisionRows, verdict.population + verdict.decisionRows)}.`,
    );
    console.log("");
    console.log("THE HEADLINE");
    console.log(
      `  linked: ${verdict.linked}   unlinked: ${verdict.unlinked} ` +
        `(${pct(verdict.unlinked, verdict.population)} of ${verdict.population}) over ` +
        `${verdict.walkableEdges} distinct walkable edges`,
    );
    console.log(
      rawVerdict.unlinked === verdict.unlinked && rawVerdict.population === verdict.population
        ? "  the RAW rows and the wire agree on both figures."
        : `  ⚠ the RAW rows disagree with the wire: ${rawVerdict.unlinked} unlinked of ` +
          `${rawVerdict.population}. Run \`pnpm probe:depth-from-work\`, which owns that diff.`,
    );
    const recordNodes = verdict.nodes.filter((node) => RECORD_TIERS.has(node.kind));
    const knowledgeNodes = verdict.nodes.filter((node) => !RECORD_TIERS.has(node.kind));
    const recordUnlinked = recordNodes.filter((node) => node.edgeFreeReason !== null).length;
    const knowledgeUnlinked = knowledgeNodes.filter((node) => node.edgeFreeReason !== null).length;
    console.log(
      `  record tiers    (${[...RECORD_TIERS].sort().join(", ")}): ${recordUnlinked} of ` +
        `${recordNodes.length} unlinked (${pct(recordUnlinked, recordNodes.length)})`,
    );
    console.log(
      `  knowledge tiers (everything else): ${knowledgeUnlinked} of ${knowledgeNodes.length} ` +
        `unlinked (${pct(knowledgeUnlinked, knowledgeNodes.length)}) — the single ratio hides this split`,
    );

    console.log("");
    console.log(
      `THE READ RECORD — two sources, SIDE BY SIDE and never summed (they overlap by construction)`,
    );
    console.log(
      `  traces:      ${trace.filesScanned} files (${trace.filesCarrying} carrying reads), ` +
        `${trace.observations.length} reads of ${traceReads.size} artifacts by ${trace.bySession.size} sessions`,
    );
    console.log(
      `  transcripts: ${transcript.filesScanned} files (${transcript.filesCarrying} carrying the hint), ` +
        `${transcript.observations.length} reads of ${transcriptReads.size} artifacts by ` +
        `${transcript.bySession.size} context windows`,
    );
    console.log(`  EVERY ZERO BELOW IS A FLOOR, NOT AN ABSENCE:`);
    for (const note of readFloorNotes()) console.log(`    · ${note}`);
    const declined = [...transcript.declined.entries()].sort((a, b) => b[1] - a[1]);
    console.log(
      `  the transcript scrape DECLINED (counted, never swallowed): ` +
        `${declined.map(([verb, count]) => `${verb}=${String(count)}`).join("  ")}`,
    );

    const cohorts = buildCohorts(verdict.nodes, traceReads, transcriptReads, new Set(manifest.targets.keys()));
    console.log("");
    console.log("THE COHORTS — every unlinked node, grouped by WHY it carries no edge");
    console.log(
      `  ${"cohort".padEnd(46)}${"nodes".padStart(6)}${"read".padStart(6)}${"%".padStart(8)}` +
        `${"tr-rd".padStart(7)}${"ts-rd".padStart(7)}${"sess".padStart(6)}${"agent".padStart(6)}  last read`,
    );
    for (const cohort of cohorts) {
      console.log(
        `  ${cohort.key.padEnd(46)}${String(cohort.nodes.length).padStart(6)}` +
          `${String(cohort.observedNodes).padStart(6)}${pct(cohort.observedNodes, cohort.nodes.length).padStart(8)}` +
          `${String(cohort.trace.reads).padStart(7)}${String(cohort.transcript.reads).padStart(7)}` +
          `${String(Math.max(cohort.trace.sessions, cohort.transcript.sessions)).padStart(6)}` +
          `${String(cohort.inAgentManifest).padStart(6)}  ` +
          `${[cohort.trace.lastAt, cohort.transcript.lastAt].sort().at(-1)?.slice(0, 10) || "NEVER OBSERVED"}`,
      );
    }
    console.log(
      `  columns: read/% = seen by EITHER source · tr-rd/ts-rd = raw reads per source · ` +
        `sess = the larger source's distinct sessions · agent = members an AGENT MANIFEST injects`,
    );

    console.log("");
    console.log("PURPOSE, READ OFF CO-OCCURRENCE — what else the same session read");
    for (const cohort of cohorts) {
      if (cohort.observedNodes === 0) continue;
      const memberIds = new Set(cohort.nodes.map((node) => node.rowId));
      const neighbours = coReadNeighbours(memberIds, trace.bySession, 5);
      if (neighbours.length === 0) continue;
      console.log(
        `  ${cohort.key}: ${neighbours.map((n) => `${n.id}(${String(n.sessions)})`).join("  ")}`,
      );
    }

    // ------------------------------------------------------------------------------------------
    // THE CROSS-CHECK. Without it every figure above is an unverified reconstruction.
    // ------------------------------------------------------------------------------------------
    const { adrs, parseErrors } = await loadProbeDecisions(TAG);
    if (parseErrors.length > 0) {
      console.error("");
      console.error(`${TAG} — ${parseErrors.length} problem(s) reading the decision log:`);
      for (const line of parseErrors) console.error(`  ${line}`);
      process.exitCode = 1;
      return;
    }
    const judge = evaluateDepthFromWork(
      depthFromWorkNodes(rows.map((row) => ({ id: row.id, doc: row.doc }))),
      decisionSupportResolver(adrs),
    );
    console.log("");
    console.log("CROSS-CHECK against `evaluateDepthFromWork` — the same rows, the same resolver");
    console.log(
      `  judge: ${judge.anchors} anchors, ${judge.reached} artifact(s) + ${judge.decisionsReached} ` +
        `decision(s) reached = ${judge.reached + judge.decisionsReached}, deepest ${judge.maxDepth}` +
        (judge.deepestId === null ? "" : ` (${renderCombinedNodeId(judge.deepestId)})`),
    );

    const byNodeId = new Map(verdict.nodes.map((node) => [node.nodeId, node]));
    const violations: string[] = [];
    for (const [id, depth] of judge.depthById) {
      if (depth < 1) continue;
      const nodeId = isDecisionNodeId(id) ? id : linkageNodeId(id);
      const node = byNodeId.get(nodeId);
      if (node === undefined) {
        violations.push(`  ${id}: judge reached it at depth ${String(depth)}; no such node here`);
      } else if (node.inDegree === 0) {
        violations.push(`  ${id}: judge reached it at depth ${String(depth)}; in-degree 0 here`);
      }
    }
    if (violations.length > 0) {
      console.error("");
      console.error(
        `${TAG} FAIL — ${violations.length} node(s) the judge reached through an edge that this ` +
          `reconstruction shows as pointed-at by nothing. The two are not reading one graph, so every ` +
          `cohort figure above is void:`,
      );
      for (const line of violations.slice(0, 20)) console.error(line);
      process.exitCode = 1;
      return;
    }
    console.log(
      `  agreement: all ${judge.depthById.size} node(s) the judge reached are consistent with this ` +
        `graph — every one at depth >= 1 carries an in-edge here.`,
    );
    const anchorOnly = verdict.nodes.filter(
      (node) => node.edgeFreeReason === "points-outside-the-corpus" && node.anchorOut > 0,
    ).length;
    console.log(
      `  the one deliberate divergence: ${anchorOnly} node(s) point ONLY at story/capability units. ` +
        `The judge SEEDS on those; this reading calls them unlinked, because the unit they name is in ` +
        `the work hierarchy and not in this graph. Neither is wrong about its own question.`,
    );
    console.log(
      `  agent manifests: ${manifest.agents} agents inject ${manifest.targets.size} distinct artifacts ` +
        `through \`context\`/\`rules\`/\`antiPatterns\`/\`stepRefs\` — fields NO dependency walk reads.`,
    );

    if (jsonPath !== null) {
      const payload = verdict.nodes.map((node) => ({
        ...node,
        traceReads: traceReads.get(node.rowId)?.reads ?? 0,
        transcriptReads: transcriptReads.get(node.rowId)?.reads ?? 0,
        lastReadAt: [traceReads.get(node.rowId)?.lastAt, transcriptReads.get(node.rowId)?.lastAt]
          .filter((value): value is string => value !== undefined)
          .sort()
          .at(-1) ?? null,
        agentManifest: [...(manifest.targets.get(node.rowId) ?? [])],
      }));
      fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      console.log("");
      console.log(`  wrote ${payload.length} node record(s) to ${jsonPath}`);
    }

    console.log("");
    console.log(
      `${TAG} — a classification, not a verdict. No cohort here is a defect until the owner says ` +
        `which of LINK / RETIRE / LEAVE-AND-FIX-THE-DENOMINATOR it belongs to.`,
    );
  } finally {
    await corpus.close();
  }
}

main().catch((err: unknown) => {
  // Fail-closed: a linkage census over a corpus nobody read is not a census.
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
