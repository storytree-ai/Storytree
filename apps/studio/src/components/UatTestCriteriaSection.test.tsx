// @vitest-environment jsdom
//
// The UAT test criteria table (ADR-0082 attestation-surface), owner-redesigned: each row carries ONE glyph at
// its RIGHT edge — a witness ICON whose SHAPE is the witness (robot = machine-witnessed, person =
// human-witnessed) and whose state conveys proven-ness. The single actionable case is an unproven
// HUMAN leg an admin may sign ("I saw it work" → api.signUat, a REAL events.verdict). A machine leg,
// or an already-proven one, is a non-interactive status indicator. The ⚑/⚐ vouch and the
// witness=machine|human TEXT label are gone (owner UX call). Plus the ADR-0106 d.1 guard: when the
// server flags an adopted story's still-undecided legs, the panel nudges the author to resolve them.
//
// The api client is mocked (no fetch, no dev server) and useAppData is stubbed to a desktop member
// carrying the narrow UAT permission, proving signing no longer requires a fake admin role.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import type { AttestationsPayload, UatTestCriterionRow } from '../types';

import { HttpDouble, installHttpDouble } from '../test/httpDouble';
import { WithAppData } from '../test/appData';
import type { MeInfo } from '../types';

// THE SEAMS ARE REAL, NOT MOCKED MODULES (anti-slop-adoption-arc inc-06, `no-module-mocking`): the
// TRANSPORT is doubled and the caller arrives through the app's own `AppDataContext`. The mocked
// hook returned a TWO-FIELD `me` ({role, canAttestUat}) where `MeInfo` carries five, so a gate that
// started reading `member` or `status` saw `undefined`; the real context is complete by construction.
const ATTESTATIONS = '/api/attestations';
const ATTEST = '/api/uat/attest';

let http: HttpDouble;

/** A member who may sign a human leg — the default caller for this section. */
const SIGNER: MeInfo = {
  email: 'signer@example.com',
  role: 'member',
  status: 'active',
  member: true,
  canAttestUat: true,
};
/** The same member WITHOUT the narrow signing permission. */
const NON_SIGNER: MeInfo = { ...SIGNER, canAttestUat: false };

/** The sign requests that reached the wire, oldest first. */
const signed = (): unknown[] =>
  http.requestsTo(ATTEST).filter((request) => request.method === 'POST').map((r) => r.body);

import { UatTestCriteriaSection } from './TreeView';

/** Flush the async fetch the mount effect (and any post-click reload) kicks off. */
const flush = () => act(async () => {});

type RowFixture = Omit<UatTestCriterionRow, 'criterionId' | 'revisionId'> & { id: string };

function payload(tests: RowFixture[], over: Partial<AttestationsPayload> = {}): AttestationsPayload {
  return {
    storyId: 'agent',
    tests: tests.map(({ id, ...row }) => ({
      ...row,
      criterionId: id,
      revisionId: 'uatr1:0000000000000001',
    })),
    ...over,
  };
}

/** Render the section for `storyId` as `me` (a signer by default). */
function renderSection(
  storyId: string,
  onCrownRefresh: () => void = () => {},
  me: MeInfo = SIGNER,
) {
  return render(
    <WithAppData me={me}>
      <UatTestCriteriaSection storyId={storyId} onCrownRefresh={onCrownRefresh} />
    </WithAppData>,
  );
}

beforeEach(() => {
  http = installHttpDouble();
});
afterEach(() => {
  cleanup();
  http.uninstall();
});

describe('UatTestCriteriaSection — witness-icon row (ADR-0082 redesign)', () => {
  it('shows a clickable confirm for a `human` leg and NONE for a `machine` leg', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        { id: 'agent#uat-1', title: 'machine leg', witness: 'machine' },
        { id: 'agent#uat-2', title: 'human leg', witness: 'human' },
      ]),
    );
    renderSection('agent');
    await flush();

    // the human leg's icon IS the clickable "I saw it work" affordance…
    const humanBtn = screen.getByRole('button', {
      name: /human leg: human-witnessed, not yet proven.*click to sign/i,
    });
    expect(humanBtn.hasAttribute('disabled')).toBe(false);
    // …the machine leg's icon is NOT clickable (the gate/adopt proves it, the operator does not).
    const machineBtn = screen.getByRole('button', {
      name: /machine leg: machine-witnessed, not yet proven/i,
    });
    expect(machineBtn.hasAttribute('disabled')).toBe(true);
  });

  it('keeps a plain member without the narrow UAT permission non-signable', async () => {
    http.get(ATTESTATIONS, () =>
      payload([{ id: 'agent#uat-2', title: 'human leg', witness: 'human' }]),
    );
    renderSection('agent', () => {}, NON_SIGNER);
    await flush();
    expect(
      screen.getByRole('button', { name: /human leg: human-witnessed, not yet proven/i }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('renders a person icon for a human leg and a robot icon for a machine leg', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        { id: 'agent#uat-1', title: 'machine leg', witness: 'machine' },
        { id: 'agent#uat-2', title: 'human leg', witness: 'human' },
      ]),
    );
    const { container } = renderSection('agent');
    await flush();

    // SHAPE ↔ witness: a robot under the machine-witnessed button, a person under the human one.
    expect(container.querySelector('.uat-witness.witness-machine .icon-robot')).toBeTruthy();
    expect(container.querySelector('.uat-witness.witness-machine .icon-person')).toBeNull();
    expect(container.querySelector('.uat-witness.witness-human .icon-person')).toBeTruthy();
    expect(container.querySelector('.uat-witness.witness-human .icon-robot')).toBeNull();
  });

  it('an unproven human icon SIGNS a real verdict; a machine/proven icon is inert', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        { id: 'agent#uat-1', title: 'gate leg', witness: 'machine', proven: 'pass' },
        { id: 'agent#uat-2', title: 'saw-it leg', witness: 'human' },
      ]),
    );
    http.post(ATTEST, () => ({
      verdict: { unitId: 'agent#uat-2', outcome: 'pass', signer: 'admin', at: '2026-01-01' },
    }));
    const onCrownRefresh = vi.fn();
    renderSection('agent', onCrownRefresh);
    await flush();

    // the machine + proven leg: a non-actionable status icon (passed), never the sign affordance.
    const machineBtn = screen.getByRole('button', { name: /gate leg: machine-witnessed, proven/i });
    expect(machineBtn.hasAttribute('disabled')).toBe(true);
    expect(machineBtn.className).toContain('proven-pass');
    expect(machineBtn.className).not.toContain('is-signable');

    // the human + unproven leg: the clickable sign affordance — a click signs a REAL events.verdict.
    const humanBtn = screen.getByRole('button', {
      name: /saw-it leg: human-witnessed, not yet proven.*click to sign/i,
    });
    expect(humanBtn.hasAttribute('disabled')).toBe(false);
    expect(humanBtn.className).toContain('is-signable');

    await act(async () => {
      fireEvent.click(humanBtn);
    });
    await flush();

    // The signing REQUEST BODY, exactly once, naming the human leg and never the machine one —
    // clicking the machine icon does nothing (it carries no onClick).
    expect(signed()).toEqual([{ storyId: 'agent', criterionId: 'agent#uat-2', outcome: 'pass' }]);
    // signing a per-test verdict re-pulls the panel AND repaints the world crown.
    expect(onCrownRefresh).toHaveBeenCalledTimes(1);
  });

  it('a proven human leg shows a passed, non-clickable person icon (already signed)', async () => {
    http.get(ATTESTATIONS, () =>
      payload([{ id: 'agent#uat-1', title: 'done leg', witness: 'human', proven: 'pass' }]),
    );
    const { container } = renderSection('agent');
    await flush();
    const btn = screen.getByRole('button', { name: /done leg: human-witnessed, proven/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.className).toContain('proven-pass');
    expect(container.querySelector('.witness-human .icon-person')).toBeTruthy();
  });

  it('never renders the witness as a TEXT label (the robot/person icon carries it)', async () => {
    http.get(ATTESTATIONS, () =>
      payload([{ id: 'agent#uat-1', title: 'a leg', witness: 'human' }]),
    );
    const { container } = renderSection('agent');
    await flush();
    // the word `either` is never shown (ADR-0106 d.5)…
    expect(container.textContent ?? '').not.toMatch(/either/i);
    // …and the witness cell holds only the icon button — no standalone "human"/"machine" text node.
    expect(container.querySelector('.uat-witness-cell')?.textContent?.trim() ?? '').toBe('');
  });

  it('surfaces the no-`either`-at-rest guard when the server flags unresolved legs', async () => {
    http.get(ATTESTATIONS, () =>
      payload([{ id: 'agent#uat-1', title: 'a leg', witness: 'human' }], {
        unresolvedWitnesses: ['agent#uat-3', 'agent#uat-5'],
      }),
    );
    renderSection('agent');
    await flush();
    expect(screen.getByText(/2 UAT legs on this adopted story are still undecided/i)).toBeTruthy();
  });
});

describe('UatTestCriteriaSection — ADR-0209 D7 one-liner + Library detail open', () => {
  it('renders the story-owned one-liner and never the detail-body procedure prose', async () => {
    const oneLiner = 'Reader can open the pointed detail';
    const detailProse =
      'Action: open the Library artifact and verify the action/success/evidence sections render.';
    http.get(ATTESTATIONS, () =>
      payload([
        {
          id: 'uat-detail-studio#uat-1',
          title: oneLiner,
          witness: 'machine',
          detailArtifactId: 'uat-criterion-detail:example',
        },
      ]),
    );
    const { container } = renderSection('uat-detail-studio');
    await flush();

    expect(container.querySelector('.uat-test-criterion-title')?.textContent).toBe(oneLiner);
    expect(container.textContent ?? '').not.toContain(detailProse);
    expect(container.textContent ?? '').not.toContain('Action:');
  });

  it('a pointed row links to the Library detail asset; the one-liner stays the label', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        {
          id: 'uat-detail-studio#uat-2',
          title: 'Open reaches the detail',
          witness: 'machine',
          detailArtifactId: 'uat-criterion-detail:open-me',
        },
      ]),
    );
    renderSection('uat-detail-studio');
    await flush();

    const link = screen.getByRole('link', { name: /Open reaches the detail: open Library detail/i });
    expect(link.getAttribute('href')).toBe('#/asset/uat-criterion-detail%3Aopen-me');
    expect(link.textContent).toBe('Open reaches the detail');
  });

  it('a row without a detail pointer has no fake open link', async () => {
    http.get(ATTESTATIONS, () =>
      payload([{ id: 'legacy#uat-1', title: 'Legacy one-liner', witness: 'human' }]),
    );
    const { container } = renderSection('legacy');
    await flush();

    expect(container.querySelector('.uat-test-criterion-detail-link')).toBeNull();
    expect(screen.queryByRole('link', { name: /open Library detail/i })).toBeNull();
    expect(container.querySelector('.uat-test-criterion-title')?.textContent).toBe('Legacy one-liner');
    // existing sign path undisturbed — human unproven leg stays the clickable glyph
    expect(
      screen.getByRole('button', {
        name: /Legacy one-liner: human-witnessed, not yet proven.*click to sign/i,
      }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('concision does not steal the witness sign glyph (human signable, machine inert)', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        {
          id: 'uat-detail-studio#uat-m',
          title: 'machine pointed',
          witness: 'machine',
          detailArtifactId: 'uat-criterion-detail:m',
        },
        {
          id: 'uat-detail-studio#uat-h',
          title: 'human pointed',
          witness: 'human',
          detailArtifactId: 'uat-criterion-detail:h',
        },
      ]),
    );
    renderSection('uat-detail-studio');
    await flush();

    expect(screen.getAllByRole('link', { name: /open Library detail/i })).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /machine pointed: machine-witnessed, not yet proven/i })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(
      screen.getByRole('button', {
        name: /human pointed: human-witnessed, not yet proven.*click to sign/i,
      }).hasAttribute('disabled'),
    ).toBe(false);
  });
});

// ADR-0357 D3 — the owner decides what to attest at the glyph, not in story.md, so the leg's own
// authored basis has to be readable HERE. Before this, every human leg produced the identical
// generic string: it told the owner THAT they were needed and never WHY.
describe('UatTestCriteriaSection — the human leg states WHY it needs a person (ADR-0357 D3)', () => {
  const BASIS =
    'dialog.showOpenDialog is an Electron main-process modal and Playwright drives the renderer; ' +
    'retired when the spine owns OS-level automation.';

  it('carries the leg\u2019s own basis on the hover title, not the generic human string', async () => {
    http.get(ATTESTATIONS, () =>
      payload([{ id: 'agent#uat-1', title: 'native picker', witness: 'human', witnessBasis: BASIS }]),
    );
    renderSection('agent');
    await flush();

    const btn = screen.getByRole('button', { name: /native picker/i });
    expect(btn.getAttribute('title')).toContain(BASIS);
    expect(btn.getAttribute('aria-label')).toContain(BASIS);
  });

  it('distinguishes two human legs from each other — the defect was one identical string', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        { id: 'agent#uat-1', title: 'leg one', witness: 'human', witnessBasis: 'first basis.' },
        { id: 'agent#uat-2', title: 'leg two', witness: 'human', witnessBasis: 'second basis.' },
      ]),
    );
    renderSection('agent');
    await flush();

    const one = screen.getByRole('button', { name: /leg one/i }).getAttribute('title');
    const two = screen.getByRole('button', { name: /leg two/i }).getAttribute('title');
    expect(one).toContain('first basis.');
    expect(two).toContain('second basis.');
    expect(one).not.toEqual(two);
  });

  it('keeps the basis once the leg is PROVEN — it is why the leg is human at all', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        { id: 'agent#uat-1', title: 'proven leg', witness: 'human', witnessBasis: BASIS, proven: 'pass' },
      ]),
    );
    renderSection('agent');
    await flush();

    expect(screen.getByRole('button', { name: /proven leg/i }).getAttribute('title')).toContain(BASIS);
  });

  it('adds nothing to a machine leg, and falls back cleanly on a human leg with no basis yet', async () => {
    http.get(ATTESTATIONS, () =>
      payload([
        { id: 'agent#uat-1', title: 'machine leg', witness: 'machine' },
        { id: 'agent#uat-2', title: 'bare human leg', witness: 'human' },
      ]),
    );
    renderSection('agent');
    await flush();

    expect(screen.getByRole('button', { name: /machine leg/i }).getAttribute('title')).not.toContain(
      'Why this needs a person',
    );
    expect(screen.getByRole('button', { name: /bare human leg/i }).getAttribute('title')).not.toContain(
      'Why this needs a person',
    );
  });
});
