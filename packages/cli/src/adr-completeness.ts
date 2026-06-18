import { parseAdrFrontmatter } from "./adr-frontmatter.js";

/**
 * ADR-0059 (gate-as-proof for authoring): the per-artifact STRUCTURAL-COMPLETENESS check that lets
 * an ADR earn a signed verdict through the prove-it-gate. It is the "test" gate-as-proof drives —
 * the ADR markdown is the "source", and editing the scaffold into a complete record is what turns
 * this red→green (ADR-0057 expansion C, edit-existing). `storytree adr new` scaffolds a
 * `status: proposed` record with NO `decided:` date and literal `<…>` placeholder prose in every
 * section; this returns the list of completeness failures against such a record ([] = complete).
 *
 * Deliberately does NOT assert `status: accepted` — acceptance is a HUMAN flip (ADR-0006/0037: no
 * machine writes status), witnessed later by the corpus green-flip gate (`adr-health`). So a leaf
 * editing the scaffold into a complete PROPOSED record turns this green WITHOUT ever writing the
 * decision: the gate proves the record is structurally complete, never that it is accepted or good.
 * That is the honesty boundary of gate-as-proof — the machine witnesses authoring hygiene, not merit.
 */
export function adrCompleteness(
  file: string,
  content: string,
  required?: { supersedes?: number[]; amends?: number[] },
): string[] {
  const failures: string[] = [];

  // 1. The frontmatter must parse (status/decided/edges valid). A parse failure is itself incomplete.
  let meta;
  try {
    meta = parseAdrFrontmatter(file, content);
  } catch (e) {
    return [`frontmatter invalid: ${(e as Error).message}`];
  }

  // 2. A `decided:` date — the scaffold omits it; a complete record records when it was decided.
  if (meta.decided === undefined) {
    failures.push("missing `decided:` date in frontmatter");
  }

  // 3. No scaffold placeholders left. The scaffold emits `<…>` prose (angle brackets with internal
  //    whitespace) in every section. Two guards keep this from false-flagging a finished ADR: code
  //    spans (fenced ``` blocks and `inline` code) are stripped first, so a comma-bearing generic
  //    like `Map<string, number>` written as code never trips; and the whitespace requirement skips
  //    code-shaped brackets with no internal space (`Array<string>`). The residual edge — an
  //    UN-fenced `< word … >` with a space in prose — yields a LOUD, fixable failure, never a silent pass.
  const prose = content
    .replace(/```[\s\S]*?```/g, "") // fenced code blocks
    .replace(/`[^`\n]*`/g, ""); // inline code spans
  const placeholders = [...new Set([...prose.matchAll(/<[^<>\n]*\s[^<>\n]*>/g)].map((m) => m[0]))];
  if (placeholders.length > 0) {
    failures.push(`unfilled scaffold placeholder(s): ${placeholders.join(", ")}`);
  }

  // 4. The canonical sections must be present (the scaffold has them; a mangled record might not).
  for (const section of ["Status", "Context", "Decision", "Consequences"]) {
    if (!new RegExp(`^##\\s+${section}\\b`, "m").test(content)) {
      failures.push(`missing '## ${section}' section`);
    }
  }

  // 5. Every DECLARED outgoing edge (the build's brief states which supersession this ADR makes) must
  //    actually appear in the frontmatter — so the record's edges match its stated intent.
  for (const n of required?.supersedes ?? []) {
    if (!meta.supersedes.includes(n)) {
      failures.push(`declared supersedes ADR-${pad4(n)} is not in the frontmatter`);
    }
  }
  for (const n of required?.amends ?? []) {
    if (!meta.amends.includes(n)) {
      failures.push(`declared amends ADR-${pad4(n)} is not in the frontmatter`);
    }
  }

  return failures;
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}
