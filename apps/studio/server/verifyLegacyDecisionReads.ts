// A ONE-SHOT LIVE MEASUREMENT for `traversal-panel-legacy-decision-reads-resolve`, deliberately kept
// out of `check:` / `probe:`: it answers "did the panel's reading actually move on the real traces
// this machine holds", which is a question about a LANDING, not a standing invariant. Its sibling
// `verify:manifest-edge-effect` is the same shape for ADR-0481 D1.
//
// ## WHAT IT MEASURES
//
// Before ADR-0403 dec 1 made a decision an ordinary Library row, an agent that wanted ADR-0311 opened
// `docs/decisions/0311-….md` with the file tool, and the recorder wrote the FILE as the node id. Today
// it writes `adr-0311`. The panel looks the recorded id up in the corpus, so every pre-migration
// decision read matched nothing and was counted ABSENT — a decision's whole subtree of depth withheld
// from the historical traces, which are 601 of this machine's 750.
//
// ## BOTH ARMS, ONE CORPUS READ, AND THAT IS NOT A CONVENIENCE
//
// The live corpus moves by more than these deltas between two runs, so a before/after taken as two
// invocations measures the corpus drifting as much as it measures the change. `main()` therefore reads
// `/api/assets` ONCE, builds ONE `KnowledgeDepthModel`, and reports both arms against it.
//
// The AFTER arm is the shipped `reportKnowledgeDepth` — the panel's own function, not a copy. The
// BEFORE arm reproduces the two lines this increment changed, and nothing else: the dedup keyed on the
// RAW recorded id, and a lookup that consults only `canonicalIds`. It is a historical reproduction
// confined to this file and must never be reached for as a resolver — the one resolver is
// `resolveDecisionSpelling`, and a second spelling of the rule is the exact failure the increment
// named.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

import { loadLocalSecrets } from '@storytree/drive';

import { buildKnowledgeDepth, reportKnowledgeDepth } from '../src/lib/knowledgeDepth';
import type { KnowledgeDepthModel } from '../src/lib/knowledgeDepth';
import type { TraversalEventEnvelope } from '../src/types';
import { createBackend } from './libraryBackend';

const TAG = 'verify-legacy-decision-reads';

/** The reading the panel gave a recorded id BEFORE this increment — see the header. */
function shippedReadingOf(model: KnowledgeDepthModel, id: string): string {
  if (model.status !== 'measured') return 'absent';
  const { verdict } = model;
  const canonical = verdict.canonicalIds.get(id) ?? id;
  const depth = verdict.depthById.get(canonical);
  if (depth !== undefined) return `placed:${depth}`;
  if (verdict.unlinkedIds.has(canonical)) return 'unlinked';
  if (verdict.knownIds.has(canonical)) return 'cyclic';
  return 'absent';
}

/** What the AFTER arm reports, reduced to the four figures the panel's chip prints. */
interface Arm {
  visited: number;
  placed: number;
  absent: number;
  deepest: number | null;
}

/** The BEFORE arm, computed the way the panel computed it: raw ids, raw lookup. */
function shippedArm(model: KnowledgeDepthModel, events: readonly TraversalEventEnvelope[]): Arm {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind === 'front_matter_read' || event.kind === 'full_payload_read') ids.add(event.nodeId);
  }
  let placed = 0;
  let absent = 0;
  let deepest: number | null = null;
  for (const id of ids) {
    const reading = shippedReadingOf(model, id);
    if (reading.startsWith('placed:')) {
      placed += 1;
      const depth = Number(reading.slice('placed:'.length));
      if (deepest === null || depth > deepest) deepest = depth;
    } else if (reading === 'absent') absent += 1;
  }
  return { visited: ids.size, placed, absent, deepest };
}

/**
 * The read events of one trace file, as the panel's replay composes them.
 *
 * The line is an ENVELOPE — `{v, event, grade, slot}` — so the read fields are one level down.
 * Reading the envelope's own keys finds no `kind` at all and reports an honest-looking zero, which is
 * the trap `verify-panel-decision-depth.ts` already documents.
 */
function readEventsOf(file: string): TraversalEventEnvelope[] {
  const events: TraversalEventEnvelope[] = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    let envelope: { event?: { kind?: unknown; nodeId?: unknown } };
    try {
      envelope = JSON.parse(line) as { event?: { kind?: unknown; nodeId?: unknown } };
    } catch {
      continue;
    }
    const event = envelope.event;
    if (event === undefined) continue;
    if (event.kind !== 'front_matter_read' && event.kind !== 'full_payload_read') continue;
    if (typeof event.nodeId !== 'string' || event.nodeId === '') continue;
    events.push({
      kind: event.kind,
      eventId: `${file}:${String(events.length)}`,
      sessionId: path.basename(file, '.jsonl'),
      at: new Date(0).toISOString(),
      visitId: `${file}:${String(events.length)}`,
      nodeId: event.nodeId,
    });
  }
  return events;
}

/** Every local trace, richest first — the population the panel's picker offers. */
function localTraces(): string[] {
  const dir = path.join(homedir(), '.storytree', 'traces');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(dir, name))
    .sort((left, right) => statSync(right).size - statSync(left).size);
}

async function main(): Promise<void> {
  loadLocalSecrets();
  // The PgBackend ignores these; they are the JsonBackend half of one shared options type. Pointed at
  // a temp directory rather than at the studio's own runtime store so a mis-selected store can never
  // write into a real one.
  const scratch = path.join(tmpdir(), TAG);
  const backend = createBackend({
    assetsFile: path.join(scratch, 'assets.json'),
    commentsFile: path.join(scratch, 'comments.json'),
    usersFile: path.join(scratch, 'users.json'),
    attestationsFile: path.join(scratch, 'attestations.json'),
  });

  const assets = await backend.listAssets();
  const model = buildKnowledgeDepth({ assets, assetsStatus: 'ready', assetsError: '' });
  if (model.status !== 'measured') {
    throw new Error(`${TAG} — the corpus did not read: ${model.reason}`);
  }
  console.log(
    `${TAG} — ONE corpus snapshot: ${String(assets.length)} rows on the wire, ` +
      `${String(model.verdict.decisionsScanned)} of them decisions, ` +
      `corpus maxDepth ${String(model.verdict.maxDepth)}.`,
  );
  console.log('');

  const files = localTraces();
  let moved = 0;
  let identical = 0;
  let empty = 0;
  let placedBefore = 0;
  let placedAfter = 0;
  let absentBefore = 0;
  let absentAfter = 0;

  for (const file of files) {
    const events = readEventsOf(file);
    if (events.length === 0) {
      empty += 1;
      continue;
    }
    const before = shippedArm(model, events);
    const report = reportKnowledgeDepth(events, model);
    if (report === null) throw new Error(`${TAG} — reportKnowledgeDepth returned null on a measured model`);
    const after: Arm = {
      visited: report.visited,
      placed: report.placed,
      absent: report.absent,
      deepest: report.maxDepth,
    };
    placedBefore += before.placed;
    placedAfter += after.placed;
    absentBefore += before.absent;
    absentAfter += after.absent;

    const same =
      before.visited === after.visited &&
      before.placed === after.placed &&
      before.absent === after.absent &&
      before.deepest === after.deepest;
    if (same) {
      identical += 1;
      continue;
    }
    moved += 1;
    // Only the traces that MOVED are printed by name: a list of the ~750 that did not is noise, and
    // the count of them is the claim that matters (the remap is a no-op on a modern trace).
    if (moved <= 12) {
      const render = (arm: Arm): string =>
        `placed ${String(arm.placed)}/${String(arm.visited)} · deepest ` +
        `${arm.deepest === null ? 'none' : String(arm.deepest)} · absent ${String(arm.absent)}`;
      console.log(`  ${path.basename(file, '.jsonl')} (${String(events.length)} reads)`);
      console.log(`    as shipped   ${render(before)}`);
      console.log(`    remapped     ${render(after)}`);
    }
  }

  console.log('');
  console.log(
    `  ${String(files.length)} local traces · ${String(empty)} carry no read event · ` +
      `${String(moved)} MOVED · ${String(identical)} byte-identical in both arms.`,
  );
  console.log(
    `  ACROSS EVERY TRACE: placed ${String(placedBefore)} -> ${String(placedAfter)} · ` +
      `absent ${String(absentBefore)} -> ${String(absentAfter)}.`,
  );
  if (moved > 12) console.log(`  (${String(moved - 12)} further moved traces not printed.)`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(`${TAG} — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
