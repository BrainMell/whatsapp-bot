// ============================================
// 🎨 PROFILE CARD RENDERER — node-canvas (DYNAMIC LAYOUT)
// ============================================
// All sections use a running Y cursor — no hardcoded positions.
// Card height is computed from total content, so nothing ever overlaps.

const path = require('path');
const fs = require('fs');

// Lazy-load canvas
let _canvas = null;
function getCanvas() {
  if (!_canvas) _canvas = require('canvas');
  return _canvas;
}

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
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBar(ctx, x, y, w, h, pct, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * Math.min(1, Math.max(0, pct)), h, h / 2);
  ctx.fill();
}

const RANK_COLORS = {
  F: '#9E9E9E', E: '#8D6E63', D: '#795548', C: '#558B2F',
  B: '#2E7D32', A: '#1565C0', S: '#7B1FA2', SS: '#C2185B',
  SSS: '#E65100', GOD: '#FFD700', DRAGON: '#FF6F00'
};

const STAT_COLORS = {
  hp: '#F44336', atk: '#FF9800', def: '#2196F3', mag: '#9C27B0',
  spd: '#4CAF50', luck: '#FFEB3B', crit: '#FF6F00', evasion: '#00BCD4'
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

// ─────────────────────────────────────────────────────────────
// MAIN RENDER — dynamic height, cursor-based layout
// ─────────────────────────────────────────────────────────────

async function renderProfileCard(params) {
  const { user, classData, stats, equipStats, equipment, level, rank, activeSummon } = params;
  ensureFonts();
  const { createCanvas, loadImage } = getCanvas();

  const W = 800;
  const PAD = 20;       // outer padding
  const GAP = 12;       // gap between sections
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.F;

  // ── STEP 1: Compute all section heights ──
  const headerH = 80;
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

  const statsPanelH = 40 + statList.length * 28 + 15; // header + rows + padding

  // Equipment grid: 3 columns × 3 rows of 88px slots + gaps
  const slotSize = 88;
  const slotGap = 8;
  const equipGridH = 3 * slotSize + 2 * slotGap; // 280
  const equipPanelH = 40 + equipGridH + 15; // header + grid + padding = 335

  // Top panels use the taller of stats/equip
  const topPanelH = Math.max(statsPanelH, equipPanelH);

  // Active summon panel
  const summonPanelH = activeSummon ? 200 : 80;

  // Resonances panel
  const resonances = user?.activeResonances || [];
  const resonancePanelH = 40 + Math.max(resonances.length, 1) * 22 + 15;

  // Trial passives
  const passives = user?.unlockedSummonPassives || [];
  const passivesH = passives.length > 0 ? 30 : 0;

  // Footer
  const footerH = 35;

  // Total height
  const H = PAD + headerH + GAP + topPanelH + GAP + summonPanelH + GAP + resonancePanelH + passivesH + GAP + footerH + PAD;

  // ── STEP 2: Create canvas with computed height ──
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#1a1a2e');
  bgGradient.addColorStop(0.5, '#16213e');
  bgGradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < W; i += 40)
    for (let j = 0; j < H; j += 40)
      ctx.fillRect(i, j, 1, 1);

  // Outer border
  ctx.strokeStyle = rankColor;
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, W - 16, H - 16, 12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 14, 14, W - 28, H - 28, 8);
  ctx.stroke();

  // ── Running Y cursor ──
  let y = PAD;

  // ═══════════════════════════════════════════
  // SECTION 1: HEADER
  // ═══════════════════════════════════════════
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, PAD, y, W - 2 * PAD, headerH, 8);
  ctx.fill();

  // Avatar
  const avatarSize = 55;
  const avatarX = PAD + 15;
  const avatarY = y + 12;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 6);
  ctx.fill();

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
    ctx.font = `26px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('👤', avatarX + avatarSize / 2, avatarY + avatarSize / 2);
  }

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 22px "${FONT_BOLD}", monospace`;
  ctx.fillText(user?.nickname || 'Adventurer', avatarX + avatarSize + 15, y + 12);

  ctx.fillStyle = rankColor;
  ctx.font = `14px "${FONT_REG}", monospace`;
  ctx.fillText(`${classData?.icon || '🛡️'} ${classData?.name || 'Adventurer'}  |  ⭐ Lv.${level || 1}  |  🏆 ${rank}-Rank`, avatarX + avatarSize + 15, y + 40);

  // XP bar
  const xpPct = params.xpPercent || 0;
  drawBar(ctx, avatarX + avatarSize + 15, y + 60, W - avatarX - avatarSize - 2 * PAD - 30, 8, xpPct / 100, '#4CAF50');
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`XP ${xpPct}%`, W - PAD - 60, y + 58);

  y += headerH + GAP;

  // ═══════════════════════════════════════════
  // SECTION 2: STATS (left) + EQUIPMENT (right) — side by side
  // ═══════════════════════════════════════════
  const statsX = PAD;
  const statsW = 350;
  const equipX = PAD + statsW + GAP;
  const equipW = W - PAD - equipX;

  // Stats panel background
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, statsX, y, statsW, topPanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, statsX, y, statsW, topPanelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('📊 STATS', statsX + 15, y + 12);

  for (let i = 0; i < statList.length; i++) {
    const s = statList[i];
    const sy = y + 40 + i * 28;
    const total = s.base + s.equip;
    const color = STAT_COLORS[s.key] || '#9E9E9E';

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(s.label, statsX + 15, sy);

    ctx.fillStyle = color;
    ctx.fillText(`${s.base}`, statsX + 55, sy);

    if (s.equip > 0) {
      ctx.fillStyle = '#4CAF50';
      ctx.font = `10px "${FONT_REG}", monospace`;
      ctx.fillText(`+${s.equip}`, statsX + 100, sy + 1);
    }

    drawBar(ctx, statsX + 140, sy + 3, statsW - 165, 8, total / s.max, color);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 12px "${FONT_BOLD}", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${total}${s.suffix || ''}`, statsX + statsW - 15, sy);
  }
  ctx.textAlign = 'left';

  // Equipment panel background
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, equipX, y, equipW, topPanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, equipX, y, equipW, topPanelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('⚔️ EQUIPMENT', equipX + 15, y + 12);

  // 3×3 grid — centered in the panel
  const gridW = 3 * slotSize + 2 * slotGap;
  const gridStartX = equipX + (equipW - gridW) / 2;
  const gridStartY = y + 40;

  for (let i = 0; i < EQUIPMENT_SLOTS.length; i++) {
    const slot = EQUIPMENT_SLOTS[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sx = gridStartX + col * (slotSize + slotGap);
    const sy = gridStartY + row * (slotSize + slotGap);

    const equippedItem = equipment?.[slot.key];
    const hasItem = equippedItem && equippedItem !== null && typeof equippedItem === 'object';

    ctx.fillStyle = hasItem ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)';
    roundRect(ctx, sx, sy, slotSize, slotSize, 6);
    ctx.fill();
    ctx.strokeStyle = hasItem ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, sx, sy, slotSize, slotSize, 6);
    ctx.stroke();

    ctx.fillStyle = hasItem ? '#FFD700' : 'rgba(255,255,255,0.3)';
    ctx.font = `26px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.icon, sx + slotSize / 2, sy + slotSize / 2 - 8);

    ctx.fillStyle = hasItem ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
    ctx.font = `9px "${FONT_REG}", monospace`;
    ctx.fillText(hasItem ? (equippedItem.name || slot.label).slice(0, 12) : slot.label, sx + slotSize / 2, sy + slotSize - 14);

    if (hasItem && equippedItem.durability !== undefined && equippedItem.maxDurability) {
      const durPct = (equippedItem.durability / equippedItem.maxDurability);
      const durColor = durPct >= 0.75 ? '#4CAF50' : durPct >= 0.5 ? '#FFEB3B' : durPct >= 0.25 ? '#FF9800' : '#F44336';
      drawBar(ctx, sx + 8, sy + slotSize - 8, slotSize - 16, 5, durPct, durColor);
    }
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  y += topPanelH + GAP;

  // ═══════════════════════════════════════════
  // SECTION 3: ACTIVE SUMMON (dynamic height)
  // ═══════════════════════════════════════════
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, PAD, y, W - 2 * PAD, summonPanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,0,0.2)';
  roundRect(ctx, PAD, y, W - 2 * PAD, summonPanelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('🐉 ACTIVE SUMMON', PAD + 15, y + 12);

  if (activeSummon) {
    const portraitSize = 100;
    const portraitX = PAD + 15;
    const portraitY = y + 35;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 6);
    ctx.fill();

    try {
      const summonSprites = require('./summonSprites');
      const spritePath = summonSprites.getSpritePath(activeSummon.species);
      if (spritePath && fs.existsSync(spritePath)) {
        const img = await loadImage(spritePath);
        const scale = Math.min(portraitSize / img.width, portraitSize / img.height) * 0.9;
        const dw = img.width * scale;
        const dh = img.height * scale;
        ctx.drawImage(img, portraitX + (portraitSize - dw) / 2, portraitY + (portraitSize - dh) / 2, dw, dh);
      }
    } catch (e) {}

    const registry = require('./summonRegistry');
    const species = registry.getSpecies(activeSummon.species);
    const summonName = activeSummon.nickname || species?.name || activeSummon.species;
    const infoX = portraitX + portraitSize + 15;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 18px "${FONT_BOLD}", monospace`;
    ctx.fillText(summonName, infoX, portraitY + 10);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `13px "${FONT_REG}", monospace`;
    ctx.fillText(`Lv.${activeSummon.level} ${activeSummon.rarity} ${activeSummon.tier || 'BASE'} | ${activeSummon.element}/${activeSummon.archetype}`, infoX, portraitY + 32);
    ctx.fillText(`🧠 ${activeSummon.personality} | ${species?.icon || '🐉'} ${activeSummon.element}`, infoX, portraitY + 50);

    // Loyalty bar
    drawBar(ctx, infoX, portraitY + 68, 200, 8, activeSummon.loyalty / 100,
      activeSummon.loyalty >= 75 ? '#4CAF50' : activeSummon.loyalty >= 50 ? '#FFEB3B' : '#F44336');
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(`💖 Loyalty ${activeSummon.loyalty}/100`, infoX, portraitY + 82);

    // Echo info
    const echo = registry.getEcho(activeSummon.echoId);
    if (echo) {
      ctx.fillStyle = '#4FC3F7';
      ctx.font = `12px "${FONT_REG}", monospace`;
      ctx.fillText(`${echo.icon} ${echo.name} — ${echo.desc}`, infoX, portraitY + 105);
    }

    // Tamed indicator
    const isTamed = (activeSummon.lineage || []).some(l => l.personality === 'TAMED');
    if (isTamed) {
      ctx.fillStyle = '#4CAF50';
      ctx.font = `bold 12px "${FONT_BOLD}", monospace`;
      ctx.fillText('✨ TAMED (+20% stats)', infoX, portraitY + 125);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.fillText('No summon deployed', PAD + 15, y + 45);
    ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(`Use ${params.prefix || '.jk'} summon deploy <id> to equip one`, PAD + 15, y + 63);
  }

  y += summonPanelH + GAP;

  // ═══════════════════════════════════════════
  // SECTION 4: RESONANCES (dynamic height)
  // ═══════════════════════════════════════════
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, PAD, y, W - 2 * PAD, resonancePanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(79,195,247,0.2)';
  roundRect(ctx, PAD, y, W - 2 * PAD, resonancePanelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#4FC3F7';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('🔗 RESONANCES', PAD + 15, y + 12);

  if (resonances.length > 0) {
    try {
      const registry = require('./summonRegistry');
      for (let i = 0; i < resonances.length; i++) {
        const res = registry.getResonance(resonances[i]);
        if (!res) continue;
        const ry = y + 38 + i * 22;
        ctx.fillStyle = '#4FC3F7';
        ctx.font = `12px "${FONT_REG}", monospace`;
        ctx.fillText(`${res.icon} ${res.name}`, PAD + 15, ry);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `10px "${FONT_REG}", monospace`;
        ctx.fillText(res.desc, PAD + 200, ry);
      }
    } catch (e) {}
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.fillText('No active resonances — own diverse summons to activate', PAD + 15, y + 38);
  }

  y += resonancePanelH;

  // ═══════════════════════════════════════════
  // SECTION 5: TRIAL PASSIVES (if any)
  // ═══════════════════════════════════════════
  if (passives.length > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold 13px "${FONT_BOLD}", monospace`;
    ctx.fillText(`✨ ${passives.length} trial passive${passives.length > 1 ? 's' : ''} unlocked`, PAD + 15, y + 5);
    y += passivesH;
  }

  y += GAP;

  // ═══════════════════════════════════════════
  // SECTION 6: FOOTER
  // ═══════════════════════════════════════════
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, PAD, y, W - 2 * PAD, footerH, 6);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${user?.userId?.split('@')[0] || 'Unknown'}  |  ${user?.pvpWins || 0}W ${user?.pvpLosses || 0}L  |  💰 ${(user?.wallet || 0).toLocaleString()} Zeni`, W / 2, y + 12);

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderProfileCard,
  RANK_COLORS,
  STAT_COLORS,
  EQUIPMENT_SLOTS
};
