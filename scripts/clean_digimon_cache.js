// 🧼 One-time digimon-cache halo scrub (boxes + fresh clones).
// Re-processes every cached sprite's ALREADY-TRANSPARENT border region with
// the border-flood-fill white removal — no network, no re-fetch: it walks the
// existing PNG pixels, pushing near-white border-connected pixels to
// transparent, healing the 1px halos the old threshold-only pass left.
// Run: node scripts/clean_digimon_cache.js [cacheDir]
const path = require('path');
const fs = require('fs');

async function main() {
    const JimpMod = require('jimp');
    const Jimp = JimpMod.Jimp || JimpMod;
    const CACHE = process.argv[2]
        || path.join(__dirname, '..', 'core', 'rpgasset', 'summons', 'digimon');
    const files = fs.readdirSync(CACHE).filter((f) => f.toLowerCase().endsWith('.png'));
    let cleaned = 0, skipped = 0, failed = 0;
    for (const f of files) {
        const p = path.join(CACHE, f);
        try {
            const image = await Jimp.read(p);
            const { width, height, data } = image.bitmap;
            const isNearWhite = (i) => data[i + 3] === 0 || (data[i] > 228 && data[i + 1] > 228 && data[i + 2] > 228);
            const visited = new Uint8Array(width * height);
            const queue = [];
            const pushIf = (x, y) => {
                if (x < 0 || y < 0 || x >= width || y >= height) return;
                const q = y * width + x;
                if (visited[q] || !isNearWhite(q * 4)) return;
                visited[q] = 1; queue.push(q);
            };
            for (let x = 0; x < width; x++) { pushIf(x, 0); pushIf(x, height - 1); }
            for (let y = 0; y < height; y++) { pushIf(0, y); pushIf(width - 1, y); }
            let touched = 0;
            while (queue.length) {
                const q = queue.pop();
                const i = q * 4;
                if (data[i + 3] !== 0) {
                    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
                        data[i + 3] = 0; touched++;
                    } else {
                        const alpha = Math.floor(((255 - data[i]) + (255 - data[i + 1]) + (255 - data[i + 2])) / 3 * 2.55);
                        const na = Math.min(data[i + 3], alpha);
                        if (na !== data[i + 3]) { data[i + 3] = na; touched++; }
                    }
                }
                const x = q % width, y = (q / width) | 0;
                pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1);
            }
            if (touched > 0) {
                await image.writeAsync(p);
                cleaned++;
            } else skipped++;
        } catch (e) {
            failed++;
            console.error('FAIL', f, e.message);
        }
    }
    console.log(`[clean_digimon_cache] ${path.basename(CACHE)}: ${cleaned} cleaned, ${skipped} already clean, ${failed} failed (${files.length} total)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
