import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseAdrFrontmatter, type AdrMeta } from "./adr-frontmatter.js";

/**
 * The ADR-meta loader (split out of the cli `adr-health.ts` in the drive extraction): the thin
 * fs-backed loader the build drivers need without pulling in the whole `adr-health` check core
 * (which depends on cli's `health.ts` `CheckResult`). `adr-health.ts` stays in cli; this loader
 * moved to drive so `story-build.ts` can consume it without a cli → drive → cli cycle.
 */

/** Parse every `NNNN-*.md` under a decisions dir; parse failures become lines, not throws. */
export function loadAdrMetas(decisionsDir: string): { adrs: AdrMeta[]; parseErrors: string[] } {
  const adrs: AdrMeta[] = [];
  const parseErrors: string[] = [];
  for (const file of readdirSync(decisionsDir).sort()) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    try {
      adrs.push(parseAdrFrontmatter(file, readFileSync(path.join(decisionsDir, file), "utf8")));
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { adrs, parseErrors };
}

/** PURE: the text after `# ADR-NNNN:` (the decision's H1 title); "" when there is no such heading. */
export function extractAdrTitle(content: string): string {
  const m = /^#\s+ADR-\d{4}:\s*(.+?)\s*$/m.exec(content);
  return m && m[1] !== undefined ? m[1] : "";
}

/** An ADR's frontmatter meta plus its H1 title — the shape every ADR *view* needs. */
export interface TitledAdrMeta extends AdrMeta {
  /** The `# ADR-NNNN:` heading text, falling back to the filename when the heading is missing. */
  title: string;
}

/**
 * {@link loadAdrMetas} plus each ADR's H1 title — the ONE fs scan of `docs/decisions` that every
 * ADR view is built on. Both readers of the decision log delegate here rather than each walking the
 * directory themselves: the cli's `loadAdrListings` (which reshapes it into `{meta, title}` for
 * `adr list`) and `deriveArcRollup`'s ADR leg (`@storytree/arc`'s `arc-rollup.ts`), which the CLI,
 * the studio server and the desktop backend share. A missing/unreadable dir yields an empty list
 * rather than throwing, so an arc view stays derivable on a partial checkout.
 */
export function loadTitledAdrMetas(decisionsDir: string): {
  adrs: TitledAdrMeta[];
  parseErrors: string[];
} {
  const adrs: TitledAdrMeta[] = [];
  const parseErrors: string[] = [];
  let files: string[];
  try {
    files = readdirSync(decisionsDir).sort();
  } catch {
    return { adrs, parseErrors };
  }
  for (const file of files) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    try {
      const content = readFileSync(path.join(decisionsDir, file), "utf8");
      adrs.push({ ...parseAdrFrontmatter(file, content), title: extractAdrTitle(content) || file });
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { adrs, parseErrors };
}
