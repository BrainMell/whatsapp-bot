// ============================================
// 🎞️ GIF89a ENCODER — pure JS, zero deps
// ============================================
// Encodes RGBA pixel buffers into a looping animated GIF for WhatsApp
// (sent as { image, gifPlayback: true } — the card-system-proven path).
//
// Why hand-rolled: the abyss floor-descent card needs a small, crisp,
// palette-true animation; npm gif encoders would add a dependency that
// every box must npm-install manually. This module is ~200 lines, runs
// inside the renderQueue's sync budget for card-sized frames, and keeps
// pixel art EXACT: flat-color frames quantize to <=255 colors losslessly.
//
// Contract:
//   encodeGif({ width, height, frames: [Buffer RGBA w*h*4], delayMs, loop })
//     → Buffer (GIF89a) | null on any failure (callers fall back to PNG)
//   palette-true when total unique colors <= 255, else nearest-match (no dither)
// ============================================

// ── LZW (GIF variant) ─────────────────────────────────────────────────────
// GIF packs codes LSB-first into sub-blocks of <=255 bytes.
function lzwEncode(indexPixels, minCodeSize) {
    const clearCode = 1 << minCodeSize;        // 256 for 8-bit
    const eoiCode = clearCode + 1;             // 257
    let codeSize = minCodeSize + 1;            // 9 bits to start
    let nextCode = eoiCode + 1;                // first free slot
    let dict = new Map();                      // "prefix,byte" → code
    const resetDict = () => {
        dict = new Map();
        nextCode = eoiCode + 1;
        codeSize = minCodeSize + 1;
    };

    // bit packing state
    const out = [];
    let cur = 0, curBits = 0;
    const emit = (code) => {
        cur |= code << curBits;
        curBits += codeSize;
        while (curBits >= 8) {
            out.push(cur & 0xFF);
            cur >>= 8;
            curBits -= 8;
        }
    };

    resetDict();
    emit(clearCode);

    let prefixKey = indexPixels[0];
    // dictionary key: (prefixCode << 8) | byte  — prefixCode < 4096, byte < 256
    // BUT the root symbols ARE byte values, so seed prefix as raw byte value.
    for (let i = 1; i < indexPixels.length; i++) {
        const b = indexPixels[i];
        const key = (prefixKey << 8) | b;
        if (dict.has(key)) {
            prefixKey = dict.get(key);
        } else {
            emit(prefixKey);
            if (nextCode < 4096) {
                dict.set(key, nextCode++);
                // GIF grows code size when nextCode exceeds current capacity
                if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
            } else {
                emit(clearCode);
                resetDict();
            }
            prefixKey = b;
        }
    }
    emit(prefixKey);
    emit(eoiCode);
    if (curBits > 0) out.push(cur & 0xFF);
    return out;
}

// ── palette building: exact for <=255 unique colors, else top-255 + nearest ─
function buildPalette(frames) {
    const counts = new Map(); // rgb int → freq
    for (const f of frames) {
        for (let i = 0; i < f.length; i += 4) {
            if (f[i + 3] < 128) continue;         // transparent-ish → bg later
            const key = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
            counts.set(key, (counts.get(key) || 0) + 1);
        }
    }
    const colors = [...counts.keys()];
    let palette;
    if (colors.length <= 255) {
        palette = colors;
    } else {
        palette = colors
            .sort((a, b) => counts.get(b) - counts.get(a))
            .slice(0, 255);
    }
    const index = new Map();
    palette.forEach((c, i) => index.set(c, i));
    // nearest match table for the leftover colors (pixel art: usually zero)
    if (colors.length > 255) {
        for (const c of colors) {
            if (index.has(c)) continue;
            const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
            let best = 0, bestD = Infinity;
            for (let i = 0; i < palette.length; i++) {
                const p = palette[i];
                const d = ((r - ((p >> 16) & 255)) ** 2) + ((g - ((p >> 8) & 255)) ** 2) + ((b - (p & 255)) ** 2);
                if (d < bestD) { bestD = d; best = i; }
            }
            index.set(c, best);
        }
    }
    // pad GCT to power of two
    let gctSize = 2;
    while (gctSize < palette.length) gctSize <<= 1;
    if (gctSize < 2) gctSize = 2;
    return { palette, index, gctSize };
}

// ── the encoder ─────────────────────────────────────────────────────────────
function encodeGif({ width, height, frames, delayMs = 120, loop = 0 }) {
    try {
        if (!width || !height || !Array.isArray(frames) || !frames.length) return null;
        for (const f of frames) {
            if (!Buffer.isBuffer(f) || f.length !== width * height * 4) return null;
        }
        const { palette, index, gctSize } = buildPalette(frames);
        if (!palette.length) return null;

        const buf = [];
        const push = (...b) => buf.push(...b);
        const u16 = (v) => buf.push(v & 0xFF, (v >> 8) & 0xFF);

        // header + LSD (global color table flag 0xF0 | gctSize bits)
        push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);   // GIF89a
        u16(width); u16(height);
        const gctBits = Math.max(1, Math.log2(gctSize) | 0);
        push(0x80 | (gctBits - 1), 0, 0);
        // GCT bytes (index 0 = black bg used for transparent-ish pixels)
        const colorAt = (i) => (i < palette.length ? palette[i] : 0);
        for (let i = 0; i < gctSize; i++) {
            const c = colorAt(i);
            push((c >> 16) & 255, (c >> 8) & 255, c & 255);
        }
        // NETSCAPE2.0 loop extension
        push(0x21, 0xFF, 0x0B);
        for (const ch of 'NETSCAPE2.0') push(ch.charCodeAt(0));
        push(0x03, 0x01); u16(loop); push(0x00);

        const delayCs = Math.max(2, Math.round(delayMs / 10)); // 1/100s units
        const minCodeSize = 8;
        for (const f of frames) {
            // Graphic Control Extension: disposal 1 (do not dispose), no transparency
            push(0x21, 0xF9, 0x04, 0x04); u16(delayCs); push(0x00, 0x00);
            // Image Descriptor
            push(0x2C); u16(0); u16(0); u16(width); u16(height); push(0x00);
            push(minCodeSize);
            // index stream
            const idx = Buffer.allocUnsafe(width * height);
            for (let i = 0, p = 0; p < idx.length; i += 4, p++) {
                if (f[i + 3] < 128) { idx[p] = 0; continue; }
                const key = (f[i] << 16) | (f[i + 1] << 8) | f[i + 2];
                idx[p] = index.get(key) || 0;
            }
            const lzw = lzwEncode(idx, minCodeSize);
            // sub-blocks of <=255 bytes
            for (let i = 0; i < lzw.length; i += 255) {
                const chunk = lzw.slice(i, i + 255);
                push(chunk.length); buf.push(...chunk);
            }
            push(0x00);
        }
        push(0x3B); // trailer
        return Buffer.from(buf);
    } catch (e) {
        return null;
    }
}

// GIF87a/89a magic probe — send sites use this to pick gifPlayback
function isGifBuffer(b) {
    return Buffer.isBuffer(b) && b.length > 6
        && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46   // 'GIF'
        && (b[3] === 0x38);                                   // '8'
}

module.exports = { encodeGif, isGifBuffer };
