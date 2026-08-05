#!/usr/bin/env node
// Prompt-keyed definition injector — the `UserPromptSubmit` hook entry.
//
// When a prompt is submitted in an interactive session, scan it for Library `definition` terms
// and prepend the matched definitions' `oneLine` summaries (plus one pull pointer to the full
// body) to the model's context — so the agent doesn't spend a full tool round-trip (~52k fixed
// overhead + the whole context re-billed as cache-read, ~180–210k tokens in a mature session)
// looking a term up mid-work.
//
// This is term DISAMBIGUATION at the moment of use, not a glossary preload: only prompt-matched
// terms, `oneLine` only (never the whatItIs/whatItIsNot body — ADR-0156), capped at MAX_MATCHES
// so a term-dense prompt cannot front-load the corpus (the ADR-0135-retired glossary stays
// retired; the full body stays pull-based behind `storytree library artifact <id>`, ADR-0023).
//
// Constraints that shape it (mirrors provision-worktree.mjs):
//   - BARE NODE, ZERO non-builtin deps — the hook runs on EVERY prompt submit and blocks the
//     model's response, so startup latency matters: plain `node` + a JSON parse is ~150 ms on this
//     box where a tsx boot is ~1 s. It also keeps working in a fresh worktree with no node_modules.
//   - OFFLINE, and it reads the GENERATED PROJECTION `definitions.generated.json` beside this file
//     — never the live DB, and (since 2026-08-04) no longer the 1.25 MB seed corpus either. It used
//     the corpus and consumed 0.99% of it: 52 definitions × id/title/oneLine
//     is 11.8 KB. ADR-0302 D1 decommits that seed, which would have dropped this hook into its own
//     fail-safe `catch` and stopped injection SILENTLY. ADR-0307 D4 gives it a committed projection
//     instead — regenerate with `pnpm build:guidance` (`check:guidance` fails on drift). The
//     projection can lag a live CLI edit; a slightly stale oneLine still beats a 200k-token lookup,
//     and the pointer always pulls the live/full body.
//   - FAIL-SAFE as a hook — ALWAYS exit 0, silent on every failure path (the presence-hook.sh
//     contract): a definition-injection failure must never surface into the session.
//   - PROMPTS ONLY, and STATEFUL per session. Two 2026-08-04 measurements over one real session:
//     30 injections carried only 14 distinct terms (53% were repeats of definitions the model had
//     already been given), and 20 of the 30 were triggered not by anything the operator typed but by
//     BACKGROUND TASK NOTIFICATIONS — machine-generated text scanned as if it were a prompt, so
//     probe output was injecting `orchestrator`/`dependency`/`boundary` at a reader who never asked.
//     `isOperatorPrompt` drops the latter and `readInjected`/`writeInjected` dedupe the former.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import process from "node:process";

/** Cap on injected definitions per prompt — selectivity is the design, not a tuning knob. */
export const MAX_MATCHES = 5;

/** Lowercase and collapse hyphen/underscore to space, so `proof-mode` == `Proof mode`. */
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The surface strings one definition can be recognised by: its id, its title, and each
 * slash-separated title part ("leaf step / leaf judgment" matches on either part).
 */
function surfacesFor(doc) {
  const out = new Set();
  const add = (s) => {
    const n = normalize(s ?? "").trim();
    if (n.length >= 3) out.add(n);
  };
  add(doc.id);
  add(doc.title);
  for (const part of String(doc.title ?? "").split("/")) add(part);
  return [...out];
}

/** Word-boundary, plural-tolerant regex for one normalized surface string. */
function surfacePattern(surface) {
  const words = surface.split(" ").map(escapeRegExp);
  const last = words.length - 1;
  // plural tolerance on the final word: verdict(s), stor(y|ies)
  const tail = words[last];
  words[last] = tail.endsWith("y")
    ? `(?:${tail}|${tail.slice(0, -1)}ies)`
    : `${tail}(?:s|es)?`;
  return new RegExp(`\\b${words.join(" ")}\\b`);
}

/**
 * Match `prompt` against the definitions' surfaces. Returns at most `max` docs, most-specific
 * (longest matched surface) first, ties in corpus order; one entry per definition.
 */
export function matchDefinitions(prompt, docs, opts = {}) {
  const max = opts.max ?? MAX_MATCHES;
  const haystack = normalize(prompt);
  const ranked = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    let best = null;
    for (const surface of surfacesFor(doc)) {
      if (!surfacePattern(surface).test(haystack)) continue;
      if (best === null || surface.length > best) best = surface.length;
    }
    if (best !== null) ranked.push({ doc, best, i });
  }
  ranked.sort((a, b) => b.best - a.best || a.i - b.i);
  return ranked.slice(0, max).map((r) => r.doc);
}

/** Render the injection block: one oneLine per match + one shared pull-pointer line. */
export function renderInjection(matches) {
  if (matches.length === 0) return "";
  const lines = matches.map((d) => `- ${d.id}: ${d.oneLine}`);
  return [
    "[storytree] Library definitions for terms in this prompt (full body: `storytree library artifact <id>`):",
    ...lines,
    "",
  ].join("\n");
}

/**
 * prompt + corpus docs in → the definitions to inject.
 *
 * `opts.exclude` is a Set of ids this session has already been given; they are dropped AFTER
 * matching, so the `max` cap still applies to fresh terms. Filtering before the match would let a
 * prompt full of already-known terms pull in `max` unrelated ones it only weakly matched — the cap
 * exists to keep injection selective, not to guarantee a full quota.
 */
export function selectDefinitions(prompt, docs, opts = {}) {
  const defs = docs.filter(
    (d) => d?.kind === "definition" && typeof d.id === "string" && typeof d.oneLine === "string" && d.oneLine.length > 0,
  );
  const exclude = opts.exclude ?? new Set();
  return matchDefinitions(prompt, defs, opts).filter((d) => !exclude.has(d.id));
}

/** prompt + corpus docs in → injection text out ("" when nothing matches). */
export function buildInjection(prompt, docs, opts = {}) {
  return renderInjection(selectDefinitions(prompt, docs, opts));
}

/**
 * Markers that identify machine-generated turns the harness feeds through this hook. A background
 * task completing is not an operator asking a question, and scanning a probe's own output for terms
 * spends the operator's context disambiguating text they never wrote (measured: 20 of 30 injections
 * in one session). CONSERVATIVE by construction — matched near the START of the text only, so an
 * operator who quotes one of these strings mid-prompt is unaffected, and an unrecognised shape keeps
 * the old always-inject behaviour rather than silently dropping a real prompt.
 */
const MACHINE_TURN_MARKERS = [
  "[SYSTEM NOTIFICATION - NOT USER INPUT]",
  "<task-notification>",
  "<system-reminder>",
];

/** Whether `prompt` reads as something the operator actually typed. Exported for the unit test. */
export function isOperatorPrompt(prompt) {
  const head = prompt.slice(0, 400);
  return !MACHINE_TURN_MARKERS.some((marker) => head.includes(marker));
}

/**
 * Where this session's already-injected ids are remembered. Keyed by the harness's session id, in
 * the OS temp dir — deliberately not in the repo (it is per-run scratch, and a worktree must never
 * gain an untracked file from a hook). An unknown session id disables dedup rather than sharing one
 * bucket across sessions, which would suppress a definition the new session has never seen.
 */
export function injectedStatePath(sessionId) {
  if (typeof sessionId !== "string" || sessionId === "") return null;
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) return null; // never let an id shape a path
  return join(tmpdir(), "storytree-definition-injection", `${sessionId}.json`);
}

function readInjected(statePath) {
  if (statePath === null) return new Set();
  try {
    const ids = JSON.parse(readFileSync(statePath, "utf8"));
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set(); // no state yet, or unreadable — inject as if first time
  }
}

function writeInjected(statePath, ids) {
  if (statePath === null) return;
  try {
    mkdirSync(join(statePath, ".."), { recursive: true });
    writeFileSync(statePath, JSON.stringify([...ids]), "utf8");
  } catch {
    // fail-safe: losing the memo costs a repeat injection, never the session
  }
}

/** The generated definition table beside this file (ADR-0307 D4). */
function projectionPath() {
  return resolve(fileURLToPath(new URL("definitions.generated.json", import.meta.url)));
}

function main() {
  try {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const prompt = typeof input?.prompt === "string" ? input.prompt : "";
    if (prompt === "" || !isOperatorPrompt(prompt)) return;
    const docs = JSON.parse(readFileSync(projectionPath(), "utf8"));
    if (!Array.isArray(docs)) return;

    const statePath = injectedStatePath(input?.session_id);
    const already = readInjected(statePath);
    const matches = selectDefinitions(prompt, docs, { exclude: already });
    if (matches.length === 0) return;

    process.stdout.write(renderInjection(matches));
    for (const d of matches) already.add(d.id);
    writeInjected(statePath, already);
  } catch {
    // fail-safe hook contract: silent, exit 0
  }
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
  process.exit(0);
}
