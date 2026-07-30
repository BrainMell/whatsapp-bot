// ============================================
// 🎨 SUMMON ROSTER RENDERER — node-canvas
// ============================================
// Renders the Summon Codex as an image card with:
// - Header (title + slot count)
// - Summon cards in a grid (sprite + name + stats + loyalty bar)
// - Element-coded borders
// - Active summon highlighted
//
// Uses node-canvas for all rendering.
// UI elements drawn with canvas primitives (no sprite dependencies).
// Sprites loaded from summonSprites.js (Digimon cache + local assets).

// Lazy-load canvas (prevents crash if not installed on server)
let _canvas = null;
function getCanvas() {
  if (!_canvas) {
    const canvas = require('canvas');
    _canvas = canvas;
  }
  return _canvas;
}
const path = require('path');
const fs = require('fs');
const summonSprites = require('./summonSprites');
const summonSystem = require('./summonSystem');
const registry = require('./summonRegistry');

// Register fonts
const FONTS_DIR = path.join(__dirname, '..', 'rpgasset', 'fonts');
const FONT_REG = 'Pixeloid Sans';
const FONT_BOLD = 'Dogica Pixel Bold';

// Font registration (lazy — done on first render)
let _fontsRegistered = false;
function ensureFonts() {
  if (_fontsRegistered) return;
  _fontsRegistered = true;
  try {
    const { registerFont } = getCanvas();
    if (fs.existsSync(path.join(FONTS_DIR, 'PixeloidSans.ttf'))) {
      registerFont(path.join(FONTS_DIR, 'PixeloidSans.ttf'), { family: FONT_REG });
    }
    if (fs.existsSync(path.join(FONTS_DIR, 'dogicapixelbold.otf'))) {
      registerFont(path.join(FONTS_DIR, 'dogicapixelbold.otf'), { family: FONT_BOLD });
    }
  } catch (e) {
    console.warn('[RosterRenderer] Font registration failed:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// ELEMENT CONFIG — colors + icons per element
// ─────────────────────────────────────────────────────────────

const ELEMENT_CONFIG = {
  fire:      { color: '#FF6B35', bg: 'rgba(255,107,53,0.15)', label: '🔥 Fire' },
  ice:       { color: '#4FC3F7', bg: 'rgba(79,195,247,0.15)', label: '❄️ Ice' },
  lightning: { color: '#FFEB3B', bg: 'rgba(255,235,59,0.15)', label: '⚡ Storm' },
  undead:    { color: '#9C27B0', bg: 'rgba(156,39,176,0.15)', label: '💀 Undead' },
  demon:     { color: '#D32F2F', bg: 'rgba(211,47,47,0.15)', label: '😈 Demon' },
  beast:     { color: '#8BC34A', bg: 'rgba(139,195,74,0.15)', label: '🐺 Beast' },
  dragon:    { color: '#FFD700', bg: 'rgba(255,215,0,0.15)', label: '🐉 Dragon' },
  construct: { color: '#607D8B', bg: 'rgba(96,125,139,0.15)', label: '🔫 Construct' },
  holy:      { color: '#FFF9C4', bg: 'rgba(255,249,196,0.15)', label: '✨ Holy' },
  neutral:   { color: '#9E9E9E', bg: 'rgba(158,158,158,0.15)', label: '⚪ Neutral' },
};

const RARITY_COLORS = {
  COMMON: '#9E9E9E', UNCOMMON: '#4CAF50', RARE: '#2196F3',
  EPIC: '#9C27B0', LEGENDARY: '#FF9800', MYTHIC: '#E91E63'
};

const RARITY_BG = {
  COMMON: 'rgba(158,158,158,0.1)', UNCOMMON: 'rgba(76,175,80,0.1)',
  RARE: 'rgba(33,150,243,0.1)', EPIC: 'rgba(156,39,176,0.1)',
  LEGENDARY: 'rgba(255,152,0,0.1)', MYTHIC: 'rgba(233,30,99,0.1)'
};

// ─────────────────────────────────────────────────────────────
// HELPER: rounded rectangle
// ─────────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ─────────────────────────────────────────────────────────────
// HELPER: draw loyalty bar
// ─────────────────────────────────────────────────────────────

function drawLoyaltyBar(ctx, x, y, w, loyalty) {
  const h = 6;
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();

  // Fill
  const pct = Math.max(0, Math.min(100, loyalty)) / 100;
  let color;
  if (loyalty >= 75) color = '#4CAF50';
  else if (loyalty >= 50) color = '#FFEB3B';
  else if (loyalty >= 25) color = '#FF9800';
  else if (loyalty >= 1) color = '#F44336';
  else color = '#616161';

  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * pct, h, 3);
  ctx.fill();
}

// ─────────────────────────────────────────────────────────────
// HELPER: draw stat bar
// ─────────────────────────────────────────────────────────────

function drawStatBar(ctx, x, y, w, value, maxValue, color) {
  const h = 5;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, x, y, w, h, 2);
  ctx.fill();

  const pct = Math.min(1, value / (maxValue || 1));
  ctx.fillStyle = color || '#4FC3F7';
  roundRect(ctx, x, y, w * pct, h, 2);
  ctx.fill();
}

// ─────────────────────────────────────────────────────────────
// MAIN: render summon roster as an image
// ─────────────────────────────────────────────────────────────

/**
 * Render the summon roster as a PNG image.
 * @param {object} user - Economy user object
 * @param {array} summons - Array of Summon documents
 * @param {object} options - { selectedIndex, filter }
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function renderRoster(user, summons, options = {}) {
  const W = 1024;
  const H = 720;
  ensureFonts();
  const { createCanvas } = getCanvas();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background ──
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(0.5, '#16213e');
  bgGradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  // Subtle pattern overlay
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < W; i += 40) {
    for (let j = 0; j < H; j += 40) {
      ctx.fillRect(i, j, 1, 1);
    }
  }

  // ── Header ──
  const headerH = 60;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 20, 15, W - 40, headerH, 8);
  ctx.fill();

  // Header border
  ctx.strokeStyle = 'rgba(255,215,0,0.3)';
  ctx.lineWidth = 2;
  roundRect(ctx, 20, 15, W - 40, headerH, 8);
  ctx.stroke();

  // Title
  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 28px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐉 MY SUMMONS', 40, 45);

  // Slots info
  const slotText = `${summons.length}/${user.summonSlots || 3} slots`;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `16px "${FONT_REG}", monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(slotText, W - 40, 45);

  // Active summon indicator
  if (user.activeSummonId) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.fillText('⭐ 1 deployed', W - 40, 62);
  }

  // Resonance count
  const resonances = user.activeResonances || [];
  if (resonances.length > 0) {
    ctx.fillStyle = '#4FC3F7';
    ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`🔗 ${resonances.length} resonance${resonances.length > 1 ? 's' : ''}`, W / 2, 45);
  }

  // ── Summon cards ──
  const cardsTop = 90;
  const cardH = 140;
  const cardW = 480;
  const cardGap = 10;
  const cardsPerRow = 2;
  const cardStartX = 20;

  // Filter summons if needed
  let displaySummons = summons;
  if (options.filter && options.filter !== 'all') {
    displaySummons = summons.filter(s => s.element === options.filter);
  }

  if (displaySummons.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `20px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('📭 No summons in your codex yet.', W / 2, H / 2 - 20);
    ctx.font = `16px "${FONT_REG}", monospace`;
    ctx.fillText('Capture enemies or hatch eggs to get summons!', W / 2, H / 2 + 10);
    return canvas.toBuffer('image/png');
  }

  // Draw each summon as a card
  for (let i = 0; i < Math.min(displaySummons.length, 8); i++) {
    const summon = displaySummons[i];
    const col = i % cardsPerRow;
    const row = Math.floor(i / cardsPerRow);
    const x = cardStartX + col * (cardW + cardGap);
    const y = cardsTop + row * (cardH + cardGap);

    await drawSummonCard(ctx, summon, user, x, y, cardW, cardH, i + 1);
  }

  // ── Footer ──
  const footerY = H - 35;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 20, footerY - 5, W - 40, 30, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `13px "${FONT_REG}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('.summon <#> — view details  |  .summon deploy <#> — equip  |  .summon help — all commands', W / 2, footerY + 10);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// Draw a single summon card
// ─────────────────────────────────────────────────────────────

async function drawSummonCard(ctx, summon, user, x, y, w, h, index) {
  const species = registry.getSpecies(summon.species);
  const elementCfg = ELEMENT_CONFIG[summon.element] || ELEMENT_CONFIG.neutral;
  const rarityColor = RARITY_COLORS[summon.rarity] || RARITY_COLORS.COMMON;
  const rarityBg = RARITY_BG[summon.rarity] || RARITY_BG.COMMON;
  const isActive = user.activeSummonId === summon.summonId;
  const stats = summonSystem.computeEffectiveStats(summon);
  const name = summon.nickname || species?.name || summon.species;

  // Card background
  ctx.fillStyle = rarityBg;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();

  // Element-colored left border
  ctx.fillStyle = elementCfg.color;
  roundRect(ctx, x, y, 4, h, 2);
  ctx.fill();

  // Card border
  ctx.strokeStyle = isActive ? '#FFD700' : rarityColor;
  ctx.lineWidth = isActive ? 3 : 1.5;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  // Active summon star
  if (isActive) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `16px "${FONT_REG}", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('⭐', x + w - 10, y + 15);
  }

  // ── Sprite portrait ──
  const portraitSize = 80;
  const portraitX = x + 12;
  const portraitY = y + 15;

  // Portrait background
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 6);
  ctx.fill();

  // Try to load sprite (auto-fetch from API on cache miss)
  const spritePath = await summonSprites.getOrFetchSprite(summon.species);
  if (spritePath && fs.existsSync(spritePath)) {
    try {
      const { loadImage } = getCanvas();
      const img = await loadImage(spritePath);
      // Fit sprite into portrait area (contain mode)
      const scale = Math.min(portraitSize / img.width, portraitSize / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const dx = portraitX + (portraitSize - dw) / 2;
      const dy = portraitY + (portraitSize - dh) / 2;
      ctx.drawImage(img, dx, dy, dw, dh);
    } catch (e) {
      // Draw placeholder
      ctx.fillStyle = elementCfg.color;
      ctx.font = `32px "${FONT_REG}", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(species?.icon || '🐉', portraitX + portraitSize / 2, portraitY + portraitSize / 2);
    }
  } else {
    // Draw emoji icon as placeholder
    ctx.fillStyle = elementCfg.color;
    ctx.font = `32px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(species?.icon || '🐉', portraitX + portraitSize / 2, portraitY + portraitSize / 2);
  }

  ctx.textBaseline = 'alphabetic';

  // ── Name + level ──
  const textX = portraitX + portraitSize + 12;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(name, textX, y + 25);

  ctx.fillStyle = rarityColor;
  ctx.font = `12px "${FONT_REG}", monospace`;
  ctx.fillText(`Lv.${summon.level} ${summon.rarity} ${summon.tier}`, textX, y + 42);

  // Element + personality
  ctx.fillStyle = elementCfg.color;
  ctx.font = `12px "${FONT_REG}", monospace`;
  ctx.fillText(`${elementCfg.label} | 🧠 ${summon.personality}`, textX, y + 58);

  // ── Stats ──
  const statY = y + 72;
  const statW = 100;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`HP ${stats.hp}`, textX, statY);
  ctx.fillText(`ATK ${stats.atk}`, textX + 55, statY);
  ctx.fillText(`DEF ${stats.def}`, textX, statY + 12);
  ctx.fillText(`MAG ${stats.mag}`, textX + 55, statY + 12);
  ctx.fillText(`SPD ${stats.spd}`, textX, statY + 24);

  // ── Loyalty bar ──
  const loyaltyY = y + h - 20;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText('💖', textX, loyaltyY);
  drawLoyaltyBar(ctx, textX + 15, loyaltyY - 8, w - (textX - x) - 30, summon.loyalty);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`${summon.loyalty}`, x + w - 30, loyaltyY);

  // ── Index number ──
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `bold 24px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`${index}`, x + 8, y + 20);

  // Tamed indicator
  const isTamed = (summon.lineage || []).some(l => l.personality === 'TAMED');
  if (isTamed) {
    ctx.fillStyle = '#4CAF50';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('✨ Tamed', x + w - 10, y + h - 10);
  }
}

// ─────────────────────────────────────────────────────────────
// Render a single summon detail card (for .summon <#>)
// ─────────────────────────────────────────────────────────────

async function renderDetailCard(summon, user) {
  const W = 800;
  const H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const species = registry.getSpecies(summon.species);
  const elementCfg = ELEMENT_CONFIG[summon.element] || ELEMENT_CONFIG.neutral;
  const rarityColor = RARITY_COLORS[summon.rarity] || RARITY_COLORS.COMMON;
  const stats = summonSystem.computeEffectiveStats(summon);
  const name = summon.nickname || species?.name || summon.species;
  const echo = registry.getEcho(summon.echoId);
  const personality = registry.getPersonalityModifier(summon.personality);

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  // Element color wash
  ctx.fillStyle = elementCfg.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Outer border (rarity-colored) ──
  ctx.strokeStyle = rarityColor;
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, W - 20, H - 20, 12);
  ctx.stroke();

  // Inner border (element-colored)
  ctx.strokeStyle = elementCfg.color;
  ctx.lineWidth = 2;
  roundRect(ctx, 16, 16, W - 32, H - 32, 8);
  ctx.stroke();

  // ── Header ──
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 30, 30, W - 60, 50, 8);
  ctx.fill();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 24px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${species?.icon || '🐉'} ${name}`, W / 2, 55);

  // ── Sprite portrait (large) ──
  const portraitSize = 200;
  const portraitX = 40;
  const portraitY = 100;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 10);
  ctx.fill();
  ctx.strokeStyle = elementCfg.color;
  ctx.lineWidth = 2;
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 10);
  ctx.stroke();

  const spritePath = await summonSprites.getOrFetchSprite(summon.species);
  if (spritePath && fs.existsSync(spritePath)) {
    try {
      const { loadImage } = getCanvas();
      const img = await loadImage(spritePath);
      const scale = Math.min(portraitSize / img.width, portraitSize / img.height) * 0.9;
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, portraitX + (portraitSize - dw) / 2, portraitY + (portraitSize - dh) / 2, dw, dh);
    } catch (e) {
      ctx.fillStyle = elementCfg.color;
      ctx.font = `80px "${FONT_REG}", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(species?.icon || '🐉', portraitX + portraitSize / 2, portraitY + portraitSize / 2 + 30);
    }
  } else {
    // No sprite — draw emoji fallback
    ctx.fillStyle = elementCfg.color;
    ctx.font = `80px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(species?.icon || '🐉', portraitX + portraitSize / 2, portraitY + portraitSize / 2 + 30);
  }

  // ── Info panel (right side) ──
  const infoX = 270;
  const infoY = 100;
  const infoW = W - infoX - 40;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, infoX, infoY, infoW, 200, 8);
  ctx.fill();

  // Name + details
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 18px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(name, infoX + 15, infoY + 12);

  ctx.fillStyle = rarityColor;
  ctx.font = `14px "${FONT_REG}", monospace`;
  ctx.fillText(`Level ${summon.level} | ${summon.rarity} | ${summon.tier}`, infoX + 15, infoY + 35);

  ctx.fillStyle = elementCfg.color;
  ctx.fillText(`${elementCfg.label} | ${summon.archetype}`, infoX + 15, infoY + 52);

  // Stats with bars
  const statLabels = [
    { key: 'hp', label: 'HP', value: stats.hp, max: 500, color: '#F44336' },
    { key: 'atk', label: 'ATK', value: stats.atk, max: 200, color: '#FF9800' },
    { key: 'def', label: 'DEF', value: stats.def, max: 200, color: '#2196F3' },
    { key: 'mag', label: 'MAG', value: stats.mag, max: 200, color: '#9C27B0' },
    { key: 'spd', label: 'SPD', value: stats.spd, max: 200, color: '#4CAF50' },
  ];

  for (let i = 0; i < statLabels.length; i++) {
    const s = statLabels[i];
    const sy = infoY + 78 + i * 22;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.fillText(s.label, infoX + 15, sy);
    drawStatBar(ctx, infoX + 50, sy + 4, infoW - 120, s.value, s.max, s.color);
    ctx.fillStyle = s.color;
    ctx.fillText(`${s.value}`, infoX + infoW - 45, sy);
  }

  // ── Bottom section: Loyalty + Echo + Personality ──
  const bottomY = 320;

  // Loyalty
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `14px "${FONT_REG}", monospace`;
  ctx.fillText('💖 Loyalty', 40, bottomY);
  drawLoyaltyBar(ctx, 130, bottomY - 4, 150, summon.loyalty);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(`${summon.loyalty}/100`, 290, bottomY);

  // Personality
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('🧠 Personality', 40, bottomY + 25);
  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.fillText(personality.name, 160, bottomY + 25);

  // Echo
  if (echo) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.fillText(`${echo.icon} Echo`, 40, bottomY + 50);
    ctx.fillStyle = '#4FC3F7';
    ctx.fillText(echo.name, 130, bottomY + 50);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(echo.desc, 130, bottomY + 65);
  }

  // ── Footer ──
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 30, H - 50, W - 60, 30, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `11px "${FONT_REG}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`🆔 ${summon.summonId.slice(-12)}  |  📅 ${summon.obtainedFrom}  |  ${user.activeSummonId === summon.summonId ? '⭐ DEPLOYED' : 'Not deployed'}`, W / 2, H - 32);

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderRoster,
  renderDetailCard,
  ELEMENT_CONFIG,
  RARITY_COLORS
};
