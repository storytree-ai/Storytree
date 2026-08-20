// island.tsx — entry point for the ISLAND evidence page (dev-only).
//
// Same settled-signal contract as the plant page: the capture waits on a signal the page
// publishes rather than sleeping, because this arc has twice captured evidence mid-draw.

import { createRoot } from 'react-dom/client';

import { IslandPanel } from './IslandView.js';
import type { CriterionState } from './island-fixture.js';

declare global {
  interface Window {
    __stExperimentSettled?: boolean;
  }
}

/** The shipped map's real scale on a 2880x1920 display: 1x sprites are already upscaled
 *  about 2x before anyone sees them (ADR-0380 D2). */
const DELIVERED = 2;

/** A deliberately MIXED verdict spread, so one island shows all three authored forms. It is a
 *  labelled deviation from the fixture's default (`proven` throughout, which is the honest
 *  reading of an all-healthy research surface) and never the default itself &mdash; a page that
 *  shipped failing flowers as its resting state would be the art asserting a proof state the work
 *  does not hold, which is the ADR-0367 D5 failure. */
const MIXED: CriterionState[] = [
  'proven',
  'proven',
  'pending',
  'proven',
  'failing',
  'proven',
  'pending',
  'proven',
  'proven',
  'failing',
];

const ALL_PROVEN: CriterionState[] = Array.from({ length: 10 }, () => 'proven');
const ALL_PENDING: CriterionState[] = Array.from({ length: 10 }, () => 'pending');
const ALL_FAILING: CriterionState[] = Array.from({ length: 10 }, () => 'failing');

function App() {
  return (
    <main>
      <header>
        <h1>The island carries its flowers and its story tree</h1>
        <p>
          The 2026-08-19 island drew ground and vegetation and <em>nothing else</em>. The owner
          named the gap on 2026-08-16 &mdash; &ldquo;we still dont have flowers etc&rdquo; &mdash;
          and it had never been closed. This page adds the two named components: the{' '}
          <strong>UAT flowers</strong>, one per criterion, whose verdict is read from their FORM
          (ADR-0226 D4 &mdash; a bloomed daisy is proven, a closed bud is pending, a wilted
          nodding head is failing), and the <strong>hero story tree</strong>, grown as a solid
          rather than composited as a raster.
        </p>
        <p>
          Both panels in each pair draw the same <code>buildScene</code> output &mdash; same
          ground cells, same plants, same flowers at the same ground positions, same tree, same
          banded palette, same light, same orthographic 50&deg; camera. Only the rasterisation
          resolution differs, so a difference between panels is the convention and nothing else.
        </p>
        <p className="numbers">
          13 hexes &middot; 11 capabilities &middot; all healthy &middot; 10 UAT criteria (the real
          story&rsquo;s own ten) &middot; density is <code>2 + tests &times; 1.9</code> (ADR-0226
          D2) &middot; the scene is projected at 20&deg; and UNPROJECTED before rendering, so the
          ground is foreshortened exactly once &middot; the flowers are NEVER animated (ADR-0045)
        </p>
      </header>

      <section>
        <h2>1 &mdash; at the size it is actually delivered</h2>
        <p className="lede">
          The unflattering pair, life size on a 2880&times;1920 display.
        </p>
        <div className="row">
          <IslandPanel
            label="SPRITE — today"
            note={`1 px/unit, upscaled ${DELIVERED}x`}
            pxPerUnit={1}
            displayPxPerUnit={DELIVERED}
          />
          <IslandPanel
            label="LIVE — same scene"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
          />
        </div>
      </section>

      <section>
        <h2>2 &mdash; the same island, zoomed in</h2>
        <p className="lede">
          Where the two conventions part. Same island, bigger map scale each time.
        </p>
        {[4, 8].map((z) => (
          <div className="row zoomrung" key={z}>
            <span className="rung">{z} px / unit</span>
            <IslandPanel
              label="sprite"
              note={`1 px/unit, upscaled ${z}x`}
              pxPerUnit={1}
              displayPxPerUnit={z}
            />
            <IslandPanel label="live" note={`${z} px/unit`} pxPerUnit={z} displayPxPerUnit={z} />
          </div>
        ))}
      </section>

      <section>
        <h2>3 &mdash; the swirls fork: mound vs foliage</h2>
        <p className="lede">
          The owner&rsquo;s read of the first pass was &ldquo;circular swirls&rdquo;, and that is a
          fair description of what a mound IS: every lobe is a sphere scaled on the world axes, so
          the outline is a union of circles and the banded shading lays concentric rings inside
          each one &mdash; the rings <em>are</em> the swirl. <strong>foliage</strong> changes only
          each lobe&rsquo;s orientation and proportion &mdash; flattened into leaf-like discs,
          tilted onto their own axes &mdash; at the same lobe count, same footprint, same triangle
          cost. Everything else is identical.
        </p>
        <div className="row stack">
          <div className="row">
            <IslandPanel label="mound (today)" note="8 px/unit" pxPerUnit={8} displayPxPerUnit={8} style="mound" />
            <IslandPanel label="foliage" note="8 px/unit" pxPerUnit={8} displayPxPerUnit={8} style="foliage" />
          </div>
          <div className="row">
            <IslandPanel
              label="mound — as delivered"
              note={`${DELIVERED} px/unit`}
              pxPerUnit={DELIVERED}
              displayPxPerUnit={DELIVERED}
              style="mound"
            />
            <IslandPanel
              label="foliage — as delivered"
              note={`${DELIVERED} px/unit`}
              pxPerUnit={DELIVERED}
              displayPxPerUnit={DELIVERED}
              style="foliage"
            />
          </div>
        </div>
      </section>

      <section>
        <h2>
          4 &mdash; the land without vegetation, and one unhealthy capability{' '}
          <em>(the 2026-08-19 state, kept as the control)</em>
        </h2>
        <p className="lede">
          The bare control tells you how much of the picture is the vegetation at all &mdash; and
          the first time anyone drew it, it answered: <strong>all of it</strong>. These two panels
          are pinned to the pre-definition land so the next section has something to be measured
          against. The mixed island shows the banded material carrying a second status: nothing is
          snapped, so a parcel can only ever emit its own family&rsquo;s colours.
        </p>
        <div className="row">
          <IslandPanel
            label="bare land"
            note="8 px/unit, flat land, nothing on it"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            flowers={false}
            tree={false}
            land="flat"

          />
          <IslandPanel
            label="one unhealthy capability"
            note="8 px/unit"
            pxPerUnit={8}
            displayPxPerUnit={8}
            island={{ oddOneOut: { index: 0, status: 'unhealthy' } }}
            land="flat"
          />
        </div>
      </section>

      <section>
        <h2>5 &mdash; the land carries its own definition</h2>
        <p className="lede">
          The bare panel above is the finding this section answers:{' '}
          <strong>the land was a single flat green field</strong> &mdash; no seams, no variation,
          no texture &mdash; so every scrap of the island&rsquo;s visual interest rested on
          vegetation marks a handful of pixels across. That is not a bug. It is what three
          separately-correct directions compose to: flat green ground, mesh seams removed, one
          surface rather than three hash-picked variants. Both mechanisms below are{' '}
          <em>lighting</em> operations on geometry the land already has, and neither names a
          colour &mdash; so the closed palette is untouched by construction, and a shadow landing
          on this land speaks the same language rather than fighting a second pattern.
        </p>
        <div className="row">
          <IslandPanel
            label="FLAT — the 2026-08-19 control"
            note="8 px/unit, no plants"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            land="flat"
          />
          <IslandPanel
            label="FULL — relief + parcel bevel"
            note="8 px/unit, no plants"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            land="full"
          />
        </div>
        <p className="lede">
          The two mechanisms apart, because a reader who cannot see them separately cannot tell
          which one is doing the work. <strong>Relief</strong> gives the surface normal somewhere
          to go, so a big parcel&rsquo;s interior stops being one rung of the ladder.{' '}
          <strong>The bevel</strong> turns the land down over 1.6 ground units at every{' '}
          <em>capability</em> boundary &mdash; and at no other seam, because a seam between two
          cells of the same capability asserts nothing, which is exactly why drawing those was
          rejected.
        </p>
        <div className="row">
          <IslandPanel
            label="relief only"
            note="8 px/unit, no plants"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            land="relief"
          />
          <IslandPanel
            label="parcel bevel only"
            note="8 px/unit, no plants"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            land="bevel"
          />
        </div>
      </section>

      <section>
        <h2>6 &mdash; at the size it is actually delivered, which is the only size that counts</h2>
        <p className="lede">
          Everything above is at 8&nbsp;px/unit. This is the pair that decides it: the bare land
          before and after, life size, and then the dressed island the same way. If the definition
          does not survive this row it does not exist.
        </p>
        <div className="row">
          <IslandPanel
            label="FLAT — bare, as delivered"
            note={`${DELIVERED} px/unit, no plants`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            plants={false}
            land="flat"
          />
          <IslandPanel
            label="FULL — bare, as delivered"
            note={`${DELIVERED} px/unit, no plants`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            plants={false}
            land="full"
          />
        </div>
        <div className="row">
          <IslandPanel
            label="FLAT — dressed, as delivered"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            land="flat"
          />
          <IslandPanel
            label="FULL — dressed, as delivered"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            land="full"
          />
        </div>
      </section>

      <section>
        <h2>7 &mdash; the amplitude the relief was set at, and the ones it was set against</h2>
        <p className="lede">
          The number that matters is not the height &mdash; it is the <em>slope</em>, because the
          shader quantises <code>dot(n, L)</code> onto a four-rung ladder and only slope moves a
          pixel between rungs. Flat ground sits on rung <code>0.9</code>; reaching{' '}
          <code>1.0</code> needs about 9&deg; toward the light and reaching <code>0.8</code> about
          11&deg; away from it.{' '}
          <strong>
            This ladder is why an amplitude was chosen rather than guessed, and it prices nothing
          </strong>{' '}
          &mdash; the palette/amplitude trade for the <em>author-time compositor</em> is a
          different renderer with a different closure argument, and it is still owed by its own
          increment.
        </p>
        <div className="row">
          {[0, 1.2, 2.2, 3.2].map((a) => (
            <IslandPanel
              key={a}
              label={a === 0 ? 'amplitude 0 (flat)' : `amplitude ${a.toFixed(1)}`}
              note={`${DELIVERED} px/unit, no plants`}
              pxPerUnit={DELIVERED}
              displayPxPerUnit={DELIVERED}
              plants={false}
              land="relief"
              amplitude={a}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>8 &mdash; the mixed island keeps its palette closure</h2>
        <p className="lede">
          The treatment moves positions and normals and never names a colour, so a parcel still
          cannot emit a colour from another status&rsquo;s family. Here it is carrying one
          unhealthy capability, defined.
        </p>
        <div className="row">
          <IslandPanel
            label="one unhealthy capability — defined"
            note="8 px/unit"
            pxPerUnit={8}
            displayPxPerUnit={8}
            island={{ oddOneOut: { index: 0, status: 'unhealthy' } }}
            land="full"
          />
          <IslandPanel
            label="bare, defined, one unhealthy"
            note="8 px/unit, no plants"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            island={{ oddOneOut: { index: 0, status: 'unhealthy' } }}
            land="full"
          />
        </div>
      </section>

      <section>
        <h2>9 &mdash; what the two new components actually add</h2>
        <p className="lede">
          The control on the left is this island with its vegetation and <em>nothing else</em>
          &mdash; which is what every island the arc has rendered has been. On the right it
          carries its ten UAT flowers and its story tree. Both at the size the map is actually
          delivered, because that is the only size at which &ldquo;does this add anything&rdquo;
          is a real question: the arc has measured twice that two treatments which part
          dramatically at 20&times; are indistinguishable at 2&times;.{' '}
          <strong>Note the control is not the 2026-08-19 island any more</strong> &mdash; it
          carries the land definition section 5 added, so what these four panels isolate is the
          two PROPS and not the ground beneath them.
        </p>
        <div className="row">
          <IslandPanel
            label="vegetation only — the control"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            flowers={false}
            tree={false}
          />
          <IslandPanel
            label="with flowers and the story tree"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
          />
        </div>
        <div className="row">
          <IslandPanel
            label="flowers only, no tree"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            tree={false}
          />
          <IslandPanel
            label="tree only, no flowers"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            flowers={false}
          />
        </div>
      </section>

      <section>
        <h2>10 &mdash; the three verdict forms, read off the island</h2>
        <p className="lede">
          ADR-0226 D4 puts the UAT verdict in the flower&rsquo;s FORM rather than in a glow or a
          colour, which means the test of the form is whether the three read apart{' '}
          <em>as silhouettes</em>. This island is the same one, with its criteria set to a mixed
          spread so all three appear at once &mdash; a labelled deviation from the real
          story&rsquo;s state, exactly like the foreign-status capability above. Left is delivered
          size; right is the same island magnified.
        </p>
        <div className="row">
          <IslandPanel
            label="mixed verdicts — as delivered"
            note={`${DELIVERED} px/unit`}
            pxPerUnit={DELIVERED}
            displayPxPerUnit={DELIVERED}
            island={{ criteriaStates: MIXED }}
          />
          <IslandPanel
            label="mixed verdicts — magnified"
            note="8 px/unit"
            pxPerUnit={8}
            displayPxPerUnit={8}
            island={{ criteriaStates: MIXED }}
          />
        </div>
        <p className="lede">
          And the pathological control: every criterion in one state at a time. If the three
          islands below are not immediately different from one another, the form is not carrying
          the verdict and that is a finding rather than a preference.
        </p>
        <div className="row">
          <IslandPanel
            label="all proven — bloomed daisies"
            note="6 px/unit"
            pxPerUnit={6}
            displayPxPerUnit={6}
            island={{ criteriaStates: ALL_PROVEN }}
          />
          <IslandPanel
            label="all pending — closed buds"
            note="6 px/unit"
            pxPerUnit={6}
            displayPxPerUnit={6}
            island={{ criteriaStates: ALL_PENDING }}
          />
          <IslandPanel
            label="all failing — wilted heads"
            note="6 px/unit"
            pxPerUnit={6}
            displayPxPerUnit={6}
            island={{ criteriaStates: ALL_FAILING }}
          />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__stExperimentSettled = true;
  });
});
