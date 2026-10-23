'use strict';
// ===========================================================================
// emojiBitmap.js - COLOR emoji for node-canvas via CBDT bitmap extraction
// ===========================================================================
// WHY: canvas 3.2.3 on the render boxes cannot draw colored emoji from any
// font: probe proved (a) registerFont is bypassed for emoji
// glyph resolution (bogus family renders pixel-identical), and (b) CBDT
// color bitmaps come out as alpha-mask silhouettes tinted by fillStyle.
// Fonts can never produce color here. OWNER "Use colors not
// hex code cus who tf knows hex codes dude?" - so we ship the color font
// and paint its per-emoji PNG strikes with ctx.drawImage instead.
// Binary layout (validated byte-for-byte against fonttools ground truth):
// IndexSubTable header (8B): u16 indexFormat, u16 imageFormat,
// u32 imageDataOffset
// glyph record start = CBDT_table_offset + imageDataOffset + offsetArray[gid-first]
// imageFormat 17 record: [height][width][BearingX][BearingY][Advance]
// [u32 dataLen][PNG bytes] (NO per-glyph format byte)
// imageFormat 18: bigGlyphMetrics (8B) + u32 len + PNG
// imageFormat 19: u32 len + PNG
// Strike metrics (CBLC BitmapSize, 48B): ascender @+16, ppemX/ppemY @+44/+45.
// LIMITATIONS (accepted): ZWJ sequences / skin tones / flags draw as
// adjacent component bitmaps (no GSUB shaping) - visually the same
// behaviour the mono font path gives today. Glyphs missing from CBDT
// (non-emoji like U+26ED) return nothing and the caller falls back to
// the mono/system path or a text glyph.
// ===========================================================================
const fs = require('fs');

const STATE = {
    parsed: false, ok: false, err: null,
    cmap: new Map(),        // codepoint -> gid
    buf: null, cbdtOff: 0,
    strike: null,           // {ppemX, ppemY, ascender, descender, subs:[]}
    pngCache: new Map()     // gid -> {buf, w, h, bearingX, bearingY, advance, _img} | null
};

function u16(b, o) { return b.readUInt16BE(o); }
function u32(b, o) { return b.readUInt32BE(o); }
function i8(b, o) { return b.readInt8(o); }

function parseSFNT(buf) {
    const numTables = u16(buf, 4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
        const o = 12 + i * 16;
        tables[buf.toString('latin1', o, o + 4)] = { off: u32(buf, o + 8), len: u32(buf, o + 12) };
    }
    return tables;
}

function parseCmap(buf, off) {
    const n = u16(buf, off + 2);
    let sub12 = null, sub4 = null;
    for (let i = 0; i < n; i++) {
        const r = off + 4 + i * 8;
        const pid = u16(buf, r), eid = u16(buf, r + 2), s = off + u32(buf, r + 4);
        const fmt = u16(buf, s);
        if (fmt === 12 && sub12 == null && (pid === 0 || (pid === 3 && eid === 10))) sub12 = s;
        if (fmt === 4 && sub4 == null && (pid === 0 || (pid === 3 && eid === 1))) sub4 = s;
    }
    const map = new Map();
    if (sub12 != null) {
        const nGroups = u32(buf, sub12 + 12);
        for (let g = 0; g < nGroups; g++) {
            const go = sub12 + 16 + g * 12;
            const start = u32(buf, go), end = u32(buf, go + 4), sg = u32(buf, go + 8);
            if (end >= start && end - start < 20000) {
                for (let c = start; c <= end; c++) if (!map.has(c)) map.set(c, sg + (c - start));
            } else if (end >= start) {
                for (let c = start, k = 0; c <= end && k < 20000; c++, k++) if (!map.has(c)) map.set(c, sg + (c - start));
            }
        }
    }
    if (!map.size && sub4 != null) {
        const segX2 = u16(buf, sub4 + 6);
        for (let s = 0; s < segX2 / 2; s++) {
            const end = u16(buf, sub4 + 14 + s * 2);
            const start = u16(buf, sub4 + 16 + segX2 + s * 2);
            const delta = u16(buf, sub4 + 16 + segX2 * 2 + s * 2) | 0;
            const rangeOff = u16(buf, sub4 + 16 + segX2 * 3 + s * 2);
            for (let c = start; c <= end && c !== 0xFFFF; c++) {
                let gid;
                if (rangeOff === 0) gid = (c + delta) & 0xFFFF;
                else {
                    const gi = sub4 + 16 + segX2 * 3 + s * 2 + rangeOff + (c - start) * 2;
                    gid = u16(buf, gi) === 0 ? 0 : (u16(buf, gi) + delta) & 0xFFFF;
                }
                if (gid) map.set(c, gid);
            }
        }
    }
    return map;
}

function parseCblc(buf, off) {
    const numSizes = u32(buf, off + 4);
    let best = null;
    let p = off + 8;
    for (let s = 0; s < numSizes; s++, p += 48) {
        const arrayOff = u32(buf, p), arrayLen = u32(buf, p + 4), numSub = u32(buf, p + 8);
        const ascender = i8(buf, p + 16), descender = i8(buf, p + 17);
        const ppemX = buf[p + 44], ppemY = buf[p + 45];
        const subs = [];
        for (let i = 0; i < numSub; i++) {
            const q = off + arrayOff + i * 8;
            const first = u16(buf, q), last = u16(buf, q + 2);
            const st = off + arrayOff + u32(buf, q + 4);   // absolute (in file space)
            const indexFormat = u16(buf, st), imageFormat = u16(buf, st + 2);
            const imageDataOffset = u32(buf, st + 4);
            const sub = { first, last, indexFormat, imageFormat, imageDataOffset, _abs: st };
            if (indexFormat === 1 || indexFormat === 3) {
                const n = last - first + 2;
                sub.offsets = [];
                const width = indexFormat === 1 ? 4 : 2;
                const read = indexFormat === 1 ? u32 : u16;
                for (let k = 0; k < n; k++) sub.offsets.push(read(buf, st + 8 + k * width));
            } else if (indexFormat === 2) {
                sub.imageSize = u32(buf, st + 8);
                sub.bigMetrics = readBigMetrics(buf, st + 12);
            } else if (indexFormat === 5) {
                sub.imageSize = u32(buf, st + 8);
                sub.bigMetrics = readBigMetrics(buf, st + 12);
                sub.gids = [];
                const arrLen = u16(buf, st + 2);
                for (let k = 0; k < arrLen / 2; k++) sub.gids.push(u16(buf, st + 16 + k * 2));
            }
            subs.push(sub);
        }
        if (!best || ppemX > best.ppemX) best = { ppemX, ppemY, ascender, descender, subs };
    }
    return best;
}

function readBigMetrics(buf, o) {
    return { height: buf[o], width: buf[o + 1], bearingX: i8(buf, o + 2), bearingY: i8(buf, o + 3), advance: buf[o + 4] };
}

// Extract a glyph's PNG blob + placement metrics. null if absent/unsupported.
function glyphBitmap(gid) {
    if (STATE.pngCache.has(gid)) return STATE.pngCache.get(gid);
    let out = null;
    const S = STATE.strike;
    if (S && STATE.buf) {
        for (const sub of S.subs) {
            if (gid < sub.first || gid > sub.last) continue;
            try {
                const cbdt = STATE.cbdtOff;
                if (sub.indexFormat === 1 || sub.indexFormat === 3) {
                    const idx = gid - sub.first;
                    const start = sub.offsets[idx], end = sub.offsets[idx + 1];
                    if (end > start) out = decodeGlyphData(sub.imageFormat, STATE.buf, cbdt + sub.imageDataOffset + start, end - start);
                } else if (sub.indexFormat === 2) {
                    out = decodeGlyphData(sub.imageFormat, STATE.buf, cbdt + sub.imageDataOffset + (gid - sub.first) * sub.imageSize, sub.imageSize, sub.bigMetrics);
                } else if (sub.indexFormat === 5) {
                    const pos = sub.gids.indexOf(gid);
                    if (pos >= 0) out = decodeGlyphData(sub.imageFormat, STATE.buf, cbdt + sub.imageDataOffset + pos * sub.imageSize, sub.imageSize, sub.bigMetrics);
                }
            } catch (_) { out = null; }
            break;
        }
    }
    if (out) out.gid = gid;
    STATE.pngCache.set(gid, out);
    return out;
}

// imageFormat carries the record layout (NO per-glyph format byte - validated
// against fonttools: metrics begin at the record start).
function decodeGlyphData(imageFormat, buf, o, len, bigMetrics) {
    if (len <= 8 || o + 8 > buf.length) return null;
    if (imageFormat === 17) {
        const m = { height: buf[o], width: buf[o + 1], bearingX: i8(buf, o + 2), bearingY: i8(buf, o + 3), advance: buf[o + 4] };
        const dlen = u32(buf, o + 5);
        const png = pngSlice(buf, o + 9, Math.min(dlen, len - 9));
        return png ? { buf: png, m } : null;
    }
    if (imageFormat === 18) {
        const m = readBigMetrics(buf, o);
        const dlen = u32(buf, o + 8);
        const png = pngSlice(buf, o + 12, Math.min(dlen, len - 12));
        return png ? { buf: png, m } : null;
    }
    if (imageFormat === 19) {
        const dlen = u32(buf, o);
        const png = pngSlice(buf, o + 4, Math.min(dlen, len - 4));
        return png ? { buf: png, m: bigMetrics || null } : null;
    }
    return null; // raw-bitmap formats (1/2/…) unsupported - mono fallback covers
}

function pngSlice(buf, o, len) {
    if (o < 0 || o + 8 > buf.length || buf[o] !== 0x89 || buf[o + 1] !== 0x50) return null;
    const end = buf.indexOf('IEND', o, 'latin1');
    if (end < 0) return null;
    return buf.slice(o, end + 8);
}

function init(fontPath) {
    if (STATE.parsed) return STATE.ok;
    STATE.parsed = true;
    try {
        const head = fs.readFileSync(fontPath).slice(0, 4);
        const real = head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || head.toString('latin1') === 'OTTO';
        if (!real) throw new Error('color emoji font missing or LFS-stubbed');
        const buf = fs.readFileSync(fontPath);
        const tables = parseSFNT(buf);
        if (!tables.cmap || !tables.CBDT || !tables.CBLC) throw new Error('font lacks cmap/CBDT/CBLC tables');
        STATE.cmap = parseCmap(buf, tables.cmap.off);
        STATE.strike = parseCblc(buf, tables.CBLC.off);
        STATE.buf = buf;
        STATE.cbdtOff = tables.CBDT.off;
        STATE.ok = !!(STATE.cmap.size > 0 && STATE.strike && STATE.strike.ppemX > 0);
        if (!STATE.ok) throw new Error('cmap/strike parse produced nothing usable');
    } catch (e) {
        STATE.ok = false; STATE.err = e.message;
        try { console.error('[emojiBitmap] init failed:', e.message); } catch (_) {}
    }
    return STATE.ok;
}

// ---- public API ------------------------------------------------------------

function ready(fontPath) { return init(fontPath); }

// Split a string into [run, isEmoji] runs. A run is emoji if ANY char is a
// codepoint present in the color font's cmap (plus VS16/ZWJ/keycap glue).
// cmap also maps ASCII whitespace (0x20!) - NotoColorEmoji ships blank
// glyphs for them - so only codepoints ≥ U+2000 count as emoji candidates,
// otherwise " Pyro" glues the space into the emoji run and paints a 1.25em
// gap (caught by QA mixed-advance assert).
function splitRuns(str) {
    const s = String(str || '');
    const runs = [];
    let cur = '', curE = null;
    const GLUE = new Set(['\uFE0F', '\u200D', '\u20E3', '\uFE0E']);
    const isEmojiChar = (c) => {
        const cp = c.codePointAt(0);
        return GLUE.has(c) || (cp >= 0x2000 && STATE.cmap.has(cp));
    };
    for (const ch of s) {
        const e = isEmojiChar(ch);
        if (curE === null || e === curE) { cur += ch; curE = e; }
        else { runs.push([cur, curE]); cur = ch; curE = e; }
    }
    if (cur) runs.push([cur, curE]);
    return runs;
}

// Codepoints of an emoji run → glyph ids (VS/ZWJ glue skipped; components map
// individually - no GSUB shaping, same visual result as today's mono path).
function seqToGids(run) {
    const gids = [];
    for (const c of run) {
        const cp = c.codePointAt(0);
        if (cp === 0xFE0F || cp === 0x200D || cp === 0xFE0E || cp === 0x20E3) continue;
        const gid = STATE.cmap.get(cp);
        if (gid) gids.push(gid);
    }
    return gids;
}

const DEFAULT_ADV = 1.245; // em advance when a glyph lacks metrics (matches mono font)

// Total advance (px) of an emoji run at font-size px.
function measure(run, px) {
    if (!STATE.ok || !run) return 0;
    const S = STATE.strike, s = px / S.ppemX;
    const gids = seqToGids(run);
    if (!gids.length) return 0;
    let total = 0;
    for (const gid of gids) {
        const g = glyphBitmap(gid);
        total += g && g.m && g.m.advance ? g.m.advance * s : px * DEFAULT_ADV;
    }
    return total;
}

// Draw an emoji run with its LEFT EDGE at x (text semantics for both axes).
// Baseline handling reads ctx.textBaseline:
// alphabetic (default) → glyph top at y - bearingY*s (exact font metrics:
// bearingY=ascender=101, bitmap 128 tall → 27px hang below baseline,
// matching the strike's descender of -27)
// middle → bitmap bbox centered on y (matches how fillText centers the em box)
// top → bitmap top at y; bottom → bitmap bottom at y
// Native colors - fillStyle deliberately ignored. Returns total advance.
// ImageCtor: node-canvas Image (buffer src decodes synchronously).
function draw(ctx, run, x, y, px, ImageCtor) {
    if (!STATE.ok || !run) return 0;
    const S = STATE.strike, s = px / S.ppemX;
    let cx = x;
    const gids = seqToGids(run);
    if (!gids.length) return 0;
    const baseline = ctx.textBaseline || 'alphabetic';
    for (const gid of gids) {
        const g = glyphBitmap(gid);
        if (g && g.buf) {
            try {
                if (!g._img) { const img = new ImageCtor(); img.src = g.buf; g._img = img; }
                const w = (g.m ? g.m.width : S.ppemX) * s;
                const h = (g.m ? g.m.height : S.ppemX) * s;
                const bx = (g.m ? g.m.bearingX : 0) * s;
                const by = (g.m ? g.m.bearingY : S.ascender) * s;
                let top;
                if (baseline === 'middle') top = y - h / 2;
                else if (baseline === 'top') top = y;
                else if (baseline === 'bottom') top = y - h;
                else top = y - by; // alphabetic / hanging
                ctx.drawImage(g._img, cx + bx, top, Math.max(1, w), Math.max(1, h));
            } catch (_) { /* fall through: advance keeps line rhythm */ }
            cx += (g.m && g.m.advance ? g.m.advance : S.ppemX * DEFAULT_ADV) * s;
        } else {
            cx += px * DEFAULT_ADV;
        }
    }
    return cx - x;
}

function stats() {
    return { ok: STATE.ok, err: STATE.err, cmap: STATE.cmap.size,
        ppem: STATE.strike ? STATE.strike.ppemX : 0,
        ascender: STATE.strike ? STATE.strike.ascender : 0,
        cached: STATE.pngCache.size };
}

module.exports = { ready, splitRuns, seqToGids, measure, draw, stats, glyphBitmap, _state: STATE };
