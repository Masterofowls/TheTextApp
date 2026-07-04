/**
 * Metro shim for @kixelated/libavjs-webcodecs-polyfill.
 * Only used when WebCodecs is unavailable; Chrome/Edge have native support.
 */
export async function load() {
  return true;
}
