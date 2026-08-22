// A faithful test value for the app-wide data context (lib/appData.ts).
//
// WHY THIS EXISTS (anti-slop-adoption-arc inc-06, `no-module-mocking`). Suites used to replace the
// module with `vi.mock('../lib/appData', () => ({ useAppData: () => ({ …some fields… }) }))`. There
// was already a real seam one line away — `AppDataContext` — and the module mock was strictly worse
// than using it in a way that matters: the mocked hook returned a PARTIAL `AppData`, so a component
// that started reading a field the test never supplied got `undefined` silently. `docsStatus` is
// exactly such a field, and its own header in `lib/appData.ts` explains at length why an absent
// status falls through every `=== 'loading'` / `=== 'error'` check into the "genuinely empty" branch
// — reintroducing the dishonesty that unit exists to prevent.
//
// Going through the real provider makes the value COMPLETE BY CONSTRUCTION: `AppData` is a checked
// type, so a new required field breaks compilation here, once, instead of reading as `undefined`
// across every suite that happened to mock the hook.

import type { ReactNode } from 'react';

import { AppDataContext, type AppData } from '../lib/appData';
import type { MeInfo } from '../types';

/** The default caller — an active admin, since most surfaces gate on membership before anything. */
export const TEST_ME: MeInfo = {
  email: 'operator@example.com',
  role: 'admin',
  status: 'active',
  member: true,
};

/**
 * A complete `AppData` with empty-but-resolved defaults. Override only what a test is about — the
 * rest is honest rather than absent (`docsStatus: 'ready'` means "resolved and empty", which is a
 * different fact from "not loaded yet", and the surfaces under test tell them apart).
 */
export function testAppData(overrides: Partial<AppData> = {}): AppData {
  return {
    docs: [],
    docIds: new Set<string>(),
    docTitles: new Map<string, string>(),
    docsStatus: 'ready',
    docsError: '',
    assets: [],
    assetsStatus: 'ready',
    assetsError: '',
    me: TEST_ME,
    refreshAssets: async () => {},
    ...overrides,
  };
}

/** Mount `children` under a real {@link AppDataContext} carrying {@link testAppData}. */
export function WithAppData({
  children,
  ...overrides
}: Partial<AppData> & { children: ReactNode }): React.JSX.Element {
  return <AppDataContext.Provider value={testAppData(overrides)}>{children}</AppDataContext.Provider>;
}
