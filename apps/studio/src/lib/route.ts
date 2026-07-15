// Tiny hash router — no dependency, deep-linkable. Doc/asset ids are URI-encoded
// into a single hash segment so slashes in doc relpaths don't break parsing.

import { useSyncExternalStore } from 'react';

// The standalone `#/library` page is retired (ADR-0185 dec 6): the Library lives as a lens over
// the forest map, opened via `libraryHref()`'s `?overlay=library#/tree` href. `parseRoute` never
// produces a library route — `/library` paths redirect to the tree route below.
export type Route =
  | { name: 'home' }
  | { name: 'doc'; id: string }
  | { name: 'asset'; id: string }
  | { name: 'asset-edit'; id: string }
  | { name: 'asset-new' }
  | { name: 'tree'; focus: string | null }
  | { name: 'members' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'home' };
  if (path === '/members') return { name: 'members' };
  if (path === '/tree') return { name: 'tree', focus: null };
  if (path.startsWith('/tree/')) {
    const focus = decodeURIComponent(path.slice('/tree/'.length));
    return { name: 'tree', focus: focus || null };
  }
  if (path === '/library' || path.startsWith('/library/')) return { name: 'tree', focus: null };
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
export const membersHref = '#/members';
export const treeHref = '#/tree';
export const treeFocusHref = (storyId: string): string => `#/tree/${encodeURIComponent(storyId)}`;
export const libraryHref = (): string => '?overlay=library#/tree';
export const docHref = (id: string): string => `#/doc/${encodeURIComponent(id)}`;
export const assetHref = (id: string): string => `#/asset/${encodeURIComponent(id)}`;
export const assetEditHref = (id: string): string => `#/asset/${encodeURIComponent(id)}/edit`;
export const assetNewHref = '#/asset/new';
