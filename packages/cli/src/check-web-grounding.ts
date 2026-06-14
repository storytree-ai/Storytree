// The drift gate that binds the PUBLIC website (the `web` submodule, storytree-web) back to this
// repo's decision record (ADR-0056). Load-bearing factual claims on the site carry a
// `data-grounds="ADR-NNNN[,…]"` attribute — invisible on the page, discoverable in the repo. This
// check runs in the PARENT repo (the only side that can see the private ADR/Library corpus) and
// fails when a cited ADR is missing or SUPERSEDED — so a doctrine change can't silently leave the
// public copy overclaiming (the "a person signs off" drift that ADR-0040 made stale).
//
//   pnpm check:web-grounding
//
// References live in storytree-web; validation lives here — the web repo can't self-check. In CI the
// pinned web SHA is cloned first (storytree-web is public). Locally an absent `web/` is a SKIP
// (`git submodule update --init web` to enable it); in CI an absent `web/` is a hard failure (the
// clone step must have run). Today only `ADR-NNNN` ids are validated; any other scheme is flagged
// as unvalidated rather than silently trusted.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadAdrMetas } from "./adr-health.js";

export interface GroundingRef {
  /** web-relative path, e.g. "src/pages/index.astro". */
  readonly file: string;
  readonly ids: readonly string[];
}

export interface GroundingProblem {
  readonly file: string;
  readonly id: string;
  readonly reason: string;
}

const DATA_GROUNDS = /data-grounds\s*=\s*"([^"]*)"/g;
const ADR_ID = /^ADR-(\d{3,4})$/;

const pad = (n: number): string => String(n).padStart(4, "0");

/** Pull every `data-grounds="…"` id-list out of one file's text. */
export function extractGroundingRefs(file: string, content: string): GroundingRef[] {
  const refs: GroundingRef[] = [];
  for (const m of content.matchAll(DATA_GROUNDS)) {
    const raw = m[1];
    if (raw === undefined) continue;
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (ids.length > 0) refs.push({ file, ids });
  }
  return refs;
}

/**
 * Validate grounding refs against the ADR index (number → status). Pure, so the test drives it with
 * fixtures. A referenced ADR that is missing or fully `superseded` is a problem; a partially
 * superseded ADR (an edge, not a status) still stands and is fine. Non-ADR schemes (e.g. a library
 * artifact id) are flagged as unvalidated — extend here to resolve them.
 */
export function validateGrounding(
  refs: readonly GroundingRef[],
  adrStatusByNumber: ReadonlyMap<number, string>,
): GroundingProblem[] {
  const problems: GroundingProblem[] = [];
  for (const ref of refs) {
    for (const id of ref.ids) {
      const m = ADR_ID.exec(id);
      if (m === null) {
        problems.push({
          file: ref.file,
          id,
          reason:
            "unsupported reference scheme — only ADR-NNNN is validated today (extend check-web-grounding to resolve library ids)",
        });
        continue;
      }
      const num = Number(m[1]);
      const status = adrStatusByNumber.get(num);
      if (status === undefined) {
        problems.push({ file: ref.file, id, reason: `references ADR-${pad(num)}, which is not in docs/decisions/` });
      } else if (status === "superseded") {
        problems.push({
          file: ref.file,
          id,
          reason: `references ADR-${pad(num)}, which is SUPERSEDED — repoint the claim to the current decision`,
        });
      }
    }
  }
  return problems;
}

const TEXT_EXT = new Set([".astro", ".html", ".md", ".mdx", ".jsx", ".tsx", ".ts", ".js", ".json"]);

/** Recursively collect web-relative text-file paths under a dir (the fs shell around the pure core). */
function walkTextFiles(dir: string, base: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walkTextFiles(full, base, out);
    else if (TEXT_EXT.has(path.extname(name).toLowerCase())) {
      out.push(path.relative(base, full).split(path.sep).join("/"));
    }
  }
  return out;
}

function main(): void {
  // packages/cli/src/check-web-grounding.ts → four dirs up (the build-claude-md.ts pattern).
  const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
  const webRoot = path.join(repoRoot, "web");
  const webSrc = path.join(webRoot, "src");
  const inCi = process.env.CI === "true";

  if (!existsSync(webSrc)) {
    if (inCi) {
      console.error(
        "check:web-grounding — web/ is not checked out in CI. The workflow must clone the pinned " +
          "storytree-web submodule before this step.",
      );
      process.exit(1);
    }
    console.log(
      "check:web-grounding — SKIP: web/ submodule not checked out " +
        "(run `git submodule update --init web` to enable this check locally).",
    );
    return;
  }

  const { adrs, parseErrors } = loadAdrMetas(path.join(repoRoot, "docs", "decisions"));
  if (parseErrors.length > 0) {
    // adr-health owns ADR-frontmatter health; here a parse failure just means we can't trust the index.
    console.error(
      "check:web-grounding — could not parse the ADR index (fix adr-frontmatter first):\n  " +
        parseErrors.join("\n  "),
    );
    process.exit(1);
  }
  const statusByNumber = new Map(adrs.map((a) => [a.number, a.status]));

  const refs: GroundingRef[] = [];
  for (const rel of walkTextFiles(webSrc, webRoot)) {
    refs.push(...extractGroundingRefs(rel, readFileSync(path.join(webRoot, rel), "utf8")));
  }

  const problems = validateGrounding(refs, statusByNumber);
  const idCount = refs.reduce((n, r) => n + r.ids.length, 0);

  if (problems.length > 0) {
    console.error(
      `check:web-grounding — BLOCKED: ${problems.length} grounding reference(s) in storytree-web no ` +
        "longer hold against the corpus:\n",
    );
    for (const p of problems) console.error(`  ✗ web/${p.file}: ${p.id} — ${p.reason}`);
    console.error(
      "\nThe public site's claim drifted from the decision it cites. Update the copy in storytree-web " +
        "(and its data-grounds), or repoint the reference.",
    );
    process.exit(1);
  }

  console.log(
    `check:web-grounding — OK: ${idCount} grounding reference(s) across ${refs.length} claim(s) all ` +
      "resolve to current ADRs.",
  );
}

// Run only when invoked directly (`tsx src/check-web-grounding.ts`), not when the test imports the
// pure functions above.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
