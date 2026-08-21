// directions.tsx — FIVE ISLANDS BUILT TO LOOK GOOD, WITH PROPS UNFENCED (dev-only evidence page).
//
// Six whole islands: five directions and the island as it ships today, as the control.
//
// ============================================================================
// WHY THIS PAGE LOOKS NOTHING LIKE THE ONE IT REPLACES
// ============================================================================
//
// The previous version of this file showed six islands that differed by a flag each — light on,
// edge material, ground regional, bevel off. The owner rejected all six:
//
//   "these islands dont look nice at all, they all look the same/worse and look as if we havn't
//    really broken any new ground. If i look online there are lots of much better looking items,
//    what are we missing here"
//
// He was right, and the reason is countable. Our island draws FOUR kinds of object — ground,
// shrub, flower, tree. His four reference images draw EIGHT TO FIFTEEN, and every one of them
// has a hard boundary, a path with its own material, and stone AND wood AND paving AND water
// where we had exactly one material, matte green, in slightly different shapes.
//
// The observation that settles which half of the stack was short: his simplest reference is flat
// pixel art with NO cast shadows, NO ambient occlusion, NO terrain relief and NO bevels, and it
// reads as a place while ours did not. Our island already carried more rendering technique than
// that picture carries. So another pass of shadow, palette or bevel work could not have closed
// it — the gap was CONTENT and MATERIALS.
//
// He then lifted the fence that had kept every session working on rendering:
//
//   "for this experiement props are fine, its meant to show me what's possible so the whole point
//    of this experiement was to allow you to just build me a good looking island without worrying
//    about it representing the code"
//
// That is recorded as ADR-0406: the harness island represents nothing, so it asserts no state
// that a decoration could misreport, and props, colour and new material tokens are unfenced on
// it. The product map is untouched (ADR-0406 D2).
//
// ============================================================================
// THE RULES THIS PAGE IS STILL BUILT UNDER — none of them moved
// ============================================================================
//
//   - ADR-0392 D1 / ADR-0398 D2: the owner's look is taken ONCE, on a WHOLE island at DELIVERED
//     size, on real data. Every canvas here is a complete island at 2 px/unit on the real
//     13-hex `context-traversal-capture` surface. No contact sheet, no fragment, no prop swatch,
//     no ladder of one idea at four settings.
//   - ADR-0392 D2 / ADR-0398 D3: every appearance call is this session's and every one is
//     RECORDED WITH ITS REASON. The `calls` list under each direction is that record; the long
//     form is in `island-dressing.ts` beside the code that makes each choice, and in the
//     research README.
//   - ADR-0380 D6: three of the four fences do not move — accessibility stays in the DOM/SVG
//     layer, determinism stays on the scene graph, the projection does not move. The fourth, the
//     LOCKED PALETTE, is read by ADR-0406 D3 as a vocabulary fence rather than a size fence:
//     eighteen prop material tokens were AUTHORED, the banded shader is unchanged, and every
//     colour on this page is still an authored `(token x level)` closure entry.
//
// ============================================================================
// WHY THESE FIVE DIFFER, AND WHY THAT IS THE WHOLE DESIGN
// ============================================================================
//
// A flag can only vary a QUANTITY, which is why six flags read as one idea. These five vary what
// the island IS: an enclosed garden, a settlement, worked ground, a monument, an unbuilt shore.
// Each brings its own props, its own path material, its own vegetation density and its own
// relationship to the coast. Two of them deliberately have no buildings and two deliberately
// have no hero tree, so the page answers "what is actually carrying this?" rather than only
// "which do you like?".

import { createRoot } from 'react-dom/client';

import { IslandPanel, type IslandViewProps } from './IslandView.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The shipped map's real scale on a 2880x1920 display: 1x sprites are already upscaled about
 *  2x before anyone sees them (ADR-0380 D2). EVERY canvas on this page is here. */
const DELIVERED = 2;

/** One island, whole, at the size it is actually delivered. The only panel shape this page has
 *  — a deliberate constraint rather than a convenience, because the shapes this page does NOT
 *  offer are exactly the ones ADR-0392 D1 exists to prevent. */
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

type Dir = Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'>;

/** The control: what ships now. Flat pale ground, a rim the same green as the top face, no
 *  occlusion anywhere, 144 plants, one very large tree. */
const TODAY: Dir = {};

/**
 * A — THE WALLED GARDEN. A stone retaining wall containing the whole plot, a paved path ring
 * inside it, a court with a well, potted plants, rail fences and hedges.
 *
 * `edge: 'material'` with a 5-unit flank: the land's own rim is now mostly BEHIND the stone
 * wall, so it needs to read as the ground the wall stands on rather than as the island's edge.
 * Five units delivers about 6.4 px of earth under the coping, which is a footing; the nine units
 * the previous round used would read as a plinth and put the wall on a pedestal.
 */
const WALLED: Dir = {
  dressing: 'walled',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 5,
  ground: 'regional',
};

/**
 * B — THE HAMLET. Three cottages on three parcels, gravel paths worn between them, fenced yards,
 * a well, clutter, and a rocky unwalled coast.
 *
 * `wallDepth: 9` and `edge: 'material'`: this is the one direction whose boundary is the LAND
 * rather than something built on it, so the flank has to be thick enough to be part of the
 * silhouette. Nine units delivers 11.6 px, about one and a half times the vegetation's height —
 * the number the previous round derived and the one thing from it worth keeping.
 */
const HAMLET: Dir = {
  dressing: 'hamlet',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 9,
  ground: 'regional',
};

/**
 * C — THE TERRACES. The island's own parcel boundaries become low retaining walls, with steps
 * between them, a stone water channel along the long axis, and planting in rows.
 *
 * `tree: false`: a terraced hillside with one enormous tree in the middle reads as a tree with
 * terraces behind it. This direction is about the ground, so the ground gets the frame.
 */
const TERRACE: Dir = {
  dressing: 'terrace',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 7,
  ground: 'regional',
  tree: false,
};

/**
 * D — THE SHRINE COURT. A raised stone platform carrying a timber pavilion, approached by
 * stepping stones from a gate at the shore, lit by lanterns, on raked gravel.
 *
 * `tree: false` because the pavilion IS the focal mass — that is the direction's whole
 * proposition, and leaving the tree in would leave the question unasked.
 *
 * `flowers: false` is the one call on this page that removes something from the fixture rather
 * than adding to it. Ten white wildflowers scattered across a swept gravel court is two ideas
 * arguing; a raked court is defined by what is NOT growing on it. It is recorded here rather
 * than hidden because it is the only place on the page where a direction drops real data.
 */
const SHRINE: Dir = {
  dressing: 'shrine',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 6,
  ground: 'single',
  tree: false,
  flowers: false,
};

/**
 * E — THE WILD SHORE. No architecture at all: a sand shore rounding the coast, rock outcrops, a
 * stone-rimmed pool, a beached boat, flowering thickets.
 *
 * `style: 'foliage'`: with no built object to lead the eye, the vegetation carries more of the
 * picture, and the two silhouettes distribute their mass differently. Every other direction
 * holds `mound` so that they differ only in the ways their sections name.
 */
const WILD: Dir = {
  dressing: 'wild',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 8,
  ground: 'regional',
  style: 'foliage',
};

function App() {
  return (
    <main>
      <header>
        <h1>Five islands, built to look good</h1>
        <p>
          Every picture on this page is a <strong>whole island at the size it is actually
          delivered</strong> &mdash; 2 px per ground unit, the real 13-hex research surface
          (<code>context-traversal-capture</code>), its eleven capabilities, its own ten UAT
          criteria. Nothing here is a fragment, a swatch, or a technique survey.
        </p>
        <p>
          Last time you saw six islands that differed by a setting each, and you said they all
          looked the same. They did. The countable reason: <strong>our island draws four kinds of
          object &mdash; ground, shrub, flower, tree. Your reference images draw eight to
          fifteen</strong>, and every one of them has a wall or a fence, a path with its own
          material, and stone <em>and</em> wood <em>and</em> paving <em>and</em> water where we
          had one matte green.
        </p>
        <p>
          So this round spends nothing on rendering. It spends everything on{' '}
          <strong>what is on the island</strong>. These five differ in what the place <em>is</em>
          {' '}&mdash; an enclosed garden, a settlement, worked ground, a monument, an unbuilt
          shore &mdash; not in how brightly it is lit.
        </p>
        <p className="numbers">
          13 hexes &middot; 11 capabilities &middot; 18 new authored material tokens &middot;
          locked palette, every colour still an authored <code>token &times; level</code> entry
          &middot; 2.5D isometric at 50&deg; &middot; one authored light at 55.2&deg; &middot;
          nothing is animated (ADR-0045) &middot; nothing here is adopted into the app
        </p>
      </header>

      <section>
        <h2>1 &mdash; the choice, side by side</h2>
        <p className="lede">
          The five directions and the island as it ships today, all whole, all at delivered size.
          This is the row the decision is made on; the sections below are the same islands again,
          larger on the page but rendered at exactly the same 2 px/unit, with the appearance
          calls that made each one.
        </p>
        <div className="row">
          <Island label="TODAY" note="what ships now" tag="row-today" {...TODAY} />
          <Island label="A &mdash; WALLED GARDEN" note="an enclosed plot" tag="row-walled" {...WALLED} />
          <Island label="B &mdash; THE HAMLET" note="a place people live" tag="row-hamlet" {...HAMLET} />
          <Island label="C &mdash; THE TERRACES" note="worked ground" tag="row-terrace" {...TERRACE} />
          <Island label="D &mdash; THE SHRINE COURT" note="a monument, approached" tag="row-shrine" {...SHRINE} />
          <Island label="E &mdash; THE WILD SHORE" note="nothing built" tag="row-wild" {...WILD} />
        </div>
      </section>

      <section>
        <h2>2 &mdash; where we start: the island as it ships</h2>
        <p className="lede">
          The control, and the thing you rejected. Flat pale ground, a rim the same green as the
          top face, no occlusion anywhere, 144 plants each about fifteen delivered pixels across,
          and one very large tree. Everything below is measured against this.
        </p>
        <div className="row">
          <Island label="TODAY" note="2 px/unit &middot; the control" tag="today" {...TODAY} />
        </div>
      </section>

      <section>
        <h2>3 &mdash; A: THE WALLED GARDEN</h2>
        <p className="lede">
          Your well-garden reference, translated to our island rather than copied from it. A
          stone retaining wall contains the whole plot, a paved path follows it round, a court
          off to one side holds a well, and pots, fences and hedges fill the ground between.
        </p>
        <ul className="calls">
          <li>
            <strong>The wall follows a SMOOTHED coast, and that is the biggest single change on
            this page.</strong> The island&rsquo;s outline is a cluster of thirteen hexagons and
            it reads as a board &mdash; the last round said so and could not fix it, because
            fixing it looked like moving the land. It is not: the wall is built along the rim
            polyline with its corners rounded, so the eye traces a plot while the land keeps its
            cells, its parcels and its bevel exactly as they were.
          </li>
          <li>
            <strong>The wall is battered, not vertical, and the number is arithmetic.</strong> At
            this light every vertical face lands on the darkest rung whichever way it points, so
            a plain wall delivers two colours and reads as a silhouette with a lid. Leaning the
            sides at slope 0.45 lifts the light-facing side two rungs while the away side stays
            at the bottom &mdash; which is what turns it into a solid.
          </li>
          <li>
            <strong>The coping is a lighter stone.</strong> A wall&rsquo;s top is horizontal, so
            no lighting choice can separate it from the body; only a second authored token can.
          </li>
          <li>
            <strong>The court is off-centre, to the east.</strong> The hero tree stands near the
            middle with a 75-unit crown, so a court at the centre would sit under it and both
            would be illegible. Off-centre gives the island TWO centres of interest, which every
            one of your references has and a single tree on a green field never did.
          </li>
          <li>
            <strong>The vegetation is thinned to 45%</strong>, and the weight goes into hedges and
            pots. 144 plants at fifteen delivered pixels each read as speckle; your references
            carry between ten and thirty plant masses with actual shapes.
          </li>
        </ul>
        <div className="row">
          <Island label="A &mdash; WALLED GARDEN" note="wall, path, court, well, pots" tag="walled" {...WALLED} />
        </div>
      </section>

      <section>
        <h2>4 &mdash; B: THE HAMLET</h2>
        <p className="lede">
          A place people live. Three cottages on three different parcels, gravel paths worn
          between them, fenced yards, a village well, and a coast left rocky rather than walled.
        </p>
        <ul className="calls">
          <li>
            <strong>No perimeter wall, on purpose.</strong> This is the direction that answers
            &ldquo;does the island need to be enclosed to read as a place?&rdquo; If A and B both
            read and only A has a wall, the wall is not what did it. Keeping one variable
            genuinely absent is the only way that stays answerable.
          </li>
          <li>
            <strong>Three buildings, not one.</strong> A single house on an island this size
            reads as a marker; three read as a relationship, and the paths between them carry it.
            Your cottage reference is mostly path and fence &mdash; the house occupies about a
            fifth of the frame.
          </li>
          <li>
            <strong>The roofs are pitched with their ridges running one specific way, and it is
            worth saying why.</strong> A surface tilted toward the light is the ONLY thing on this
            island that reaches full-strength colour &mdash; the ground&rsquo;s top faces never
            do. So a pitched roof is simultaneously the brightest and the highest-contrast object
            available, and these are oriented to collect that.
          </li>
          <li>
            <strong>The paths wander.</strong> A dead-straight line between two points reads as
            drawn; a walked path bends once, smoothly, around eight units &mdash; about a cottage
            width, enough to read as a curve at this size and not so much that it stops looking
            like the shortest way there.
          </li>
          <li>
            <strong>The island&rsquo;s flank is nine units deep.</strong> With no wall, the coast
            IS the boundary, so it has to be part of the silhouette. Nine units delivers 11.6 px
            &mdash; about one and a half times the vegetation.
          </li>
        </ul>
        <div className="row">
          <Island label="B &mdash; THE HAMLET" note="cottages, paths, yards, well" tag="hamlet" {...HAMLET} />
        </div>
      </section>

      <section>
        <h2>5 &mdash; C: THE TERRACES</h2>
        <p className="lede">
          Worked ground. The island&rsquo;s own capability boundaries become low retaining walls,
          so the structure that is currently a faint bevel becomes architecture. Steps cross the
          walls, a stone channel carries water along the long axis, and the planting runs in rows.
        </p>
        <ul className="calls">
          <li>
            <strong>This is the only direction that uses the island&rsquo;s own structure.</strong>
            {' '}A, B, D and E could be built on any landmass. This one is made of where the
            capabilities meet &mdash; which makes it the most interesting if it reads and the most
            instructive if it does not.
          </li>
          <li>
            <strong>The walls are low &mdash; 3.5 units.</strong> A terrace front is a step in the
            ground, not an enclosure. That delivers about 4.5 px of face, which is enough to read
            as an edge and not enough to cut the island into compartments.
          </li>
          <li>
            <strong>⚠ It draws boundaries, and on the real map that would mean something.</strong>
            {' '}A drawn seam between two capabilities is exactly the treatment you removed on
            16 August. Here it asserts nothing, because this island represents nothing. But if you
            pick this direction, that is one of the things it <em>costs</em>, and we would rather
            say so now than discover it when someone tries to bring it into the app.
          </li>
          <li>
            <strong>No hero tree.</strong> A terraced hillside with one enormous tree in the
            middle reads as a tree with terraces behind it.
          </li>
        </ul>
        <div className="row">
          <Island label="C &mdash; THE TERRACES" note="retaining walls, steps, channel, rows" tag="terrace" {...TERRACE} />
        </div>
      </section>

      <section>
        <h2>6 &mdash; D: THE SHRINE COURT</h2>
        <p className="lede">
          A monument, approached. A raised stone platform carries a timber pavilion; stepping
          stones run to it from a gate at the shore, lit by lanterns; the ground around it is
          raked gravel rather than grass.
        </p>
        <ul className="calls">
          <li>
            <strong>The pavilion replaces the hero tree as the focal mass</strong>, which puts the
            arc&rsquo;s live question as a picture. The last round found that removing the tree
            left the island &ldquo;emptier rather than cleaner&rdquo;, because nothing else was
            tall or dark. A pavilion is both &mdash; and its roof is the one surface here big
            enough for full-strength colour to be an area rather than a highlight.
          </li>
          <li>
            <strong>The ground is mostly empty, and that is the risk this direction takes.</strong>
            {' '}Every other direction answers the reference count by ADDING kinds of object. This
            one answers it by subtraction: few objects, all large, on a swept surface. If it
            reads, the count was never the whole story and composition was. If it does not, that
            is worth knowing, and this is the cheapest way to find out.
          </li>
          <li>
            <strong>The lanterns are the only things wearing the palette&rsquo;s brightest
            token.</strong> Five of them, small, on a dark court. A bright token used anywhere
            else stops being an accent.
          </li>
          <li>
            <strong>The UAT wildflowers are off here, and it is the only place on this page that
            removes real data.</strong> Ten white wildflowers scattered across a swept gravel
            court is two ideas arguing; a raked court is defined by what is not growing on it.
          </li>
          <li>
            <strong>It gets the rounded outline by its own means &mdash; a swept gravel margin, not
            a wall.</strong> Without one it read as a house on a hexagon board, which is the
            complaint this whole round answers surviving inside one of its own directions. It is
            deliberately narrow and flat: an earlier, chunkier version read at a glance like A&rsquo;s
            retaining wall, and two directions arriving at the same silhouette is a failure here
            even when each is defensible on its own.
          </li>
        </ul>
        <div className="row">
          <Island label="D &mdash; THE SHRINE COURT" note="platform, pavilion, gate, lanterns" tag="shrine" {...SHRINE} />
        </div>
      </section>

      <section>
        <h2>7 &mdash; E: THE WILD SHORE</h2>
        <p className="lede">
          Nothing built. A sand shore rounding the coast, rock outcrops, a stone-rimmed pool, a
          beached boat, and flowering thickets.
        </p>
        <ul className="calls">
          <li>
            <strong>This is the control for the whole idea.</strong> If the diagnosis is right, an
            island given materials and masses but no architecture should still read far better
            than the round you rejected &mdash; it gains sand, stone, water and blossom, which is
            five materials against one. If it reads no better, the finding is that BUILDINGS were
            what those references were carrying, and that is a genuinely different worklist.
          </li>
          <li>
            <strong>Colour comes from flowering thickets rather than from pots</strong>, because a
            pot is a built object and this island has none. A mass of blossom or marigold has a
            silhouette; a scattered wildflower does not, at this size.
          </li>
          <li>
            <strong>The shore is a wide run of sand slabs following the smoothed coast.</strong> A
            ring of shore is not a convex shape, so it cannot be one extruded outline &mdash; but
            a three-wide run of slabs is a ring made of convex pieces, and it drapes over the
            land&rsquo;s relief for free because each slab sits at its own ground height.
          </li>
          <li>
            <strong>The vegetation keeps 70%</strong>, the most of any direction, and uses the
            other plant silhouette. A wild shore is the one place where density is the point.
          </li>
        </ul>
        <div className="row">
          <Island label="E &mdash; THE WILD SHORE" note="sand, rocks, pool, boat, thickets" tag="wild" {...WILD} />
        </div>
      </section>

      <section>
        <h2>8 &mdash; the tree, still on trial</h2>
        <p className="lede">
          Your hypothesis was that the hero tree is redundant because the land&rsquo;s colour is
          the bigger signal. The last round found it is not <em>merely</em> aesthetic in the
          picture &mdash; it is the island&rsquo;s only dark mass and its only vertical, and the
          versions without it looked emptier rather than cleaner. The interesting question now is
          whether that is still true once the island has walls, paths and buildings on it. Here is
          the same walled island twice, identical in every other respect.
        </p>
        <div className="row">
          <Island label="A &mdash; with the tree" note="the walled garden" tag="tree-with" {...WALLED} />
          <Island
            label="A &mdash; no tree"
            note="identical otherwise"
            tag="tree-without"
            {...WALLED}
            tree={false}
          />
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
