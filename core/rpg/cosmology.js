// ═══════════════════════════════════════════════════════════════════════════
//  COSMOLOGY — the four clocks (owner-confirmed geometry, pass 3)
// ═══════════════════════════════════════════════════════════════════════════
//
//  IMPLEMENTATION of implementation/cosmology_orbits.md + world_map.md §3.
//
//  THE FOUR CLOCKS RULE (additional_ideas/ideas.md #16 — NEVER MERGE):
//    1. First World orbit  : 5 real hours = 5 in-game days (clockwise)
//    2. Abyss access cycle : 6 real hours — 5 h locked + 1 h ENTRY window
//    3. Afterlife orbit    : ~2 real days (independent path)
//    4. Triune alignment   : a checked STATE (FW bottom + Afterlife at its
//                            Abyss-facing point), naturally recurring about
//                            once per ~7 real days. A flaggable window, NOT
//                            a scheduled timer and NOT a merged clock.
//
//  They answer different questions (where is the world? can I enter the
//  Abyss? where is the Afterlife? is the alignment happening?) — merging any
//  two would let a future change to one silently corrupt the others.
//
//  IN-MEMORY ONLY: every value is a pure function of wall time anchored at
//  the fixed epoch T0. Restarts re-derive identical positions. No Mongo.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// ─── PERIODS (ms) ────────────────────────────────────────────────────────────
const MS_MIN  = 60 * 1000;
const MS_HOUR = 60 * MS_MIN;
const MS_DAY  = 24 * MS_HOUR;

const FW_PERIOD_MS    = 5 * MS_HOUR;    // First World orbit: 5 h = 5 game days
const ABYSS_CYCLE_MS  = 6 * MS_HOUR;    // 5 h locked + 1 h entry window
const ABYSS_LOCKED_MS = 5 * MS_HOUR;    // locked portion of the abyss cycle
const AL_PERIOD_MS    = 48 * MS_HOUR;   // Afterlife: ~2 real days per circuit

// Triune tuning (checked state, not a timer):
//   FW "bottom"   = FW phase within FW_BOTTOM_EPS of the bottom position
//   AL "at point" = AL phase within AL_ALIGNMENT_EPS of its alignment anchor
// Expected coincidence frequency ≈ (FW_PERIOD × AL_PERIOD) /
//   (FW_bottom_window × AL_window) ≈ 168 h ≈ 7 days with the epsilons below.
const FW_BOTTOM_EPS      = 0.03;  // ±3% of the FW orbit (≈ ±9 min)
const AL_ALIGNMENT_EPS   = 0.10;  // ±10% of the AL orbit (≈ ±4.8 h)
const AL_ALIGNMENT_POINT = 0.0;   // the Afterlife's Abyss-facing anchor (T0-defined)

// Fixed epoch anchor: 2026-01-01T00:00:00Z. Pure-constant so every process
// and every restart derives identical orbital phases.
const T0 = Date.UTC(2026, 0, 1, 0, 0, 0);

// ─── CORE PHASE FUNCTIONS ────────────────────────────────────────────────────

/** First World orbital phase, 0..1 (clockwise from the anchor's top position). */
function fwPhase(t = Date.now()) {
    return (((t - T0) % FW_PERIOD_MS) + FW_PERIOD_MS) % FW_PERIOD_MS / FW_PERIOD_MS;
}

/** Afterlife orbital phase on its own independent path, 0..1. */
function alPhase(t = Date.now()) {
    return (((t - T0) % AL_PERIOD_MS) + AL_PERIOD_MS) % AL_PERIOD_MS / AL_PERIOD_MS;
}

/** True while the First World's Abyss-linking point ("bottom") is engaged. */
function fwAtBottom(t = Date.now()) {
    const p = fwPhase(t);
    // The bottom position is the anchor (phase 0) — accept the wrap window.
    return p <= FW_BOTTOM_EPS || p >= 1 - FW_BOTTOM_EPS;
}

/** True while the Afterlife rides near its Abyss-facing alignment point. */
function alAtAlignment(t = Date.now()) {
    const p = alPhase(t);
    const d = Math.min(
        Math.abs(p - AL_ALIGNMENT_POINT),
        1 - Math.abs(p - AL_ALIGNMENT_POINT),
    );
    return d <= AL_ALIGNMENT_EPS;
}

// ─── CLOCK 2: ABYSS UNIVERSAL ENTRY WINDOW ───────────────────────────────────
// One universal 6-hour cycle across ALL players: 5 h locked + 1 h open.
// The window gates ENTRY ONLY — players already inside are never extracted
// by the window closing (enforcement lives at the `.j abyss enter` gate).

/**
 * @param {number} [t] epoch ms
 * @returns {{open: boolean, phaseInCycle: number,
 *           msRemaining: number, label: string}}
 *   open       — is the entry window open right now
 *   msRemaining— ms until the window OPENS (when locked) or CLOSES (when open)
 *   label      — human line, e.g. "locked 4h 12m" / "open 48m"
 */
function abyssWindow(t = Date.now()) {
    const inCycle = (((t - T0) % ABYSS_CYCLE_MS) + ABYSS_CYCLE_MS) % ABYSS_CYCLE_MS;
    const open = inCycle >= ABYSS_LOCKED_MS;
    let msRemaining;
    if (open) msRemaining = ABYSS_CYCLE_MS - inCycle;       // until it closes
    else msRemaining = ABYSS_LOCKED_MS - inCycle;           // until it opens
    return {
        open,
        phaseInCycle: inCycle / ABYSS_CYCLE_MS,
        msRemaining,
        label: _fmtSpan(msRemaining, open),
    };
}

function _fmtSpan(ms, open) {
    const totalMin = Math.max(0, Math.ceil(ms / MS_MIN));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (open) return h > 0 ? `open ${h}h ${m}m` : `open ${m}m`;
    return h > 0 ? `locked ${h}h ${m}m` : `locked ${m}m`;
}

// ─── CLOCK 4: TRIUNE ALIGNMENT (checked STATE, flaggable window) ────────────
// TRIUNE_ALIGNED(t) = FW at its Abyss-linking bottom AND the Afterlife near
// its alignment point AND (the Abyss is always beneath — it does not orbit).
// This is the WEEKLY-grade coincidence (~1 per ~7 real days), and must never
// be conflated with the routine 5-hour FW bottom-link.

/** The triune state right now (pure function of wall time). */
function isTriuneAligned(t = Date.now()) {
    return fwAtBottom(t) && alAtAlignment(t);
}

/**
 * Flaggable window: if aligned now, compute the contiguous window bounds by
 * scanning at 1-minute resolution (bounded scan, cheap, on-demand only).
 * @returns {{aligned: boolean, start: number|null, end: number|null,
 *            minutesLeft: number}}
 */
function triuneWindow(t = Date.now()) {
    if (!isTriuneAligned(t)) {
        return { aligned: false, start: null, end: null, minutesLeft: 0 };
    }
    const STEP = MS_MIN;
    const MAX_SCAN = 12 * MS_HOUR; // far beyond the true window (<= ~36 min)
    let start = t;
    let end = t;
    while (start - STEP > 0 && t - start < MAX_SCAN && isTriuneAligned(start - STEP)) start -= STEP;
    while (t - end < MAX_SCAN && isTriuneAligned(end + STEP)) end += STEP;
    return {
        aligned: true,
        start,
        end,
        minutesLeft: Math.max(1, Math.round((end - t) / MS_MIN)),
    };
}

// ─── GEOMETRY (rendering invariants — shared with the renderer) ─────────────
// r_FirstWorld == R_WorldBeyond / 2, internally tangent: the FW center rides
// at distance (R - r) == R/2 from the WB center. One side of the FW touches
// the WB's exact center, the opposite side touches its outer circumference.
const FW_TO_WB_RADIUS_RATIO = 0.5;

/** First World center offset from the World Beyond center at time t.
 *  Phase 0 = anchor top position; clockwise in screen space. */
function fwCenterOffset(t = Date.now(), R = 1) {
    const th = fwPhase(t) * Math.PI * 2;            // 0..2π, clockwise
    const d = R * (1 - FW_TO_WB_RADIUS_RATIO);      // R/2 from WB center
    // Screen coords: phase 0 → up (−y); increasing phase → clockwise.
    return { dx: Math.sin(th) * d, dy: -Math.cos(th) * d, theta: th };
}

/** Movement indicator position: a marker rides clockwise THROUGH the First
 *  World and reaches the FW's bottom (Abyss-linking) position exactly as the
 *  orbit completes (phase 1). Ride = half a clockwise turn: top -> right ->
 *  bottom (matches the owner's render). One interpolated coordinate — no
 *  extra state. Screen space (+y down). */
function movementIndicator(t = Date.now(), fwR = 1, fwCx = 0, fwCy = 0) {
    const p = fwPhase(t);
    const ang = (3 * Math.PI / 2) + p * Math.PI;    // top -> right -> bottom
    const rad = fwR * 0.55;                          // rides inside the FW disk
    return { x: fwCx + Math.cos(ang) * rad, y: fwCy + Math.sin(ang) * rad, phase: p };
}

/** True while the routine 5-hour FW ↔ Abyss link is engaged (distinct from
 *  the weekly triune alignment — never merge the two). */
function isRoutineLink(t = Date.now()) {
    return fwAtBottom(t);
}

// ─── STATUS TEXT (used by .j world sheets and .j abyss entry gate) ───────────

/** One-line live orbital status block for the map sheets. */
function statusLines(t = Date.now()) {
    const w = abyssWindow(t);
    const fw = fwPhase(t);
    const al = alPhase(t);
    const tri = triuneWindow(t);
    const lines = [];
    lines.push(`the First World: ${(fw * 100).toFixed(0)}% through its crossing (one orbit = 5 hours = 5 days under its sky)`);
    lines.push(`the abyss gate: ${w.label}`);
    lines.push(`the afterlife: ${(al * 100).toFixed(0)}% through its own circuit (~2 days)`);
    lines.push(tri.aligned
        ? `the three are aligned NOW — window closes in ~${tri.minutesLeft} min`
        : 'the three are not aligned (the alignment is read, not scheduled)');
    return lines;
}

/** Compact status for the abyss entry gate refusal / help text. */
function abyssGateLine(t = Date.now()) {
    return `the abyss gate is ${abyssWindow(t).label}`;
}

module.exports = {
    // periods + anchors
    T0,
    FW_PERIOD_MS,
    ABYSS_CYCLE_MS,
    ABYSS_LOCKED_MS,
    AL_PERIOD_MS,
    FW_TO_WB_RADIUS_RATIO,
    // clock 1
    fwPhase,
    fwAtBottom,
    // clock 2
    abyssWindow,
    abyssGateLine,
    // clock 3
    alPhase,
    alAtAlignment,
    // clock 4
    isTriuneAligned,
    triuneWindow,
    // geometry helpers
    fwCenterOffset,
    movementIndicator,
    isRoutineLink,
    // presentation
    statusLines,
};
