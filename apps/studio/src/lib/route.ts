// Tiny hash router — no dependency, deep-linkable. Doc/asset ids are URI-encoded
// into a single hash segment so slashes in doc relpaths don't break parsing.

import { useSyncExternalStore } from 'react';
import { ASSET_CATEGORIES, type AssetCategory } from '../types';

export type Route =
  | { name: 'home' }
  | { name: 'doc'; id: string }
  | { name: 'library'; category: AssetCategory | null }
  | { name: 'asset'; id: string }
  | { name: 'asset-edit'; id: string }
  | { name: 'asset-new' }
  | { name: 'tree'; focus: string | null }
  | { name: 'circle' };

function asCategory(value: string): AssetCategory | null {
  return (ASSET_CATEGORIES as string[]).includes(value) ? (value as AssetCategory) : null;
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'home' };
  if (path === '/circle') return { name: 'circle' };
  if (path === '/tree') return { name: 'tree', focus: null };
  if (path.startsWith('/tree/')) {
    const focus = decodeURIComponent(path.slice('/tree/'.length));
    return { name: 'tree', focus: focus || null };
  }
  if (path === '/library') return { name: 'library', category: null };
  if (path.startsWith('/library/')) {
    return { name: 'library', category: asCategory(path.slice('/library/'.length)) };
  }
  if (path.startsWith('/doc/')) {
    return { name: 'doc', id: decodeURIComponent(path.slice('/doc/'.length)) };
  }
  if (path.startsWith('/asset/')) {
    const rest = path.slice('/asset/'.length);
    if (rest === 'new') return { name: 'asset-new' };
    const [encId, sub] = rest.split('/');
    const id = decodeURIComponent(encId ?? '');
    if (sub === 'edit') return { name: 'asset-edit', id };
    if (id) return { name: 'asset', id };
  }
  return { name: 'home' };
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash || '#/',
    () => '#/',
  );
  return parseRoute(hash);
}

export function navigate(to: string): void {
  if (window.location.hash !== to) window.location.hash = to;
}

export const homeHref = '#/';
export const circleHref = '#/circle';
export const treeHref = '#/tree';
export const treeFocusHref = (storyId: string): string => `#/tree/${encodeURIComponent(storyId)}`;
export const libraryHref = (category?: AssetCategory | null): string =>
  category ? `#/library/${category}` : '#/library';
export const docHref = (id: string): string => `#/doc/${encodeURIComponent(id)}`;
export const assetHref = (id: string): string => `#/asset/${encodeURIComponent(id)}`;
export const assetEditHref = (id: string): string => `#/asset/${encodeURIComponent(id)}/edit`;
export const assetNewHref = '#/asset/new';
