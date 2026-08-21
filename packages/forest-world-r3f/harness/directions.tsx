// directions.tsx — SIX DIRECTIONS FOR THE ISLAND, MADE TO LOOK GOOD (dev-only evidence page).
//
// Seven whole islands: six directions and the island as it ships today, as the control.
//
// The arc this belongs to inverts its predecessor's order: `chapter2-code-generated-organic-
// art-arc` proved one component at a time and reached 58 landed increments without anyone
// being able to say whether the island was any good. This page starts at the other end —
// make islands that look good, then work backwards to what is actually needed.
//
// THE RULES IT IS BUILT UNDER, because they decide the page's shape rather than decorate it:
//
//   - ADR-0392 D1 (unchanged by ADR-0398 D2): the owner's look is taken ONCE, on a WHOLE
//     island at DELIVERED size, on real data. Every canvas on this page is therefore a
//     complete island at 2 px/unit. There is no contact sheet, no technique row, no
//     fragment, and no ladder of one idea at four settings.
//   - ADR-0392 D2 (strengthened by ADR-0398 D3): every appearance call here is this
//     session's, and every one is RECORDED WITH ITS REASON. The `calls` list under each
//     direction is that record, and the research README carries the long form.
//   - ADR-0380 D6: the four fences are not this arc's to move. Accessibility stays in the
//     DOM/SVG layer, determinism stays on the scene graph, the palette stays LOCKED (every
//     colour below is an authored `(token x level)` entry — nothing here widens it), and the
//     projection does not move (2.5D isometric, the declared 50-degree camera as a
//     parameter).
//
// WHY THE DIRECTIONS DIFFER IN WHERE THE INTEREST LIVES, rather than in a setting. Four
// settings of one idea is a ladder, not a choice. These differ in what carries the picture:
// the LIGHT, the ISLAND'S EDGE, the GROUND ITSELF, the SILHOUETTE, or all of them together.
// That is a structural difference, and it is the axis the owner's own hypothesis runs along —
// if the land's colour is the bigger signal, the ground directions should be the ones that read.

import { createRoot } from 'react-dom/client';

import { IslandPanel, type IslandViewProps } from './IslandView.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The shipped map's real scale on a 2880x1920 display: 1x sprites are already upscaled
 *  about 2x before anyone sees them (ADR-0380 D2). EVERY canvas on this page is here. */
const DELIVERED = 2;

/** One island, whole, at the size it is actually delivered. The only panel shape this page
 *  has — a deliberate constraint rather than a convenience, because the shapes this page
 *  does NOT offer are exactly the ones ADR-0392 D1 exists to prevent. */
function Island({
  label,
  note,
  ...props
}: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> & {
  label: string;
  note: string;
}) {
  return (
    <IslandPanel
      label={label}
      note={note}
      pxPerUnit={DELIVERED}
      displayPxPerUnit={DELIVERED}
      {...props}
    />
  );
}

/**
 * How far the island's flank hangs below its coast, for the directions that give it one.
 *
 * NINE GROUND UNITS, AND THE NUMBER IS DERIVED FROM DELIVERY RATHER THAN CHOSEN. At the
 * 50-degree camera an UPRIGHT height foreshortens by `cos(50) = 0.643`, so at 2 px/unit the
 * island's thickness on screen is `depth * 1.286` pixels. The shipped depth is
 * `LAND_CELL_DEPTH = 2.2`, which is **2.8 delivered pixels** — under one percent of the
 * island's on-screen height, which is why every island this arc has rendered reads as a flat
 * cut-out however its rim is coloured.
 *
 * The floor that makes an edge part of a silhouette is that it be at least as tall as the
 * things standing on the land: the median plant is 6.2 ground units, delivering 8.0 px. Nine
 * units delivers 11.6 px — about one and a half times the vegetation, which puts the flank
 * in the picture without turning the island into a floating column. It costs the palette
 * NOTHING: it is geometry, and every pixel it adds is the same `(token x level)` entry the
 * rim already wore.
 */
const DEEP = 9;

/** The directions plus the island as it ships, as data — so the headline row and each
 *  direction's own section can never drift apart into showing two different things. */
const TODAY: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {};

const AFTERNOON: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  contact: true,
  shadow: 'both',
};

const SLAB: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  contact: true,
  edge: 'material',
  wallDepth: DEEP,
};

const GARDEN: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  contact: true,
  ground: 'regional',
  style: 'foliage',
  tree: false,
};

const LANDMASS: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  contact: true,
  land: 'relief',
  edge: 'material',
  wallDepth: DEEP,
  ground: 'regional',
  tree: false,
};

const COMPOSED: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  contact: true,
  shadow: 'both',
  edge: 'material',
  wallDepth: DEEP,
  ground: 'regional',
};

/** ⚠ GATED — see section 8. Everything COMPOSED has, plus the one ground token the closed
 *  palette holds that would actually change the picture, and that this session may not decide
 *  to use. */
const DEEPGROUND: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  ...COMPOSED,
  ground: 'regional-deep',
};

function App() {
  return (
    <main>
      <header>
        <h1>Six directions for the island</h1>
        <p>
          Every picture on this page is a <strong>whole island at the size it is actually
          delivered</strong> &mdash; 2 px per ground unit, the real 13-hex research surface
          (<code>context-traversal-capture</code>), its eleven capabilities, its real test
          spread, its own ten UAT criteria. Nothing here is a fragment, a swatch, or a
          technique survey.
        </p>
        <p>
          They differ in <strong>where the interest lives</strong>: in the light, in the
          island&rsquo;s edge, in the ground itself, in the silhouette, or in all of them. That
          is the choice being offered &mdash; not a setting to tune.
        </p>
        <p className="numbers">
          13 hexes &middot; 11 capabilities &middot; all healthy &middot; 10 UAT flowers
          &middot; 144 plants &middot; locked palette, every colour an authored{' '}
          <code>token &times; level</code> entry &middot; 2.5D isometric at 50&deg; &middot;
          one authored light at 55.2&deg; &middot; nothing is animated (ADR-0045)
        </p>
      </header>

      <section>
        <h2>1 &mdash; the choice, side by side</h2>
        <p className="lede">
          The six directions and the island as it ships today, all whole, all at delivered
          size. This is the row the decision is made on; the sections below are the same
          islands again, larger on the page but rendered at exactly the same 2 px/unit, with
          the appearance calls that made each one. <strong>F is not on the menu yet</strong> —
          it needs an answer from you first, and section 8 says why.
        </p>
        <div className="row">
          <Island label="TODAY" note="what ships now" tag="row-today" {...TODAY} />
          <Island label="A &mdash; AFTERNOON" note="the light carries it" tag="row-a" {...AFTERNOON} />
          <Island label="B &mdash; THE SLAB" note="the edge carries it" tag="row-b" {...SLAB} />
          <Island label="C &mdash; THE GARDEN" note="the ground carries it" tag="row-c" {...GARDEN} />
          <Island label="D &mdash; ONE LANDMASS" note="the silhouette carries it" tag="row-d" {...LANDMASS} />
          <Island label="E &mdash; COMPOSED" note="all of them" tag="row-e" {...COMPOSED} />
          <Island
            label="F &mdash; DEEPER GROUND ⚠"
            note="needs your answer first"
            tag="row-f"
            {...DEEPGROUND}
          />
        </div>
      </section>

      <section>
        <h2>2 &mdash; where we start: the island as it ships</h2>
        <p className="lede">
          The control. Flat pale ground, a rim that is the same green as the top face, no
          shadow anywhere, and one very large tree in the middle. Everything below is measured
          against this.
        </p>
        <div className="row">
          <Island label="TODAY" note="2 px/unit &middot; the control" tag="today" {...TODAY} />
        </div>
      </section>

      <section>
        <h2>3 &mdash; A: AFTERNOON, where the light carries it</h2>
        <p className="lede">
          The island as a place at a time of day. Every upright thing casts, and every upright
          thing now also sits in a pool of its own contact shade, so the props are IN the land
          rather than ON it.
        </p>
        <ul className="calls">
          <li>
            <strong>Contact darkening, on.</strong> The reference board&rsquo;s highest-value
            unattempted lever &mdash; in all three of the owner&rsquo;s references every object
            darkens the ground where it meets it, and ours had none. The pool size is DERIVED
            from each prop&rsquo;s own radius and height (the fraction of sky it hides), not
            dialled, so the hero tree pools far more ground than a shrub because it hides far
            more sky.
          </li>
          <li>
            <strong>Cast shadow, on, both terms.</strong> Built and measured admissible at one
            rung (0.84) by the previous arc and never yet shown on an island anyone was asked
            to look at. The terrain term delivers identically zero &mdash; the land cannot
            shadow itself at any relief amplitude this project accepts &mdash; so what is drawn
            here is the canopy, and most of it is the tree.
          </li>
          <li>
            <strong>Everything else held at today&rsquo;s values</strong>, so this direction is
            the light and nothing else.
          </li>
        </ul>
        <div className="row">
          <Island label="A &mdash; AFTERNOON" note="contact + cast shadow" tag="a-afternoon" {...AFTERNOON} />
        </div>
      </section>

      <section>
        <h2>4 &mdash; B: THE SLAB, where the edge carries it</h2>
        <p className="lede">
          The island as a solid object you could pick up. Its rim becomes its own material
          rather than a shaded lip of the same green, which is what gives the references their
          thickness &mdash; R1&rsquo;s wall of stone blocks, R3&rsquo;s kerb over a soil slab.
        </p>
        <ul className="calls">
          <li>
            <strong>The rim wears the family&rsquo;s authored <code>side</code> token.</strong>{' '}
            Not a new colour: <code>side</code> is the token the shipped map already puts on a
            territory&rsquo;s side faces, already in the closed palette. The island stops
            reading as a coloured plane with a dark lip and starts reading as a top surface on
            a flank.
          </li>
          <li>
            <strong>The flank is 9 ground units deep rather than 2.2.</strong> Colouring the
            rim was not enough on its own and the reason is arithmetic: at the 50&deg; camera
            the shipped 2.2-unit skirt delivers <strong>2.8 pixels</strong> of island
            thickness &mdash; under one percent of the island&rsquo;s on-screen height, so
            whatever colour it wears it cannot be part of the silhouette. Nine units delivers
            11.6 px, about 1.5&times; the median plant&rsquo;s delivered height. It is
            geometry, so it costs the palette nothing.
          </li>
          <li>
            <strong>The RIM only &mdash; capability boundaries are untouched.</strong> A parcel
            boundary drawn in a different colour is a drawn SEAM, which is the treatment the
            owner removed on 2026-08-16. The outer rim is not a boundary between two parcels;
            it is where the land stops.
          </li>
          <li>
            <strong>No cast shadow.</strong> Deliberate, so this direction is the silhouette
            and not the light. Contact darkening stays, because without it the props float
            against a now-more-solid island and the mismatch is worse than either alone.
          </li>
        </ul>
        <div className="row">
          <Island label="B &mdash; THE SLAB" note="deep material flank + contact" tag="b-slab" {...SLAB} />
        </div>
      </section>

      <section>
        <h2>5 &mdash; C: THE GARDEN, where the ground carries it</h2>
        <p className="lede">
          The direct test of the owner&rsquo;s own hypothesis &mdash; that the land&rsquo;s
          colour is the bigger signal and the tree is aesthetic. So this island has no tree at
          all, and everything that would have been focal is spread across the ground instead.
        </p>
        <ul className="calls">
          <li>
            <strong>Regional ground variation.</strong> The land selects among its status
            family&rsquo;s THREE authored ground tokens by a low-frequency field over ground
            space, on wavelengths of 96 and 61 units against a 16.5-unit cell pitch &mdash; so
            neighbouring cells almost always agree and the variation reads as patches rather
            than as noise. ⚠ This sits next to a decision the owner made against: the PER-CELL
            hash variants were removed on 2026-08-16. The distinction is measured, not
            asserted &mdash; the seam rate is in the README.
          </li>
          <li>
            <strong>No hero tree.</strong> Not a verdict on the tree; a direction that has to
            find its interest somewhere else, which is the only way to see whether it can.
          </li>
          <li>
            <strong>The <code>foliage</code> plant silhouette</strong> rather than{' '}
            <code>mound</code>, because with nothing focal the vegetation is carrying more of
            the picture and the two silhouettes distribute their mass differently.
          </li>
        </ul>
        <div className="row">
          <Island label="C &mdash; THE GARDEN" note="regional ground, no tree" tag="c-garden" {...GARDEN} />
        </div>
      </section>

      <section>
        <h2>6 &mdash; D: ONE LANDMASS, where the silhouette carries it</h2>
        <p className="lede">
          Every island above reads as a cluster of hexagons &mdash; a board rather than a
          place &mdash; and that read gets stronger, not weaker, when the tree comes off,
          because the silhouette is then the whole picture. This direction stops drawing the
          parcels and lets the land be one continuous mass with a thick flank.
        </p>
        <ul className="calls">
          <li>
            <strong>No parcel bevel.</strong> The bevel is what draws the capability
            boundaries &mdash; a V-groove per boundary, in the land&rsquo;s own colour. It is
            the single thing making the island read as tiles. Turned off, cells share exact
            edges and the ground is one surface riding one relief field.
          </li>
          <li>
            ⚠ <strong>The trade-off, named rather than buried:</strong> the parcel read GOES.
            You can no longer see where one capability ends and the next begins. Nothing false
            is asserted &mdash; a boundary that is not drawn claims nothing &mdash; but a
            signal is lost, and whether the island needs that signal is one of the things this
            arc is here to find out by looking.
          </li>
          <li>
            <strong>Deep material flank, regional ground, contact darkening, no tree.</strong>{' '}
            The composition that gives the silhouette the most to do.
          </li>
        </ul>
        <div className="row">
          <Island label="D &mdash; ONE LANDMASS" note="no parcel bevel, deep flank" tag="d-landmass" {...LANDMASS} />
        </div>
      </section>

      <section>
        <h2>7 &mdash; E: COMPOSED</h2>
        <p className="lede">
          Everything at once, with the parcels kept and the tree kept. If the directions
          compose rather than fight, this is the one that says so; if they fight, this is where
          it shows.
        </p>
        <ul className="calls">
          <li>
            <strong>Contact + cast shadow + deep material flank + regional ground.</strong> The{' '}
            <code>mound</code> plant silhouette rather than the garden&rsquo;s{' '}
            <code>foliage</code>, so the only differences from A and B are the ones named.
          </li>
        </ul>
        <div className="row">
          <Island label="E &mdash; COMPOSED" note="everything, tree kept" tag="e-composed" {...COMPOSED} />
        </div>
      </section>

      <section>
        <h2>8 &mdash; F: DEEPER GROUND, and why you have to decide it rather than us</h2>
        <p className="lede">
          Everything E has, plus the one thing that would actually change the picture: the
          ground is allowed to reach for a FOURTH authored token in its deepest hollows. It is
          the same status family and it is already in the closed palette &mdash; it is the
          colour the vegetation and the island&rsquo;s flank already wear.
        </p>
        <p className="lede">
          <strong>The size of the prize, measured.</strong> Flat ground is delivered at
          luminance 145. The occlusion rung &mdash; the deepest shadow the palette currently
          permits, and the thing directions A and E spend most of their machinery on &mdash;
          takes it to 135: a <strong>6.6% darkening</strong>. The fourth token takes it to 103:
          a <strong>29.2% darkening</strong>, four and a half times as much. Every other lever
          on this page is working inside a range narrower than this one token.
        </p>
        <p className="lede caveat">
          <strong>⚠ Why this session will not simply take it.</strong> The land&rsquo;s colour
          is what says whether a capability is proven. Under the renderer&rsquo;s own reader
          &mdash; one reference colour per status &mdash; that fourth token on lit ground reads
          as <code>mapped</code> rather than <code>healthy</code>. Under a reader that knows all
          three of the family&rsquo;s ground colours it reads as <code>healthy</code>. Both
          readers are defensible and they disagree, which is exactly the question already
          waiting on you: <em>the land&rsquo;s status colours differ mainly in brightness, and
          lighting moves brightness.</em> An appearance pass may not settle what the art
          asserts, so this island exists to price that question rather than to answer it. If
          the answer is that the statuses get separated by HUE rather than by brightness, this
          direction is available and so is a great deal more.
        </p>
        <div className="row">
          <Island
            label="E &mdash; COMPOSED"
            note="the same island, permitted today"
            tag="f-before"
            {...COMPOSED}
          />
          <Island
            label="F &mdash; DEEPER GROUND ⚠"
            note="gated on the open question"
            tag="f-after"
            {...DEEPGROUND}
          />
        </div>
      </section>

      <section>
        <h2>9 &mdash; the tree, on trial</h2>
        <p className="lede">
          The same island twice, identical in every other respect, with and without the hero
          tree, at delivered size. Two pairs: the island as it ships today, and the composed
          direction &mdash; because the question is worth asking both about the island the
          owner knows and about the one he might choose.
        </p>
        <p className="lede caveat">
          <strong>Two things that follow from removing it, and neither is an argument against
          doing so.</strong> The tree throws MORE ground shadow than all 144 plants combined
          (16.58% of the island&rsquo;s ground against 14.63%), so without it the shadow work
          drops back to roughly the 3% of delivered pixels it reached before the tree landed
          &mdash; close to not worth its palette cost. And it is the island&rsquo;s only focal
          point, so an island without one needs its interest somewhere else. Directions C and D
          are what that looks like.
        </p>
        <div className="row">
          <Island label="TODAY &mdash; with tree" note="the control" tag="tree-today-with" {...TODAY} />
          <Island label="TODAY &mdash; no tree" note="identical otherwise" tag="tree-today-without" {...TODAY} tree={false} />
        </div>
        <div className="row" style={{ marginTop: 26 }}>
          <Island label="E &mdash; with tree" note="composed" tag="tree-composed-with" {...COMPOSED} />
          <Island label="E &mdash; no tree" note="identical otherwise" tag="tree-composed-without" {...COMPOSED} tree={false} />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

// The capture gates on this signal rather than sleeping — this arc has twice photographed
// evidence mid-draw. Two frames, because the first only guarantees React has committed.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__stExperimentSettled = true;
  });
});
