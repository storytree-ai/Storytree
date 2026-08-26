// @vitest-environment jsdom
//
// Red-green on the context-window meter's BEHAVIOUR and GEOMETRY (ADR-0452 D1/D2, increment
// `make-the-single-window-meter-useful`). The appearance verdict is the owner's (ADR-0070 stage 2)
// and nothing here signs it: these prove which segments are drawn, at what widths, what the surface
// says when it cannot read, and that the unsigned half declares itself.
//
// The read is INJECTED, not module-mocked (`no-module-mocking`, and the seam the component declares
// for exactly this) — so these drive the real component against real payload shapes with no dev
// server, no transcripts and no clock.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ContextWindowsTab } from './ContextWindowsTab';
import { BASE_SCALE_TOKENS } from '../lib/contextWindowMeter';
import type { ContextWindowEntry, ContextWindowsPayload } from '../types';

afterEach(cleanup);

const NOW = Date.parse('2026-08-26T12:00:00.000Z');

function windowEntry(over: Partial<ContextWindowEntry> = {}): ContextWindowEntry {
  return {
    windowId: 'ed6899de-da1b-4322-b04a-5670f877988f',
    residentTokens: 147_910,
    peakTokens: 147_910,
    observationCount: 23,
    syntheticObservations: 0,
    modelId: 'claude-opus-5',
    lastObservedAt: '2026-08-26T11:56:00.000Z',
    lastWrittenAt: '2026-08-26T11:56:00.000Z',
    helpers: [],
    helpersJoined: true,
    ...over,
  };
}

function payload(windows: ContextWindowEntry[], scanOver: Partial<ContextWindowsPayload['scan']> = {}): ContextWindowsPayload {
  return {
    scan: {
      root: 'C:\\Users\\mickh\\.claude\\projects',
      windowFilesFound: 3219,
      windowFilesRead: windows.length,
      helperFilesFound: 0,
      helperFilesRead: 0,
      helperFilesOnMachine: 0,
      ...scanOver,
    },
    windows,
  };
}

/** The drawn width of one segment, as the fraction the component wrote into its inline style. */
function widthFraction(testId: string): number {
  const el = screen.queryByTestId(testId);
  if (el === null) return 0;
  return Number.parseFloat(el.style.width) / 100;
}

describe('ContextWindowsTab — the read is lazy', () => {
  it('reads nothing until the tab is actually open', async () => {
    const read = vi.fn(async () => payload([windowEntry()]));
    const { rerender } = render(
      <ContextWindowsTab active={false} onMeta={() => {}} compact={false} read={read} nowMs={NOW} />,
    );
    expect(read).not.toHaveBeenCalled();

    rerender(<ContextWindowsTab active onMeta={() => {}} compact={false} read={read} nowMs={NOW} />);
    await screen.findByTestId('context-windows');
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe('ContextWindowsTab — the marks are drawn as colour, never as a marker', () => {
  it('draws only the calm segment below both marks', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry({ residentTokens: 147_910, peakTokens: 147_910 })])}
      />,
    );
    await screen.findByTestId('context-window-headline-track');
    expect(widthFraction('context-window-headline-track-calm')).toBeCloseTo(147_910 / BASE_SCALE_TOKENS, 5);
    expect(screen.queryByTestId('context-window-headline-track-soft')).toBeNull();
    expect(screen.queryByTestId('context-window-headline-track-hard')).toBeNull();
  });

  it('adds the soft segment past 400k, and the hard segment past 500k, with nothing drawn AT either mark', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry({ residentTokens: 500_250, peakTokens: 500_250 })])}
      />,
    );
    await screen.findByTestId('context-window-headline-track');
    expect(widthFraction('context-window-headline-track-calm')).toBeCloseTo(400_000 / BASE_SCALE_TOKENS, 5);
    expect(widthFraction('context-window-headline-track-soft')).toBeCloseTo(100_000 / BASE_SCALE_TOKENS, 5);
    expect(widthFraction('context-window-headline-track-hard')).toBeCloseTo(250 / BASE_SCALE_TOKENS, 5);

    // The signed grammar removed the threshold marker; the colour IS the signal. Nothing in the
    // track may be a marker, tick or arc — only the three fills.
    const track = screen.getByTestId('context-window-headline-track');
    expect(track.querySelectorAll(':scope > *')).toHaveLength(3);
  });

  it('states the DECISION each band carries, not only the number', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry({ residentTokens: 430_000, peakTokens: 430_000 })])}
      />,
    );
    const guidance = await screen.findByTestId('context-window-headline-guidance');
    expect(guidance.textContent).toMatch(/no new increment/);
  });
});

describe('ContextWindowsTab — one shared track', () => {
  it('scales every window against one ceiling, so two meters compare by eye', async () => {
    const big = windowEntry({ windowId: 'big-window', residentTokens: 500_250, peakTokens: 500_250 });
    const small = windowEntry({ windowId: 'small-window', residentTokens: 120_000, peakTokens: 120_000 });
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([big, small])}
      />,
    );
    await screen.findByTestId('context-windows-rest');
    const headlineFill =
      widthFraction('context-window-headline-track-calm') +
      widthFraction('context-window-headline-track-soft') +
      widthFraction('context-window-headline-track-hard');
    const restFill = widthFraction('context-window-track-small-window-calm');
    expect(headlineFill / restFill).toBeCloseTo(500_250 / 120_000, 3);
  });
});

describe('ContextWindowsTab — honesty', () => {
  it('names the synthetic readings it excluded rather than dropping them silently', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry({ syntheticObservations: 2 })])}
      />,
    );
    const note = await screen.findByTestId('context-windows-scan');
    expect(note.textContent).toMatch(/2 synthetic readings excluded/);
    expect(note.textContent).toMatch(/3219/);
  });

  it('shows a peak only when a later reading fell below it', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry({ residentTokens: 228_100, peakTokens: 240_900 })])}
      />,
    );
    const readout = await screen.findByTestId('context-window-headline-readout');
    expect(readout.textContent).toMatch(/228\.1k/);
    expect(readout.textContent).toMatch(/peak 240\.9k/);
  });

  it('reports a failed read as the server not answering, never as an empty machine', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => {
          throw new Error('aborted');
        }}
      />,
    );
    const note = await screen.findByText(/could not read the context windows/);
    expect(note.textContent).toMatch(/not an empty machine/);
  });

  it('says where it looked when the machine genuinely holds nothing', async () => {
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([], { windowFilesFound: 0, windowFilesRead: 0 })}
      />,
    );
    const note = await screen.findByText(/no session window on this machine/);
    expect(note.textContent).toMatch(/projects/);
  });

  it('reports the headline reading to the tab strip against the hard mark', async () => {
    const onMeta = vi.fn();
    render(
      <ContextWindowsTab
        active
        onMeta={onMeta}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry({ residentTokens: 292_322 })])}
      />,
    );
    await waitFor(() => {
      expect(onMeta).toHaveBeenCalledWith('292.3k of 500.0k');
    });
  });
});

describe('ContextWindowsTab — the helper lane declares itself unsigned (ADR-0452 D3)', () => {
  it('renders the proposal even with nothing to draw, saying WHERE it found none', async () => {
    // The ordinary case on this machine, measured 2026-08-26: the twelve newest windows had spawned
    // no helper while 190 helper transcripts sat under the project. A block that vanished here would
    // leave the owner nothing to review, and "none" would be indistinguishable from "not looked at".
    render(
      <ContextWindowsTab
        active
        onMeta={() => {}}
        compact={false}
        nowMs={NOW}
        read={async () => payload([windowEntry()], { windowFilesRead: 12, helperFilesOnMachine: 190 })}
      />,
    );
    const block = await screen.findByTestId('context-windows-helpers');
    expect(block.textContent).toMatch(/UNSIGNED PROPOSAL/);
    const empty = screen.getByTestId('context-windows-helpers-empty');
    expect(empty.textContent).toMatch(/None of the 12 windows above spawned a helper/);
    expect(empty.textContent).toMatch(/190 helper transcripts sit elsewhere/);
  });


  const withHelpers = (): ContextWindowsPayload =>
    payload(
      [
        windowEntry({
          residentTokens: 150_000,
          peakTokens: 150_000,
          helpers: [
            { file: 'agent-b4c92361.jsonl', requestCount: 30, peakTokens: 210_000, lastObservedAt: '2026-08-26T11:00:00.000Z' },
            { file: 'agent-a16b5d32.jsonl', requestCount: 12, peakTokens: 71_000, lastObservedAt: '2026-08-26T11:02:00.000Z' },
          ],
        }),
      ],
      { helperFilesFound: 2, helperFilesRead: 2, helperFilesOnMachine: 2 },
    );

  it('badges the block as an unsigned proposal on the surface itself', async () => {
    render(<ContextWindowsTab active onMeta={() => {}} compact={false} nowMs={NOW} read={async () => withHelpers()} />);
    const block = await screen.findByTestId('context-windows-helpers');
    expect(block.textContent).toMatch(/UNSIGNED PROPOSAL/);
    expect(block.textContent).toMatch(/not owner-attested/);
  });

  it('never adds a helper’s tokens into the parent’s readout', async () => {
    render(<ContextWindowsTab active onMeta={() => {}} compact={false} nowMs={NOW} read={async () => withHelpers()} />);
    const readout = await screen.findByTestId('context-window-headline-readout');
    // 150k + 210k + 71k = 431k, the number this surface must never show for a window.
    expect(readout.textContent).toMatch(/150\.0k/);
    expect(readout.textContent).not.toMatch(/431/);
    // Each helper on its OWN track, at the same shared scale, so the comparison is the argument.
    expect(widthFraction('context-helper-track-agent-b4c92361.jsonl-calm')).toBeCloseTo(
      210_000 / BASE_SCALE_TOKENS,
      5,
    );
  });

  it('states the population it can never attribute rather than presenting a whole-looking total', async () => {
    render(<ContextWindowsTab active onMeta={() => {}} compact={false} nowMs={NOW} read={async () => withHelpers()} />);
    const block = await screen.findByTestId('context-windows-helpers');
    expect(block.textContent).toMatch(/233 of 1,074/);
  });

  it('yields the helper block and the legend when the panel is dragged small', async () => {
    render(<ContextWindowsTab active onMeta={() => {}} compact nowMs={NOW} read={async () => withHelpers()} />);
    await screen.findByTestId('context-window-headline-track');
    // Compact means the chrome yields and the meters keep the room (ADR-0354 D4) — the headline
    // track survives, the explanatory blocks do not.
    expect(screen.queryByTestId('context-windows-helpers')).toBeNull();
    expect(screen.queryByTestId('context-windows-legend')).toBeNull();
    expect(screen.queryByTestId('context-window-headline-guidance')).toBeNull();
  });
});
