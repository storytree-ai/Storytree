// Unit test for the studio's operator-attested UAT verdict builder (ADR-0082, apiRouter.buildUatVerdict):
// the pure half of the "I saw it work" button. It is fed the REAL `checkUatProof`, so the studio's
// sign-time honesty walls are held to the SAME compute the CLI `uat attest` and the spine use — a
// machine-witness test or an agent/`sandbox:` signer is refused BEFORE any verdict exists, and a
// legitimate human signature yields a real `operator-attested` Verdict (the kind that greens a crown,
// NOT the lower-rigor events.attestation vouch).

import { describe, it, expect } from 'vitest';
import { Verdict } from '@storytree/proof-protocol';
import { checkUatProof } from '@storytree/orchestrator';

import { buildUatVerdict } from './apiRouter.js';

const base = {
  outcome: 'pass' as const,
  signer: 'hua.mick@gmail.com',
  commitSha: 'cafebabecafebabecafebabecafebabecafebabe',
  at: '2026-06-21T00:00:00.000Z',
};
const C1 = 'uatc_000000000000000000000001';
const C2 = 'uatc_000000000000000000000002';
const C3 = 'uatc_000000000000000000000003';
const R1 = 'uatr1:0000000000000001';

describe('buildUatVerdict (the studio "I saw it work" honesty walls)', () => {
  it('builds a real operator-attested verdict for a human-witness test signed by a person', () => {
    const got = buildUatVerdict(
      { ...base, test: { criterionId: C1, revisionId: R1, witness: 'human' } },
      checkUatProof,
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    // It is a REAL gate verdict (validates against the published Verdict shape), not a vouch.
    expect(() => Verdict.parse(got.verdict)).not.toThrow();
    expect(got.verdict).toMatchObject({
      unitId: C1,
      criterionId: C1,
      revisionId: R1,
      proofMode: 'operator-attested',
      outcome: 'pass',
      commitSha: base.commitSha,
      signer: 'hua.mick@gmail.com',
      outputVersion: 'v1',
      at: base.at,
    });
    // The signer is recorded as operator-attested evidence (provenance for the verdict).
    expect(got.verdict.evidence).toEqual([{ kind: 'operator-attested', ref: 'hua.mick@gmail.com' }]);
    // The runId is the studio's own, distinct from a CLI/build run.
    expect(got.verdict.runId).toContain('studio-uat-attest:');
  });

  it('carries an optional note as operator-attested evidence', () => {
    const got = buildUatVerdict(
      {
        ...base,
        test: { criterionId: C1, revisionId: R1, witness: 'human' },
        note: '  looked right  ',
      },
      checkUatProof,
    );
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.verdict.evidence[0]).toEqual({
      kind: 'operator-attested',
      ref: 'hua.mick@gmail.com',
      note: 'looked right',
    });
  });

  it('proves an `either`-witness test by an operator attestation', () => {
    const got = buildUatVerdict(
      { ...base, test: { criterionId: C3, revisionId: R1, witness: 'either' } },
      checkUatProof,
    );
    expect(got.ok).toBe(true);
  });

  it('REFUSES a machine-witness test — a click cannot stand in for a machine proof (ADR-0082 d.2)', () => {
    const got = buildUatVerdict(
      { ...base, test: { criterionId: C2, revisionId: R1, witness: 'machine' } },
      checkUatProof,
    );
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.reason).toMatch(/machine/i);
  });

  it('REFUSES an agent/`sandbox:` signer on a human test (ADR-0007 no-self-exempt)', () => {
    const got = buildUatVerdict(
      {
        ...base,
        test: { criterionId: C1, revisionId: R1, witness: 'human' },
        signer: 'sandbox:run-42',
      },
      checkUatProof,
    );
    expect(got.ok).toBe(false);
    if (got.ok) return;
    expect(got.reason).toMatch(/agent|self-attest|sandbox/i);
  });

  it('REFUSES a blank signer (fail-closed)', () => {
    const got = buildUatVerdict(
      {
        ...base,
        test: { criterionId: C1, revisionId: R1, witness: 'human' },
        signer: '   ',
      },
      checkUatProof,
    );
    expect(got.ok).toBe(false);
  });
});
