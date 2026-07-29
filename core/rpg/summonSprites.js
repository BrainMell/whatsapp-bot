// ============================================
// 🎨 UNIFIED SPRITE SYSTEM — single source of truth
// ============================================
// This is the ONE sprite pipeline for the entire RPG.
// Every creature (summon, enemy, boss, companion, collectible)
// resolves its sprite through this module.
//
// Pipeline:
//   Creature Data → getSpritePath()/getOrFetchSprite() → UI Component → Displayed Sprite
//
// Lookup priority:
//   1. Local Digimon cache (rpgasset/summons/digimon/)
//   2. Local Retromon (rpgasset/summons/retromon/) — case-insensitive
//   3. Local SD summons (rpgasset/summons/) — case-insensitive
//   4. Numeric species → retromon rotation
//   5. On-demand fetch from digi-api.com (getOrFetchSprite only)
//
// Case-insensitive matching means "Agumon.png", "agumon.png", "AGUMON.png"
// all resolve correctly — fixes the retromon case-mismatch bug.

const https = require('https');
const fs = require('fs');
const path = require('path');
// Lazy-load Jimp only when needed (prevents crash if not installed)
let _jimp = null;
async function getJimp() {
  if (!_jimp) _jimp = require('jimp');
  return _jimp;
}

const CACHE_DIR = path.join(__dirname, '..', 'rpgasset', 'summons', 'digimon');
const FALLBACK_DIR = path.join(__dirname, '..', 'rpgasset', 'summons');
const RETROMON_DIR = path.join(__dirname, '..', 'rpgasset', 'summons', 'retromon');
const IMG_BASE = 'https://digi-api.com/images/digimon/w';

// Ensure cache directory exists
fs.mkdirSync(CACHE_DIR, { recursive: true });

// In-memory cache of loaded images (for node-canvas)
const imageCache = new Map();

// ─────────────────────────────────────────────
// Case-insensitive directory index (built lazily, cached)
// Fixes the bug where "Atrox.png" wouldn't match species id "atrox"
// ─────────────────────────────────────────────
const _dirIndexes = new Map(); // dir → Map(lowercaseFilename, actualFilename)

function getDirIndex(dir) {
  if (_dirIndexes.has(dir)) return _dirIndexes.get(dir);
  const idx = new Map();
  try {
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        idx.set(f.toLowerCase(), f);
      }
    }
  } catch (e) {}
  _dirIndexes.set(dir, idx);
  return idx;
}

/** Refresh the directory index (call after writing new sprites to cache). */
function refreshDirIndex(dir) {
  _dirIndexes.delete(dir);
  return getDirIndex(dir);
}

/**
 * Case-insensitive file lookup in a directory.
 * @param {string} dir - Absolute directory path
 * @param {string} basename - Filename (e.g. "atrox.png")
 * @returns {string|null} - Full path to actual file, or null
 */
function findCaseInsensitive(dir, basename) {
  const idx = getDirIndex(dir);
  const lower = basename.toLowerCase();
  if (idx.has(lower)) {
    return path.join(dir, idx.get(lower));
  }
  return null;
}

// ─────────────────────────────────────────────
// Species name normalization
// ─────────────────────────────────────────────
// Common typos / spelling drift → canonical species id mapping
const SPECIES_ALIASES = {
  charmordillo: 'charmadillo',  // registry typo (charmordillo) → file (Charmadillo.png)
  charmadillo: 'charmadillo',
};

// ─────────────────────────────────────────────
// Digimon API name overrides
// ─────────────────────────────────────────────
// The digi-api.com uses Japanese names for some Digimon.
// Map species id → exact API name to use when fetching.
// (When fetching, we also try the species name as-is and with spaces removed.)
const DIGIMON_API_NAME_OVERRIDES = {
  // Japanese-name Digimon (English name → Japanese API name)
  beelzemon: 'Beelzebumon',
  myotismon: 'Vamdemon',
  machinedramon: 'Mugendramon',
  venommyotismon: 'VenomVamdemon',
  ladydevimon: 'LadyDevimon',     // confirmed via API
  skullgreymon: 'SkullGreymon',   // try concatenated
  wargreymon: 'WarGreymon',
  metalgreymon: 'MetalGreymon',
  metalgarurumon: 'MetalGarurumon',
  weregarurumon: 'WereGarurumon',
  imperialdramon: 'Imperialdramon',
  seraphimon: 'Seraphimon',
  magnaangemon: 'MagnaAngemon',
  gallantmon: 'Gallantmon',
  omnimon: 'Omegamon',            // Japanese name
  daemon: 'Daemon',
  ophanimon: 'Ophanimon',
  cherubimon: 'Cherubimon',
  lucemon: 'Lucemon',
  craniummon: 'Craniummon',
  dukemon: 'Dukemon',             // Japanese name for Gallantmon
  imperialdramon_paladin_mode: 'ImperialdramonPaladinMode',
  susanoomon: 'Susanoomon',
  shinegreymon: 'ShineGreymon',
  miragegaogamon: 'MirageGaogamon',
  rosemon: 'Rosemon',
  burstmon: 'Burstmon',
};

function getApiName(species) {
  const safeName = normalizeSpeciesName(species);
  return DIGIMON_API_NAME_OVERRIDES[safeName] || null;
}

function normalizeSpeciesName(species) {
  if (!species) return '';
  let s = species.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return SPECIES_ALIASES[s] || s;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Get the local file path for a summon sprite.
 * Case-insensitive lookup. Checks digimon cache → retromon → SD summons → numeric retromon rotation.
 *
 * @param {string} species - Summon species ID (e.g. 'agumon', 'flame_elemental', 'Atrox')
 * @returns {string|null} - File path to the sprite, or null if not found
 */
function getSpritePath(species) {
  if (!species) return null;
  const safeName = normalizeSpeciesName(species);

  // 1. Check Digimon cache (case-insensitive)
  let resolved = findCaseInsensitive(CACHE_DIR, `${safeName}.png`);
  if (resolved) return resolved;

  // 2. Check Retromon folder (case-insensitive)
  resolved = findCaseInsensitive(RETROMON_DIR, `${safeName}.png`);
  if (resolved) return resolved;

  // 3. Check SD summons folder (case-insensitive)
  resolved = findCaseInsensitive(FALLBACK_DIR, `${safeName}.png`);
  if (resolved) return resolved;

  // 4. Try Retromon by index (if species is numeric)
  if (/^\d+$/.test(safeName)) {
    const retromonFiles = fs.existsSync(RETROMON_DIR) ? fs.readdirSync(RETROMON_DIR).filter(f => f.endsWith('.png')) : [];
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
 * @param {string} digimonName - Digimon name (e.g. 'Agumon', 'Tyrannomon')
 * @returns {Promise<string|null>} - Path to the cached file, or null on failure
 */
async function fetchAndCache(digimonName) {
  if (!digimonName) return null;
  const safeName = normalizeSpeciesName(digimonName);
  const outPath = path.join(CACHE_DIR, `${safeName}.png`);

  // Already cached (case-insensitive check)
  const existing = findCaseInsensitive(CACHE_DIR, `${safeName}.png`);
  if (existing) return existing;

  // Try several name variants — the Digimon API uses different naming conventions:
  //   "Agumon"          → https://digi-api.com/images/digimon/w/Agumon.png
  //   "Skull Greymon"   → https://digi-api.com/images/digimon/w/SkullGreymon.png (no space)
  //   "Aegiochusmon(Dark)" → https://digi-api.com/images/digimon/w/Aegiochusmon(Dark).png
  // We try: original name, name with spaces removed, name with underscores removed.
  const variants = [
    digimonName,
    digimonName.replace(/\s+/g, ''),           // "Skull Greymon" → "SkullGreymon"
    digimonName.replace(/[_\s]+/g, ''),        // "skull_greymon" → "skullgreymon"
    safeName.replace(/_/g, ''),                // species id with underscores removed
  ];
  // Deduplicate
  const uniqueVariants = [...new Set(variants)];

  for (const variant of uniqueVariants) {
    try {
      const imageUrl = `${IMG_BASE}/${encodeURIComponent(variant)}.png`;
      const imageBuffer = await downloadImage(imageUrl);
      const processedBuffer = await removeWhiteBackground(imageBuffer);
      fs.writeFileSync(outPath, processedBuffer);
      refreshDirIndex(CACHE_DIR);
      console.log(`[SummonSprites] Cached: ${digimonName} (as ${variant}) → ${safeName}.png`);
      return outPath;
    } catch (e) {
      // Try next variant
      continue;
    }
  }

  console.error(`[SummonSprites] Failed to fetch ${digimonName} (tried ${uniqueVariants.length} variants)`);
  return null;
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
  const jimpModule = await getJimp();
  // Jimp v1 API: require('jimp').Jimp is the class
  const Jimp = jimpModule.Jimp || jimpModule;
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
      data[i + 3] = 0;
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
 * Get a sprite path, fetching from API if needed (auto-fetch enabled).
 * Use this anywhere a sprite is rendered to ensure on-demand fetching.
 *
 * @param {string} species - Species name (used for both lookup and API fetch)
 * @param {string} [digimonName] - Optional override for the Digimon API name
 *                                 (defaults to species name with underscores stripped,
 *                                  or the override from DIGIMON_API_NAME_OVERRIDES)
 * @returns {Promise<string|null>}
 */
async function getOrFetchSprite(species, digimonName) {
  // Check local first
  const local = getSpritePath(species);
  if (local) return local;

  // Determine fetch name: explicit override > API name map > species name
  const fetchName = digimonName || getApiName(species) || (species || '').replace(/_/g, ' ');
  if (fetchName) {
    const fetched = await fetchAndCache(fetchName);
    if (fetched) return fetched;
  }

  return null;
}

/**
 * Batch-fetch missing sprites for an array of species.
 * Used by the backfill script and the codex warm-up.
 * Runs in small parallel batches to avoid hammering the API.
 *
 * @param {Array<{species: string, digimonName?: string}>} list
 * @param {object} [opts] - { concurrency: 5, onProgress: (done, total, name, ok) => void }
 * @returns {Promise<{ok: string[], failed: string[]}>}
 */
async function batchFetch(list, opts = {}) {
  const concurrency = opts.concurrency || 5;
  const onProgress = opts.onProgress || (() => {});
  const ok = [], failed = [];
  let i = 0;
  const total = list.length;

  async function worker() {
    while (i < list.length) {
      const idx = i++;
      const item = list[idx];
      try {
        const result = await getOrFetchSprite(item.species, item.digimonName);
        if (result) { ok.push(item.species); onProgress(idx + 1, total, item.species, true); }
        else        { failed.push(item.species); onProgress(idx + 1, total, item.species, false); }
      } catch (e) {
        failed.push(item.species);
        onProgress(idx + 1, total, item.species, false);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { ok, failed };
}

module.exports = {
  getSpritePath,
  fetchAndCache,
  getOrFetchSprite,
  batchFetch,
  CACHE_DIR,
  imageCache,
  // Exposed for testing / debugging
  _internal: { normalizeSpeciesName, findCaseInsensitive, refreshDirIndex, SPECIES_ALIASES }
};
