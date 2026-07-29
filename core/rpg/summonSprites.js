// ============================================
// 🎨 SUMMON SPRITE CACHE — lazy Digimon fetcher
// ============================================
// Fetches Digimon sprites from digi-api.com on first use,
// removes white backgrounds, caches transparent PNGs locally.
// Subsequent requests use the cached file (instant).
//
// Falls back to existing SpriteAssets (Retromon, SD summons)
// if the Digimon API is unavailable.

const https = require('https');
const fs = require('fs');
const path = require('path');
const { Jimp } = require('/home/z/my-project/repos/whatsapp-bot/node_modules/jimp');

const CACHE_DIR = path.join(__dirname, '..', 'rpgasset', 'summons', 'digimon');
const FALLBACK_DIR = path.join(__dirname, '..', 'rpgasset', 'summons');
const RETROMON_DIR = path.join(__dirname, '..', 'rpgasset', 'summons', 'retromon');
const IMG_BASE = 'https://digi-api.com/images/digimon/w';

// Ensure cache directory exists
fs.mkdirSync(CACHE_DIR, { recursive: true });

// In-memory cache of loaded images (for node-canvas)
const imageCache = new Map();

/**
 * Get the local file path for a summon sprite.
 * Checks: Digimon cache → Retromon → SD summons → fallback.
 *
 * @param {string} species - Summon species ID (e.g. 'agumon', 'flame_elemental')
 * @returns {string|null} - File path to the sprite, or null if not found
 */
function getSpritePath(species) {
  if (!species) return null;
  const safeName = species.toLowerCase().replace(/[^a-z0-9]/g, '_');

  // 1. Check Digimon cache
  const digimonPath = path.join(CACHE_DIR, `${safeName}.png`);
  if (fs.existsSync(digimonPath)) return digimonPath;

  // 2. Check Retromon folder
  const retromonPath = path.join(RETROMON_DIR, `${safeName}.png`);
  if (fs.existsSync(retromonPath)) return retromonPath;

  // 3. Check SD summons folder
  const sdPath = path.join(FALLBACK_DIR, `${safeName}.png`);
  if (fs.existsSync(sdPath)) return sdPath;

  // 4. Try Retromon by index (if species is numeric)
  if (/^\d+$/.test(safeName)) {
    const retromonFiles = fs.existsSync(RETROMON_DIR) ? fs.readdirSync(RETROMON_DIR) : [];
    if (retromonFiles.length > 0) {
      const idx = parseInt(safeName) % retromonFiles.length;
      return path.join(RETROMON_DIR, retromonFiles[idx]);
    }
  }

  return null;
}

/**
 * Fetch a Digimon sprite from the API and cache it locally.
 * Only called on cache miss — subsequent calls use the cached file.
 *
 * @param {string} digimonName - Digimon name (e.g. 'Agumon')
 * @returns {Promise<string|null>} - Path to the cached file, or null on failure
 */
async function fetchAndCache(digimonName) {
  if (!digimonName) return null;
  const safeName = digimonName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const outPath = path.join(CACHE_DIR, `${safeName}.png`);

  // Already cached
  if (fs.existsSync(outPath)) return outPath;

  try {
    const imageUrl = `${IMG_BASE}/${encodeURIComponent(digimonName)}.png`;
    const imageBuffer = await downloadImage(imageUrl);
    const processedBuffer = await removeWhiteBackground(imageBuffer);
    fs.writeFileSync(outPath, processedBuffer);
    console.log(`[SummonSprites] Cached: ${digimonName} → ${safeName}.png`);
    return outPath;
  } catch (e) {
    console.error(`[SummonSprites] Failed to fetch ${digimonName}:`, e.message);
    return null;
  }
}

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function removeWhiteBackground(imageBuffer) {
  const image = await Jimp.read(imageBuffer);
  const { width, height } = image.bitmap;

  // Direct pixel manipulation on the bitmap data (Jimp v1 compatible)
  const data = image.bitmap.data; // Uint8ClampedArray [R,G,B,A, R,G,B,A, ...]
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 240 && g > 240 && b > 240) {
      // Near-white → fully transparent
      data[i + 3] = 0; // Set alpha to 0
    } else if (r > 220 && g > 220 && b > 220) {
      // Edge anti-aliasing → partial transparency
      const alpha = Math.floor(((255 - r) + (255 - g) + (255 - b)) / 3 * 2.55);
      data[i + 3] = alpha;
    }
  }

  // Jimp v1: getBuffer with MIME string
  return await image.getBuffer('image/png');
}

/**
 * Get a sprite path, fetching from API if needed.
 * @param {string} species - Species name
 * @param {string} digimonName - Optional: the Digimon name to fetch from API
 * @returns {Promise<string|null>}
 */
async function getOrFetchSprite(species, digimonName) {
  // Check local first
  const local = getSpritePath(species);
  if (local) return local;

  // Try fetching from API
  if (digimonName) {
    const fetched = await fetchAndCache(digimonName);
    if (fetched) return fetched;
  }

  // Return null — caller should use a fallback
  return null;
}

module.exports = {
  getSpritePath,
  fetchAndCache,
  getOrFetchSprite,
  CACHE_DIR,
  imageCache
};
