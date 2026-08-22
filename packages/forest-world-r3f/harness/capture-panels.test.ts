// capture-panels.test.ts — the panel-naming invariant, and the source guard that keeps the
// evidence pages holding up their end of it.
//
// THE ONE PROPERTY EVERYTHING HERE EXISTS FOR: inserting a section into an evidence page must
// not change which picture any existing panel name refers to. The first test states it as a
// property AND carries the positional zip that used to be in `capture.mjs` as a CONTROL, so
// the test cannot pass by accident — if `planPanelCaptures` were re-implemented positionally
// the control and the subject would agree, and the assertion that they DISAGREE fails.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  PANEL_ID_ATTRIBUTE,
  panelFileName,
  parseRequestedPanels,
  planPanelCaptures,
  type PanelSection,
} from './capture-panels.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Build the `sections` argument from a list of ids in document order. */
function page(ids: readonly (string | null)[]): PanelSection[] {
  return ids.map((id, index) => ({ index, id }));
}

/** Files a plan would write, in the order it would write them. */
function filesOf(sections: readonly PanelSection[], requested: readonly string[] | null) {
  const plan = planPanelCaptures(sections, requested);
  assert.equal(plan.ok, true, plan.ok ? '' : plan.refusal);
  assert.ok(plan.ok);
  return plan.captures.map((c) => `${c.file} <- section ${c.index}`);
}

/**
 * THE CODE THIS MODULE REPLACED, kept verbatim in shape so the defect can be asserted rather
 * than described. It is the control, never the subject.
 */
function positionalZip(sectionCount: number, names: readonly string[]) {
  const out: string[] = [];
  for (let i = 0; i < sectionCount && i < names.length; i++) {
    out.push(`${panelFileName(names[i]!)} <- section ${i}`);
  }
  return out;
}

test('inserting a section does not change which picture an existing panel name refers to', () => {
  // The chapter2 island page as it stood, and the same page after a section was inserted
  // ABOVE the two being photographed — the exact 2026-08-20 shape from the friction.
  const before = page(['delivered', 'zoom', 'defn', 'delivered-defn']);
  const after = page(['delivered', 'zoom', 'amplitude', 'defn', 'delivered-defn']);
  const asked = ['defn', 'delivered-defn'];

  assert.deepEqual(filesOf(before, asked), [
    'panel-defn.png <- section 2',
    'panel-delivered-defn.png <- section 3',
  ]);
  // Same NAMES, and each still points at the section that authored it — the indices moved
  // because the page moved, which is the whole point.
  assert.deepEqual(filesOf(after, asked), [
    'panel-defn.png <- section 3',
    'panel-delivered-defn.png <- section 4',
  ]);

  // THE CONTROL. The old zip, given the same request against the same two pages, writes
  // `panel-defn.png` holding section 0 both times — a picture of the delivered-size row filed
  // under the land-definition name. The subject and the control must DISAGREE; if they ever
  // agree, positional binding is back.
  assert.deepEqual(positionalZip(before.length, asked), [
    'panel-defn.png <- section 0',
    'panel-delivered-defn.png <- section 1',
  ]);
  assert.notDeepEqual(filesOf(before, asked), positionalZip(before.length, asked));
  assert.notDeepEqual(filesOf(after, asked), positionalZip(after.length, asked));
});

test('an unlabelled section between two labelled ones is skipped, not counted', () => {
  // A page may legitimately carry prose sections that are not evidence. Under the old zip they
  // consumed a name each; under authored identity they are simply invisible to the capture.
  const sections = page(['delivered', null, 'zoom', null, null, 'ladder']);
  assert.deepEqual(filesOf(sections, ['zoom', 'ladder']), [
    'panel-zoom.png <- section 2',
    'panel-ladder.png <- section 5',
  ]);
});

test('no request captures every authored panel, in document order', () => {
  const sections = page([null, 'b', 'a', null, 'c']);
  assert.deepEqual(filesOf(sections, null), [
    'panel-b.png <- section 1',
    'panel-a.png <- section 2',
    'panel-c.png <- section 4',
  ]);
});

test('a requested order is honoured, and is independent of page order', () => {
  const sections = page(['a', 'b', 'c']);
  assert.deepEqual(filesOf(sections, ['c', 'a']), [
    'panel-c.png <- section 2',
    'panel-a.png <- section 0',
  ]);
});

test('requesting a panel the page does not carry is REFUSED, and the refusal names what is available', () => {
  const plan = planPanelCaptures(page(['delivered', 'zoom']), ['delivered', 'defn']);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.match(plan.refusal, /"defn"/);
  // A refusal that does not say what WOULD have worked sends the reader back to the source.
  assert.match(plan.refusal, /"delivered", "zoom"/);
});

test('two sections claiming one id is REFUSED before either is photographed', () => {
  const plan = planPanelCaptures(page(['delivered', 'zoom', 'delivered']), null);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.match(plan.refusal, /sections 0 and 2/);
  assert.match(plan.refusal, /overwrite/);
});

test('the same panel requested twice is REFUSED', () => {
  const plan = planPanelCaptures(page(['a', 'b']), ['a', 'b', 'a']);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.match(plan.refusal, /"a" was requested twice/);
});

test('a blank entry in the request is REFUSED as the stray comma it is', () => {
  // `ST_PANEL_NAMES=a,,b` and `ST_PANEL_NAMES=` both land here.
  const plan = planPanelCaptures(page(['a', 'b']), parseRequestedPanels('a,,b') ?? []);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.match(plan.refusal, /requested panel 2 of 3 is blank/);

  const empty = planPanelCaptures(page(['a']), parseRequestedPanels('') ?? []);
  assert.equal(empty.ok, false);
});

test('a section carrying a blank id is REFUSED rather than read as an opt-out', () => {
  const plan = planPanelCaptures(page(['a', '   ']), null);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.match(plan.refusal, /section 1 carries an empty/);
});

test('a page with sections but no authored ids is REFUSED, so it cannot capture nothing in silence', () => {
  const plan = planPanelCaptures(page([null, null, null]), null);
  assert.equal(plan.ok, false);
  assert.ok(!plan.ok);
  assert.match(plan.refusal, /3 <section> element\(s\) and none carries/);
});

test('parseRequestedPanels distinguishes UNSET from an empty request', () => {
  // Unset is "everything the page authored"; empty is a request naming nothing, which is a
  // mistake and must not silently widen to everything.
  assert.equal(parseRequestedPanels(undefined), null);
  assert.deepEqual(parseRequestedPanels(''), ['']);
  assert.deepEqual(parseRequestedPanels('a,b'), ['a', 'b']);
});

// --- the source guard ----------------------------------------------------------------------
//
// The resolver above cannot make a page correct on its own: a session that inserts a section
// and forgets the attribute gets a page whose new evidence is simply missing, which is quieter
// than the misfiling this replaces but still a hole. This is the rung that catches it, and it
// is the reason the fix is a red→green on real repo state rather than on invented inputs —
// before the attributes were authored, this test failed on all three pages.

/** Every `<section …>` opening tag in a source file, with its attribute text. */
function sectionTags(source: string): string[] {
  const tags = [...source.matchAll(/<section\b([^>]*)>/g)].map((m) => m[1] ?? '');
  // If a section were written in a shape the scan cannot parse it would be SKIPPED, and a
  // guard that silently skips is the fault class this whole increment is about. Count the
  // bare occurrences too and insist the two agree.
  const occurrences = (source.match(/<section\b/g) ?? []).length;
  assert.equal(
    tags.length,
    occurrences,
    `the section scan parsed ${tags.length} of ${occurrences} <section> tags — one is written ` +
      `in a shape this guard cannot read, so it would be skipped rather than checked`,
  );
  return tags;
}

test('every capturable <section> on every harness evidence page carries a unique authored id', () => {
  const sources = readdirSync(HERE)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(HERE, f), 'utf8') }))
    .filter((s) => s.text.includes('<section'));

  // ANTI-VACUITY. A scan that finds no files, or files with no sections, passes trivially —
  // which is exactly how a check comes to verify nothing. Both floors are asserted.
  assert.ok(sources.length > 0, 'no harness page carries a <section> — the scan found nothing to check');

  let total = 0;
  for (const { file, text } of sources) {
    const tags = sectionTags(text);
    assert.ok(tags.length > 0, `${file} matched the <section> filter but parsed none`);
    const seen = new Map<string, number>();
    tags.forEach((attrs, i) => {
      const m = attrs.match(new RegExp(`${PANEL_ID_ATTRIBUTE}="([^"]*)"`));
      assert.ok(
        m,
        `${file}: <section> #${i + 1} carries no ${PANEL_ID_ATTRIBUTE} — it would be dropped ` +
          `from the evidence capture without a word. Give it a stable authored id.`,
      );
      const id = (m[1] ?? '').trim();
      assert.notEqual(id, '', `${file}: <section> #${i + 1} has a blank ${PANEL_ID_ATTRIBUTE}`);
      const clash = seen.get(id);
      assert.equal(
        clash,
        undefined,
        `${file}: sections #${clash === undefined ? '?' : clash + 1} and #${i + 1} both claim ` +
          `${PANEL_ID_ATTRIBUTE}="${id}" — one picture would overwrite the other`,
      );
      seen.set(id, i);
      total++;
    });

    // The page must resolve under the real resolver, not merely look right to a regex.
    const plan = planPanelCaptures(
      tags.map((attrs, index) => ({
        index,
        id: attrs.match(new RegExp(`${PANEL_ID_ATTRIBUTE}="([^"]*)"`))?.[1] ?? null,
      })),
      null,
    );
    assert.equal(plan.ok, true, plan.ok ? '' : `${file}: ${plan.refusal}`);
  }
  assert.ok(total >= 3, `only ${total} capturable sections found across the harness pages`);
});

test('the capture driver resolves panels through this module', () => {
  // A narrow guard with a narrow claim: it proves the driver still NAMES the resolver, so a
  // revert to the positional zip cannot land quietly. It does not prove the driver uses the
  // result correctly — that is the live capture run, recorded in the increment's evidence.
  // `includes` rather than `assert.match`, because a failing regex assertion prints the whole
  // 600-line driver and buries its own message.
  const driver = readFileSync(join(HERE, 'capture.mjs'), 'utf8');
  assert.ok(
    driver.includes('planPanelCaptures'),
    'capture.mjs does not call planPanelCaptures — panel names are being resolved somewhere else',
  );
  assert.ok(
    driver.includes('parseRequestedPanels'),
    'capture.mjs does not parse ST_PANEL_NAMES through parseRequestedPanels',
  );
  assert.ok(
    !driver.includes('sections[i]'),
    'capture.mjs walks its sections by loop index — the positional panel zip is back',
  );
  assert.ok(
    !driver.includes('panel-${'),
    'capture.mjs builds a panel filename itself — the name must come from panelFileName, or the ' +
      'driver and the resolver can disagree about which file a section becomes',
  );
});
