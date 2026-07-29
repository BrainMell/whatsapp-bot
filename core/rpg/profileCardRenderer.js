// ============================================
// 🎨 PROFILE CARD RENDERER — node-canvas (DYNAMIC LAYOUT v2)
// ============================================
// All sections use a running Y cursor — no hardcoded positions.
// Card height is computed from total content, so nothing ever overlaps.
// Supports multiple active summons, rank gradient bar, equipment rarity colors.

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

// Rank gradient pairs (from → to) for the rank bar
const RANK_GRADIENTS = {
  F:   ['#616161', '#9E9E9E'],
  E:   ['#5D4037', '#8D6E63'],
  D:   ['#4E342E', '#795548'],
  C:   ['#33691E', '#558B2F'],
  B:   ['#1B5E20', '#2E7D32'],
  A:   ['#0D47A1', '#1565C0'],
  S:   ['#4A148C', '#7B1FA2'],
  SS:  ['#880E4F', '#C2185B'],
  SSS: ['#BF360C', '#E65100'],
  GOD: ['#F57F17', '#FFD700'],
  DRAGON: ['#E65100', '#FF6F00']
};

const STAT_COLORS = {
  hp: '#F44336', atk: '#FF9800', def: '#2196F3', mag: '#9C27B0',
  spd: '#4CAF50', luck: '#FFEB3B', crit: '#FF6F00', evasion: '#00BCD4'
};

// Equipment rarity → border color + bg tint
const EQUIP_RARITY = {
  COMMON:    { border: 'rgba(158,158,158,0.5)',  tint: 'rgba(158,158,158,0.08)',  label: 'C' },
  UNCOMMON:  { border: 'rgba(76,175,80,0.5)',    tint: 'rgba(76,175,80,0.1)',     label: 'U' },
  RARE:      { border: 'rgba(33,150,243,0.6)',   tint: 'rgba(33,150,243,0.12)',   label: 'R' },
  EPIC:      { border: 'rgba(156,39,176,0.6)',   tint: 'rgba(156,39,176,0.12)',   label: 'E' },
  LEGENDARY: { border: 'rgba(255,152,0,0.7)',    tint: 'rgba(255,152,0,0.15)',    label: 'L' },
  MYTHIC:    { border: 'rgba(233,30,99,0.7)',    tint: 'rgba(233,30,99,0.15)',    label: 'M' }
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
// Draw a single summon entry (portrait + stats) — used in a loop
// ─────────────────────────────────────────────────────────────
async function drawSummonEntry(ctx, summon, x, y, w, loadImage) {
  const portraitSize = 80;
  const portraitX = x + 15;
  const portraitY = y;

  // Portrait bg
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 6);
  ctx.fill();

  // Load sprite
  try {
    const summonSprites = require('./summonSprites');
    const spritePath = summonSprites.getSpritePath(summon.species);
    if (spritePath && fs.existsSync(spritePath)) {
      const img = await loadImage(spritePath);
      const scale = Math.min(portraitSize / img.width, portraitSize / img.height) * 0.9;
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, portraitX + (portraitSize - dw) / 2, portraitY + (portraitSize - dh) / 2, dw, dh);
    }
  } catch (e) {}

  const registry = require('./summonRegistry');
  const species = registry.getSpecies(summon.species);
  const name = summon.nickname || species?.name || summon.species;
  const infoX = portraitX + portraitSize + 15;
  const entryH = 95; // fixed entry height

  // Name + level
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(name, infoX, portraitY + 2);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `12px "${FONT_REG}", monospace`;
  ctx.fillText(`Lv.${summon.level} ${summon.rarity} ${summon.tier || 'BASE'} | ${summon.element}`, infoX, portraitY + 22);
  ctx.fillText(`🧠 ${summon.personality}`, infoX, portraitY + 38);

  // Loyalty bar
  drawBar(ctx, infoX, portraitY + 56, 150, 6, summon.loyalty / 100,
    summon.loyalty >= 75 ? '#4CAF50' : summon.loyalty >= 50 ? '#FFEB3B' : '#F44336');
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`💖 ${summon.loyalty}/100`, infoX, portraitY + 66);

  // Tamed + echo (compact, right side)
  const isTamed = (summon.lineage || []).some(l => l.personality === 'TAMED');
  if (isTamed) {
    ctx.fillStyle = '#4CAF50';
    ctx.font = `bold 10px "${FONT_BOLD}", monospace`;
    ctx.fillText('✨ TAMED', infoX + 165, portraitY + 56);
  }

  const echo = registry.getEcho(summon.echoId);
  if (echo) {
    ctx.fillStyle = '#4FC3F7';
    ctx.font = `10px "${FONT_REG}", monospace`;
    ctx.fillText(`${echo.icon} ${echo.name}`, infoX + 165, portraitY + 70);
  }

  ctx.textBaseline = 'alphabetic';
  return entryH;
}

// ─────────────────────────────────────────────────────────────
// MAIN RENDER — dynamic height, cursor-based layout
// ─────────────────────────────────────────────────────────────

async function renderProfileCard(params) {
  const { user, classData, stats, equipStats, equipment, level, rank } = params;
  // Support both single activeSummon and array activeSummons
  const activeSummons = params.activeSummons || (params.activeSummon ? [params.activeSummon] : []);

  ensureFonts();
  const { createCanvas, loadImage } = getCanvas();

  const W = 800;
  const PAD = 20;
  const GAP = 12;
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.F;
  const rankGradient = RANK_GRADIENTS[rank] || RANK_GRADIENTS.F;

  // ── STEP 1: Compute all section heights ──
  const headerH = 90; // taller for rank gradient bar
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

  const statsPanelH = 40 + statList.length * 28 + 15;
  const slotSize = 88;
  const slotGap = 8;
  const equipGridH = 3 * slotSize + 2 * slotGap;
  const equipPanelH = 40 + equipGridH + 15;
  const topPanelH = Math.max(statsPanelH, equipPanelH);

  // Active summons — dynamic: 35px header + 95px per summon + 10px gap between + 15px padding
  const summonEntryH = 95;
  const summonGap = 8;
  const summonPanelH = activeSummons.length > 0
    ? 35 + activeSummons.length * summonEntryH + (activeSummons.length - 1) * summonGap + 15
    : 60;

  // Resonances
  const resonances = user?.activeResonances || [];
  const resonancePanelH = 40 + Math.max(resonances.length, 1) * 22 + 15;

  // Trial passives
  const passives = user?.unlockedSummonPassives || [];
  const passivesH = passives.length > 0 ? 30 : 0;

  // Footer
  const footerH = 35;

  // Total height
  const H = PAD + headerH + GAP + topPanelH + GAP + summonPanelH + GAP + resonancePanelH + passivesH + GAP + footerH + PAD;

  // ── STEP 2: Create canvas ──
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

  // Outer border (rank-colored)
  ctx.strokeStyle = rankColor;
  ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, W - 16, H - 16, 12);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, 14, 14, W - 28, H - 28, 8);
  ctx.stroke();

  let y = PAD;

  // ═══════════════════════════════════════════
  // SECTION 1: HEADER with RANK GRADIENT BAR
  // ═══════════════════════════════════════════
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, PAD, y, W - 2 * PAD, headerH, 8);
  ctx.fill();

  // Rank gradient bar (full width strip at top of header)
  const rankBarH = 8;
  const rankGrad = ctx.createLinearGradient(PAD, y, W - PAD, y);
  rankGrad.addColorStop(0, rankGradient[0]);
  rankGrad.addColorStop(0.5, rankGradient[1]);
  rankGrad.addColorStop(1, rankGradient[0]);
  ctx.fillStyle = rankGrad;
  roundRect(ctx, PAD, y, W - 2 * PAD, rankBarH, 4);
  ctx.fill();

  // Avatar
  const avatarSize = 55;
  const avatarX = PAD + 15;
  const avatarY = y + rankBarH + 8;
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
  ctx.fillText(user?.nickname || 'Adventurer', avatarX + avatarSize + 15, avatarY);

  ctx.fillStyle = rankColor;
  ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.fillText(`${classData?.icon || '🛡️'} ${classData?.name || 'Adventurer'}  |  ⭐ Lv.${level || 1}`, avatarX + avatarSize + 15, avatarY + 28);

  // Rank badge with gradient fill
  const rankBadgeW = 80;
  const rankBadgeH = 24;
  const rankBadgeX = W - PAD - rankBadgeW - 15;
  const rankBadgeY = avatarY + 2;
  const badgeGrad = ctx.createLinearGradient(rankBadgeX, rankBadgeY, rankBadgeX + rankBadgeW, rankBadgeY);
  badgeGrad.addColorStop(0, rankGradient[0]);
  badgeGrad.addColorStop(1, rankGradient[1]);
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, rankBadgeX, rankBadgeY, rankBadgeW, rankBadgeH, 4);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${rank}-RANK`, rankBadgeX + rankBadgeW / 2, rankBadgeY + 5);

  // XP bar
  const xpPct = params.xpPercent || 0;
  ctx.textAlign = 'left';
  drawBar(ctx, avatarX + avatarSize + 15, avatarY + 50, W - avatarX - avatarSize - 2 * PAD - 30, 6, xpPct / 100, '#4CAF50');
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`XP ${xpPct}%`, W - PAD - 50, avatarY + 48);

  y += headerH + GAP;

  // ═══════════════════════════════════════════
  // SECTION 2: STATS (left) + EQUIPMENT (right)
  // ═══════════════════════════════════════════
  const statsX = PAD;
  const statsW = 350;
  const equipX = PAD + statsW + GAP;
  const equipW = W - PAD - equipX;

  // Stats panel
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, statsX, y, statsW, topPanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
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

  // Equipment panel
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, equipX, y, equipW, topPanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, equipX, y, equipW, topPanelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('⚔️ EQUIPMENT', equipX + 15, y + 12);

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
    const itemRarity = hasItem ? (equippedItem.rarity || 'COMMON') : 'COMMON';
    const rarityCfg = EQUIP_RARITY[itemRarity] || EQUIP_RARITY.COMMON;

    // Slot bg — tinted by rarity if equipped
    ctx.fillStyle = hasItem ? rarityCfg.tint : 'rgba(0,0,0,0.3)';
    roundRect(ctx, sx, sy, slotSize, slotSize, 6);
    ctx.fill();

    // Slot border — colored by rarity if equipped
    ctx.strokeStyle = hasItem ? rarityCfg.border : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = hasItem ? 2 : 1;
    roundRect(ctx, sx, sy, slotSize, slotSize, 6);
    ctx.stroke();

    // Slot icon
    ctx.fillStyle = hasItem ? '#FFD700' : 'rgba(255,255,255,0.3)';
    ctx.font = `24px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(slot.icon, sx + slotSize / 2, sy + slotSize / 2 - 12);

    // Item name
    ctx.fillStyle = hasItem ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
    ctx.font = `9px "${FONT_REG}", monospace`;
    ctx.fillText(hasItem ? (equippedItem.name || slot.label).slice(0, 12) : slot.label, sx + slotSize / 2, sy + slotSize - 20);

    // Rarity letter badge (top-right corner of slot)
    if (hasItem && itemRarity !== 'COMMON') {
      ctx.fillStyle = rarityCfg.border.replace('0.5', '0.9').replace('0.6', '0.9').replace('0.7', '0.9');
      ctx.font = `bold 9px "${FONT_BOLD}", monospace`;
      ctx.fillText(rarityCfg.label, sx + slotSize - 10, sy + 10);
    }

    // Durability bar
    if (hasItem && equippedItem.durability !== undefined && equippedItem.maxDurability) {
      const durPct = (equippedItem.durability / equippedItem.maxDurability);
      const durColor = durPct >= 0.75 ? '#4CAF50' : durPct >= 0.5 ? '#FFEB3B' : durPct >= 0.25 ? '#FF9800' : '#F44336';
      drawBar(ctx, sx + 8, sy + slotSize - 8, slotSize - 16, 4, durPct, durColor);
    }
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  y += topPanelH + GAP;

  // ═══════════════════════════════════════════
  // SECTION 3: ACTIVE SUMMONS (plural — dynamic height)
  // ═══════════════════════════════════════════
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, PAD, y, W - 2 * PAD, summonPanelH, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,0,0.2)';
  roundRect(ctx, PAD, y, W - 2 * PAD, summonPanelH, 8);
  ctx.stroke();

  ctx.fillStyle = '#FFD700';
  ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText(`🐉 ACTIVE SUMMONS (${activeSummons.length})`, PAD + 15, y + 12);

  if (activeSummons.length > 0) {
    let summonY = y + 35;
    for (let i = 0; i < activeSummons.length; i++) {
      const entryH = await drawSummonEntry(ctx, activeSummons[i], PAD, summonY, W - 2 * PAD, loadImage);
      summonY += entryH + summonGap;
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.fillText('No summons deployed', PAD + 15, y + 38);
    ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(`Use ${params.prefix || '.jk'} summon deploy <id> to equip one`, PAD + 15, y + 56);
  }

  y += summonPanelH + GAP;

  // ═══════════════════════════════════════════
  // SECTION 4: RESONANCES
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
  // SECTION 5: TRIAL PASSIVES
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
  RANK_GRADIENTS,
  STAT_COLORS,
  EQUIP_RARITY,
  EQUIPMENT_SLOTS
};
