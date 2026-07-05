// @vitest-environment jsdom
//
// State-machine tests for the store-health banner. The api module is mocked (no fetch, no
// dev server) and the poll loop runs on fake timers, so every transition is driven exactly:
//   • stopped → Start DB click → starting → (health ok) → healthy, onRecovered fires
//   • the refine-once path: one /api/db/status call per outage, not per poll tick
//   • the 2026-06-12 freeze gap: /api/health itself failing repeatedly while 'starting'
//     used to spin forever — now SERVER_LOST_AFTER consecutive failures flip the banner
//     to honest "the studio server itself is unreachable" copy, and recovery still works.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { StoreHealth, DbStatus } from '../types';

const apiMock = vi.hoisted(() => ({
  health: vi.fn<() => Promise<StoreHealth>>(),
  dbStatus: vi.fn<() => Promise<DbStatus>>(),
  dbStart: vi.fn<() => Promise<{ ok: true }>>(),
  dbWake: vi.fn<() => Promise<{ ok: true }>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { StoreBanner, SERVER_LOST_AFTER } from './StoreBanner';

const FAST_POLL_MS = 5_000; // mirrors StoreBanner's fast cadence (down/starting phases)
const SLOW_POLL_MS = 30_000; // …and the slow one (healthy / no verdict yet)

const healthy: StoreHealth = { store: 'pg', db: 'ok' };
const dbDown: StoreHealth = { store: 'pg', db: 'unreachable' };
const stopped: DbStatus = { state: 'STOPPED', activationPolicy: 'NEVER' };
// Code stamps: the checkout moved under the running server vs a fresh (restarted) one.
const movedStamp = { startedAt: 'a'.repeat(40), head: 'b'.repeat(40), stale: true };
const freshStamp = { startedAt: 'b'.repeat(40), head: 'b'.repeat(40), stale: false };

/** Flush the async probe chain that render/timers kicked off. */
const flush = () => act(async () => {});
/** Advance the poll clock (and flush whatever the tick triggered). */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

let onRecovered: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.health.mockReset();
  apiMock.dbStatus.mockReset();
  apiMock.dbStart.mockReset();
  apiMock.dbWake.mockReset();
  onRecovered = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { desktopApply?: unknown }).desktopApply; // never leak the desktop bridge
});

const renderBanner = () => render(<StoreBanner onRecovered={onRecovered} />);

describe('StoreBanner', () => {
  it('renders nothing while healthy, the offline badge for the json store', async () => {
    apiMock.health.mockResolvedValue(healthy);
    const { container, unmount } = renderBanner();
    await flush();
    expect(container.innerHTML).toBe('');
    unmount();

    apiMock.health.mockResolvedValue({ store: 'json', db: 'n/a' });
    renderBanner();
    await flush();
    expect(screen.getByText('offline store (json)')).toBeTruthy();
  });

  it('refines an outage into "stopped" via ONE /api/db/status call, not one per tick', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockResolvedValue(stopped);
    renderBanner();
    await flush();
    expect(screen.getByText('The live store (Cloud SQL) is stopped.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start DB' })).toBeTruthy();

    await tick(FAST_POLL_MS);
    await tick(FAST_POLL_MS);
    expect(apiMock.dbStatus).toHaveBeenCalledTimes(1); // refine-once per outage
    expect(screen.getByText('The live store (Cloud SQL) is stopped.')).toBeTruthy();
  });

  it('shows "unreachable" when the instance is not STOPPED (likely still booting)', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockResolvedValue({ state: 'RUNNABLE', activationPolicy: 'ALWAYS' });
    renderBanner();
    await flush();
    expect(screen.getByText(/unreachable — it may still be coming up/)).toBeTruthy();
  });

  it('stopped → Start DB → starting → health ok → banner gone + onRecovered', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockResolvedValue(stopped);
    apiMock.dbStart.mockResolvedValue({ ok: true });
    const { container } = renderBanner();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Start DB' }));
    await flush();
    expect(apiMock.dbStart).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeTruthy();
    expect(screen.getByText(/Starting the live store/)).toBeTruthy();

    // While the instance boots, health keeps failing on the DB — the starting copy holds.
    await tick(FAST_POLL_MS);
    expect(screen.getByText(/Starting the live store/)).toBeTruthy();
    expect(onRecovered).not.toHaveBeenCalled();

    // The probe flips ok → banner disappears and the app reloads what the outage cost.
    apiMock.health.mockResolvedValue(healthy);
    await tick(FAST_POLL_MS);
    expect(container.innerHTML).toBe('');
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('falls back to stopped (with the error) when /api/db/start itself fails', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockResolvedValue(stopped);
    apiMock.dbStart.mockRejectedValue(new Error('failed to start gcloud: spawn gcloud ENOENT'));
    renderBanner();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Start DB' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Start DB' })).toBeTruthy();
    expect(screen.getByText(/failed to start gcloud/)).toBeTruthy();
  });

  it('the freeze gap: repeated /api/health failures while starting flip to server-lost honesty', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockResolvedValue(stopped);
    apiMock.dbStart.mockResolvedValue({ ok: true });
    renderBanner();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Start DB' }));
    await flush();
    expect(screen.getByText(/Starting the live store/)).toBeTruthy();

    // The studio dev server dies: /api/health itself now rejects.
    apiMock.health.mockRejectedValue(new Error('fetch failed'));

    // Short of the threshold the starting copy holds (a blip must not kill a pending start)…
    for (let i = 1; i < SERVER_LOST_AFTER; i++) {
      await tick(FAST_POLL_MS);
      expect(screen.getByText(/Starting the live store/)).toBeTruthy();
    }
    // …but at the threshold the banner stops pretending and names the real problem.
    await tick(FAST_POLL_MS);
    expect(screen.getByText(/studio server itself is unreachable/)).toBeTruthy();
    expect(screen.queryByText(/Starting the live store/)).toBeNull();
  });

  it('flags a moved checkout even while the DB is healthy (the /api/presence incident)', async () => {
    apiMock.health.mockResolvedValue({ ...healthy, code: movedStamp });
    renderBanner();
    await flush();
    expect(screen.getByText(/checkout has moved/)).toBeTruthy();
    // The remedy and the two stamps (abbreviated) are on the banner.
    expect(screen.getByText('pnpm studio:down')).toBeTruthy();
    expect(screen.getByText('pnpm studio:up')).toBeTruthy();
    expect(screen.getByText(movedStamp.startedAt.slice(0, 7))).toBeTruthy();
    expect(screen.getByText(movedStamp.head.slice(0, 7))).toBeTruthy();
  });

  it('the moved-checkout banner outranks a DB outage — stale code makes other signals suspect', async () => {
    apiMock.health.mockResolvedValue({ ...dbDown, code: movedStamp });
    apiMock.dbStatus.mockResolvedValue(stopped);
    renderBanner();
    await flush();
    expect(screen.getByText(/checkout has moved/)).toBeTruthy();
    expect(screen.queryByText('The live store (Cloud SQL) is stopped.')).toBeNull();
  });

  it('clears the moved-checkout banner when a restarted server answers with a fresh stamp', async () => {
    apiMock.health.mockResolvedValue({ ...healthy, code: movedStamp });
    const { container } = renderBanner();
    await flush();
    expect(screen.getByText(/checkout has moved/)).toBeTruthy();

    // pnpm studio:down/up happened: the new process's startedAt matches the disk HEAD.
    apiMock.health.mockResolvedValue({ ...healthy, code: freshStamp });
    await tick(SLOW_POLL_MS);
    expect(container.innerHTML).toBe('');
  });

  // ── hosted DB wake (ADR-0049): canWake swaps the gcloud Start DB for the keyless wake ──
  it('canWake: shows "Wake the database"; click → api.dbWake → starting → health ok → recovered', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockRejectedValue(new Error('403')); // hosted: /api/db/status is structurally off
    apiMock.dbWake.mockResolvedValue({ ok: true });
    const { container } = render(<StoreBanner onRecovered={onRecovered} canWake />);
    await flush();
    expect(screen.getByRole('button', { name: 'Wake the database' })).toBeTruthy();
    expect(screen.getByText(/isn.t responding — it may be idle-stopped/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Wake the database' }));
    await flush();
    expect(apiMock.dbWake).toHaveBeenCalledTimes(1);
    expect(apiMock.dbStart).not.toHaveBeenCalled(); // the gcloud path is NOT used hosted
    expect(screen.getByText(/Starting the live store/)).toBeTruthy();

    apiMock.health.mockResolvedValue(healthy);
    await tick(FAST_POLL_MS);
    expect(container.innerHTML).toBe('');
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('canWake: a 403 from dbWake (non-seed admin during an outage) surfaces the reason', async () => {
    apiMock.health.mockResolvedValue(dbDown);
    apiMock.dbStatus.mockRejectedValue(new Error('403'));
    apiMock.dbWake.mockRejectedValue(new Error('only an admin can wake the database — ask an admin to bring it up'));
    render(<StoreBanner onRecovered={onRecovered} canWake />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Wake the database' }));
    await flush();
    expect(screen.getByText(/only an admin can wake the database/)).toBeTruthy();
    // …and the affordance stays so they can hand off / retry.
    expect(screen.getByRole('button', { name: 'Wake the database' })).toBeTruthy();
  });

  // ── ADR-0164 Phase 1: in the desktop app the moved-checkout banner becomes a rebuild ACTION ──
  type RebuildResult = { ok: true } | { ok: false; step: string; code: number; output: string };
  const installDesktopBridge = (
    fn: ReturnType<typeof vi.fn<() => Promise<RebuildResult>>>,
  ): void => {
    (window as unknown as { desktopApply: { rebuildAndRelaunch: unknown } }).desktopApply = {
      rebuildAndRelaunch: fn,
    };
  };

  it('desktop: a moved checkout shows "Rebuild & relaunch" instead of the manual pnpm instructions', async () => {
    installDesktopBridge(vi.fn<() => Promise<RebuildResult>>().mockResolvedValue({ ok: true }));
    apiMock.health.mockResolvedValue({ ...healthy, code: movedStamp });
    renderBanner();
    await flush();
    expect(screen.getByRole('button', { name: 'Rebuild & relaunch' })).toBeTruthy();
    // The browser-only manual restart copy is NOT shown in the desktop app.
    expect(screen.queryByText('pnpm studio:down')).toBeNull();
    expect(screen.getByText(/a newer version has landed/)).toBeTruthy();
  });

  it('desktop: clicking Rebuild & relaunch calls the bridge and shows the rebuilding state', async () => {
    const bridge = vi.fn<() => Promise<RebuildResult>>().mockResolvedValue({ ok: true });
    installDesktopBridge(bridge);
    apiMock.health.mockResolvedValue({ ...healthy, code: movedStamp });
    renderBanner();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Rebuild & relaunch' }));
    await flush();
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Rebuilding and relaunching/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rebuilding…' })).toBeTruthy();
  });

  it('desktop: a failed rebuild surfaces the error and stays on the old build (fail-closed)', async () => {
    const bridge = vi
      .fn<() => Promise<RebuildResult>>()
      .mockResolvedValue({ ok: false, step: 'build studio bundle', code: 2, output: 'Type error in App.tsx' });
    installDesktopBridge(bridge);
    apiMock.health.mockResolvedValue({ ...healthy, code: movedStamp });
    renderBanner();
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'Rebuild & relaunch' }));
    await flush();
    expect(screen.getByText(/still on the old build/)).toBeTruthy();
    expect(screen.getByText(/build studio bundle failed \(exit 2\): Type error in App.tsx/)).toBeTruthy();
    // The affordance returns so the operator can retry after fixing the cause.
    expect(screen.getByRole('button', { name: 'Rebuild & relaunch' })).toBeTruthy();
  });

  it('recovers from server-lost when /api/health answers again', async () => {
    // Drive straight into server-lost from an initial outage. Before any phase resolves
    // the banner polls on the SLOW cadence (initial probe + ticks = SERVER_LOST_AFTER
    // consecutive failures).
    apiMock.health.mockRejectedValue(new Error('fetch failed'));
    const { container } = renderBanner();
    await flush();
    for (let i = 1; i < SERVER_LOST_AFTER; i++) await tick(SLOW_POLL_MS);
    expect(screen.getByText(/studio server itself is unreachable/)).toBeTruthy();

    apiMock.health.mockResolvedValue(healthy);
    await tick(FAST_POLL_MS);
    expect(container.innerHTML).toBe('');
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });
});
