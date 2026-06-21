// WorldLegend — the story world's legend bar (ADR-0036 d.6c, model-per-row
// rework; vocabulary recalibrated by ADR-0038).
//
// Games-style: ONE entry per world model (story trees, garden plants, proof
// marks, activity blooms, in-flight builds, decoration), representative state
// icons side by side, a single caption. Clicking an entry expands a drawer
// fanning out that model's FULL state vocabulary — states that don't occur in
// the current world render dimmed ("not in world yet"), and entries whose model
// has no instance at all (no verdicts, nothing building) drop out of the bar
// entirely, so the legend only ever describes what's on screen. Session
// presence has NO legend row — it no longer orbits (ADR-0048 §5); it lives in
// the toolbar's session dock. Roads and the focus tints carry no legend entry —
// they're self-explanatory in place (ADR-0038). The legend receives the
// PRESENTED world (worldStatus.ts): retired is pruned and building wears
// proposed before anything reaches here.
//
// The status fan doubles as the status filter (it absorbed the old toolbar
// chips): tiles toggle the same `hidden` set, and the world fades matching
// trees/flora. Icons reuse the world's OWN css classes (story-tree st-*,
// garden-flora, story-sign, world-wisp band-building), so the legend can never
// drift from the world's palette — it IS the world's palette.
//
// The captions carry the observability contract's caveats in operator-facing
// text: hue-is-the-signed-verdict (ADR-0040 — authored status can never paint
// green), crown-is-never-a-roll-up, signpost-is-the-human-witness-mark,
// offline-under-claims, build-wisps-are-the-harness (ADR-0048).

import { useEffect, useRef, useState } from 'react';
import { anyInFlight, anyRecentLanding } from '../lib/activity';
import type { BuildActivity, TreeStory } from '../types';

type RowKey = 'tree' | 'flora' | 'proof' | 'activity' | 'building' | 'decor';

/**
 * Status fan order: the growth ladder, then the failure state. `building` and
 * `retired` never reach the legend — the world folds building into proposed
 * and prunes retired entirely (worldStatus.ts, ADR-0038).
 */
const STATUS_ORDER = ['proposed', 'mapped', 'healthy', 'unhealthy'] as const;

/** Statuses an ALIVE plant can wear in the world — unhealthy flora always renders dead. */
const ALIVE_STATUSES = STATUS_ORDER.filter((st) => st !== 'unhealthy');

export interface LegendFacts {
  /** status → instance counts across both tiers ('unknown' = spec error / no status). */
  statusTotals: Map<string, { stories: number; caps: number }>;
  /** Any unit wears healthy — which, post ADR-0040, only a signed pass can paint. */
  anyProven: boolean;
  /** Human-witness signpost states (ADR-0040): blank = the UAT awaits the operator. */
  signBlank: boolean;
  signWitnessedPass: boolean;
  signWitnessedFail: boolean;
  /** Any capability renders the dead silhouette (signed ✗ or authored unhealthy). */
  anyDeadFlora: boolean;
}

/**
 * Ground the legend in the loaded world: which states actually occur right now.
 * Receives the PRESENTED world (worldStatus.ts), so `healthy` here already
 * means "the last signed run passed" — authored paint never reaches it.
 */
export function legendFacts(stories: TreeStory[]): LegendFacts {
  const statusTotals = new Map<string, { stories: number; caps: number }>();
  const bump = (key: string, tier: 'stories' | 'caps'): void => {
    const cur = statusTotals.get(key) ?? { stories: 0, caps: 0 };
    cur[tier] += 1;
    statusTotals.set(key, cur);
  };
  let anyProven = false;
  let signBlank = false;
  let signWitnessedPass = false;
  let signWitnessedFail = false;
  let anyDeadFlora = false;
  for (const s of stories) {
    const st = s.status ?? 'unknown';
    bump(st, 'stories');
    if (st === 'healthy') anyProven = true;
    if (s.uatWitness === 'human') {
      if (!s.verdict) signBlank = true;
      else if (s.verdict.outcome === 'pass') signWitnessedPass = true;
      else signWitnessedFail = true;
    }
    for (const c of s.capabilities) {
      const cst = c.status ?? 'unknown';
      bump(cst, 'caps');
      if (cst === 'healthy') anyProven = true;
      if (cst === 'unhealthy') anyDeadFlora = true;
    }
  }
  return {
    statusTotals,
    anyProven,
    signBlank,
    signWitnessedPass,
    signWitnessedFail,
    anyDeadFlora,
  };
}

// ---------- mini icons (world css classes — the world's palette, never a copy) ----------

const HEX = 'M 0 -11 L 9.5 -5.5 L 9.5 5.5 L 0 11 L -9.5 5.5 L -9.5 -5.5 Z';

const BARE_BRANCHES = ['M 0 -15 C 2 -20, 1 -22, 2 -25', 'M -3 -15.5 C -8 -19, -7 -20, -4.5 -22'];

function TreeIcon({
  status,
  form,
}: {
  status: string;
  form: 'full' | 'withered' | 'young';
}): React.JSX.Element {
  if (form === 'young') {
    // The not-yet-full proposed tree: same viewBox as the full form so the
    // smaller growth stage reads at a glance.
    return (
      <svg viewBox="-14 -30 28 34" aria-hidden="true">
        <g className={`story-tree st-${status}`}>
          <rect className="story-trunk" x={-1.3} y={-8} width={2.6} height={8} rx={1} />
          <g className="crown-lo">
            <circle cx={0} cy={-12.5} r={5.4} />
            <circle cx={-4.2} cy={-9.6} r={3.4} />
            <circle cx={4.4} cy={-10} r={3.5} />
          </g>
          <g className="crown-hi">
            <circle cx={-1.4} cy={-14} r={2.8} />
          </g>
        </g>
      </svg>
    );
  }
  if (form === 'withered') {
    return (
      <svg viewBox="-14 -32 28 36" aria-hidden="true">
        <g className="story-tree st-unhealthy">
          <rect className="story-trunk" x={-1.5} y={-10} width={3} height={10} rx={1} />
          <g className="story-bare">
            {BARE_BRANCHES.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <g className="crown-lo">
            <circle cx={0} cy={-14} r={6.5} />
            <circle cx={-4.5} cy={-12} r={4} />
          </g>
          <g className="crown-hi" opacity={0.7}>
            <circle cx={-1.5} cy={-16} r={2.8} />
          </g>
          <circle className="leaf-litter" cx={-7} cy={-1} r={1.2} />
          <circle className="leaf-litter" cx={5} cy={-2} r={1.2} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="-14 -30 28 34" aria-hidden="true">
      <g className={`story-tree st-${status}`}>
        <rect className="story-trunk" x={-1.5} y={-10} width={3} height={10} rx={1} />
        <g className="crown-lo">
          <circle cx={0} cy={-16} r={7.6} />
          <circle cx={-6} cy={-12} r={4.8} />
          <circle cx={6.4} cy={-12.5} r={5} />
        </g>
        <g className="crown-hi">
          <circle cx={-2} cy={-18} r={4} />
        </g>
      </g>
    </svg>
  );
}

function PlantIcon({
  status,
  dead,
}: {
  status: string;
  dead?: boolean;
}): React.JSX.Element {
  if (dead) {
    return (
      <svg viewBox="-12 -18 24 24" aria-hidden="true">
        <g className={`garden-flora st-${status}`}>
          <ellipse className="flora-bed" cx={0} cy={0.4} rx={8} ry={2.8} opacity={0.7} />
          <path
            className="flora-dead-stem"
            strokeWidth={1.2}
            d="M 0.5 0 C 0.6 -6 0.4 -10 2.6 -11.4 C 4.4 -12.4 5.8 -10.8 5.6 -9.2"
          />
          <circle className="flora-dead-head flora-dead-accent" cx={5.6} cy={-8.2} r={1.7} />
          <path className="flora-dead-stem" strokeWidth={1.1} d="M -3.5 0 C -4 -5 -4.5 -8.5 -2.5 -10" />
          <circle className="leaf-litter" cx={-7} cy={-0.5} r={1} />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="-12 -19 24 24" aria-hidden="true">
      <g className={`garden-flora st-${status}`}>
        <polygon
          className="flora-dark"
          points="0,-12.5 5.5,-10.5 8.5,-5.5 7,-1 0,0.8 -7,-1 -8.5,-5.5 -5.5,-10.5"
        />
        <polygon
          className="flora-light"
          points="-1,-12.5 4.5,-10.8 6,-7 0.5,-5.6 -4.8,-7.4 -4.6,-10.6"
        />
        <circle className="flora-core" cx={2} cy={-7.5} r={1.5} />
      </g>
    </svg>
  );
}

/** The human-witness signpost (ADR-0040): dashed-blank, or a verdict-hued seal. */
function SignIcon({ state }: { state: 'blank' | 'pass' | 'fail' }): React.JSX.Element {
  return (
    <svg viewBox="-9 -26 18 28" aria-hidden="true">
      <g
        className={`story-sign ${
          state === 'blank' ? 'sign-blank' : `sign-witnessed verdict-${state}`
        }`}
      >
        <rect x={-1.3} y={-15} width={2.6} height={15} rx={1.1} />
        <circle cy={-18} r={6.5} />
      </g>
    </svg>
  );
}

/** The in-flight build wisp (ADR-0048) — the world's `world-wisp band-building`
 *  classes, so the swatch can never drift from the live teal pulse. */
function BuildWispIcon(): React.JSX.Element {
  return (
    <svg viewBox="-8 -8 16 16" aria-hidden="true">
      <g className="world-wisp band-building">
        <circle className="world-wisp-glow" r={5.5} />
        <circle className="world-wisp-dot" r={2.4} />
      </g>
    </svg>
  );
}

/** The recently-landed bloom (ADR-0045) — the world's `world-bloom` classes, so
 *  the legend swatch can never drift from the live halo + sparkles. */
function BloomIcon(): React.JSX.Element {
  return (
    <svg viewBox="-11 -11 22 22" aria-hidden="true">
      <g className="world-bloom verdict-pass bloom-crown">
        <circle className="bloom-ring" r={7.5} />
        <circle className="bloom-spark" cx={5} cy={-3} r={1.5} />
        <circle className="bloom-spark" cx={-4.5} cy={2.5} r={1.3} />
        <circle className="bloom-spark" cx={-1} cy={-6.5} r={1.2} />
      </g>
    </svg>
  );
}

function ConiferIcon(): React.JSX.Element {
  return (
    <svg viewBox="-12 -14 24 18" aria-hidden="true">
      <g className="hex-conifer">
        <path className="conifer-body c-0" d="M -5 -10 L -1 0 L -9 0 Z" />
        <path className="conifer-body c-1" d="M 5 -8 L 8.5 0 L 1.5 0 Z" />
      </g>
    </svg>
  );
}

function WheatIcon(): React.JSX.Element {
  return (
    <svg viewBox="-13 -13 26 26" aria-hidden="true">
      <path className="hex-top is-wheat" d={HEX} />
    </svg>
  );
}

// ---------- tiles & fans ----------

function Tile({
  icon,
  label,
  note,
  absent,
  off,
  wide,
  title,
  onClick,
  pressed,
}: {
  icon: React.JSX.Element;
  label: string;
  note?: string;
  absent?: boolean;
  off?: boolean;
  wide?: boolean;
  title?: string;
  onClick?: () => void;
  pressed?: boolean | undefined;
}): React.JSX.Element {
  const cls = `legend-tile${absent ? ' is-absent' : ''}${off ? ' is-off' : ''}${wide ? ' is-wide' : ''}`;
  const body = (
    <>
      <span className="legend-tile-icon">{icon}</span>
      <span className="legend-tile-label">{label}</span>
      {note && <span className="legend-tile-note">{note}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        title={title ?? ''}
        {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cls} title={title ?? ''}>
      {body}
    </div>
  );
}

/** Growth ladder (ADR-0038): proposed = young, mapped/healthy = full, unhealthy = withered.
 *  A zero-capability story is NOT a distinct stage — it takes its status form like any
 *  other (the sapling state was folded into `young`, owner 2026-06-21). */
export const treeForm = (st: string): 'full' | 'withered' | 'young' =>
  st === 'unhealthy' ? 'withered' : st === 'proposed' ? 'young' : 'full';

function countNote(tot: { stories: number; caps: number }): string {
  const parts: string[] = [];
  if (tot.stories > 0) parts.push(`${tot.stories} ${tot.stories === 1 ? 'story' : 'stories'}`);
  if (tot.caps > 0) parts.push(`${tot.caps} ${tot.caps === 1 ? 'cap' : 'caps'}`);
  return parts.join(' · ');
}

// ---------- the legend ----------

export function WorldLegend({
  stories,
  builds = [],
  now,
  hidden,
  onToggleStatus,
  onResetHidden,
}: {
  stories: TreeStory[];
  builds?: BuildActivity[];
  now: Date;
  hidden: ReadonlySet<string>;
  onToggleStatus: (st: string) => void;
  onResetHidden: () => void;
}): React.JSX.Element {
  const [open, setOpen] = useState<RowKey | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  // An open drawer covers a lot of map — Escape and any click outside dismiss it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(null);
    };
    const onDown = (e: PointerEvent): void => {
      if (e.target instanceof Node && !dockRef.current?.contains(e.target)) setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  const facts = legendFacts(stories);
  const totals = (st: string): { stories: number; caps: number } =>
    facts.statusTotals.get(st) ?? { stories: 0, caps: 0 };
  const present = (st: string): boolean => {
    const t = totals(st);
    return t.stories > 0 || t.caps > 0;
  };
  const anyWitnessed = facts.signWitnessedPass || facts.signWitnessedFail;
  const anySign = facts.signBlank || anyWitnessed;
  // The bar shows the most informative signpost state in the world right now.
  const signState: 'blank' | 'pass' | 'fail' = facts.signWitnessedPass
    ? 'pass'
    : facts.signWitnessedFail
      ? 'fail'
      : 'blank';
  const unknownPresent = present('unknown');
  // The activity row appears IFF some unit carries a live bloom right now —
  // read off the same verdict.at the proof facts use, aged by the same `now`
  // ticker. The row drops the moment the last bloom ages out, exactly like a
  // model with no instance (ADR-0045 §6).
  const recentLandings = anyRecentLanding(stories, now);
  // The building row appears IFF a leaf agent is mechanically building a unit
  // right now (ADR-0048) — an in-flight build, aged by the same `now` ticker.
  // It drops the moment the last build lands or times out.
  const building = anyInFlight(builds, now);
  const toggle = (key: RowKey): void => setOpen((cur) => (cur === key ? null : key));

  const rows: { key: RowKey; label: string; visible: boolean; icons: React.JSX.Element }[] = [
    {
      key: 'tree',
      label: 'story trees',
      visible: true,
      icons: (
        <>
          {STATUS_ORDER.filter((st) => totals(st).stories > 0).map((st) => (
            <TreeIcon key={st} status={st} form={treeForm(st)} />
          ))}
          {totals('unknown').stories > 0 && <TreeIcon status="unknown" form="full" />}
        </>
      ),
    },
    {
      key: 'flora',
      label: 'garden plants',
      visible: stories.some((s) => s.capabilities.length > 0),
      icons: (
        <>
          <PlantIcon status={ALIVE_STATUSES.find((st) => totals(st).caps > 0) ?? 'unknown'} />
          {facts.anyDeadFlora && <PlantIcon status="unhealthy" dead />}
        </>
      ),
    },
    {
      // Always visible: "no proof on screen" is itself a state of the world —
      // it's exactly what an offline operator needs the legend to explain
      // (ADR-0033 d.3 / ADR-0040's under-claim rule).
      key: 'proof',
      label: 'proof',
      visible: true,
      icons: (
        <>
          {facts.anyProven && <PlantIcon status="healthy" />}
          {facts.anyDeadFlora && <PlantIcon status="unhealthy" dead />}
          {anySign && <SignIcon state={signState} />}
        </>
      ),
    },
    {
      // The world's live-activity layer (ADR-0045): a signed verdict landing
      // on a territory in the last few hours. Drops out once the last bloom
      // ages past the window — the durable record stays the plant hue.
      key: 'activity',
      label: 'activity',
      visible: recentLandings,
      icons: <BloomIcon />,
    },
    {
      // The in-flight harness layer (ADR-0048): a wisp orbits while a leaf agent
      // drives a unit through the red-green gate. Drops out when nothing builds.
      // This is the world's ONLY orbiting layer now — session presence was
      // demoted out of orbit (§5) and lives in the toolbar's session dock.
      key: 'building',
      label: 'building',
      visible: building,
      icons: <BuildWispIcon />,
    },
    { key: 'decor', label: 'decoration', visible: true, icons: <ConiferIcon /> },
  ];
  const openRow = open ? rows.find((r) => r.key === open && r.visible) : undefined;

  return (
    <div className="world-legend-dock" ref={dockRef}>
      <div className="legend-bar" role="group" aria-label="legend">
        {rows
          .filter((r) => r.visible)
          .map((r) => (
            <button
              key={r.key}
              type="button"
              className={`legend-chip${open === r.key ? ' on' : ''}`}
              aria-expanded={open === r.key}
              onClick={() => toggle(r.key)}
            >
              {r.icons}
              {r.label}
            </button>
          ))}
        {hidden.size > 0 && (
          <button type="button" className="legend-chip legend-reset" onClick={onResetHidden}>
            show all statuses ({hidden.size} hidden)
          </button>
        )}
      </div>

      {openRow?.key === 'tree' && (
        <div className="legend-drawer" role="region" aria-label="legend — story trees">
          <div className="legend-fan">
            {STATUS_ORDER.map((st) => {
              const tot = totals(st);
              const here = tot.stories > 0 || tot.caps > 0;
              const off = hidden.has(st);
              return (
                <Tile
                  key={st}
                  icon={<TreeIcon status={st} form={treeForm(st)} />}
                  label={st}
                  note={here ? `${countNote(tot)}${off ? ' — hidden' : ''}` : 'not in world yet'}
                  absent={!here}
                  off={off}
                  {...(here
                    ? {
                        onClick: () => onToggleStatus(st),
                        pressed: off,
                        title: off ? `show ${st}` : `fade ${st}`,
                      }
                    : {})}
                />
              );
            })}
            {unknownPresent && (
              <Tile
                icon={<TreeIcon status="unknown" form="full" />}
                label="unknown"
                note={`${countNote(totals('unknown'))}${hidden.has('unknown') ? ' — hidden' : ''}`}
                off={hidden.has('unknown')}
                onClick={() => onToggleStatus('unknown')}
                pressed={hidden.has('unknown')}
                title="spec missing or failed to parse"
              />
            )}
          </div>
          <p className="legend-cap">
            An island is a <strong>story</strong>; the big tree is the story itself — growth and
            colour carry the lifecycle. A young amber tree = <strong>proposed</strong>, still
            iterating (a claimed-but-empty story renders here too, and a story under active build —
            live work shows as session wisps, not a hue); a full brown tree ={' '}
            <strong>mapped</strong> brownfield — real, not yet proven (an authored “healthy” renders
            here until the gate signs); deep green = <strong>proven</strong>, a signed pass on the
            story's own UAT. Retired stories leave the forest. Click a tile to fade that status
            across the forest.
          </p>
        </div>
      )}

      {openRow?.key === 'flora' && (
        <div className="legend-drawer" role="region" aria-label="legend — garden plants">
          <div className="legend-fan">
            <Tile
              icon={<PlantIcon status={ALIVE_STATUSES.find((st) => totals(st).caps > 0) ?? 'unknown'} />}
              label="alive"
              note="colour = status, same key as the trees"
            />
            <Tile
              icon={<PlantIcon status="unhealthy" dead />}
              label="withered"
              note="failed its last signed run, or unhealthy"
              absent={!facts.anyDeadFlora}
            />
          </div>
          <p className="legend-cap">
            Garden flora are the story's <strong>capabilities</strong> — click one in the world to
            inspect it. Species is decorative; colour and withering carry the data: deep green = the
            last signed run passed (the only green source, ADR-0040), withered = a signed fail or
            authored unhealthy, every other hue = the authored ladder, unproven.
          </p>
        </div>
      )}

      {openRow?.key === 'proof' && (
        <div className="legend-drawer" role="region" aria-label="legend — proof">
          <div className="legend-fan">
            <Tile
              icon={<PlantIcon status="healthy" />}
              label="proven green"
              note="the last signed run passed"
              absent={!facts.anyProven}
            />
            <Tile
              icon={<PlantIcon status="unhealthy" dead />}
              label="withered"
              note="failed its last signed run, or authored unhealthy"
              absent={!facts.anyDeadFlora}
            />
            <Tile
              icon={<SignIcon state="blank" />}
              label="awaiting witness"
              note="a human must see this story's UAT"
              absent={!facts.signBlank}
            />
            <Tile
              icon={<SignIcon state={facts.signWitnessedPass ? 'pass' : 'fail'} />}
              label="witnessed"
              note="the story's own UAT was signed — never a roll-up"
              absent={!anyWitnessed}
            />
          </div>
          <p className="legend-cap">
            Hue only ever reports a <strong>signed</strong> prove-it-gate verdict — authored status
            can never paint green, and a story's crown answers only to its <strong>own</strong> UAT
            (“all capabilities pass” and “the story passed UAT” are different claims). Stories with
            a <strong>human</strong> witness (the default) carry a signpost — dashed-blank until the
            operator's ceremony, a filled seal once signed (a signed fail also withers the crown);
            machine-witnessed stories carry none. With the live store down, verdicts are absent and
            the world <strong>under-claims</strong>: trees fall back to the authored ladder — the
            store banner is the signal.
          </p>
        </div>
      )}

      {openRow?.key === 'activity' && (
        <div className="legend-drawer" role="region" aria-label="legend — activity">
          <div className="legend-fan">
            <Tile
              icon={<BloomIcon />}
              label="recently landed"
              note="a signed verdict landed here in the last few hours"
            />
          </div>
          <p className="legend-cap">
            Activity marks real <strong>signed-verdict</strong> events landing on a territory, not
            who is online; the bloom <strong>fades as the event ages</strong> and is gone within a
            few hours. The durable result is the plant <strong>colour</strong> (a signed pass greens
            it, ADR-0040) — the bloom only announces the moment it landed, so it never re-states what
            the hue already records. A brand-new verdict blooms on the next world load (the geometry
            is a one-shot read); aged-out blooms vanish without a refetch.
          </p>
        </div>
      )}

      {openRow?.key === 'building' && (
        <div className="legend-drawer" role="region" aria-label="legend — building">
          <div className="legend-fan">
            <Tile
              icon={<BuildWispIcon />}
              label="building"
              note="a leaf agent is driving this unit through the gate right now"
            />
          </div>
          <p className="legend-cap">
            A teal wisp orbits a story while the <strong>harness</strong> is mechanically building one
            of its units — a leaf agent walking the red-green prove-it-gate (ADR-0048). Unlike a
            session wisp it tracks <strong>work, not who is online</strong>: it appears when a build
            starts and <strong>self-clears</strong> when the verdict lands (a pass then blooms green)
            or after a few minutes if the run died — so it can never become a stale false positive.
          </p>
        </div>
      )}

      {openRow?.key === 'decor' && (
        <div className="legend-drawer" role="region" aria-label="legend — decoration">
          <div className="legend-fan">
            <Tile icon={<ConiferIcon />} label="conifers" />
            <Tile icon={<WheatIcon />} label="wheat fields" />
            <Tile icon={<PlantIcon status="healthy" />} label="plant species & grass shades" wide />
          </div>
          <p className="legend-cap">
            Scenery — hash-grown so the world looks alive yet renders identically every visit. Only
            colour, withering and glyphs carry data.
          </p>
        </div>
      )}
    </div>
  );
}
