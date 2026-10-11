// ============================================
// 💎 SKILL & RUNE ASSET LOADER (2026-10-11)
// ============================================
// Resolves the sliced reference artwork for abilities + runes:
//   core/rpgasset/skills/<skillId>.png   (manifest.json, 217 arts)
//   core/rpgasset/runes/<type>.png       (manifest.json, 39 types)
// Loaders return preloaded `Image` objects (node-canvas) with a process-lifetime
// cache, so repeated card renders never re-read the disk. Everything degrades
// gracefully: missing file / unreadable PNG -> null -> caller draws its fallback.
//
// Pixel-art integrity: the PNGs are x3 nearest-neighbor upslices of the source
// sheets, so callers should draw them with imageSmoothingEnabled=false when
// upscaling further, or smooth when downscaling (downscale smooths fine).

const path = require('path');
const fs = require('fs');

const ASSET_DIR = path.join(__dirname, '..', 'rpgasset');

let _canvas = null;
function getCanvas() {
  if (!_canvas) _canvas = require('canvas');
  return _canvas;
}

let _skillManifest = null;
let _runeManifest = null;
function skillManifest() {
  if (_skillManifest) return _skillManifest;
  try {
    _skillManifest = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'skills', 'manifest.json'), 'utf8'));
  } catch (e) {
    _skillManifest = {};
  }
  return _skillManifest;
}
function runeManifest() {
  if (_runeManifest) return _runeManifest;
  try {
    _runeManifest = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'runes', 'manifest.json'), 'utf8'));
  } catch (e) {
    _runeManifest = {};
  }
  return _runeManifest;
}

const _imgCache = new Map();   // relPath -> Image | null (null = known missing)
const MAX_CACHE = 600;

function loadImageCached(relPath) {
  if (_imgCache.has(relPath)) return _imgCache.get(relPath);
  let img = null;
  try {
    const abs = path.join(ASSET_DIR, relPath);
    if (fs.existsSync(abs)) {
      const { loadImage } = getCanvas();
      img = loadImage(abs); // promise
    }
  } catch (e) {
    img = null;
  }
  if (_imgCache.size > MAX_CACHE) {
    const first = _imgCache.keys().next().value;
    if (first) _imgCache.delete(first);
  }
  _imgCache.set(relPath, img);
  return img;
}

/**
 * Resolve + load a skill's artwork. Returns Promise<Image|null>.
 * Accepts the skill object ({id, name}) or a raw id string.
 */
async function getSkillArt(skillOrId) {
  const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
  if (!id) return null;
  const rel = skillManifest()[id.toLowerCase()];
  if (!rel) return null;
  try {
    const p = loadImageCached(rel);
    return p ? await p : null;
  } catch (e) {
    return null;
  }
}

/** True when the skill has reference art on disk (no image load). */
function hasSkillArt(skillOrId) {
  const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
  return Boolean(id && skillManifest()[id.toLowerCase()]);
}

/**
 * Load a rune's artwork by type id (POWER, VOID_CONVERSION, ...).
 * Returns Promise<Image|null>.
 */
async function getRuneArt(type) {
  const t = String(type || '').toUpperCase();
  if (!t) return null;
  const rel = runeManifest()[t];
  if (!rel) return null;
  try {
    const p = loadImageCached(rel);
    return p ? await p : null;
  } catch (e) {
    return null;
  }
}

/** Skill icon filename (Go service asset name) or null — used for SKILLUP/SKILLTREE payloads. */
function skillArtFile(skillOrId) {
  const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
  if (!id) return null;
  const rel = skillManifest()[id.toLowerCase()];
  return rel ? path.basename(rel) : null;
}

module.exports = { getSkillArt, hasSkillArt, getRuneArt, skillArtFile, skillManifest, runeManifest };
