// App-wide data shared via context: the doc index, guidance assets, and all
// comments — one source of truth so sidebar badges and views stay in sync.
// Loaded and refreshed by <App>.

import { createContext, useContext } from 'react';
import type { Comment, DocMeta, GuidanceAsset, MeInfo } from '../types';

export interface AppData {
  docs: DocMeta[];
  docIds: Set<string>;
  docTitles: Map<string, string>;
  assets: GuidanceAsset[];
  comments: Comment[];
  /** The signed-in caller's circle membership/role (ADR-0043). Drives admin-only UI. */
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

/** Unresolved-comment count for a topic, for sidebar/list badges. */
export function openCount(comments: Comment[], topicId: string): number {
  return comments.filter((c) => c.topicId === topicId && !c.resolved).length;
}
