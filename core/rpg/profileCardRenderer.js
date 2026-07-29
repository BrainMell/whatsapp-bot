// ============================================
// 🎨 PROFILE CARD RENDERER v5 — real icon PNGs + auto-fetch sprites
// ============================================
// Uses RPG UI PNGs (hp bars, banners, panels) for chrome.
// Equipment slots use real icon PNGs from rpgasset/icons/essential/.
// Summon sprites auto-fetch from digi-api.com on cache miss.
// Avatar fallback uses a default character PNG instead of stick-figure.
// NO EMOJIS — all text/drawn elements (Oracle has no color emoji font).

const path = require('path');
const fs = require('fs');

let _canvas = null;
function getCanvas() { if (!_canvas) _canvas = require('canvas'); return _canvas; }

const FONTS_DIR = path.join(__dirname, '..', 'rpgasset', 'fonts');
const UI_DIR = path.join(__dirname, '..', 'rpgasset', 'ui');
const ICON_DIR = path.join(__dirname, '..', 'rpgasset', 'icons', 'essential');
const CHAR_DIR = path.join(__dirname, '..', 'rpgasset', 'characters');
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

// Cache loaded UI images
const _imageCache = new Map();
async function loadImageFrom(dir, name, cacheKey) {
  const key = cacheKey || `${dir}/${name}`;
  if (_imageCache.has(key)) return _imageCache.get(key);
  const { loadImage } = getCanvas();
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) return null;
  try {
    const img = await loadImage(p);
    _imageCache.set(key, img);
    return img;
  } catch (e) { return null; }
}
async function loadUI(name)    { return loadImageFrom(UI_DIR, name); }
async function loadIcon(name)  { return loadImageFrom(ICON_DIR, name); }
async function loadChar(name)  { return loadImageFrom(CHAR_DIR, name); }

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

function drawBar(ctx, x, y, w, h, pct, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * Math.min(1, Math.max(0, pct)), h, h / 2); ctx.fill();
}

function drawDot(ctx, x, y, r, color) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

// Draw 9-slice panel using a UI sprite
function draw9Slice(ctx, img, x, y, w, h, slice) {
  if (!img) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; roundRect(ctx, x, y, w, h, 8); ctx.fill(); return; }
  const s = slice || 8;
  const iw = img.width, ih = img.height;
  // Corners
  ctx.drawImage(img, 0, 0, s, s, x, y, s, s);
  ctx.drawImage(img, iw - s, 0, s, s, x + w - s, y, s, s);
  ctx.drawImage(img, 0, ih - s, s, s, x, y + h - s, s, s);
  ctx.drawImage(img, iw - s, ih - s, s, s, x + w - s, y + h - s, s, s);
  // Edges
  ctx.drawImage(img, s, 0, iw - 2 * s, s, x + s, y, w - 2 * s, s);
  ctx.drawImage(img, s, ih - s, iw - 2 * s, s, x + s, y + h - s, w - 2 * s, s);
  ctx.drawImage(img, 0, s, s, ih - 2 * s, x, y + s, s, h - 2 * s);
  ctx.drawImage(img, iw - s, s, s, ih - 2 * s, x + w - s, y + s, s, h - 2 * s);
  // Center
  ctx.drawImage(img, s, s, iw - 2 * s, ih - 2 * s, x + s, y + s, w - 2 * s, h - 2 * s);
}

const RANK_COLORS = {
  F: '#9E9E9E', E: '#8D6E63', D: '#795548', C: '#558B2F',
  B: '#2E7D32', A: '#1565C0', S: '#7B1FA2', SS: '#C2185B',
  SSS: '#E65100', GOD: '#FFD700', DRAGON: '#FF6F00'
};

const RANK_GRADIENTS = {
  F: ['#616161', '#9E9E9E'], E: ['#5D4037', '#8D6E63'],
  D: ['#4E342E', '#795548'], C: ['#33691E', '#558B2F'],
  B: ['#1B5E20', '#2E7D32'], A: ['#0D47A1', '#1565C0'],
  S: ['#4A148C', '#7B1FA2'], SS: ['#880E4F', '#C2185B'],
  SSS: ['#BF360C', '#E65100'], GOD: ['#F57F17', '#FFD700'],
  DRAGON: ['#E65100', '#FF6F00']
};

const STAT_COLORS = {
  hp: '#F44336', atk: '#FF9800', def: '#2196F3', mag: '#9C27B0',
  spd: '#4CAF50', luck: '#FFEB3B', crit: '#FF6F00', evasion: '#00BCD4'
};

const EQUIP_RARITY = {
  COMMON:    { border: '#9E9E9E', tint: 'rgba(158,158,158,0.1)',  label: 'C' },
  UNCOMMON:  { border: '#4CAF50', tint: 'rgba(76,175,80,0.12)',   label: 'U' },
  RARE:      { border: '#2196F3', tint: 'rgba(33,150,243,0.14)',  label: 'R' },
  EPIC:      { border: '#9C27B0', tint: 'rgba(156,39,176,0.14)',  label: 'E' },
  LEGENDARY: { border: '#FF9800', tint: 'rgba(255,152,0,0.17)',   label: 'L' },
  MYTHIC:    { border: '#E91E63', tint: 'rgba(233,30,99,0.17)',   label: 'M' }
};

// Equipment slot → icon PNG mapping.
// Uses real icon assets from rpgasset/icons/essential/ (80 PNGs from SpriteAssets).
// The folder is "essential UI icons" — there are no weapon/armor/helmet themed icons,
// so we use the closest semantic matches. When no good match exists, we still draw
// the short text label as fallback.
const EQUIPMENT_SLOTS = [
  { key: 'main_hand', label: 'Weapon',   short: 'WPN', icon: 'Hammer.png' },      // Hammer = closest weapon/tool metaphor
  { key: 'off_hand',  label: 'Off-Hand', short: 'OFF', icon: 'Book.png' },        // Book = spellbook/tome off-hand
  { key: 'armor',     label: 'Armor',    short: 'ARM', icon: 'Backpack.png' },    // Backpack = worn torso gear
  { key: 'helmet',    label: 'Helmet',   short: 'HLM', icon: 'Sun.png' },         // Sun = head/halo metaphor
  { key: 'gloves',    label: 'Gloves',   short: 'GLV', icon: 'Wrench.png' },      // Wrench = tool/grip metaphor
  { key: 'boots',     label: 'Boots',    short: 'BTS', icon: 'Exit.png' },        // Exit = movement metaphor
  { key: 'ring',      label: 'Ring',     short: 'RNG', icon: 'Key.png' },         // Key = jewelry metaphor
  { key: 'amulet',    label: 'Amulet',   short: 'AML', icon: 'Necklace.png' },    // Necklace = perfect match
  { key: 'cloak',     label: 'Cloak',    short: 'CLK', icon: 'Briefcase.png' }    // Briefcase = carried item
];

// Try a list of fallback icon names (in order) — returns first that exists
async function loadFirstIcon(icons) {
  for (const name of icons) {
    const img = await loadIcon(name);
    if (img) return img;
  }
  return null;
}

async function drawSummonEntry(ctx, summon, x, y, w, loadImage) {
  const portraitSize = 80;
  const portraitX = x + 15, portraitY = y;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
  roundRect(ctx, portraitX, portraitY, portraitSize, portraitSize, 6); ctx.stroke();

  try {
    const summonSprites = require('./summonSprites');
    // Auto-fetch from digi-api.com on cache miss (best-effort, doesn't block on failure)
    const spritePath = await summonSprites.getOrFetchSprite(summon.species, summon.species);
    if (spritePath && fs.existsSync(spritePath)) {
      const img = await loadImage(spritePath);
      const scale = Math.min(portraitSize / img.width, portraitSize / img.height) * 0.9;
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, portraitX + (portraitSize - dw) / 2, portraitY + (portraitSize - dh) / 2, dw, dh);
    } else {
      // No sprite available — draw species initial letter as fallback
      const registry = require('./summonRegistry');
      const sp = registry.getSpecies(summon.species);
      const initial = (sp?.name || summon.species).charAt(0).toUpperCase();
      ctx.fillStyle = 'rgba(255,215,0,0.4)';
      ctx.font = `bold 36px "${FONT_BOLD}", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(initial, portraitX + portraitSize / 2, portraitY + portraitSize / 2);
    }
  } catch (e) {}

  const registry = require('./summonRegistry');
  const species = registry.getSpecies(summon.species);
  const name = summon.nickname || species?.name || summon.species;
  const infoX = portraitX + portraitSize + 15;

  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(name, infoX, portraitY + 2);

  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `12px "${FONT_REG}", monospace`;
  ctx.fillText(`Lv.${summon.level} ${summon.rarity} ${summon.tier || 'BASE'} | ${summon.element}`, infoX, portraitY + 22);
  ctx.fillText(`Personality: ${summon.personality}`, infoX, portraitY + 38);

  drawBar(ctx, infoX, portraitY + 56, 150, 6, summon.loyalty / 100,
    summon.loyalty >= 75 ? '#4CAF50' : summon.loyalty >= 50 ? '#FFEB3B' : '#F44336');
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`Loyalty ${summon.loyalty}/100`, infoX, portraitY + 66);

  const isTamed = (summon.lineage || []).some(l => l.personality === 'TAMED');
  if (isTamed) {
    drawDot(ctx, infoX + 165, portraitY + 60, 4, '#4CAF50');
    ctx.fillStyle = '#4CAF50'; ctx.font = `bold 10px "${FONT_BOLD}", monospace`;
    ctx.fillText('TAMED', infoX + 175, portraitY + 56);
  }

  const echo = registry.getEcho(summon.echoId);
  if (echo) {
    ctx.fillStyle = '#4FC3F7'; ctx.font = `10px "${FONT_REG}", monospace`;
    ctx.fillText(`Echo: ${echo.name}`, infoX + 165, portraitY + 70);
  }

  ctx.textBaseline = 'alphabetic';
  return 95;
}

async function renderProfileCard(params) {
  const { user, classData, stats, equipStats, equipment, level, rank } = params;
  const activeSummons = params.activeSummons || (params.activeSummon ? [params.activeSummon] : []);
  ensureFonts();
  const { createCanvas, loadImage } = getCanvas();

  const W = 800, PAD = 20, GAP = 12;
  const rankColor = RANK_COLORS[rank] || RANK_COLORS.F;
  const rankGradient = RANK_GRADIENTS[rank] || RANK_GRADIENTS.F;

  // Load UI sprites
  const panelImg = await loadUI('banner.png'); // for panel backgrounds
  const hpBarImg = await loadUI('hp5.png'); // for stat bars

  const headerH = 90;
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
  const slotSize = 88, slotGap = 8;
  const equipGridH = 3 * slotSize + 2 * slotGap;
  const equipPanelH = 40 + equipGridH + 15;
  const topPanelH = Math.max(statsPanelH, equipPanelH);
  const summonEntryH = 95, summonGap = 8;
  const summonPanelH = activeSummons.length > 0 ? 35 + activeSummons.length * summonEntryH + (activeSummons.length - 1) * summonGap + 15 : 60;
  const resonances = user?.activeResonances || [];
  const resonancePanelH = 40 + Math.max(resonances.length, 1) * 22 + 15;
  const passives = user?.unlockedSummonPassives || [];
  const passivesH = passives.length > 0 ? 30 : 0;
  const footerH = 35;
  const H = PAD + headerH + GAP + topPanelH + GAP + summonPanelH + GAP + resonancePanelH + passivesH + GAP + footerH + PAD;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#1a1a2e'); bgGradient.addColorStop(0.5, '#16213e'); bgGradient.addColorStop(1, '#0f3460');
  ctx.fillStyle = bgGradient; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < W; i += 40) for (let j = 0; j < H; j += 40) ctx.fillRect(i, j, 1, 1);

  // Borders
  ctx.strokeStyle = rankColor; ctx.lineWidth = 4;
  roundRect(ctx, 8, 8, W - 16, H - 16, 12); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
  roundRect(ctx, 14, 14, W - 28, H - 28, 8); ctx.stroke();

  let y = PAD;

  // ══ HEADER ══
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, PAD, y, W - 2 * PAD, headerH, 8); ctx.fill();

  // Rank gradient bar
  const rankBarH = 8;
  const rankGrad = ctx.createLinearGradient(PAD, y, W - PAD, y);
  rankGrad.addColorStop(0, rankGradient[0]); rankGrad.addColorStop(0.5, rankGradient[1]); rankGrad.addColorStop(1, rankGradient[0]);
  ctx.fillStyle = rankGrad;
  roundRect(ctx, PAD, y, W - 2 * PAD, rankBarH, 4); ctx.fill();

  // Avatar
  const avatarSize = 55;
  const avatarX = PAD + 15, avatarY = y + rankBarH + 8;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 6); ctx.fill();

  if (params.pfpBuffer) {
    try {
      const pfpImg = await loadImage(params.pfpBuffer);
      ctx.save(); roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 6); ctx.clip();
      ctx.drawImage(pfpImg, avatarX, avatarY, avatarSize, avatarSize); ctx.restore();
    } catch (e) {}
  } else {
    // Avatar fallback: try a default character PNG based on class, else draw a hooded silhouette
    const classSpriteMap = {
      FIGHTER: 'Fighter1.png', WARRIOR: 'warrior1.png', BERSERKER: 'Berserker1.png',
      PALADIN: 'Paladin (1).png', ROGUE: 'Rogue1.png', NINJA: 'ninja1.png',
      MONK: 'Monk.png', MAGE: 'archmage1.png', ARCHMAGE: 'archmage6.png',
      WARLOCK: 'voidwalker1.png', VOIDWALKER: 'voidwalker5.png',
      CLERIC: 'cleric1.png', SAINT: 'saint1.png', DRUID: 'druid1.png',
      NECROMANCER: 'necromancer1.png', LICH: 'lich1.png',
      TYCOON: 'tycoon1.png', MERCHANT: 'merchant1.png'
    };
    const spriteFile = classSpriteMap[(classData?.name || '').toUpperCase()] || 'apprentice1.png';
    const charImg = await loadChar(spriteFile);
    if (charImg) {
      ctx.save(); roundRect(ctx, avatarX, avatarY, avatarSize, avatarSize, 6); ctx.clip();
      // Crop to top portion (head/torso) like the combat renderer does
      const cropTop = charImg.height * 0.3;
      const scale = Math.max(avatarSize / charImg.width, avatarSize / cropTop);
      const dw = charImg.width * scale, dh = cropTop * scale;
      ctx.drawImage(charImg, 0, 0, charImg.width, cropTop,
                    avatarX + (avatarSize - dw) / 2, avatarY + (avatarSize - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      // Final fallback: simple hooded silhouette
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + 20, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(avatarX + avatarSize / 2, avatarY + 55, 22, Math.PI, 0); ctx.fill();
    }
  }

  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 22px "${FONT_BOLD}", monospace`;
  ctx.fillText(user?.nickname || 'Adventurer', avatarX + avatarSize + 15, avatarY);

  ctx.fillStyle = rankColor; ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.fillText(`${classData?.name || 'Adventurer'}  |  Lv.${level || 1}`, avatarX + avatarSize + 15, avatarY + 28);

  // Rank badge
  const rankBadgeW = 80, rankBadgeH = 24;
  const rankBadgeX = W - PAD - rankBadgeW - 15, rankBadgeY = avatarY + 2;
  const badgeGrad = ctx.createLinearGradient(rankBadgeX, rankBadgeY, rankBadgeX + rankBadgeW, rankBadgeY);
  badgeGrad.addColorStop(0, rankGradient[0]); badgeGrad.addColorStop(1, rankGradient[1]);
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, rankBadgeX, rankBadgeY, rankBadgeW, rankBadgeH, 4); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 14px "${FONT_BOLD}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${rank}-RANK`, rankBadgeX + rankBadgeW / 2, rankBadgeY + 5);

  // XP bar
  const xpPct = params.xpPercent || 0;
  ctx.textAlign = 'left';
  drawBar(ctx, avatarX + avatarSize + 15, avatarY + 50, W - avatarX - avatarSize - 2 * PAD - 30, 6, xpPct / 100, '#4CAF50');
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.fillText(`XP ${xpPct}%`, W - PAD - 50, avatarY + 48);

  y += headerH + GAP;

  // ══ STATS + EQUIPMENT ══
  const statsX = PAD, statsW = 350;
  const equipX = PAD + statsW + GAP, equipW = W - PAD - equipX;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, statsX, y, statsW, topPanelH, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, statsX, y, statsW, topPanelH, 8); ctx.stroke();

  ctx.fillStyle = '#FFD700'; ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('STATS', statsX + 15, y + 12);

  for (let i = 0; i < statList.length; i++) {
    const s = statList[i], sy = y + 40 + i * 28, total = s.base + s.equip;
    const color = STAT_COLORS[s.key] || '#9E9E9E';

    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.textAlign = 'left'; ctx.fillText(s.label, statsX + 15, sy);

    ctx.fillStyle = color; ctx.fillText(`${s.base}`, statsX + 55, sy);

    if (s.equip > 0) {
      ctx.fillStyle = '#4CAF50'; ctx.font = `10px "${FONT_REG}", monospace`;
      ctx.fillText(`+${s.equip}`, statsX + 100, sy + 1);
    }

    drawBar(ctx, statsX + 140, sy + 3, statsW - 165, 8, total / s.max, color);

    ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 12px "${FONT_BOLD}", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(`${total}${s.suffix || ''}`, statsX + statsW - 15, sy);
  }
  ctx.textAlign = 'left';

  // Equipment panel
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, equipX, y, equipW, topPanelH, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  roundRect(ctx, equipX, y, equipW, topPanelH, 8); ctx.stroke();

  ctx.fillStyle = '#FFD700'; ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('EQUIPMENT', equipX + 15, y + 12);

  const gridW = 3 * slotSize + 2 * slotGap;
  const gridStartX = equipX + (equipW - gridW) / 2, gridStartY = y + 40;

  for (let i = 0; i < EQUIPMENT_SLOTS.length; i++) {
    const slot = EQUIPMENT_SLOTS[i];
    const col = i % 3, row = Math.floor(i / 3);
    const sx = gridStartX + col * (slotSize + slotGap), sy = gridStartY + row * (slotSize + slotGap);

    const equippedItem = equipment?.[slot.key];
    const hasItem = equippedItem && equippedItem !== null && typeof equippedItem === 'object';
    const itemRarity = hasItem ? (equippedItem.rarity || 'COMMON') : 'COMMON';
    const rarityCfg = EQUIP_RARITY[itemRarity] || EQUIP_RARITY.COMMON;

    // Slot bg tinted by rarity
    ctx.fillStyle = hasItem ? rarityCfg.tint : 'rgba(0,0,0,0.3)';
    roundRect(ctx, sx, sy, slotSize, slotSize, 6); ctx.fill();

    // Border colored by rarity — THICK for equipped
    ctx.strokeStyle = hasItem ? rarityCfg.border : 'rgba(255,255,255,0.1)';
    ctx.lineWidth = hasItem ? 3 : 1;
    roundRect(ctx, sx, sy, slotSize, slotSize, 6); ctx.stroke();

    // Slot icon (real PNG from rpgasset/icons/essential/)
    // Falls back to short text label if icon image can't be loaded
    const iconImg = await loadIcon(slot.icon);
    const iconSize = 40;
    const iconX = sx + (slotSize - iconSize) / 2, iconY = sy + 12;
    if (iconImg) {
      ctx.globalAlpha = hasItem ? 1.0 : 0.4;
      ctx.drawImage(iconImg, iconX, iconY, iconSize, iconSize);
      ctx.globalAlpha = 1.0;
    } else {
      // Fallback: short text label (WPN, OFF, ARM, etc.)
      ctx.fillStyle = hasItem ? rarityCfg.border : 'rgba(255,255,255,0.3)';
      ctx.font = `bold 18px "${FONT_BOLD}", monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(slot.short, sx + slotSize / 2, sy + slotSize / 2 - 12);
    }

    // Slot label below icon (always shown)
    ctx.fillStyle = hasItem ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
    ctx.font = `9px "${FONT_REG}", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(hasItem ? (equippedItem.name || slot.label).slice(0, 12) : slot.label, sx + slotSize / 2, sy + slotSize - 22);

    // Rarity letter badge (top-right)
    if (hasItem && itemRarity !== 'COMMON') {
      ctx.fillStyle = rarityCfg.border;
      ctx.font = `bold 10px "${FONT_BOLD}", monospace`;
      ctx.textAlign = 'right';
      ctx.fillText(rarityCfg.label, sx + slotSize - 6, sy + 6);
    }

    // Durability bar
    if (hasItem && equippedItem.durability !== undefined && equippedItem.maxDurability) {
      const durPct = equippedItem.durability / equippedItem.maxDurability;
      const durColor = durPct >= 0.75 ? '#4CAF50' : durPct >= 0.5 ? '#FFEB3B' : durPct >= 0.25 ? '#FF9800' : '#F44336';
      drawBar(ctx, sx + 8, sy + slotSize - 8, slotSize - 16, 4, durPct, durColor);
    }
  }

  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  y += topPanelH + GAP;

  // ══ ACTIVE SUMMONS ══
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, PAD, y, W - 2 * PAD, summonPanelH, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,0,0.2)';
  roundRect(ctx, PAD, y, W - 2 * PAD, summonPanelH, 8); ctx.stroke();

  ctx.fillStyle = '#FFD700'; ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText(`ACTIVE SUMMONS (${activeSummons.length})`, PAD + 15, y + 12);

  if (activeSummons.length > 0) {
    let summonY = y + 35;
    for (let i = 0; i < activeSummons.length; i++) {
      const entryH = await drawSummonEntry(ctx, activeSummons[i], PAD, summonY, W - 2 * PAD, loadImage);
      summonY += entryH + summonGap;
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = `14px "${FONT_REG}", monospace`;
    ctx.fillText('No summons deployed', PAD + 15, y + 38);
    ctx.font = `11px "${FONT_REG}", monospace`;
    ctx.fillText(`Use ${params.prefix || '.jk'} summon deploy <id> to equip one`, PAD + 15, y + 56);
  }

  y += summonPanelH + GAP;

  // ══ RESONANCES ══
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, PAD, y, W - 2 * PAD, resonancePanelH, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(79,195,247,0.2)';
  roundRect(ctx, PAD, y, W - 2 * PAD, resonancePanelH, 8); ctx.stroke();

  ctx.fillStyle = '#4FC3F7'; ctx.font = `bold 16px "${FONT_BOLD}", monospace`;
  ctx.fillText('RESONANCES', PAD + 15, y + 12);

  if (resonances.length > 0) {
    try {
      const registry = require('./summonRegistry');
      for (let i = 0; i < resonances.length; i++) {
        const res = registry.getResonance(resonances[i]);
        if (!res) continue;
        const ry = y + 38 + i * 22;
        drawDot(ctx, PAD + 20, ry + 5, 4, '#4FC3F7');
        ctx.fillStyle = '#4FC3F7'; ctx.font = `12px "${FONT_REG}", monospace`;
        ctx.fillText(res.name, PAD + 30, ry);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `10px "${FONT_REG}", monospace`;
        ctx.fillText(res.desc, PAD + 200, ry);
      }
    } catch (e) {}
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = `12px "${FONT_REG}", monospace`;
    ctx.fillText('No active resonances — own diverse summons to activate', PAD + 15, y + 38);
  }

  y += resonancePanelH;

  // ══ TRIAL PASSIVES ══
  if (passives.length > 0) {
    drawDot(ctx, PAD + 10, y + 10, 4, '#FFD700');
    ctx.fillStyle = '#FFD700'; ctx.font = `bold 13px "${FONT_BOLD}", monospace`;
    ctx.fillText(`${passives.length} trial passive${passives.length > 1 ? 's' : ''} unlocked`, PAD + 20, y + 5);
    y += passivesH;
  }

  y += GAP;

  // ══ FOOTER ══
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, PAD, y, W - 2 * PAD, footerH, 6); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = `10px "${FONT_REG}", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`${user?.userId?.split('@')[0] || 'Unknown'}  |  ${user?.pvpWins || 0}W ${user?.pvpLosses || 0}L  |  ${(user?.wallet || 0).toLocaleString()} Zeni`, W / 2, y + 12);

  return canvas.toBuffer('image/png');
}

module.exports = { renderProfileCard, RANK_COLORS, RANK_GRADIENTS, STAT_COLORS, EQUIP_RARITY, EQUIPMENT_SLOTS };
