import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parseWorkspaceRoots } from "./test-timing-gate.js";

/**
 * THE TYPECHECK APERTURE — what `pnpm -r typecheck` can actually see.
 *
 * Every workspace tsconfig declares `include`, and for most of them that list read `["src"]`. A
 * package's `scripts/` directory therefore sat OUTSIDE the aperture: `tsc --noEmit` never opened it,
 * CI never opened it, and a type error there failed nothing. That is not a cosmetic gap — the code
 * living there is instrument code. `packages/cli/scripts/measure-lane-width.ts` is where every lane-
 * width figure in ADR-0340 / ADR-0341 / ADR-0342 is read from, and it carried a real error (an
 * assignment through a `readonly` field) for as long as it was invisible. The failure mode is the one
 * this whole arc exists to fence: nothing goes red, and the only symptom is a wrong number that is
 * discovered if and only if somebody disbelieves a published ADR.
 *
 * Enlarging the aperture once fixes the instance. This keeps it enlarged: a workspace that grows a
 * `scripts/` directory without naming it in `include` is a finding, so the hole cannot silently
 * reopen when the next package is scaffolded from an older sibling.
 *
 * SCOPE, stated rather than glossed. The rule is keyed on `scripts/` ALONE, not on "any directory
 * holding TypeScript the aperture misses". The wider rule sounds better and is worse: `harness`,
 * `server`, `uat` and `electron` are all real non-`src` roots here, and several are already covered
 * by a SECOND project file (`apps/desktop/tsconfig.electron.json`, `apps/studio/tsconfig.node.json`)
 * that this check does not model. Deciding coverage properly means implementing tsconfig's include
 * glob semantics across every project in a workspace; keyed on one well-known directory name, the
 * rule needs no glob engine and has no false positives. If another root name starts accumulating
 * unchecked TypeScript, add the name here — do not widen this into a resolver.
 *
 * A workspace with no `include` at all is NOT a finding: tsc then takes everything under the project
 * directory, so `scripts/` is already inside the aperture.
 *
 * WHEN THIS ACTUALLY RUNS, since a guard nobody reaches is not a guard. It is a `@storytree/cli`
 * test, and `pnpm gate` / CI narrow the `-r` legs to the affected packages (ADR-0304 D1) — so a
 * branch touching only some other package does not run it. That is sufficient rather than lucky: the
 * shape it fences is a workspace GROWING a `scripts/` directory, and a new workspace needs a
 * `package.json`, which is one of the root paths that force the classifier WIDE. A `scripts/`
 * directory added to an EXISTING package is the residual gap, and it is caught on that package's
 * next full run rather than at once.
 */

/** One workspace's aperture facts, as read off disk. */
export interface WorkspaceAperture {
  /** repo-relative, forward-slash — e.g. `packages/cli` */
  readonly workspace: string;
  /** true when `<workspace>/scripts` exists on disk */
  readonly hasScriptsDir: boolean;
  /**
   * the `include` list from `<workspace>/tsconfig.json`, or `undefined` when the file declares none
   * (tsc then includes the whole project directory, so the aperture is already total)
   */
  readonly include: readonly string[] | undefined;
}

/** The directory name this rule is keyed on. See the SCOPE paragraph above before adding another. */
export const APERTURE_DIR = "scripts";

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

/**
 * The rule, as a pure function over facts: a workspace with a `scripts/` directory that its
 * tsconfig's `include` does not name.
 */
export function findUncheckedScriptDirs(apertures: readonly WorkspaceAperture[]): string[] {
  return apertures
    .filter((a) => a.hasScriptsDir && a.include !== undefined && !a.include.includes(APERTURE_DIR))
    .map((a) => `${a.workspace}/${APERTURE_DIR}`)
    .sort();
}

/**
 * Read every typechecked workspace's aperture facts off disk.
 *
 * FAILS CLOSED, and the reason is this arc's most expensive lesson (#970): the rule above is
 * SUBTRACTIVE — findings come only from facts we managed to enumerate — so a walk that reads nothing
 * yields zero findings and is indistinguishable from a healthy repo. A blind loader would therefore
 * make the tree look CLEANER than a sighted one. So an empty enumeration THROWS rather than
 * answering "nothing to report", and an unparseable tsconfig throws rather than being skipped.
 */
export function readWorkspaceApertures(repoRoot: string): WorkspaceAperture[] {
  const roots = parseWorkspaceRoots(readFileSync(path.join(repoRoot, "pnpm-workspace.yaml"), "utf8"));

  const apertures: WorkspaceAperture[] = [];
  for (const root of roots) {
    const rootDir = path.join(repoRoot, root);
    if (!existsSync(rootDir)) continue;
    for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const wsDir = path.join(rootDir, entry.name);
      const pkgPath = path.join(wsDir, "package.json");
      const tsconfigPath = path.join(wsDir, "tsconfig.json");
      if (!existsSync(pkgPath) || !existsSync(tsconfigPath)) continue;
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
      // The aperture is defined by the chain that runs tsc: `pnpm -r typecheck` reaches a workspace
      // iff it declares `typecheck`. One that declares none has no aperture to widen.
      if (typeof pkg.scripts?.typecheck !== "string") continue;

      let include: readonly string[] | undefined;
      try {
        const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as { include?: unknown };
        include = Array.isArray(tsconfig.include) ? (tsconfig.include as string[]) : undefined;
      } catch (err) {
        throw new Error(`${root}/${entry.name}/tsconfig.json did not parse as JSON: ${String(err)}`);
      }

      apertures.push({
        workspace: `${root}/${entry.name}`,
        hasScriptsDir: existsSync(path.join(wsDir, APERTURE_DIR)),
        include,
      });
    }
  }

  if (apertures.length === 0) {
    throw new Error(
      `typecheck-aperture: enumerated no typechecked workspace under ${repoRoot} — refusing to ` +
        `report a clean aperture from a blind walk`,
    );
  }
  return apertures;
}
