// @vitest-environment jsdom
//
// ADR-0106 d.5: the owner surface is BINARY. A UAT leg whose resolved witness is `human` shows the
// operator a clickable "I saw it work" confirm affordance; a `machine` leg shows none (adopt/build
// proves it). The word `either` is never rendered. Plus the d.1 guard: when the server flags an
// adopted story's still-undecided legs, the panel nudges the author to resolve them.
//
// The api client is mocked (no fetch, no dev server) and useAppData is stubbed to an admin, so the
// panel renders deterministically from an injected attestations payload.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import type { AttestationsPayload, UatTestRow } from '../types';

const apiMock = vi.hoisted(() => ({
  attestations: vi.fn<(storyId: string) => Promise<AttestationsPayload>>(),
  signUat: vi.fn(),
  recordAttestation: vi.fn(),
}));
vi.mock('../api', () => ({ api: apiMock }));
vi.mock('../lib/appData', () => ({ useAppData: () => ({ me: { role: 'admin' } }) }));

import { UatTestsSection } from './TreeView';

/** Flush the async fetch the mount effect kicks off. */
const flush = () => act(async () => {});

function payload(tests: UatTestRow[], over: Partial<AttestationsPayload> = {}): AttestationsPayload {
  return { storyId: 'agent', tests, ...over };
}

beforeEach(() => {
  apiMock.attestations.mockReset();
  apiMock.signUat.mockReset();
  apiMock.recordAttestation.mockReset();
});
afterEach(() => cleanup());

describe('UatTestsSection — binary owner surface (ADR-0106)', () => {
  it('shows a clickable confirm for a `human` leg and NONE for a `machine` leg', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([
        { id: 'agent#uat-1', title: 'machine leg', witness: 'machine' },
        { id: 'agent#uat-2', title: 'human leg', witness: 'human' },
      ]),
    );
    render(<UatTestsSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();

    // the human leg's proven cell IS the clickable "I saw it work" affordance…
    const humanBtn = screen.getByRole('button', { name: /I saw human leg work — sign a verdict/i });
    expect(humanBtn.hasAttribute('disabled')).toBe(false);
    // …the machine leg's proven cell is NOT clickable (adopt/build proves it, the operator does not).
    const machineBtn = screen.getByRole('button', { name: /machine leg: not proven/i });
    expect(machineBtn.hasAttribute('disabled')).toBe(true);
  });

  it('never renders the word `either`', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'agent#uat-1', title: 'a leg', witness: 'human' }]),
    );
    const { container } = render(<UatTestsSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();
    expect(container.textContent ?? '').not.toMatch(/either/i);
  });

  it('surfaces the no-`either`-at-rest guard when the server flags unresolved legs', async () => {
    apiMock.attestations.mockResolvedValue(
      payload([{ id: 'agent#uat-1', title: 'a leg', witness: 'human' }], {
        unresolvedWitnesses: ['agent#uat-3', 'agent#uat-5'],
      }),
    );
    render(<UatTestsSection storyId="agent" onCrownRefresh={() => {}} />);
    await flush();
    expect(screen.getByText(/2 UAT legs on this adopted story are still undecided/i)).toBeTruthy();
  });
});
