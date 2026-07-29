// ============================================
// 🎨 SUMMON CODEX RENDERER — image cards with sprites
// ============================================
// Renders all summon species as an image card grid with sprite previews.
// Supports pagination (12 species per page).
//
// Sprite handling:
//   1. Try local sprite via summonSprites.getSpritePath (case-insensitive)
//   2. On miss, auto-fetch from digi-api.com via getOrFetchSprite (async)
//   3. On fetch failure, fall back to species emoji icon (consistent with roster renderer)

const path = require('path');
const fs = require('fs');

let _canvas = null;
function getCanvas() { if (!_canvas) _canvas = require('canvas'); return _canvas; }

const FONTS_DIR = path.join(__dirname, '..', 'rpgasset', 'fonts');
const FONT_REG = 'Pixeloid Sans';
const FONT_BOLD = 'Dogica Pixel Bold';

let _fontsRegistered = false;
function ensureFonts() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;
  try {
    const { registerFont } = getCanvas();
    if (fs.existsSync(path.join(FONTS_DIR, 'PixeloidSans.ttf')))
      registerFont(path.join(FONTS_DIR, 'PixeloidSans.ttf'), { family: FONT_REG });
    if (fs.existsSync(path.join(FONTS_DIR, 'dogicapixelbold.otf')))
      registerFont(path.join(FONTS_DIR, 'dogicapixelbold.otf'), { family: FONT_BOLD });
  } catch (e) {}
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const ELEMENT_COLORS = {
  undead: '#9C27B0', demon: '#D32F2F', fire: '#FF6B35', ice: '#4FC3F7',
  lightning: '#FFEB3B', beast: '#8BC34A', dragon: '#FFD700',
  construct: '#607D8B', holy: '#FFF9C4', neutral: '#9E9E9E'
};

const RARITY_COLORS = {
  COMMON: '#9E9E9E', UNCOMMON: '#4CAF50', RARE: '#2196F3',
  EPIC: '#9C27B0', LEGENDARY: '#FF9800', MYTHIC: '#E91E63'
};

const RARITY_TINT = {
  COMMON: 'rgba(158,158,158,0.1)', UNCOMMON: 'rgba(76,175,80,0.12)',
  RARE: 'rgba(33,150,243,0.14)', EPIC: 'rgba(156,39,176,0.14)',
  LEGENDARY: 'rgba(255,152,0,0.17)', MYTHIC: 'rgba(233,30,99,0.17)'
};

const PAGE_SIZE = 12; // 4 columns × 3 rows

// In-memory set of species we've already attempted to fetch this session
// (avoids re-attempting API fetches for permanently-missing sprites)
const _fetchAttempted = new Set();

/**
 * Render a codex page as an image.
 * @param {object} registry - summonRegistry module
 * @param {number} page - 1-indexed page number
 * @param {string} filter - element filter (or 'all')
 * @returns {Promise<{buffer: Buffer, totalPages: number, currentPage: number, totalSpecies: number}>}
 */
async function renderCodexPage(registry, page = 1, filter = 'all') {
  ensureFonts();
  const { createCanvas, loadImage } = getCanvas();
  const summonSprites = require('./summonSprites');

  // Get all species, optionally filtered
  let allSpecies = registry.getAllSpecies();
  if (filter && filter !== 'all') {
    allSpecies = allSpecies.filter(id => {
      const sp = registry.getSpecies(id);
      return sp && sp.element === filter;
    });
  }

  const totalPages = Math.max(1, Math.ceil(allSpecies.length / PAGE_SIZE));
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  const startIdx = (page - 1) * PAGE_SIZE;
  const pageSpecies = allSpecies.slice(startIdx, startIdx + PAGE_SIZE);

  const W = 1024, H = 720;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#1a1a2e'); bgGradient.addColorStop(0.5, '#16213e'); bgGradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = bgGradient; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < W; i += 40) for (let j = 0; j < H; j += 40) ctx.fillRect(i, j, 1, 1);

  // Header
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 20, 15, W - 40, 50, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,0,0.3)'; ctx.lineWidth = 2;
  roundRect(ctx, 20, 15, W - 40, 50, 8); ctx.stroke();

  ctx.fillStyle = '#FFD700'; ctx.font = `bold 24px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const filterLabel = filter && filter !== 'all' ? ` (${filter.toUpperCase()})` : '';
  ctx.fillText(`SUMMON CODEX${filterLabel}`, 35, 40);

  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `14px "${FONT_REG}", monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(`${allSpecies.length} species | Page ${page}/${totalPages}`, W - 35, 40);

  // Species grid
  const cols = 4, cardW = 230, cardH = 180, gapX = 12, gapY = 12;
  const gridW = cols * cardW + (cols - 1) * gapX;
  const gridStartX = (W - gridW) / 2;
  const gridStartY = 80;

  // Pre-resolve all sprites in parallel (auto-fetch enabled)
  // This dramatically improves perceived performance vs sequential awaits per card.
  const spritePaths = await Promise.all(pageSpecies.map(async (speciesId) => {
    // First check local cache (sync, fast)
    let p = summonSprites.getSpritePath(speciesId);
    if (p) return p;
    // Avoid re-attempting fetches for species we've already tried this session
    if (_fetchAttempted.has(speciesId)) return null;
    _fetchAttempted.add(speciesId);
    // Auto-fetch from API (best-effort, don't block the whole page if it fails)
    try {
      const sp = registry.getSpecies(speciesId);
      const fetchName = sp?.name || speciesId.replace(/_/g, ' ');
      return await summonSprites.getOrFetchSprite(speciesId, fetchName);
    } catch (e) {
      return null;
    }
  }));

  for (let i = 0; i < pageSpecies.length; i++) {
    const speciesId = pageSpecies[i];
    const species = registry.getSpecies(speciesId);
    if (!species) continue;

    const col = i % cols, row = Math.floor(i / cols);
    const x = gridStartX + col * (cardW + gapX);
    const y = gridStartY + row * (cardH + gapY);

    const elementColor = ELEMENT_COLORS[species.element] || ELEMENT_COLORS.neutral;
    const rarityColor = RARITY_COLORS[species.rarity] || RARITY_COLORS.COMMON;
    const rarityTint = RARITY_TINT[species.rarity] || RARITY_TINT.COMMON;

    // Card background
    ctx.fillStyle = rarityTint;
    roundRect(ctx, x, y, cardW, cardH, 8); ctx.fill();

    // Element-colored left border
    ctx.fillStyle = elementColor;
    roundRect(ctx, x, y, 4, cardH, 2); ctx.fill();

    // Card border (rarity-colored)
    ctx.strokeStyle = rarityColor; ctx.lineWidth = 1.5;
    roundRect(ctx, x, y, cardW, cardH, 8); ctx.stroke();

    // Sprite portrait (80×80)
    const portraitSize = 80;
    const portraitX = x + (cardW - portraitSize) / 2;
    const portraitY = y + 12;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 6); ctx.fill();

    const spritePath = spritePaths[i];
    let spriteDrawn = false;
    if (spritePath && fs.existsSync(spritePath)) {
      try {
        const img = await loadImage(spritePath);
        const scale = Math.min(portraitSize / img.width, portraitSize / img.height) * 0.9;
        const dw = img.width * scale, dh = img.height * scale;
        ctx.drawImage(img, portraitX + (portraitSize - dw) / 2, portraitY + (portraitSize - dh) / 2, dw, dh);
        spriteDrawn = true;
      } catch (e) {}
    }
    if (!spriteDrawn) {
      // Fallback: species emoji icon (consistent with roster renderer)
      // Use 40px font for emoji to fit nicely in 80×80 portrait
      ctx.fillStyle = elementColor;
      ctx.font = `40px "${FONT_REG}", "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(species.icon || '🐉', portraitX + portraitSize / 2, portraitY + portraitSize / 2);
    }

    // Name
    ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
    ctx.fillText(species.name.slice(0, 16), x + cardW / 2, y + 100);

    // Element + rarity
    ctx.fillStyle = elementColor; ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(`${species.element.toUpperCase()} | ${species.rarity}`, x + cardW / 2, y + 118);

    // Archetype
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `10px "${FONT_REG}", monospace`;
    ctx.fillText(species.archetype, x + cardW / 2, y + 134);

    // Level cap + rune slots
    const rarityCfg = registry.getRarityConfig(species.rarity);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(`Lv cap ${rarityCfg.maxLevel} | ${rarityCfg.runeSlots} runes`, x + cardW / 2, y + 148);

    // Rarity letter badge
    if (species.rarity !== 'COMMON') {
      ctx.fillStyle = rarityColor;
      ctx.font = `bold 12px "${FONT_BOLD}", monospace`;
      ctx.textAlign = 'right';
      const rarityLabel = species.rarity.charAt(0);
      ctx.fillText(rarityLabel, x + cardW - 8, y + 8);
    }
  }

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // Footer
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 20, H - 35, W - 40, 25, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `12px "${FONT_REG}", monospace`;
  ctx.textAlign = 'center';
  const navText = totalPages > 1
    ? `Page ${page}/${totalPages} — use .summon codex <page> to navigate | filter: .summon codex <element>`
    : `${allSpecies.length} species available`;
  ctx.fillText(navText, W / 2, H - 20);

  return { buffer: canvas.toBuffer('image/png'), totalPages, currentPage: page, totalSpecies: allSpecies.length };
}

module.exports = { renderCodexPage, PAGE_SIZE };
