// ============================================
// 🎨 PROFILE CARD RENDERER — node-canvas
// ============================================
// Redesigned RPG profile card with:
// - Avatar + name + class + rank + level
// - Stats with colored bars
// - Equipment slots (3×3 grid)
// - Active summon portrait (if deployed)
// - Resonance indicators
// - Consistent visual style with summon roster
//
// Replaces the Go-rendered profile card.

const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// Register fonts (same as roster renderer)
const FONTS_DIR = path.join(__dirname, '..', 'rpgasset', 'fonts');
const FONT_REG = 'Pixeloid Sans';
const FONT_BOLD = 'Dogica Pixel Bold';

try {
  if (fs.existsSync(path.join(FONTS_DIR, 'PixeloidSans.ttf'))) {
    registerFont(path.join(FONTS_DIR, 'PixeloidSans.ttf'), { family: FONT_REG });
  }
  if (fs.existsSync(path.join(FONTS_DIR, 'dogicapixelbold.otf'))) {
    registerFont(path.join(FONTS_DIR, 'dogicapixelbold.otf'), { family: FONT_BOLD });
  }
} catch (e) {}

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

function drawStatBar(ctx, x, y, w, value, max, color) {
  const h = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  const pct = Math.min(1, value / (max || 1));
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * pct, h, 3);
  ctx.fill();
}

// Rank colors
const RANK_COLORS = {
  F: '#9E9E9E', E: '#8D6E63', D: '#795548', C: '#558B2F',
  B: '#2E7D32', A: '#1565C0', S: '#7B1FA2', SS: '#C2185B',
  SSS: '#E65100', GOD: '#FFD700', DRAGON: '#FF6F00'
};

const STAT_COLORS = {
  hp: '#F44336', atk: '#FF9800', def: '#2196F3',
  mag: '#9C27B0', spd: '#4CAF50', luck: '#FFEB3B',
  crit: '#FF6F00', evasion: '#00BCD4'
};

const EQUIPMENT_SLOTS = [
  { key: 'main_hand', label: 'Weapon', icon: '⚔️' },
  { key: 'off_hand', label: 'Off-Hand', icon: '🛡️' },
  { key: 'armor', label: 'Armor', icon: '🦺' },
  { key: 'helmet', label: 'Helmet', icon: '⛑️' },
  { key: 'gloves', label: 'Gloves', icon: '🧤' },
  { key: 'boots', label: 'Boots', icon: '🥾' },
  { key: 'ring', label: 'Ring', icon: '💍' },
  { key: 'amulet', label: 'Amulet', icon: '📿' },
  { key: 'cloak', label: 'Cloak', icon: '🧥' }
];

/**
 * Render the profile card as a PNG image.
 * @param {object} params - { user, classData, stats, equipStats, equipment, level, rank, pfpUrl, activeSummon }
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function renderProfileCard(params) {
  const { user, classData, stats, equipStats, equipment, level, rank, activeSummon } = params;

  const W = 800;
  const H = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── Background ──
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(0.5, '#16213e');
  bgGradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  // Subtle pattern
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < W; i += 40) {
    for (let j = 0; j < H; j += 40) {
      ctx.fillRect(i, j, 1, 1);
    }
  }

  // ── Outer border (rank-colored) ──
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.F;
  ctx.strokeStyle = rankColor;
  ctx.lineWidth = 4;
  roundRect(ctx, 10, 10, W - 20, H - 20, 12);
  ctx.stroke();

  // Inner border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  roundRect(ctx, 16, 16, W - 32, H - 32, 8);
  ctx.stroke();

  // ── Header ──
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 30, 30, W - 60, 70, 8);
  ctx.fill();

  // Avatar placeholder (left side)
  const avatarSize = 50;
  const avatarX = 45;
  const avatarY = 40;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 6);
  ctx.fill();

  // Try to load PFP if available
  if (params.pfpBuffer) {
    try {
      const pfpImg = await loadImage(params.pfpBuffer);
      ctx.save();
      roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 6);
      ctx.clip();
      ctx.drawImage(pfpImg, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (e) {}
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `24px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👤', avatarX + avatarSize / 2, avatarY + avatarSize / 2);
  }

  // Name + title
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 22px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(user?.nickname || 'Adventurer', avatarX + avatarSize + 15, 40);

  // Class + rank + level
  const classIcon = classData?.icon || '🛡️';
  const className = classData?.name || 'Adventurer';
  ctx.fillStyle = rankColor;
  ctx.font = `14px "${FONT_REG}", monospace`;
  ctx.fillText(`${classIcon} ${className}  |  ⭐ Lv.${level || 1}  |  🏆 ${rank}-Rank`, avatarX + avatarSize + 15, 68);

  // XP bar
  const xpPct = params.xpPercent || 0;
  drawStatBar(ctx, avatarX + avatarSize + 15, 88, W - avatarX - avatarSize - 90, 100, xpPct, '#4CAF50');
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`XP ${xpPct}%`, W - 80, 88);

  // ── Left panel: Stats ──
  const statsX = 30;
  const statsY = 120;
  const statsW = 350;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, statsX, statsY, statsW, 280, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, statsX, statsY, statsW, 280, 8);
  ctx.stroke();

  // Stats header
  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('📊 STATS', statsX + 15, statsY + 12);

  // Stat rows
  const statList = [
    { key: 'hp', label: 'HP', base: stats?.hp || 100, equip: equipStats?.hp || 0, max: 5000 },
    { key: 'atk', label: 'ATK', base: stats?.atk || 10, equip: equipStats?.atk || 0, max: 500 },
    { key: 'def', label: 'DEF', base: stats?.def || 10, equip: equipStats?.def || 0, max: 500 },
    { key: 'mag', label: 'MAG', base: stats?.mag || 10, equip: equipStats?.mag || 0, max: 500 },
    { key: 'spd', label: 'SPD', base: stats?.spd || 10, equip: equipStats?.spd || 0, max: 500 },
    { key: 'luck', label: 'LCK', base: stats?.luck || 10, equip: equipStats?.luck || 0, max: 500 },
    { key: 'crit', label: 'CRIT', base: stats?.crit || 5, equip: equipStats?.crit || 0, max: 100, suffix: '%' },
    { key: 'evasion', label: 'EVA', base: stats?.evasion || 5, equip: equipStats?.evasion || 0, max: 100, suffix: '%' }
  ];

  for (let i = 0; i < statList.length; i++) {
    const s = statList[i];
    const sy = statsY + 40 + i * 28;
    const total = s.base + s.equip;
    const color = STAT_COLORS[s.key] || '#9E9E9E';

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.fillText(s.label, statsX + 15, sy);

    // Base value
    ctx.fillStyle = color;
    ctx.fillText(`${s.base}`, statsX + 55, sy);

    // Equipment bonus (+N in green)
    if (s.equip > 0) {
      ctx.fillStyle = '#4CAF50';
      ctx.font = `10px "${FONT_REG}", monospace`;
      ctx.fillText(`+${s.equip}`, statsX + 100, sy + 1);
    }

    // Stat bar
    drawStatBar(ctx, statsX + 140, sy + 3, statsW - 165, total, s.max, color);

    // Total value (right)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 12px "${FONT_BOLD}", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${total}${s.suffix || ''}`, statsX + statsW - 15, sy);
    ctx.textAlign = 'left';
  }

  // ── Right panel: Equipment ──
  const equipX = 400;
  const equipY = 120;
  const equipW = 370;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, equipX, equipY, equipW, 280, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, equipX, equipY, equipW, 280, 8);
  ctx.stroke();

  // Equipment header
  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('⚔️ EQUIPMENT', equipX + 15, equipY + 12);

  // 3×3 grid of equipment slots
  const slotSize = 100;
  const slotGap = 10;
  const gridStartX = equipX + 15;
  const gridStartY = equipY + 40;

  for (let i = 0; i < EQUIPMENT_SLOTS.length; i++) {
    const slot = EQUIPMENT_SLOTS[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sx = gridStartX + col * (slotSize + slotGap);
    const sy = gridStartY + row * (slotSize + slotGap);

    // Slot background
    const equippedItem = equipment?.[slot.key];
    const hasItem = equippedItem && equippedItem !== null && typeof equippedItem === 'object';

    ctx.fillStyle = hasItem ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)';
    roundRect(ctx, sx, sy, slotSize, slotSize, 6);
    ctx.fill();

    // Slot border
    ctx.strokeStyle = hasItem ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, sx, sy, slotSize, slotSize, 6);
    ctx.stroke();

    // Slot icon
    ctx.fillStyle = hasItem ? '#FFD700' : 'rgba(255,255,255,0.3)';
    ctx.font = `28px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.icon, sx + slotSize / 2, sy + slotSize / 2 - 8);

    // Slot label
    ctx.fillStyle = hasItem ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
    ctx.font = `9px "${FONT_REG}", monospace`;
    ctx.fillText(hasItem ? (equippedItem.name || slot.label).slice(0, 12) : slot.label, sx + slotSize / 2, sy + slotSize - 12);

    // Durability bar if equipped
    if (hasItem && equippedItem.durability !== undefined && equippedItem.maxDurability) {
      const durPct = (equippedItem.durability / equippedItem.maxDurability) * 100;
      const durColor = durPct >= 75 ? '#4CAF50' : durPct >= 50 ? '#FFEB3B' : durPct >= 25 ? '#FF9800' : '#F44336';
      drawStatBar(ctx, sx + 8, sy + slotSize - 6, slotSize - 16, durPct, 100, durColor);
    }
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // ── Bottom section: Active Summon + Resonances ──
  const bottomY = 420;

  // Active summon panel
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, 30, bottomY, 370, 150, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,0,0.2)';
  roundRect(ctx, 30, bottomY, 370, 150, 8);
  ctx.stroke();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.fillText('🐉 ACTIVE SUMMON', 45, bottomY + 18);

  if (activeSummon) {
    // Summon sprite
    const summonPortraitSize = 80;
    const summonPortraitX = 45;
    const summonPortraitY = bottomY + 30;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, summonPortraitX, summonPortraitY, summonPortraitSize, summonPortraitSize, 6);
    ctx.fill();

    // Try to load summon sprite
    try {
      const summonSprites = require('./summonSprites');
      const spritePath = summonSprites.getSpritePath(activeSummon.species);
      if (spritePath && fs.existsSync(spritePath)) {
        const img = await loadImage(spritePath);
        const scale = Math.min(summonPortraitSize / img.width, summonPortraitSize / img.height) * 0.9;
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, summonPortraitX + (summonPortraitSize - dw) / 2, summonPortraitY + (summonPortraitSize - dh) / 2, dw, dh);
      }
    } catch (e) {}

    // Summon info
    const summonInfoX = summonPortraitX + summonPortraitSize + 12;
    const registry = require('./summonRegistry');
    const species = registry.getSpecies(activeSummon.species);
    const summonName = activeSummon.nickname || species?.name || activeSummon.species;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
    ctx.fillText(summonName, summonInfoX, summonPortraitY + 15);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.fillText(`Lv.${activeSummon.level} ${activeSummon.rarity}`, summonInfoX, summonPortraitY + 33);
    ctx.fillText(`🧠 ${activeSummon.personality}`, summonInfoX, summonPortraitY + 48);

    // Loyalty bar
    drawStatBar(ctx, summonInfoX, summonPortraitY + 58, 150, activeSummon.loyalty, 100,
      activeSummon.loyalty >= 75 ? '#4CAF50' : activeSummon.loyalty >= 50 ? '#FFEB3B' : '#F44336');
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `10px "${FONT_REG}", monospace`;
    ctx.fillText(`💖 ${activeSummon.loyalty}/100`, summonInfoX, summonPortraitY + 75);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.fillText('No summon deployed', 45, bottomY + 50);
    ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(`Use ${params.prefix || '.jk'} summon deploy <id> to equip one`, 45, bottomY + 68);
  }

  // Resonances panel
  const resX = 420;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, resX, bottomY, 350, 150, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(79,195,247,0.2)';
  roundRect(ctx, resX, bottomY, 350, 150, 8);
  ctx.stroke();

  ctx.fillStyle = '#4FC3F7';
  ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.fillText('🔗 RESONANCES', resX + 15, bottomY + 18);

  const resonances = user?.activeResonances || [];
  if (resonances.length > 0) {
    try {
      const registry = require('./summonRegistry');
      for (let i = 0; i < Math.min(resonances.length, 5); i++) {
        const res = registry.getResonance(resonances[i]);
        if (!res) continue;
        const ry = bottomY + 38 + i * 20;
        ctx.fillStyle = '#4FC3F7';
        ctx.font = `12px "${FONT_REG}", monospace`;
        ctx.fillText(`${res.icon} ${res.name}`, resX + 15, ry);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `10px "${FONT_REG}", monospace`;
        ctx.fillText(res.desc, resX + 120, ry);
      }
    } catch (e) {}
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.fillText('No active resonances', resX + 15, bottomY + 40);
    ctx.fillText('Own diverse summons to activate', resX + 15, bottomY + 55);
  }

  // Trial passives count
  const passives = user?.unlockedSummonPassives || [];
  if (passives.length > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold 12px "${FONT_BOLD}", monospace`;
    ctx.fillText(`✨ ${passives.length} trial passives unlocked`, resX + 15, bottomY + 130);
  }

  // ── Footer ──
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 30, H - 40, W - 60, 25, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${user?.userId?.split('@')[0] || 'Unknown'}  |  ${user?.pvpWins || 0}W ${user?.pvpLosses || 0}L  |  💰 ${(user?.wallet || 0).toLocaleString()} Zeni`, W / 2, H - 25);

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderProfileCard,
  RANK_COLORS,
  STAT_COLORS,
  EQUIPMENT_SLOTS
};
