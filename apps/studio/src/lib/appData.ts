// App-wide data shared via context: the doc index and the guidance assets — one source of truth so
// the Library views stay in sync. Loaded and refreshed by <App>.
//
// map-boot-independence (ADR-0240 decision 2 stage 4): `assets` starts empty and is populated
// independently of the map's own /api/tree fetch, so a consumer can now observe the collection
// BEFORE `/api/assets` has resolved — a window that did not exist while the whole app was withheld
// behind the corpus. `assetsStatus`/`assetsError` are what let a consumer tell "not yet loaded"
// from "resolved and genuinely empty", and they are REQUIRED rather than optional on purpose: an
// absent status reads as `undefined`, which falls through every `=== 'loading'` / `=== 'error'`
// check straight into the "genuinely empty" branch — reintroducing exactly the dishonesty this
// unit exists to prevent (ADR-0240 decision 3), silently, for any AppData built without it.
//
// The `comments` collection and its refresher were REMOVED here, not deferred. Established by
// probe: nothing in apps/studio/src ever read them. `openCount` — their only helper — had no
// callers; the "sidebar badges" this header used to describe retired with the per-category rail
// (ADR-0185 decision 6); and the live comment surfaces own their own data (InlineCommentThread
// fetches per topic, ReviewBlocks polls its own feed). `/api/comments`, `api.listComments()`, and
// every per-topic surface are untouched — only the dead boot fetch and the dead field are gone.

import { createContext, useContext } from 'react';
import type { DocMeta, GuidanceAsset, MeInfo } from '../types';

export interface AppData {
  docs: DocMeta[];
  docIds: Set<string>;
  docTitles: Map<string, string>;
  assets: GuidanceAsset[];
  /** Whether `assets` reflects a resolved `/api/assets` response yet. Required — see header. */
  assetsStatus: 'loading' | 'ready' | 'error';
  /** The failure message when `assetsStatus === 'error'` — an empty string otherwise. */
  assetsError: string;
  /** The signed-in caller's membership/role (ADR-0043). Drives admin-only UI. */
  me: MeInfo;
  refreshAssets: () => Promise<void>;
}

export const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used within <AppDataContext>');
  return value;
}
