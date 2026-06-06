# Test fixtures must mirror production failure modes

**Rule:** a fixture, stub, or mock must be designed so the test *fails when production fails*. A fixture that pre-installs a property production might lack — priming a stub with one platform's error wording, pre-creating state production does not create, granting an access production's runtime does not have — is defective: it hands the test a false green that hides the production failure mode.

## Why this matters

The glossary permits mocks at the contract-test tier (collaborators are stubbed) but forbids them within an organism (capability integration tests and the story UAT run against real in-story collaborators — the `mock-UAT seam` rule). That tells you *where* a mock may live; it is silent on whether a permitted mock is sterile or adversarial. This guideline closes that gap. A mock that satisfies the no-mocks-in-the-organism rule can still be defective if it stages a world more forgiving than what the code will actually meet.

## The inversion check

Per pre-install in the fixture, ask two questions in order:

1. **Inversion.** If I remove this pre-install, does the test still cover its observable?
   - **Yes** → the pre-install is convenience or isolation, not masking. Fine.
   - **No** → it is load-bearing. Continue.

2. **Production guarantee.** Does production *guarantee* the property — by build config, by a documented invariant, by the boundary contract it stands on?
   - **Yes** → the fixture mirrors a real guarantee. Fine.
   - **No** → the fixture is masking a production failure mode. Defective. Remediate.

## Remediations when a fixture masks

- **Drop the pre-install and assert the typed error** production should return when the property is absent (fail-loud pattern).
- **Add a sibling test** that exercises the property-absent case explicitly, so both branches of the possible world are covered.
- **Escalate so production guarantees the property** — the fix may belong in the code/build config (make the guarantee real) rather than in the test pretending the property always holds.

## Where it fires

- When the owned loop scaffolds a new contract or integration test — especially fixtures simulating filesystem state, container/runtime state, user/permission context, or external-process behaviour (priming a stub's exit codes, error wordings, or output).
- When re-authoring tests after a UAT-caught defect: this is exactly when the rule is most active. The previous fixture let a defect through; the re-author must install one that does *not* mask the same class. If the new fixture would still let the original defect through, the contract has not been tightened.
- When the owned loop is chasing a production failure a green test did not catch — suspect the fixture before blaming the environment. The fix is usually in the fixture (or in making production guarantee the property), not a workaround in the source.

This composes with [implementer-shortcut-patterns](implementer-shortcut-patterns.md): both are "green test, red production" disciplines on inverse axes — sterile fixture here, hollow implementation there. Many UAT-caught defects implicate both.
