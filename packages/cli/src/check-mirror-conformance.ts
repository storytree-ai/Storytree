/**
 * `pnpm check:mirror-conformance` — the cross-surface conformance harness
 * (verification-integrity-arc inc 2). A sibling of `check:boundaries` / `check:manifest`: wired
 * into `pnpm gate` and CI's `verify` job as a ROOT step, deliberately OUTSIDE the ADR-0195
 * affected-only narrowing. That placement is load-bearing — drift here is introduced by editing
 * EITHER surface, and the affected filter would run only the edited one's suite. This check has to
 * see both on every PR or it only fences half the class.
 *
 * WHAT IT PROVES. Two surfaces are required to serve the same `/api/*` payloads and are forbidden
 * to share code: the desktop backend re-composes `apps/studio/server/apiRouter.ts`'s routes verbatim
 * over its own seam and may never import the studio (ADR-0176's one-wired-backend rule). The
 * duplication is the DECISION; the drift it invites is the defect. So each surface is run in its OWN
 * process by its own probe over ONE shared input, and the two decoded payloads are compared here by
 * a third party. No surface imports the other, at build time or at run time — the harness encodes
 * the boundary rather than punching through it.
 *
 * THE INPUTS, one set per `MirrorInputSet` (a row names the set its two probes run over):
 *
 *   `docs-trees` — `GET /api/docs`, compared over two things:
 *     1. a synthetic FIXTURE built here, exercising the branches a corpus may not currently contain
 *        (an unresolvable lineage edge, `load_bearing: false`, an unterminated frontmatter block, a
 *        doc with no H1, an over-long first sentence, a nested Decisions doc, a non-`.md` file);
 *     2. the repo's REAL `docs/` tree, which catches whatever the corpus actually exercises and the
 *        fixture author didn't think of. Content changes can't destabilise it — the assertion is
 *        equality between two implementations over the same input, not against a recorded value.
 *
 *   `activity-fixtures` — `GET /api/activity`, compared over two synthetic fixtures. There is no
 *     "real corpus" arm here and that is structural, not an omission: this payload's real input is
 *     `events.node_claim` in Cloud SQL, and CI is DB-free. So the fixtures carry RAW claim rows and
 *     a FIXED `now`, which each probe folds through its own surface's re-composed fold — the grade
 *     defect is inside the assertion rather than upstream of it — and they cover both the populated
 *     shape (every ADR-0200 grade branch, the back-compat absent/unknown grade, a stale row both
 *     folds must drop) and the ADVISORY-ABSENCE shape (`null` layers, zero rows), which is the arm
 *     that catches a route emitting `[]` where its mirror emits `null`.
 *
 * FAIL-CLOSED, and never vacuous. A probe that dies, prints unparseable output, or returns an
 * EMPTY payload for a non-empty input is a FAILURE, not a skip: two silent surfaces agree
 * perfectly, and "a proof that cannot fail is not a proof" is the class this arc exists to fence.
 * The judge that owns the comparison rules is the pure {@link file://./mirror-conformance.ts}.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MIRRORS,
  compareMirrors,
  formatDivergences,
  projectActivityPayload,
  type Divergence,
  type Entry,
  type MirrorInputSet,
  type Probe,
} from "./mirror-conformance.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// ---------- the fixtures ----------

/**
 * Build the synthetic docs tree both probes walk. Deliberately covers the branches the real corpus
 * may not: an ADR whose lineage edge names no ADR on disk, an explicit `load_bearing: false`, an
 * unterminated frontmatter block, a doc with no H1, a first sentence past the excerpt cap, a
 * Decisions doc in a nested dir, a Reference doc in a nested dir, and a non-`.md` file that must
 * be skipped by both walks.
 */
function buildDocsFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "storytree-mirror-"));
  mkdirSync(join(dir, "decisions", "nested"), { recursive: true });
  mkdirSync(join(dir, "notes", "deep"), { recursive: true });

  const write = (rel: string, body: string): void => writeFileSync(join(dir, rel), body, "utf8");

  write(
    "decisions/0001-load-bearing-with-edges.md",
    "---\nstatus: accepted\ndecided: 2026-01-02\nload_bearing: true\nsupersedes: [2]\namends: [3]\n---\n" +
      "# ADR-0001: Load bearing with edges\n\nA decision that stands and reaches back.\n",
  );
  write(
    "decisions/0002-explicitly-not-load-bearing.md",
    "---\nstatus: superseded\nload_bearing: false\nsupersedes_in_part: [1]\n---\n" +
      "# ADR-0002: Explicitly not load bearing\n\nAn explicit false must read the same as an absent tag.\n",
  );
  write(
    "decisions/0003-edge-to-nowhere.md",
    "---\nstatus: accepted\namends: [9999]\n---\n" +
      "# ADR-0003: Edge to nowhere\n\nA lineage edge naming no ADR on disk is dropped, not rendered broken.\n",
  );
  write(
    "decisions/0004-unterminated-frontmatter.md",
    "---\nstatus: accepted\nload_bearing: true\n# ADR-0004: Unterminated\n\nThe block never closes.\n",
  );
  write("decisions/0005-no-heading.md", "---\nstatus: proposed\n---\nNo H1 at all; the filename is the title.\n");
  write(
    "decisions/0006-long-first-sentence.md",
    "---\nstatus: accepted\n---\n# ADR-0006: Long\n\n" +
      `${"A very long opening clause that keeps going and going ".repeat(8)}and finally stops.\n`,
  );
  write(
    "decisions/nested/0007-nested-decision.md",
    "---\nstatus: accepted\nload_bearing: true\n---\n# ADR-0007: Nested\n\nA Decisions doc below a subdirectory.\n",
  );
  write("open-questions.md", "# Open questions\n\nA reference doc with no frontmatter at all.\n");
  write("notes/deep/handbook.md", "# Handbook\n\nA nested reference doc; groups as Reference, not Decisions.\n");
  write("decisions/not-markdown.txt", "Both walks must skip a non-.md file.\n");
  return dir;
}

/**
 * Build the two synthetic `/api/activity` fixtures both probes fold. Each carries RAW
 * `events.node_claim` rows plus a FIXED `now` (so the 2 h stale-reclaim window is decided by data,
 * never by wall-clock), and the two already-folded pass-through layers.
 *
 * The row set covers every branch the two re-composed folds have to agree on: each ADR-0200 grade,
 * the back-compat normalisations (grade ABSENT and grade NULL are both the work claim — the exact
 * shape a re-composed SELECT that dropped the column produces), an UNRECOGNISED grade that must
 * normalise rather than pass through, a row past the stale window that BOTH folds must drop, and
 * several sessions on one unit (the composite PK the graded ledger allows).
 */
function buildActivityFixtures(): { dir: string; inputs: { label: string; arg: string }[] } {
  const dir = mkdtempSync(join(tmpdir(), "storytree-activity-"));
  const at = (hhmm: string): string => `2026-07-29T${hhmm}:00.000Z`;
  const fixtures: { label: string; file: string; body: unknown }[] = [
    {
      label: "populated",
      file: "activity-populated.json",
      body: {
        now: at("12:00"),
        claimRows: [
          { unit_id: "cli", session_id: "s-work", branch: "claude/a", intent: "orchestrate",
            grade: "work", claimed_at: at("11:00"), heartbeat_at: at("11:59") },
          { unit_id: "cli", session_id: "s-explore", branch: "claude/b", intent: "reading",
            grade: "exploring", claimed_at: at("11:10"), heartbeat_at: at("11:58") },
          { unit_id: "cli", session_id: "s-wait", branch: "claude/c", intent: "queued",
            grade: "waiting", claimed_at: at("11:20"), heartbeat_at: at("11:57") },
          // Grade ABSENT — the pre-grade row, and the shape a SELECT that lost the column yields.
          { unit_id: "studio", session_id: "s-legacy", branch: "claude/d", intent: "pre-grade",
            claimed_at: at("11:30"), heartbeat_at: at("11:56") },
          // Grade NULL — the same fact as the DB spells it.
          { unit_id: "studio", session_id: "s-null", branch: "claude/e", intent: "null grade",
            grade: null, claimed_at: at("11:35"), heartbeat_at: at("11:55") },
          // Unrecognised — must normalise to `work`, never reach the wire verbatim.
          { unit_id: "studio", session_id: "s-bogus", branch: "claude/f", intent: "bad grade",
            grade: "sideways", claimed_at: at("11:40"), heartbeat_at: at("11:54") },
          // STALE: heartbeat 6.5 h back, past the 2 h reclaim window — both folds must DROP it.
          { unit_id: "library", session_id: "s-stale", branch: "claude/g", intent: "crashed",
            grade: "work", claimed_at: at("05:00"), heartbeat_at: at("05:30") },
        ],
        builds: [
          { unitId: "cli", tier: "story", runId: "run-1", at: at("11:58"), phase: "IMPLEMENT" },
        ],
        departures: [
          { unitId: "notice-board", sessionId: "s-gone", branch: "claude/h", at: at("11:50") },
        ],
      },
    },
    {
      // The ADVISORY-ABSENCE arm: both surfaces promise `null` (never a 503, never `[]`) when a
      // layer cannot be answered. Without this input, a route that swapped `null` for `[]` would
      // agree with its mirror on every populated fixture.
      label: "advisory-absence",
      file: "activity-absent.json",
      body: { now: at("12:00"), claimRows: [], builds: null, departures: null },
    },
  ];
  const inputs: { label: string; arg: string }[] = [];
  for (const f of fixtures) {
    const path = join(dir, f.file);
    writeFileSync(path, JSON.stringify(f.body), "utf8");
    inputs.push({ label: f.label, arg: path });
  }
  return { dir, inputs };
}

/**
 * Assemble every input set, and the cleanup that removes what was written to disk. Each
 * {@link MirrorInputSet} is built ONCE and shared by every row that names it, so two mirrors over
 * the same input are compared over the identical bytes.
 */
function buildInputSets(): {
  sets: Record<MirrorInputSet, { label: string; arg: string }[]>;
  cleanup: () => void;
} {
  const docsFixture = buildDocsFixture();
  const activity = buildActivityFixtures();
  return {
    sets: {
      "docs-trees": [
        { label: "fixture", arg: docsFixture },
        { label: "docs/", arg: join(repoRoot, "docs") },
      ],
      "activity-fixtures": activity.inputs,
    },
    cleanup: () => {
      rmSync(docsFixture, { recursive: true, force: true });
      rmSync(activity.dir, { recursive: true, force: true });
    },
  };
}

// ---------- probing ----------

/** A probe failure — reported as a conformance FAILURE, never as a skip. */
class ProbeError extends Error {}

/**
 * Decode one probe's payload for one input into comparable entries — the shape half of the
 * {@link MirrorInputSet} protocol.
 *
 * `activity-fixtures` probes print the route's response body VERBATIM and the projection happens
 * HERE, on the third party, so the two probes cannot drift in how they reshape what they measured.
 * A payload this cannot decode is a ProbeError — fail-closed, exactly like a probe that died.
 */
function decodePayload(probe: Probe, inputs: MirrorInputSet, payload: unknown, arg: string): Entry[] {
  switch (inputs) {
    case "docs-trees":
      if (!Array.isArray(payload)) throw new ProbeError(`${probe.file} returned no array for ${arg}`);
      return payload as Entry[];
    case "activity-fixtures":
      try {
        return projectActivityPayload(payload);
      } catch (err) {
        throw new ProbeError(`${probe.file} returned an unusable payload for ${arg}: ${(err as Error).message}`);
      }
  }
}

/**
 * Run one surface's probe over every input, in that surface's own app dir so its bare
 * specifiers resolve through its own `node_modules`. Returns the decoded `{ input: Entry[] }` map.
 */
function runProbe(probe: Probe, inputs: MirrorInputSet, args: string[]): Record<string, Entry[]> {
  const file = join(repoRoot, probe.file);
  if (!existsSync(file)) throw new ProbeError(`probe module not found: ${probe.file}`);

  const result = spawnSync(process.execPath, ["--import", "tsx", file, ...args], {
    cwd: join(repoRoot, probe.appDir),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error !== undefined) throw new ProbeError(`${probe.file} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new ProbeError(
      `${probe.file} exited ${result.status ?? "(signal " + String(result.signal) + ")"}\n${result.stderr?.trim() ?? ""}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new ProbeError(`${probe.file} printed unparseable output:\n${result.stdout.slice(0, 500)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProbeError(`${probe.file} must print an object keyed by input`);
  }

  const out: Record<string, Entry[]> = {};
  for (const arg of args) {
    if (!(arg in (parsed as Record<string, unknown>))) {
      throw new ProbeError(`${probe.file} returned nothing for ${arg}`);
    }
    out[arg] = decodePayload(probe, inputs, (parsed as Record<string, unknown>)[arg], arg);
  }
  return out;
}

// ---------- the check ----------

function main(): void {
  const { sets, cleanup } = buildInputSets();

  const failures: string[] = [];
  try {
    for (const target of MIRRORS) {
      const { spec } = target;
      const inputs = sets[target.inputs];
      const args = inputs.map((i) => i.arg);
      let reference: Record<string, Entry[]>;
      let mirror: Record<string, Entry[]>;
      try {
        reference = runProbe(target.reference, target.inputs, args);
        mirror = runProbe(target.mirror, target.inputs, args);
      } catch (err) {
        // Fail CLOSED: a probe that cannot run proves nothing, and reporting it as a pass would
        // make this gate exactly the kind of check that can never go red.
        failures.push(`✗ ${spec.surface}: probe failure — ${(err as Error).message}`);
        continue;
      }

      for (const { label, arg } of inputs) {
        const ref = reference[arg] ?? [];
        const mir = mirror[arg] ?? [];
        // Never vacuous: two empty payloads agree perfectly. Every input here is known non-empty,
        // so an empty reference means the probe read the wrong thing, not that the input is empty.
        // The advisory-absence activity fixture still projects its three `layer:` markers, so even
        // the all-null arm cannot pass by measuring nothing.
        if (ref.length === 0) {
          failures.push(
            `✗ ${spec.surface}: ${spec.reference} returned an EMPTY payload for ${label} (${arg}) — ` +
              "a vacuous comparison is not a pass",
          );
          continue;
        }
        const divergences: Divergence[] = compareMirrors(ref, mir, spec, label);
        if (divergences.length > 0) failures.push(formatDivergences(spec, divergences));
        else {
          console.log(
            `✓ ${spec.surface}: ${spec.mirror} matches ${spec.reference} over ${label} (${ref.length} entries)`,
          );
        }
      }
    }
  } finally {
    cleanup();
  }

  if (failures.length > 0) {
    console.error(`\n✗ cross-surface mirror conformance: ${failures.length} failing comparison(s)\n`);
    for (const f of failures) console.error(`${f}\n`);
    console.error(
      "A surface that re-composes another's route must serve the SAME payload. Re-compose the\n" +
        "missing logic verbatim into the mirror (never import the reference — ADR-0176), or, if the\n" +
        "difference is deliberate, declare it in that mirror's `referenceOnlyFields` allowlist in\n" +
        "packages/cli/src/mirror-conformance.ts.",
    );
    process.exit(1);
  }
  console.log("✓ cross-surface mirror conformance: every mirrored payload matches its reference");
}

main();
