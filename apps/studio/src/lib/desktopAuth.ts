// The desktop credential bridge (ADR-0179), as the studio renderer sees it.
//
// The studio bundle is served in TWO places: the hosted/dev studio (a browser, no Electron) and the
// desktop app (which renders this same bundle and injects `window.desktopAuth` via its preload). This
// module is how the shared Credentials panel FEATURE-DETECTS the desktop app: `getDesktopAuth()` returns
// the bridge only when the preload injected it, so the hosted studio shows no non-functional keychain
// controls. The renderer imports NO Electron/agent/build code — its only path to credential storage is
// this injected bridge (ADR-0004 / ADR-0109 §Decision 4 / ADR-0179 §3).
//
// Kinds: oauth + api-key only (cursor-api-key retired with the Cursor leaf — ADR-0198).

/** The independently namespaced credential kinds the desktop broker hosts. */
export type CredentialKind = "oauth" | "api-key";

/** The kinds in stable display order (matches apps/desktop/src/credential/kinds.ts). */
export const CREDENTIAL_KINDS: readonly CredentialKind[] = ["oauth", "api-key"];

/**
 * The bridge the desktop preload exposes on `window`. Absent in the hosted/dev studio (a browser).
 * Raw values flow renderer → main on `store` only; `status` and `signOut` are boolean-only.
 */
export interface DesktopAuthBridge {
  store: (kind: CredentialKind, value: string) => Promise<void>;
  status: (kind: CredentialKind) => Promise<boolean>;
  signOut: (kind: CredentialKind) => Promise<boolean>;
}

declare global {
  interface Window {
    /** Injected by the desktop preload (ADR-0109 / ADR-0179). Undefined in the hosted/dev studio. */
    desktopAuth?: DesktopAuthBridge;
  }
}

/** The desktop auth bridge, or `undefined` in a plain browser (the hosted/dev studio). */
export function getDesktopAuth(): DesktopAuthBridge | undefined {
  return typeof window !== "undefined" ? window.desktopAuth : undefined;
}
