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

const apiMock = vi.hoisted(() => ({
  attestations: vi.fn<(storyId: string) => Promise<AttestationsPayload>>(),
  signUat: vi.fn(),
}));
const appDataMock = vi.hoisted(() => ({
  me: { role: 'member', canAttestUat: true } as { role: 'admin' | 'member'; canAttestUat?: boolean },
}));
vi.mock('../api', () => ({ api: apiMock }));
vi.mock('../lib/appData', () => ({
  useAppData: () => ({ me: appDataMock.me }),
}));

import { UatTestCriteriaSection } from './TreeView';

/** Flush the async fetch the mount effect (and any post-click reload) kicks off. */
const flush = () => act(async () => {});

function payload(tests: UatTestCriterionRow[], over: Partial<AttestationsPayload> = {}): AttestationsPayload {
  return { storyId: 'agent', tests, ...over };
}

beforeEach(() => {
  apiMock.attestations.mockReset();
  apiMock.signUat.mockReset();
  appDataMock.me = { role: 'member', canAttestUat: true };
});
afterEach(() => cleanup());

describe('UatTestCriteriaSection — witness-icon row (ADR-0082 redesign)', () => {
  it('shows a clickable confirm for a `human` leg and NONE for a `machine` leg', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([
        { id: 'agent#uat-1', title: 'machine leg', witness: 'machine' },
        { id: 'agent#uat-2', title: 'human leg', witness: 'human' },
      ]),
    );
    render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={() => {}} />);
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
    appDataMock.me = { role: 'member' };
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'agent#uat-2', title: 'human leg', witness: 'human' }]),
    );
    render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();
    expect(
      screen.getByRole('button', { name: /human leg: human-witnessed, not yet proven/i }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('renders a person icon for a human leg and a robot icon for a machine leg', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([
        { id: 'agent#uat-1', title: 'machine leg', witness: 'machine' },
        { id: 'agent#uat-2', title: 'human leg', witness: 'human' },
      ]),
    );
    const { container } = render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();

    // SHAPE ↔ witness: a robot under the machine-witnessed button, a person under the human one.
    expect(container.querySelector('.uat-witness.witness-machine .icon-robot')).toBeTruthy();
    expect(container.querySelector('.uat-witness.witness-machine .icon-person')).toBeNull();
    expect(container.querySelector('.uat-witness.witness-human .icon-person')).toBeTruthy();
    expect(container.querySelector('.uat-witness.witness-human .icon-robot')).toBeNull();
  });

  it('an unproven human icon SIGNS a real verdict; a machine/proven icon is inert', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([
        { id: 'agent#uat-1', title: 'gate leg', witness: 'machine', proven: 'pass' },
        { id: 'agent#uat-2', title: 'saw-it leg', witness: 'human' },
      ]),
    );
    apiMock.signUat.mockResolvedValue({
      verdict: { unitId: 'agent#uat-2', outcome: 'pass', signer: 'admin', at: '2026-01-01' },
    });
    const onCrownRefresh = vi.fn();
    render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={onCrownRefresh} />);
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

    expect(apiMock.signUat).toHaveBeenCalledTimes(1);
    expect(apiMock.signUat).toHaveBeenCalledWith({ testId: 'agent#uat-2', outcome: 'pass' });
    // clicking the machine icon does nothing (no onClick) — signUat fired exactly once, from the human.
    expect(apiMock.signUat).not.toHaveBeenCalledWith({ testId: 'agent#uat-1', outcome: 'pass' });
    // signing a per-test verdict re-pulls the panel AND repaints the world crown.
    expect(onCrownRefresh).toHaveBeenCalledTimes(1);
  });

  it('a proven human leg shows a passed, non-clickable person icon (already signed)', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'agent#uat-1', title: 'done leg', witness: 'human', proven: 'pass' }]),
    );
    const { container } = render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();
    const btn = screen.getByRole('button', { name: /done leg: human-witnessed, proven/i });
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.className).toContain('proven-pass');
    expect(container.querySelector('.witness-human .icon-person')).toBeTruthy();
  });

  it('never renders the witness as a TEXT label (the robot/person icon carries it)', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'agent#uat-1', title: 'a leg', witness: 'human' }]),
    );
    const { container } = render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();
    // the word `either` is never shown (ADR-0106 d.5)…
    expect(container.textContent ?? '').not.toMatch(/either/i);
    // …and the witness cell holds only the icon button — no standalone "human"/"machine" text node.
    expect(container.querySelector('.uat-witness-cell')?.textContent?.trim() ?? '').toBe('');
  });

  it('surfaces the no-`either`-at-rest guard when the server flags unresolved legs', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'agent#uat-1', title: 'a leg', witness: 'human' }], {
        unresolvedWitnesses: ['agent#uat-3', 'agent#uat-5'],
      }),
    );
    render(<UatTestCriteriaSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();
    expect(screen.getByText(/2 UAT legs on this adopted story are still undecided/i)).toBeTruthy();
  });
});

describe('UatTestCriteriaSection — ADR-0209 D7 one-liner + Library detail open', () => {
  it('renders the story-owned one-liner and never the detail-body procedure prose', async () => {
    const oneLiner = 'Reader can open the pointed detail';
    const detailProse =
      'Action: open the Library artifact and verify the action/success/evidence sections render.';
    apiMock.attestations.mockResolvedValue(
      payload([
        {
          id: 'uat-detail-studio#uat-1',
          title: oneLiner,
          witness: 'machine',
          detailArtifactId: 'uat-criterion-detail:example',
        },
      ]),
    );
    const { container } = render(
      <UatTestCriteriaSection storyId="uat-detail-studio" onCrownRefresh={() => {}} />,
    );
    await flush();

    expect(container.querySelector('.uat-test-criterion-title')?.textContent).toBe(oneLiner);
    expect(container.textContent ?? '').not.toContain(detailProse);
    expect(container.textContent ?? '').not.toContain('Action:');
  });

  it('a pointed row links to the Library detail asset; the one-liner stays the label', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([
        {
          id: 'uat-detail-studio#uat-2',
          title: 'Open reaches the detail',
          witness: 'machine',
          detailArtifactId: 'uat-criterion-detail:open-me',
        },
      ]),
    );
    render(<UatTestCriteriaSection storyId="uat-detail-studio" onCrownRefresh={() => {}} />);
    await flush();

    const link = screen.getByRole('link', { name: /Open reaches the detail: open Library detail/i });
    expect(link.getAttribute('href')).toBe('#/asset/uat-criterion-detail%3Aopen-me');
    expect(link.textContent).toBe('Open reaches the detail');
  });

  it('a row without a detail pointer has no fake open link', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'legacy#uat-1', title: 'Legacy one-liner', witness: 'human' }]),
    );
    const { container } = render(
      <UatTestCriteriaSection storyId="legacy" onCrownRefresh={() => {}} />,
    );
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
    apiMock.attestations.mockResolvedValue(
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
    render(<UatTestCriteriaSection storyId="uat-detail-studio" onCrownRefresh={() => {}} />);
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
