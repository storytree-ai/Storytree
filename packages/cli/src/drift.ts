import { readFileSync } from "node:fs";

import { hashSpan, classifyDrift } from "@storytree/orchestrator";
import {
  Anchor,
  type ChangeEvent,
  type DriftFlag,
  type DriftState,
} from "@storytree/verdict-contract";
import type { Store, ChangeStore } from "@storytree/base";

import type { Envelope } from "./envelope.js";

/**
 * `storytree drift` (ADR-0016): the operator/agent SURFACE for the binding-staleness flag — the
 * lazy, per-binding, described-change-gated drift check, rendered where an agent can see it with the
 * three states distinct (the ADR-0016 §3 model; `stale` is NEVER the silent green→brown reversion
 * ADR-0040 §7 forbids).
 *
 * Given a file and the content-hash a proof was signed against (`--bound`), it re-fingerprints the
 * file ({@link hashSpan}) and classifies the binding:
 *   - file matches `--bound`              → FRESH (no re-proof)
 *   - file differs, no `--change` given   → DRIFTED-UNDESCRIBED (demoted; audit-only, not a re-UAT)
 *   - file differs, `--change "why"` given → STALE (re-prove THIS unit; carries the reason)
 *
 * This is the parser-free, no-data-wiring first surface (ADR-0016 deferred slices): it operates on
 * an EXPLICIT bound hash + change reasons the agent supplies, so the engine is usable today. Reading
 * a unit's stored `Anchor` + change log from the store (and the studio "stale" hue) are later slices.
 *
 * Pattern: a PURE core ({@link driftEnvelope}) over the file-read shell ({@link runDrift}, with an
 * injectable reader for tests) — mirroring `health.ts` / `adr-health.ts`.
 */

/** Per-state presentation. `stale` and `drifted-undescribed` are DISTINCT from each other and from fresh. */
const STATE_PRESENTATION: Record<DriftState, { glyph: string; headline: string }> = {
  fresh: { glyph: "✓", headline: "FRESH — the proved span is unchanged; no re-proof needed." },
  stale: { glyph: "⚠", headline: "STALE — the proved code changed; re-prove THIS unit (and only this one)." },
  "drifted-undescribed": {
    glyph: "?",
    headline:
      "DRIFTED (undescribed) — the span changed but no described change explains it; DEMOTED (audit-only), NOT a re-UAT trigger.",
  },
};

/** PURE: render a {@link DriftFlag} as the operator-facing envelope (distinct per state). */
export function driftEnvelope(label: string, flag: DriftFlag): Envelope {
  const present = STATE_PRESENTATION[flag.state];
  const lines = [
    `${present.glyph} ${label} — ${present.headline}`,
    `  bound:   ${flag.boundHash}`,
    `  current: ${flag.currentHash}`,
  ];
  if (flag.description !== undefined) lines.push(`  changed: ${flag.description}`);

  // Next guidance is per-state — the choose-your-own-adventure branch (ADR-0023).
  const next: string[] =
    flag.state === "fresh"
      ? ["the proof still holds — nothing to do"]
      : flag.state === "stale"
        ? [
            "re-prove this unit, then re-bind: storytree drift --file <path> --bound <its new current hash>",
            `the new bound hash is: ${flag.currentHash}`,
          ]
        : [
            'describe the change to PROMOTE it to a re-UAT: storytree drift --file <path> --bound <hash> --change "<why>"',
            "or, if it is genuinely cosmetic, re-bind to the current hash",
            `the current hash is: ${flag.currentHash}`,
          ];
  return { ok: true, body: lines.join("\n"), next };
}

/** The options the `drift` command reads off the CLI. */
export interface DriftOpts {
  /** The file whose bound span to re-fingerprint (repo-relative; read whole-file in this slice). */
  file?: string | undefined;
  /** The content-hash the proof was signed against (the binding's `boundHash`). */
  bound?: string | undefined;
  /** Described-change reasons (`--change` repeated). Any non-blank reason makes a divergence STALE. */
  changes?: readonly string[] | undefined;
  /** A label for the rendered line (defaults to the file path). */
  label?: string | undefined;
}

function usage(message: string): Envelope {
  return {
    ok: false,
    body: `drift: ${message}`,
    next: [
      'storytree drift --file <path> --bound <hash> [--change "<why>"]',
      "storytree drift --help",
    ],
  };
}

/**
 * The `storytree drift` command shell: read the file, fingerprint it, build the described-change log
 * from the supplied reasons, and classify vs the bound hash. `readFile` is injectable for tests.
 */
export function runDrift(
  opts: DriftOpts,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): Envelope {
  const file = opts.file?.trim();
  const bound = opts.bound?.trim();
  if (file === undefined || file === "") return usage("missing --file <path>");
  if (bound === undefined || bound === "") return usage("missing --bound <hash> (the hash the proof was signed against)");

  let content: string;
  try {
    content = readFile(file);
  } catch (err) {
    return {
      ok: false,
      body: `drift: cannot read ${file} — ${(err as Error).message}`,
      next: ['storytree drift --file <path> --bound <hash>'],
    };
  }

  const currentHash = hashSpan(content);
  const label = opts.label?.trim() || file;
  // Each supplied reason is a DESCRIBED change advancing to the current hash. Indexed `at` keeps the
  // LAST-supplied reason the surfaced one (classifyDrift takes the latest by valid-time).
  const changes: ChangeEvent[] = (opts.changes ?? [])
    .filter((why) => why.trim().length > 0)
    .map((why, i) => ({
      unitId: label,
      hashBefore: bound,
      hashAfter: currentHash,
      description: why,
      author: "cli",
      at: `cli-${String(i).padStart(4, "0")}`,
    }));

  return driftEnvelope(label, classifyDrift(bound, currentHash, changes));
}

/** `storytree drift --help` / bare usage. */
export function driftHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree drift — is a proof's bound code still fresh? (ADR-0016 binding-staleness)",
      "",
      '  storytree drift --file <path> --bound <hash> [--change "<why>"]...',
      "",
      "  --file    the file whose proved span to re-fingerprint (whole-file in this slice)",
      "  --bound   the content-hash the proof was signed against (the binding's boundHash)",
      "  --change  a described change reason (repeatable); any non-blank reason makes a",
      "            divergence STALE, an undescribed divergence stays DEMOTED (audit-only)",
      "",
      "states: ✓ FRESH (unchanged) · ⚠ STALE (described change → re-prove) ·",
      "        ? DRIFTED-UNDESCRIBED (changed but unexplained → demoted, not a re-UAT)",
    ].join("\n"),
    next: ['storytree drift --file <path> --bound <hash> --change "<why>"'],
  };
}

/**
 * `storytree drift <unit>` (ADR-0016): the STORE-reading drift surface. Reads the unit's stored
 * {@link Anchor} (kind `"anchor"`, id = the unit id) and its change log, re-fingerprints the bound file
 * with {@link hashSpan}, and classifies via the same {@link classifyDrift} + {@link driftEnvelope} the
 * flag-driven {@link runDrift} uses — so drift runs on a LIVE unit's stored binding, not explicit args.
 * `readFile` is injectable for tests. The anchor is stored as a doc (a later "bind" surface writes it);
 * an absent anchor is a clean usage error, never a crash.
 */
export async function runDriftFromStore(
  unitId: string,
  store: Store & ChangeStore,
  readFile: (path: string) => string = (path) => readFileSync(path, "utf8"),
): Promise<Envelope> {
  const id = unitId.trim();
  if (id === "") return usage("missing <unit> (the unit id whose stored anchor to read)");

  const doc = await store.getDoc(id);
  if (doc === null) {
    return {
      ok: false,
      body: `drift: no stored anchor for "${id}" — bind it first (no Anchor doc in the store).`,
      next: ['storytree drift --file <path> --bound <hash>   (the explicit-args surface)'],
    };
  }
  let anchor: Anchor;
  try {
    anchor = Anchor.parse(doc.doc);
  } catch (err) {
    return { ok: false, body: `drift: the stored anchor for "${id}" is malformed — ${(err as Error).message}`, next: [] };
  }

  let content: string;
  try {
    content = readFile(anchor.file);
  } catch (err) {
    return { ok: false, body: `drift: cannot read ${anchor.file} — ${(err as Error).message}`, next: [] };
  }

  const currentHash = hashSpan(content);
  const changes: ChangeEvent[] = await store.readChangeEvents({ unitId: id });
  return driftEnvelope(id, classifyDrift(anchor.boundHash, currentHash, changes));
}
