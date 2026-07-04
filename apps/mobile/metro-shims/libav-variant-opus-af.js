/**
 * Metro shim for @libav.js/variant-opus-af.
 * The real package uses dynamic import() paths Metro cannot bundle.
 * Modern browsers have WebCodecs; @moq/hang only loads libav when encoders are missing.
 */
const libav = {
  LibAV: async () => ({}),
};

export default libav;
