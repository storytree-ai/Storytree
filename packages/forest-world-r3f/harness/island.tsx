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
        <h2>4 &mdash; the land without vegetation, and one unhealthy capability</h2>
        <p className="lede">
          The bare control tells you how much of the picture is the vegetation at all. The mixed
          island shows the banded material carrying a second status: nothing is snapped, so a
          parcel can only ever emit its own family&rsquo;s colours.
        </p>
        <div className="row">
          <IslandPanel
            label="bare land"
            note="8 px/unit, nothing on it"
            pxPerUnit={8}
            displayPxPerUnit={8}
            plants={false}
            flowers={false}
            tree={false}
          />
          <IslandPanel
            label="one unhealthy capability"
            note="8 px/unit"
            pxPerUnit={8}
            displayPxPerUnit={8}
            island={{ oddOneOut: { index: 0, status: 'unhealthy' } }}
          />
        </div>
      </section>

      <section>
        <h2>5 &mdash; what the two new components actually add</h2>
        <p className="lede">
          The control on the left is the island as it stood on 2026-08-19: ground and vegetation
          and nothing else. On the right it carries its ten UAT flowers and its story tree. Both
          at the size the map is actually delivered, because that is the only size at which
          &ldquo;does this add anything&rdquo; is a real question &mdash; the arc has measured
          twice that two treatments which part dramatically at 20&times; are indistinguishable at
          2&times;.
        </p>
        <div className="row">
          <IslandPanel
            label="2026-08-19 — vegetation only"
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
        <h2>6 &mdash; the three verdict forms, read off the island</h2>
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
