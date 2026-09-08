// canvasRegistration.constants.ts — the two elevations the registration question is ABOUT, imported
// from where each is decided rather than written down again.
//
// ⚠ IT IS A RE-EXPORT AND NOT A COPY, on purpose. A second literal `20` or `50` here would be a
// third opinion about the camera, and the whole reason `LAND_CAMERA_ELEVATION_DEG` exists is that
// the land and the objects standing on it must read ONE value (ADR-0367 D1). The test that asserts
// the layers disagree by `sin 50° / sin 20°` has to be reading the SAME numbers the map and the
// canvas are drawn at, or it is asserting something about nothing.

export { LAND_CAMERA_ELEVATION_DEG } from '@storytree/forest-world';
export { SHIPPED_ELEVATION_DEG } from '@storytree/forest-world-r3f';
