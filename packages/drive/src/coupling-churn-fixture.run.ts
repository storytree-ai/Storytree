import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { gitAbsorbed, LANDING_SUBJECT, parseCommitLog, RESYNC_SUBJECT, type CommitRec } from "./coupling-churn.js";

/**
 * REGENERATE `coupling-churn.fixture.json` — the frozen capture the coupling-churn CALIBRATION runs
 * against (`coupling-churn.calibration.test.ts`).
 *
 *   node --import tsx packages/drive/src/coupling-churn-fixture.run.ts
 *
 * A runnable, not a test (the `dogfood-probe.run.ts` shape): `pnpm -r test` globs `*.test.ts`, so
 * this never runs in the gate. It needs a FULL checkout with `origin/main` history — CI checks out at
 * `fetch-depth: 2`, which is exactly why the calibration reads a fixture rather than live git.
 *
 * RUN THIS ONLY TO RE-ANCHOR THE CALIBRATION ON PURPOSE — never to make a failing assertion pass.
 * The captured windows are `session-decoupling-arc-inc-22`'s own, in the +10:00 local time its day
 * boundaries used; changing them changes what the calibration is calibrating against, which is a
 * decision, not a refresh.
 */

/** inc-22's two measured windows. */
const WINDOWS: ReadonlyArray<readonly [string, string]> = [
  ["2026-07-31T14:00:00Z", "2026-08-03T14:00:00Z"], // BEFORE: 2026-08-01..03 (+10:00)
  ["2026-08-05T02:00:00Z", "2026-08-06T06:00:00Z"], // AFTER: 2026-08-05T12:00 .. 2026-08-06T16:00 (+10:00)
];

const FIELD = String.fromCharCode(1);

function main(): void {
  const cwd = process.cwd();
  const commits = parseCommitLog(
    execFileSync("git", ["log", "origin/main", `--pretty=%H${FIELD}%ct${FIELD}%P${FIELD}%s`], {
      cwd,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    }),
  );

  const keep = new Map<string, CommitRec>();
  for (const [from, to] of WINDOWS) {
    const f = Date.parse(from) / 1000;
    const t = Date.parse(to) / 1000;
    for (const c of commits) {
      if (c.at < f || c.at >= t) continue;
      if (RESYNC_SUBJECT.test(c.subject) || LANDING_SUBJECT.test(c.subject)) keep.set(c.sha, c);
    }
  }

  // Dictionary-encoded: ~2,300 distinct paths across ~69 re-syncs, so storing each path once and
  // referencing it by index roughly halves the file.
  const paths: string[] = [];
  const index = new Map<string, number>();
  const absorbed: Record<string, number[]> = {};
  const out = [...keep.values()]
    .sort((a, b) => a.at - b.at)
    .map((c) => {
      const sha = c.sha.slice(0, 12);
      if (!RESYNC_SUBJECT.test(c.subject) || c.parents.length < 2) {
        return { sha, at: c.at, parents: [] as string[], subject: c.subject };
      }
      absorbed[sha] = gitAbsorbed(cwd, c).map((file) => {
        let i = index.get(file);
        if (i === undefined) {
          i = paths.length;
          paths.push(file);
          index.set(file, i);
        }
        return i;
      });
      return { sha, at: c.at, parents: c.parents.map((p) => p.slice(0, 12)), subject: c.subject };
    });

  const target = path.join(import.meta.dirname, "coupling-churn.fixture.json");
  writeFileSync(target, `${JSON.stringify({ commits: out, paths, absorbed })}\n`, "utf8");
  process.stdout.write(
    `wrote ${target}: ${out.length} commit(s), ${Object.keys(absorbed).length} re-sync(s), ${paths.length} distinct path(s)\n`,
  );
}

main();
