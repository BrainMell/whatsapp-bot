// ============================================
// SKILL & RUNE ASSET LOADER (v3 )
// ============================================
// Resolves ability/rune/summon/kit artwork:
// v3 pack core/rpgasset/v3/{hires,true_res}/... (manifest.json + skill_index.json)
// - hires/ (~512px nearest-neighbour upscales - default for card renders)
// - true_res/ (native pixel-art size)
// - skills/<class>/<skill>.png (272 skills / 45 classes)
// - runes/<category>/<rune>.png (39 types) + <rune>_<tier>.png tier art (all 39)
// - summons/<arch>/<path>_n<1-5>.png (15 paths x 5 nodes) + archetype icons
// - monsters/kits/kit_<arch>.png (12 monster kits) + extras/
// legacy flat pack core/rpgasset/{skills,runes}/*.png (fallback)
// Loaders return preloaded `Image` objects (node-canvas) with a process-lifetime
// cache; everything degrades gracefully: missing file / unreadable PNG -> null
// -> caller draws its fallback.
// Matching rules (v3/ASSIGNMENTS source): pack slugs come from DISPLAY names;
// the game's skillTree ids may differ. skill_index.json (generated at pack
// build) maps '<CLASS>:<skillId>' and bare '<skillId>' -> pack sprite path.

const path = require('path');
const fs = require('fs');

const ASSET_DIR = path.join(__dirname, '..', 'rpgasset');
const V3_DIR = path.join(ASSET_DIR, 'v3');

let _canvas = null;
function getCanvas() {
  if (!_canvas) _canvas = require('canvas');
  return _canvas;
}

let _skillManifest = null;   // legacy flat: id -> relpath
let _runeManifest = null;    // legacy flat: TYPE -> relpath
let _v3Manifest = null;      // v3 pack manifest (skills/runes/summons/monsters)
let _skillIndex = null;      // v3: '<CLASS>:<id>' / '<id>' -> hires relpath
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
function v3Manifest() {
  if (_v3Manifest) return _v3Manifest;
  try {
    _v3Manifest = JSON.parse(fs.readFileSync(path.join(V3_DIR, 'manifest.json'), 'utf8'));
  } catch (e) {
    _v3Manifest = {};
  }
  return _v3Manifest;
}
function v3SkillIndex() {
  if (_skillIndex) return _skillIndex;
  try {
    _skillIndex = JSON.parse(fs.readFileSync(path.join(V3_DIR, 'skill_index.json'), 'utf8'));
  } catch (e) {
    _skillIndex = {};
  }
  return _skillIndex;
}

const _imgCache = new Map();   // relPath -> Promise<Image> | null (null = known missing)
const MAX_CACHE = 900;

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

// -- v3 rune tier resolution ------------------------------------------------
const RUNE_TIERS_LC = ['lesser', 'normal', 'greater', 'abyssal'];
function v3RuneSprite(type, tier) {
  const man = v3Manifest();
  if (!man.runes || !man.runes.length) return null;
  const t = String(type || '').toLowerCase();
  const row = man.runes.find((r) => (r.id || '').toLowerCase() === t);
  if (!row) return null;
  if (tier) {
    const tl = String(tier || '').toLowerCase();
    const p = row.tier_sprites && row.tier_sprites[tl];
    if (p) return 'v3/hires/' + p;
  }
 // tier requested but no tier art (or none requested) -> base sprite
  return row.sprite ? 'v3/hires/' + row.sprite : null;
}

// -- v3 skill resolution ----------------------------------------------------
function v3SkillSprite(skillOrId, classId) {
  const idx = v3SkillIndex();
  if (!idx || !Object.keys(idx).length) return null;
  const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
  if (!id) return null;
  const lid = id.toLowerCase();
  const clsKey = classId ? `${String(classId).toUpperCase()}:${lid}` : null;
  if (clsKey && idx[clsKey]) return 'v3/' + idx[clsKey];
  if (idx[lid]) return 'v3/' + idx[lid];
  return null;
}

/**
 * Resolve + load a skill's artwork. Returns Promise<Image|null>.
 * Accepts the skill object ({id, name}) or a raw id string; classId (skillTree
 * class constant) disambiguates cross-class ids (Cleave, Execute, Heal, ...).
 */
async function getSkillArt(skillOrId, classId) {
  let rel = v3SkillSprite(skillOrId, classId);
  if (!rel) {
    const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
    rel = id ? skillManifest()[id.toLowerCase()] : null;   // legacy flat fallback
  }
  if (!rel) return null;
  try {
    const p = loadImageCached(rel);
    return p ? await p : null;
  } catch (e) {
    return null;
  }
}

/** True when the skill has art on disk (no image load). */
function hasSkillArt(skillOrId, classId) {
  return Boolean(v3SkillSprite(skillOrId, classId)) ||
    (() => {
      const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
      return Boolean(id && skillManifest()[id.toLowerCase()]);
    })();
}

/**
 * Load a rune's artwork by type id (POWER, VOID_CONVERSION, ...).
 * tier (LESSER/NORMAL/GREATER/ABYSSAL) picks the tier-specific sprite when the
 * pack has one; falls back to the base sprite. Returns Promise<Image|null>.
 */
async function getRuneArt(type, tier) {
  const t = String(type || '').toUpperCase();
  if (!t) return null;
  let rel = v3RuneSprite(t, tier);
  if (!rel) rel = runeManifest()[t];                      // legacy flat fallback
  if (!rel) return null;
  try {
    const p = loadImageCached(rel);
    return p ? await p : null;
  } catch (e) {
    return null;
  }
}

/** Summon skill-node art: archetype (TANK..), pathKey letter or slug, node 1-5. */
const PATH_SLUGS = {
  TANK: ['iron_wall', 'guardian', 'counter'],
  BRUTE: ['berserker', 'executioner', 'whirlwind'],
  MAGE: ['elemental', 'arcane', 'temporal'],
  STALKER: ['shadow', 'venom', 'evasion'],
  SUPPORT: ['healing', 'blessing', 'nature'],
};
function v3SummonNodeSprite(archetype, pathKey, node) {
  const slugs = PATH_SLUGS[String(archetype || '').toUpperCase()];
  if (!slugs) return null;
  const pi = ['A', 'B', 'C'].indexOf(String(pathKey || '').toUpperCase());
  const slug = pi >= 0 ? slugs[pi] : slugs.find((s) => s === String(pathKey || '').toLowerCase());
  if (!slug) return null;
  const n = Math.min(5, Math.max(1, Math.floor(Number(node) || 1)));
  return `v3/hires/summons/${String(archetype).toLowerCase()}/${slug}_n${n}.png`;
}
async function getSummonNodeArt(archetype, pathKey, node) {
  const rel = v3SummonNodeSprite(archetype, pathKey, node);
  if (!rel) return null;
  try {
    const p = loadImageCached(rel);
    return p ? await p : null;
  } catch (e) {
    return null;
  }
}

/** Monster kit art by archetype key (TANK..COLOSSUS). */
async function getKitArt(archetype) {
  const a = String(archetype || '').toLowerCase();
  if (!a) return null;
  const rel = `v3/hires/monsters/kits/kit_${a}.png`;
  try {
    const p = loadImageCached(rel);
    return p ? await p : null;
  } catch (e) {
    return null;
  }
}

/** Skill icon filename (Go service asset name) or null - used for SKILLUP/SKILLTREE payloads. */
function skillArtFile(skillOrId) {
  const id = typeof skillOrId === 'object' ? String(skillOrId?.id || '') : String(skillOrId || '');
  if (!id) return null;
  const rel = skillManifest()[id.toLowerCase()];
  return rel ? path.basename(rel) : null;
}

module.exports = {
  getSkillArt, hasSkillArt, getRuneArt, skillArtFile, skillManifest, runeManifest,
  v3Manifest, v3SkillIndex, v3RuneSprite, v3SkillSprite, v3SummonNodeSprite,
  getSummonNodeArt, getKitArt, PATH_SLUGS,
};
