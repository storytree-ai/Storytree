// @vitest-environment jsdom
//
// WorldSettingsPanel — the gear's ACTION slot (ADR-0286).
//
// The panel's schema (`worldSettings`) is STATE: values the URL carries and the world reads back.
// "Regrow the forest" is neither — it is a one-shot on a clock that lives in React. Rather than
// invent a param for it (which every shared link would then have to scrub), the panel takes actions
// as a prop and folds each into its named group. These pin the fold, and the absence lock: a panel
// given no actions renders exactly the pure-schema panel it always did.
//
// The panel's APPEARANCE is owner-attested (ADR-0070 stage 2); this is the stage-1 binding.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldSettingsPanel, type WorldSettingsAction } from './WorldSettingsPanel.js';
import { CONTROLS, GROUP_INTRO } from '../lib/worldSettings.js';

afterEach(cleanup);

/** Open the gear and hand back the panel. It is default-CLOSED, so every test starts by clicking. */
function openPanel(actions?: readonly WorldSettingsAction[]): HTMLElement {
  const container = render(
    <WorldSettingsPanel
      search=""
      onCommit={vi.fn()}
      {...(actions ? { actions } : {})}
    />,
  ).container;
  fireEvent.click(screen.getByLabelText('Open world settings'));
  return container;
}

const regrow = (over: Partial<WorldSettingsAction> = {}): WorldSettingsAction => ({
  key: 'regrow',
  group: GROUP_INTRO,
  label: '▶ Regrow the forest',
  hint: 'Replay the growth from nothing.',
  onClick: vi.fn(),
  ...over,
});

describe('the gear panel’s action slot', () => {
  it('renders an action as a button inside its own group', () => {
    const container = openPanel([regrow()]);
    const button = container.querySelector('[data-gear-action="regrow"]');
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain('Regrow the forest');
    // It sits in the SAME fieldset as the schema's dials for that group, not in a stray corner.
    const fieldset = button!.closest('fieldset');
    expect(fieldset?.querySelector('legend')?.textContent).toBe(GROUP_INTRO);
    expect(fieldset?.querySelector('input[type="range"]'), 'the speed dial shares the section')
      .not.toBeNull();
  });

  it('fires exactly once per click, and never touches the URL', () => {
    const onClick = vi.fn();
    const onCommit = vi.fn();
    const container = render(
      <WorldSettingsPanel search="" onCommit={onCommit} actions={[regrow({ onClick })]} />,
    ).container;
    fireEvent.click(screen.getByLabelText('Open world settings'));
    fireEvent.click(container.querySelector('[data-gear-action="regrow"]')!);
    expect(onClick).toHaveBeenCalledTimes(1);
    // An action is not state. A regrow must not turn a clean URL into a params-carrying one.
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('honours a disabled action — it renders, and does not fire', () => {
    const onClick = vi.fn();
    const container = openPanel([regrow({ onClick, disabled: true })]);
    const button = container.querySelector('[data-gear-action="regrow"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('opens a section for an action whose group carries no dials', () => {
    const container = openPanel([
      { key: 'solo', group: 'Nowhere', label: 'A lonely button', onClick: vi.fn() },
    ]);
    const fieldset = container.querySelector('[data-gear-action="solo"]')!.closest('fieldset');
    expect(fieldset?.querySelector('legend')?.textContent).toBe('Nowhere');
  });

  it('renders the pure-schema panel when given no actions (the absence lock)', () => {
    const container = openPanel();
    expect(container.querySelector('[data-gear-action]')).toBeNull();
    // Every declared group still gets its section, and no extra one appears.
    const legends = [...container.querySelectorAll('fieldset legend')].map((l) => l.textContent);
    expect([...legends].sort()).toEqual([...new Set(CONTROLS.map((c) => c.group))].sort());
  });
});
