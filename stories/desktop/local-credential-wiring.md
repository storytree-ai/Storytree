---
id: "local-credential-wiring"
tier: capability
story: desktop
title: "Retired — the desktop in-app build credential hand-off"
outcome: "Retired by ADR-0404: no production Desktop path feeds an OS-keychain credential to an in-app build; the independently real keychain, preload, per-operation lifetime and no-readback behaviours remain owned by credential-broker and electron-shell."
status: retired
proof_mode: integration-test
depends_on: [credential-broker, local-backend-boot]
# RETIRED by ADR-0404 (2026-08-22), after events.uat_drive seq 37 tested the authored production
# journey and the real desktop answered `404 build is not enabled`. ADR-0404 deliberately deleted the
# in-app Build route and its backend-entry composition; `credentialedBuildRunner` is no longer composed
# into production, so the hand-off this capability claimed has no application path left to prove.
#
# The former `real:` proof arm is removed rather than repointed. Its source and tests still exist, but
# provide component evidence for `credential-broker`'s per-operation env lifetime, fail-closed selection
# and renderer no-leak boundary (that capability declares them in its proof scope). Treating those tests
# as a replacement production route would turn an independently real safety property into invented
# application behaviour.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
---

# Retired — the desktop in-app build credential hand-off

**Retirement —** This capability described the production hand-off behind the desktop's in-app Build
dispatch: read a Claude credential from the main-process broker, make it ambient for one local build
invocation, then scrub it without returning the value to the renderer. ADR-0404 made the CLI the only
build-dispatch surface and deleted the desktop route/composition. The seq 37 live drive confirmed the
resulting product honestly returns `404 build is not enabled`; there is no driver invocation left for a
Desktop UAT to observe.

**No replacement behaviour is authored here.** A CLI build is a different dispatch boundary. It neither
consumes the desktop keychain nor proves the old broker-to-build hand-off, so this capability and its
criterion are retired rather than re-pointed.

## Independently real behaviours that remain

- [`credential-broker`](credential-broker.md) still owns storing, checking and removing independently
  namespaced credential kinds through the OS keychain, plus the per-operation environment lifetime and
  fail-closed credential selection proven by the bridge/runner component tests.
- [`electron-shell`](electron-shell.md) still owns the real keychain adapter and context-isolated
  `desktopAuth` preload. The renderer can submit a value once and ask boolean status, but it has no raw
  stored-value getter.
- `apps/desktop/src/backend/credential-bridge.ts`, `credentialed-build-runner.ts` and their tests remain
  in the repository as component evidence used by `credential-broker`; their existence does not make
  them a production composition.

## Historical boundary

This unit formerly depended on `credential-broker` for the keychain read and `local-backend-boot` for
the in-app driver surface. ADR-0404 removed the second half of that conjunction. The dependency list is
kept only as retired history; the capability is absent from Desktop's current capability list and graph,
and its former `real:` arm is gone so no build can select it as current work.
