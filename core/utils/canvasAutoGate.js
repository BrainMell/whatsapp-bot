// ============================================
// CANVAS AUTO-GATE (2026-10-08) — the "new render code automatically follows
// the owner's queue rule" layer.
// ============================================
// Owner directive 2026-10-07 (Mellow): "can you do it in such a way that even
// if new render code is added it automatically follows this rule?"
//
// HOW: Node caches modules, so there is exactly ONE shared 'canvas' module
// object per process. install() patches it ONCE at boot:
//   - createCanvas        -> memory brake + live-surface tracking (renderQueue)
//   - Canvas#toBuffer     -> sync form: observed (the event loop serializes
//                            sync encodes by definition — API untouched);
//                            async callback form: routed through the queue
//   - Canvas#toDataURL    -> same treatment as toBuffer
// Because the patch lives on the SHARED module exports, every
// `require('canvas')` anywhere — top-level destructured imports included —
// gets the gated versions. A renderer written tomorrow by any dev/agent
// complies with ZERO extra code: worst case it hits the memory brake and
// the caller's existing try/catch degrades to a text reply.
//
// SCOPE NOTES:
//   - loadImage / registerFont don't allocate surfaces -> untouched.
//   - sharp (sharpChild) is a separate, already-isolated worker pipeline.
//   - GW map/room renders fork into child workers: renderWorker.js installs
//     this too, so children obey the same brake/tracking on their own
//     allocations (child memory still comes out of the same 952MB box).
//
// MUST be installed BEFORE any renderer module is first required (index.js
// does it right after dotenv, before core/engine). Idempotent: installing
// twice is a no-op.
// ============================================
'use strict';

function install() {
    let canvasMod;
    try {
        canvasMod = require('canvas');
    } catch (e) {
        console.log('[CanvasGate] canvas module not available — nothing to gate');
        return false;
    }
    if (canvasMod.__renderQGated) return true; // idempotent

    const rq = require('./renderQueue');

    // ── 1) createCanvas: the universal allocation gate ──────────────────
    const origCreate = canvasMod.createCanvas;
    if (typeof origCreate === 'function') {
        const gatedCreate = function createCanvas(w, h, ...rest) {
            rq.assertCanAllocate(w, h);
            const c = origCreate.call(this, w, h, ...rest);
            try { rq.trackSurface(w, h, c); } catch (e) { /* never break a render on telemetry */ }
            return c;
        };
        try { Object.defineProperty(gatedCreate, 'name', { value: 'createCanvas' }); } catch (e) {}
        canvasMod.createCanvas = gatedCreate;
    }

    // ── 2) encode phase (toBuffer / toDataURL) ──────────────────────────
    const proto = canvasMod.Canvas && canvasMod.Canvas.prototype;
    if (proto) {
        const wrapEncode = (methodName) => {
            const orig = proto[methodName];
            if (typeof orig !== 'function') return;
            proto[methodName] = function (...args) {
                if (typeof args[0] !== 'function') {
                    // SYNC form — the only form this codebase uses today
                    // (`canvas.toBuffer('image/png')`). It cannot await a
                    // queue slot without breaking the API, and it BLOCKS the
                    // event loop for its whole duration, which serializes
                    // sync encodes natively. So: observe only. The memory
                    // brake already ran at createCanvas.
                    const t0 = Date.now();
                    const out = orig.apply(this, args);
                    try { rq.noteSyncEncode(Date.now() - t0, out && out.length); } catch (e) {}
                    return out;
                }
                // ASYNC callback form — full queue treatment (slot + timeout
                // + memory gate). Native returns undefined and delivers via
                // the callback only; we match both (no new unhandled
                // rejections for callers that ignore the return value).
                const cb = args[0];
                const rest = args.slice(1);
                rq.run(`canvas.${methodName}`, () => new Promise((res, rej) => {
                    orig.call(this, (err, out) => (err ? rej(err) : res(out)), ...rest);
                })).then(
                    (out) => cb(null, out),
                    (err) => cb(err)
                );
            };
        };
        wrapEncode('toBuffer');
        wrapEncode('toDataURL');
    }

    canvasMod.__renderQGated = true;
    console.log('[CanvasGate] canvas module gated — all createCanvas/toBuffer/toDataURL flow through renderQueue');
    return true;
}

module.exports = { install };
