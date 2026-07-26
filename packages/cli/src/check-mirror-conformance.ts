/**
 * `pnpm check:mirror-conformance` — the cross-surface conformance harness
 * (verification-integrity-arc inc 2). A sibling of `check:boundaries` / `check:manifest`: wired
 * into `pnpm gate` and CI's `verify` job as a ROOT step, deliberately OUTSIDE the ADR-0195
 * affected-only narrowing. That placement is load-bearing — drift here is introduced by editing
 * EITHER surface, and the affected filter would run only the edited one's suite. This check has to
 * see both on every PR or it only fences half the class.
 *
 * WHAT IT PROVES. Two surfaces are required to serve the same `GET /api/docs` payload and are
 * forbidden to share code: `apps/desktop/src/backend/boot-read-routes.ts` re-composes
 * `apps/studio/server/apiRouter.ts`'s docs walk verbatim over its own `node:fs` and may never
 * import the studio (ADR-0176's one-wired-backend rule). The duplication is the DECISION; the
 * drift it invites is the defect. So each surface is run in its OWN process by its own probe over
 * ONE shared input, and the two decoded payloads are compared here by a third party. No surface
 * imports the other, at build time or at run time — the harness encodes the boundary rather than
 * punching through it.
 *
 * THE INPUTS. Every mirror is compared over two things:
 *   1. a synthetic FIXTURE built here, exercising the branches a corpus may not currently contain
 *      (an unresolvable lineage edge, `load_bearing: false`, an unterminated frontmatter block, a
 *      doc with no H1, an over-long first sentence, a nested Decisions doc, a non-`.md` file);
 *   2. the repo's REAL `docs/` tree, which catches whatever the corpus actually exercises and the
 *      fixture author didn't think of. Content changes can't destabilise it — the assertion is
 *      equality between two implementations over the same input, not against a recorded value.
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
  type Divergence,
  type Entry,
  type Probe,
} from "./mirror-conformance.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

// ---------- the fixture ----------

/**
 * Build the synthetic docs tree both probes walk. Deliberately covers the branches the real corpus
 * may not: an ADR whose lineage edge names no ADR on disk, an explicit `load_bearing: false`, an
 * unterminated frontmatter block, a doc with no H1, a first sentence past the excerpt cap, a
 * Decisions doc in a nested dir, a Reference doc in a nested dir, and a non-`.md` file that must
 * be skipped by both walks.
 */
function buildFixture(): string {
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

// ---------- probing ----------

/** A probe failure — reported as a conformance FAILURE, never as a skip. */
class ProbeError extends Error {}

/**
 * Run one surface's probe over every input dir, in that surface's own app dir so its bare
 * specifiers resolve through its own `node_modules`. Returns the decoded `{ dir: Entry[] }` map.
 */
function runProbe(probe: Probe, dirs: string[]): Record<string, Entry[]> {
  const file = join(repoRoot, probe.file);
  if (!existsSync(file)) throw new ProbeError(`probe module not found: ${probe.file}`);

  const result = spawnSync(process.execPath, ["--import", "tsx", file, ...dirs], {
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
    throw new ProbeError(`${probe.file} must print an object keyed by docs dir`);
  }

  const out: Record<string, Entry[]> = {};
  for (const dir of dirs) {
    const payload = (parsed as Record<string, unknown>)[dir];
    if (!Array.isArray(payload)) throw new ProbeError(`${probe.file} returned no array for ${dir}`);
    out[dir] = payload as Entry[];
  }
  return out;
}

// ---------- the check ----------

function main(): void {
  const fixture = buildFixture();
  const realDocs = join(repoRoot, "docs");
  const inputs: { label: string; dir: string }[] = [
    { label: "fixture", dir: fixture },
    { label: "docs/", dir: realDocs },
  ];
  const dirs = inputs.map((i) => i.dir);

  const failures: string[] = [];
  try {
    for (const target of MIRRORS) {
      const { spec } = target;
      let reference: Record<string, Entry[]>;
      let mirror: Record<string, Entry[]>;
      try {
        reference = runProbe(target.reference, dirs);
        mirror = runProbe(target.mirror, dirs);
      } catch (err) {
        // Fail CLOSED: a probe that cannot run proves nothing, and reporting it as a pass would
        // make this gate exactly the kind of check that can never go red.
        failures.push(`✗ ${spec.surface}: probe failure — ${(err as Error).message}`);
        continue;
      }

      for (const { label, dir } of inputs) {
        const ref = reference[dir] ?? [];
        const mir = mirror[dir] ?? [];
        // Never vacuous: two empty payloads agree perfectly. Every input here is known non-empty,
        // so an empty reference means the probe walked the wrong tree, not that the tree is empty.
        if (ref.length === 0) {
          failures.push(
            `✗ ${spec.surface}: ${spec.reference} returned an EMPTY payload for ${label} (${dir}) — ` +
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
    rmSync(fixture, { recursive: true, force: true });
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
