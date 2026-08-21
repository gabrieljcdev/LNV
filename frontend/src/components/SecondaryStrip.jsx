// DEPRECATED 2026-08-21 (round 17) — no longer imported anywhere.
//
// The separate secondary strip element this file used to render has been
// merged into Strip.jsx (see the "ROUND 17 — merged strip" comment block
// there for why: two independently-animated elements trying to collapse in
// sync never worked reliably across rounds 9-16, so gabriel proposed
// merging them into one element with a two-color background instead).
// `SECONDARY_STRIP_WIDTH` now lives in Strip.jsx as a named export;
// Preloader.jsx has been updated to import it from there instead of here.
//
// Safe to delete this file entirely — kept only as a marker in case a
// stray import was missed in this round's grep (it would fail loudly with
// a missing-export error rather than silently). As of round 17, nothing
// imports from this file.
