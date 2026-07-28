// App-wide data shared via context: the doc index, guidance assets, and all
// comments — one source of truth so sidebar badges and views stay in sync.
// Loaded and refreshed by <App>.
//
// map-boot-independence (ADR-0240 decision 2 stage 4): `assets` starts empty and is populated
// independently of the map's own /api/tree fetch — `assetsStatus`/`assetsError` let a Library-
// corpus consumer (AssetView, AssetEditor) tell "not yet loaded" from "genuinely empty" instead of
// reading the initial empty array as a resolved, empty corpus. Both are OPTIONAL on this interface
// (rather than replacing `comments`/`refreshComments` outright, as the node spec's dead-fetch
// finding would otherwise call for) because several existing test fixtures construct an `AppData`
// value by hand and sit outside this unit's write scope — see the fixtures listed in
// `App.boot-independence.test.tsx`'s companion node spec; making the new fields optional (and
// leaving the existing ones in place) keeps every one of those fixtures type-valid unedited.
// `comments` itself is no longer populated by <App> during boot (no reader needs it — see
// `App.tsx`), but the field stays on the interface for exactly that reason.

import { createContext, useContext } from 'react';
import type { Comment, DocMeta, GuidanceAsset, MeInfo } from '../types';

export interface AppData {
  docs: DocMeta[];
  docIds: Set<string>;
  docTitles: Map<string, string>;
  assets: GuidanceAsset[];
  /** Whether `assets` reflects a resolved `/api/assets` response yet. Optional — see header. */
  assetsStatus?: 'loading' | 'ready' | 'error';
  /** The failure message when `assetsStatus === 'error'` — empty/absent otherwise. */
  assetsError?: string;
  comments: Comment[];
  /** The signed-in caller's membership/role (ADR-0043). Drives admin-only UI. */
  me: MeInfo;
  refreshComments: () => Promise<void>;
  refreshAssets: () => Promise<void>;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used within <AppDataContext>');
  return value;
}
