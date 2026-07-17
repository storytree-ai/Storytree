import { parse } from "yaml";

import { parseUatTestCriteria } from "@storytree/library";

/**
 * ADR-0092 (gate-as-proof for a machine-witnessed story's own UAT node): the per-STORY
 * STRUCTURAL-COMPLETENESS check that lets a story's UAT node earn a signed verdict through the
 * prove-it-gate — the story analog of {@link import("./adr-completeness.js").adrCompleteness}.
 *
 * It is the "test" gate-as-proof drives (ADR-0059, expansion E): the story SPEC
 * (`stories/<story>/story.md`) is the "source", and editing an incomplete spec into a complete,
 * fully-witnessed machine-UAT record is what turns this red→green (ADR-0057 expansion C,
 * edit-existing). This returns the list of completeness failures ([] = complete).
 *
 * The HONESTY BOUNDARY (ADR-0092 §honesty, mirroring ADR-0059 §3): it asserts the story's UAT spec
 * is STRUCTURALLY COMPLETE and MACHINE-WITNESSED — never that the story is `healthy` or that its UAT
 * actually passed. The machine witnesses authoring HYGIENE (the walkthrough is fully specified, every
 * leg names its witness), never acceptance: the story-green CROWN still needs every capability proven
 * healthy AND every per-test UAT verdict signed by its witness (ADR-0082 / ADR-0083), which a
 * structural-completeness pass deliberately does not touch. So a complete spec turns this green
 * WITHOUT minting the story's acceptance.
 *
 * First story KIND = a `uat_witness: machine` story (the library), exactly as ADR-0059's first ADR
 * kind: the legs are agent-exercised, so a complete record names a `(witness: …)` on every leg. A
 * human-witnessed story is a later kind (its acceptance is a human ceremony, ADR-0040).
 */
export function storyUatCompleteness(file: string, content: string): string[] {
  const failures: string[] = [];

  // 1. The frontmatter block must be present and parse.
  if (!content.startsWith("---\n")) {
    return [`${file}: no frontmatter block (the file must start with '---')`];
  }
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) {
    return [`${file}: unterminated frontmatter block (no closing '---')`];
  }
  let fm: Record<string, unknown>;
  try {
    const parsed = parse(content.slice(4, end + 1)) as unknown;
    if (parsed === null || typeof parsed !== "object") {
      return [`${file}: frontmatter is not a mapping`];
    }
    fm = parsed as Record<string, unknown>;
  } catch (e) {
    return [`${file}: frontmatter invalid — ${(e as Error).message}`];
  }
  const body = content.slice(end + 5);

  // 2. The load-bearing story fields: a story tier, an outcome, the UAT proof mode, a declared
  //    witness, and a non-empty capabilities list (a story is composed of capabilities, ADR-0002).
  if (fm["tier"] !== "story") {
    failures.push(`frontmatter \`tier\` must be "story" (got ${JSON.stringify(fm["tier"])})`);
  }
  if (typeof fm["outcome"] !== "string" || fm["outcome"].trim() === "") {
    failures.push("frontmatter `outcome` is missing or empty");
  }
  if (fm["proof_mode"] !== "UAT") {
    failures.push(`frontmatter \`proof_mode\` must be "UAT" for a story (got ${JSON.stringify(fm["proof_mode"])})`);
  }
  const witness = fm["uat_witness"];
  if (witness !== "machine") {
    // The first story kind is machine-witnessed (ADR-0092): a human-witnessed story's acceptance is a
    // human ceremony (ADR-0040), not a machine gate-as-proof, so it is out of this checker's scope.
    failures.push(
      `frontmatter \`uat_witness\` must be "machine" for a gate-as-proof story node ` +
        `(got ${JSON.stringify(witness)} — a human-witnessed UAT is a human ceremony, ADR-0040)`,
    );
  }
  const caps = fm["capabilities"];
  if (!Array.isArray(caps) || caps.length === 0) {
    failures.push("frontmatter `capabilities` is missing or empty (a story is composed of capabilities)");
  }

  // 3. The canonical story sections must be present (the integrated UAT and its proof, ADR-0010).
  //    The UAT section dual-accepts the legacy `## Story UAT` heading (ADR-0206 transitional).
  if (!/^##\s+(?:UAT Test Criteria|Story UAT)\b/m.test(body)) {
    failures.push("missing '## UAT Test Criteria' section");
  }
  if (!/^##\s+Proof\b/m.test(body)) {
    failures.push("missing '## Proof' section");
  }

  // 4. The `## UAT Test Criteria` walkthrough must have ≥1 addressable leg, and EVERY leg must name its
  //    witness explicitly. An untagged leg silently defaults to `either` (parseUatTestCriteria) — a complete
  //    machine-UAT record names `(witness: machine)` on each leg, so an untagged leg is incomplete.
  let legs: ReturnType<typeof parseUatTestCriteria>;
  try {
    const id = typeof fm["id"] === "string" ? fm["id"] : "story";
    legs = parseUatTestCriteria(id, body);
  } catch (e) {
    // An EXPLICIT-but-invalid witness value (e.g. `(witness: nobody)`) throws — surface it as a
    // completeness failure rather than a crash, so the gate fails closed with a fixable message.
    return [...failures, `\`## UAT Test Criteria\` has an invalid witness tag — ${(e as Error).message}`];
  }
  if (legs.length === 0) {
    failures.push("`## UAT Test Criteria` has no numbered walkthrough legs (the integrated acceptance journey)");
  }
  const untagged = untaggedLegOrdinals(body);
  if (untagged.length > 0) {
    failures.push(
      `\`## UAT Test Criteria\` leg(s) ${untagged.join(", ")} do not declare a \`(witness: …)\` — a complete ` +
        "machine-UAT names its witness on every leg (an untagged leg silently defaults to `either`)",
    );
  }

  // 5. No scaffold placeholders left, anywhere in the record (frontmatter + body — a scaffold's
  //    `<…>` prose may sit in either). Strip code spans first (so inline `<id>` / fenced blocks never
  //    false-trip), then flag `< word … >` (angle brackets with internal whitespace) — identical to
  //    adrCompleteness (which scans the whole content), so the two authoring kinds judge the same way.
  const prose = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]*`/g, "");
  const placeholders = [...new Set([...prose.matchAll(/<[^<>\n]*\s[^<>\n]*>/g)].map((m) => m[0]))];
  if (placeholders.length > 0) {
    failures.push(`unfilled scaffold placeholder(s): ${placeholders.join(", ")}`);
  }

  return failures;
}

/**
 * Match a `## UAT Test Criteria …` heading — legacy `## Story UAT` dual-accepted (ADR-0206
 * transitional; mirrors uat-test-criteria.ts so the section boundary never forks).
 */
const STORY_UAT_HEADING = /^##[^\n\S]+(?:UAT Test Criteria|Story UAT)[^\n]*$/im;
/** Match the next `## …` heading after the section start. */
const NEXT_H2 = /^## /m;
/** A numbered list item lead: `1. …`. */
const NUMBERED_ITEM = /^(\d+)\.[^\n\S]+/;
/** An inline witness annotation, e.g. `(witness: machine)`. */
const WITNESS_TAG = /\(witness:\s*[A-Za-z]+\)/i;

/**
 * The 1-based ordinals of `## UAT Test Criteria` legs that carry NO `(witness: …)` tag (PURE, no I/O). A
 * complete machine-UAT names its witness on every leg; an untagged leg defaults to `either` silently,
 * so this surfaces exactly which legs under-declare. Positional ordinals mirror `uatTestCriterionId`.
 */
function untaggedLegOrdinals(body: string): number[] {
  const heading = STORY_UAT_HEADING.exec(body);
  if (heading === null) return [];
  const after = body.slice(heading.index + heading[0].length);
  const nextH2 = NEXT_H2.exec(after);
  const section = nextH2 === null ? after : after.slice(0, nextH2.index);

  const untagged: number[] = [];
  let current: { ordinal: number; lines: string[] } | null = null;
  let ordinal = 0;
  const flush = (): void => {
    if (current !== null && !WITNESS_TAG.test(current.lines.join("\n"))) untagged.push(current.ordinal);
  };
  for (const line of section.split("\n")) {
    if (NUMBERED_ITEM.test(line)) {
      flush();
      ordinal += 1;
      current = { ordinal, lines: [line] };
    } else if (current !== null) {
      current.lines.push(line);
    }
  }
  flush();
  return untagged;
}
