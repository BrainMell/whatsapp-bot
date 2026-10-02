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

// ─── CLOCK 4: TRIUNE ALIGNMENT ────────────────────────────────────────────
// 💡 2026-10-02 REDESIGN (owner brief #fec956): the alignment event must
// recur on a RELIABLE ~4-day cadence. The previous epsilon-coincidence
// (FW bottom window ∧ AL window) produced a lumpy bimodal lattice - a 45h
// pair followed by a 195h dry spell inside the 240h LCM (measured) - which
// players experienced as "about two weeks of nothing". The alignment is
// now a DETERMINISTIC window on a fixed cadence anchored at T0: still a
// pure checked state of wall time (restart-stable, zero Mongo, flaggable
// window), still separate from the other three clocks, and the period is
// owner-tunable via TRIUNE_ALIGNMENT_HOURS.
const ALIGNMENT_PERIOD_H = parseFloat(process.env.TRIUNE_ALIGNMENT_HOURS, 10) || 96; // ~4 days (owner #fec956)
const ALIGNMENT_PERIOD_MS  = ALIGNMENT_PERIOD_H * MS_HOUR;
const ALIGNMENT_WINDOW_MS  = 2 * MS_HOUR;   // the three hold aligned for 2h

/** The triune alignment state right now (pure function of wall time). */
function isTriuneAligned(t = Date.now()) {
    const sinceT0 = (((t - T0) % ALIGNMENT_PERIOD_MS) + ALIGNMENT_PERIOD_MS) % ALIGNMENT_PERIOD_MS;
    return sinceT0 < ALIGNMENT_WINDOW_MS;
}

/**
 * Flaggable window with exact bounds (and the next window for scheduling).
 * @returns {{aligned: boolean, start: number|null, end: number|null,
 *            minutesLeft: number, nextStart: number, periodMs: number}}
 */
function triuneWindow(t = Date.now()) {
    const sinceT0 = (((t - T0) % ALIGNMENT_PERIOD_MS) + ALIGNMENT_PERIOD_MS) % ALIGNMENT_PERIOD_MS;
    const start = t - sinceT0;
    const end = start + ALIGNMENT_WINDOW_MS;
    const aligned = sinceT0 < ALIGNMENT_WINDOW_MS;
    return {
        aligned,
        start,
        end,
        minutesLeft: aligned ? Math.max(1, Math.round((end - t) / MS_MIN)) : 0,
        nextStart: start + ALIGNMENT_PERIOD_MS,
        periodMs: ALIGNMENT_PERIOD_MS,
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
    lines.push(`the First World: ${(fw * 100).toFixed(0)}% through its crossing`);
    lines.push(`the abyss gate: ${w.label}`);
    lines.push(`the afterlife: ${(al * 100).toFixed(0)}% through its circuit`);
    lines.push(tri.aligned
        ? `the three are aligned now. window closes in ~${tri.minutesLeft} min`
        : 'the three are not aligned');
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
    // clock 4 (deterministic cadence - owner #fec956)
    ALIGNMENT_PERIOD_MS,
    ALIGNMENT_WINDOW_MS,
    // legacy epsilon constants (compat)
    FW_BOTTOM_EPS,
    AL_ALIGNMENT_EPS,
    AL_ALIGNMENT_POINT,
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
