// ============================================
// 🎨 COMBAT IMAGE GENERATOR V3.7 - FINAL LAYERING
// ============================================
// Normalized Canvas: 1024x687
// Coordinates Offset: X+694, Y+356

const { Jimp, loadFont, FONT_SANS_32_WHITE, FONT_SANS_16_WHITE } = require('jimp');
const pureimage = require('pureimage');
const { PassThrough } = require('stream');
const path = require('path');
const fs = require('fs');

const botConfig = require('../botConfig');

const getPrefix = () => botConfig.getPrefix();

const getPaths = () => {
    const base = botConfig.getRPGAssetPath('');
    return {
        characters: path.join(base, 'characters'),
        enemies: path.join(base, 'enemies'),
        environment: path.join(base, 'environment'),
        ui: path.join(base, 'ui')
    };
};

let FANTASY_FONT;
let fontLoaded = false;

async function ensureFontLoaded() {
    if (!fontLoaded) {
        const UI_PATH = getPaths().ui;
        FANTASY_FONT = pureimage.registerFont(path.join(UI_PATH, 'fantesy.ttf'), 'FantasyFont');
        await FANTASY_FONT.load();
        fontLoaded = true;
    }
}

async function createRankTextImage(text, width = 573, height = 118) {
    await ensureFontLoaded();
    const pCanvas = pureimage.make(width, height);
    const ctx = pCanvas.getContext('2d');

    // Ensure transparency
    ctx.clearRect(0, 0, width, height); 
    
    ctx.fillStyle = '#000000'; // Black color
    ctx.font = "70pt 'FantasyFont'"; // 2 times larger
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.fillText(text, width / 2, height / 2 - 15); // 10 pixels higher (was -5)

    const buffer = await new Promise((resolve, reject) => {
        const stream = new PassThrough();
        const chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
        pureimage.encodePNGToStream(pCanvas, stream).catch(reject);
    });

    return await Jimp.read(buffer);
}

const CANVAS_W = 1024;
const CANVAS_H = 687;
const OFF_X = 694;
const OFF_Y = 356;

const CHARACTER_SPRITES = {
    FIGHTER: ['Fighter1.png', 'fighter2.png', 'fighter3.png'],
    SCOUT: ['scout1.png', 'scout2.png', 'scout3.png', 'sout4.png'],
    APPRENTICE: ['apprentice1.png', 'apprentice2.png', 'apprentice3.png', 'apprentice4.png'],
    ACOLYTE: ['acolyte.png'],
    WARRIOR: ['warrior1.png', 'warrior2.png', 'warrior3.png', 'warrior4.png'],
    WARLORD: ['Warlord1.png', 'warlord2.png', 'warlord3.png'],
    BERSERKER: ['Berserker1.png', 'Berserker2.png', 'Berserker3.png'],
    DOOMSLAYER: ['DoomSlayer1.png', 'DoomSlayer2.png'],
    PALADIN: ['Paladin (1).png', 'Paladin (2).png', 'Paladin (3).png', 'Paladin (4).png', 'Paladin (5).png', 'Paladin (6).png', 'Paladin (7).png', 'Paladin (8).png'],
    TEMPLAR: ['Templar (1).png', 'Templar (2).png', 'Templar (3).png', 'Templar (4).png', 'Templar (5).png', 'Templar (6).png', 'Templar (7).png', 'Templar (8).png', 'Templar (9).png'],
    ROGUE: ['Rogue (1).png', 'Rogue (2).png', 'Rogue (3).png', 'Rogue (4).png'],
    NIGHTBLADE: ['Nightblade (1).png', 'Nightblade (2).png', 'Nightblade (3).png', 'Nightblade (4).png', 'Nightblade (5).png', 'Nightblade (6).png'],
    MONK: ['Monk.png'],
    ZENMASTER: ['zenmaster.png'],
    NINJA: ['ninja (1).png', 'ninja (2).png', 'ninja (3).png', 'ninja (4).png', 'ninja (5).png'],
    MAGE: ['archmage (1).png', 'archmage (2).png', 'archmage (3).png', 'archmage (4).png', 'archmage (5).png'],
    ARCHMAGE: ['archmage (6).png', 'archmage (7).png', 'archmage (8).png', 'archmage (9).png', 'archmage (10).png', 'archmage (11).png', 'archmage (12).png'],
    WARLOCK: ['voidwalker (1).png', 'voidwalker (2).png', 'voidwalker (3).png', 'voidwalker (4).png'],
    VOIDWALKER: ['voidwalker (5).png', 'voidwalker (6).png', 'voidwalker (7).png', 'voidwalker (8).png', 'voidwalker (9).png'],
    ELEMENTALIST: ['elementalist (1).png', 'elementalist (2).png', 'elementalist (3).png', 'elementalist (4).png'],
    CLERIC: ['cleric (1).png', 'cleric (2).png', 'cleric (3).png', 'cleric (4).png', 'cleric (5).png', 'cleric (6).png'],
    SAINT: ['saint (1).png', 'saint (2).png', 'saint (3).png', 'saint (4).png'],
    DRUID: ['druid (1).png', 'druid (2).png', 'druid (3).png', 'druid (4).png', 'druid (5).png', 'druid (6).png'],
    ARCHDRUID: ['archdruid (1).png', 'archdruid (2).png', 'archdruid (3).png', 'archdruid (4).png', 'archdruid (5).png', 'archdruid (6).png', 'archdruid (7).png', 'archdruid (8).png', 'archdruid (9).png'],
    NECROMANCER: ['necromancer.png'],
    LICH: ['lich.png'],
    MERCHANT: ['merchant.png'],
    TYCOON: ['tycoon.png'],
    CHRONOMANCER: ['timelord (1).png', 'timelord (2).png', 'timelord (3).png', 'timelord (4).png', 'timelord (5).png'],
    TIMELORD: ['timelord (1).png', 'timelord (2).png', 'timelord (3).png', 'timelord (4).png', 'timelord (5).png'],
    SAMURAI: ['samuri (1).png', 'samuri (2).png', 'samuri (3).png', 'samuri (4).png', 'samuri (5).png', 'samuri (6).png', 'samuri (7).png', 'samuri (8).png', 'samuri (9).png', 'samuri (10).png', 'samuri (11).png'],
    GOD_HAND: ['God_hand (1).png', 'God_hand (2).png'],
    DRAGONSLAYER: ['warrior1.png', 'warrior2.png', 'warrior3.png', 'warrior4.png'],
    REAPER: ['necromancer.png'],
    BARD: ['acolyte.png'],
    ARTIFICER: ['apprentice1.png', 'apprentice2.png', 'apprentice3.png', 'apprentice4.png'],
    AVATAR: ['elementalist (1).png', 'elementalist (2).png', 'elementalist (3).png', 'elementalist (4).png']
};

const ENEMY_SPRITES = {
    FIRE_LOW: ['fire (5).png', 'fire (6).png'],
    WATER_LOW: ['water (4).png', 'water (6).png'],
    EARTH_MID: ['earth (1).png', 'earth (2).png', 'earth (3).png'],
    ICE_MID: ['ice (1).png', 'ice (2).png', 'ice (3).png'],
    FIRE_HIGH: ['fire (7).png', 'fire (8).png'],
    WATER_HIGH: ['water (7).png'],
    EARTH_HIGH: ['earth (4).png', 'earth (5).png'],
    MUTATED: ['mutated (1).png', 'mutated (2).png', 'mutated (3).png', 'mutated (4).png', 'mutated (5).png', 'mutated (6).png', 'mutated (7).png'],
    HYBRID: ['hybrides (1).png', 'hybrides (2).png', 'hybrides (3).png', 'hybrides (4).png', 'hybrides (5).png', 'hybrides (6).png', 'hybrides (7).png'],
    FIRE_ELITE: ['fire (11).png']
};

const BOSS_SPRITES = {
    MID_BOSSES: ['midlevelbosses (1).png', 'midlevelbosses (2).png', 'midlevelbosses (3).png', 'midlevelbosses (4).png', 'midlevelbosses (5).png', 'midlevelbosses (6).png', 'midlevelbosses (7).png'],
    HIGH_BOSSES: ['highlevelbosses (7).png', 'highlevelbosses (8).png', 'highlevelbosses (9).png', 'highlevelbosses (10).png', 'highlevelbosses (11).png', 'highlevelbosses (12).png', 'highlevelbosses (13).png'],
    CALAMITY: ['calamaties (1).png', 'calamaties (2).png', 'calamaties (3).png', 'calamaties (4).png', 'calamaties (5).png', 'calamaties (6).png']
};

const normX = (x) => x + OFF_X;
const normY = (y) => y + OFF_Y;

function getCharacterSprite(classId, spriteIndex = 0) {
    const cid = (classId || 'FIGHTER').toUpperCase();
    const sprites = CHARACTER_SPRITES[cid] || CHARACTER_SPRITES.FIGHTER;
    return path.join(getPaths().characters, sprites[spriteIndex % sprites.length]);
}

function getEnemySprite(level, enemyIndex = 0) {
    let pool;
    if (level <= 10) pool = ENEMY_SPRITES.FIRE_LOW;
    else if (level <= 20) pool = ENEMY_SPRITES.WATER_LOW;
    else if (level <= 30) pool = ENEMY_SPRITES.EARTH_MID;
    else if (level <= 40) pool = ENEMY_SPRITES.ICE_MID;
    else if (level <= 50) pool = ENEMY_SPRITES.FIRE_HIGH;
    else if (level <= 60) pool = ENEMY_SPRITES.WATER_HIGH;
    else if (level <= 70) pool = ENEMY_SPRITES.EARTH_HIGH;
    else if (level <= 80) pool = ENEMY_SPRITES.MUTATED;
    else if (level <= 90) pool = ENEMY_SPRITES.HYBRID;
    else pool = ENEMY_SPRITES.FIRE_ELITE;
    return path.join(getPaths().enemies, pool[enemyIndex % pool.length]);
}

function getBossSprite(level, bossIndex = 0) {
    let pool;
    if (level <= 60) pool = BOSS_SPRITES.MID_BOSSES;
    else if (level <= 90) pool = BOSS_SPRITES.HIGH_BOSSES;
    else pool = BOSS_SPRITES.CALAMITY;
    return path.join(getPaths().enemies, pool[bossIndex % pool.length]);
}

function getRandomEnvironment() {
    try {
        const ENVIRONMENTS_PATH = getPaths().environment;
        if (!fs.existsSync(ENVIRONMENTS_PATH)) return null;
        const files = fs.readdirSync(ENVIRONMENTS_PATH).filter(f => f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.jpg'));
        return files.length === 0 ? null : path.join(ENVIRONMENTS_PATH, files[Math.floor(Math.random() * files.length)]);
    } catch (e) { return null; }
}

async function drawShadow(canvas, x, y, width) {
    try {
        const height = Math.floor(width * 0.3); 
        const shadow = new Jimp({ width, height, color: 0x00000000 });
        const cX = width/2, cY = height/2;
        for (let ix = 0; ix < width; ix++) {
            for (let iy = 0; iy < height; iy++) {
                const dx = (ix - cX) / (width/2), dy = (iy - cY) / (height/2);
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist <= 1) {
                    const alpha = Math.floor(140 * (1 - dist));
                    shadow.setPixelColor(((0 & 0xFF) << 24) | ((0 & 0xFF) << 16) | ((0 & 0xFF) << 8) | (alpha & 0xFF), ix, iy);
                }
            }
        }
        shadow.blur(5); 
        canvas.composite(shadow, x - (width/2), y - (height/2));
    } catch (e) {}
}

async function drawSpriteBar(canvas, x, y, current, max, type = 'hp', w = 121, h = 47, smooth = false) {
    try {
        const UI_PATH = getPaths().ui;
        const prefix = type === 'hp' ? 'hp' : 'mana';
        const safeMax = Math.max(1, Math.floor(max || 100));
        let percent = current / safeMax;
        if (isNaN(percent)) percent = 0;
        percent = Math.max(0, Math.min(1, percent));
        
        if (smooth) {
            // Smooth scaling using the 'full' sprite (hp5 or mana5)
            const spritePath = path.join(UI_PATH, `${prefix}5.png`);
            if (fs.existsSync(spritePath)) {
                const bar = await Jimp.read(spritePath);
                const barW = Math.max(1, Math.round(w * percent));
                bar.resize({ w: barW, h });
                canvas.composite(bar, x, y);
            }
        } else {
            // Segmented sprite choice
            const spriteNum = Math.min(5, Math.max(1, Math.round(percent * 4) + 1));
            const spritePath = path.join(UI_PATH, `${prefix}${spriteNum}.png`);
            if (fs.existsSync(spritePath)) {
                const bar = await Jimp.read(spritePath);
                bar.resize({ w, h });
                canvas.composite(bar, x, y);
            }
        }
    } catch (e) {}
}

// ==========================================
// ⚔️ IMAGE GENERATION
// ==========================================

async function generateEndScreenImage(text, options = {}) {
    try {
        const { outputPath = './temp/combat_end.png' } = options;
        const canvas = new Jimp({ width: CANVAS_W, height: CANVAS_H, color: 0xffffffff }); // Pure White

        await ensureFontLoaded();
        const pCanvas = pureimage.make(CANVAS_W, CANVAS_H);
        const ctx = pCanvas.getContext('2d');
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

        ctx.fillStyle = '#000000'; // Black text
        ctx.font = "80pt 'FantasyFont'";
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2);

        // Convert pureimage to Jimp buffer safely
        const buffer = await new Promise((resolve, reject) => {
            const stream = new PassThrough();
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
            pureimage.encodePNGToStream(pCanvas, stream).catch(reject);
        });

        const textImg = await Jimp.read(buffer);
        canvas.composite(textImg, 0, 0);
        
        if (!fs.existsSync('./temp')) fs.mkdirSync('./temp', { recursive: true });
        await canvas.write(outputPath);
        return { success: true, path: outputPath, width: CANVAS_W, height: CANVAS_H };
    } catch (e) {
        console.error("End screen generation error:", e);
        return { success: false, error: e.message };
    }
}

async function generateCombatImage(players, enemies, options = {}) {
    try {
        const { outputPath = './temp/combat_scene.png', backgroundPath = null, combatType = 'PVE' } = options;
        const canvas = new Jimp({ width: CANVAS_W, height: CANVAS_H, color: 0x1a1a1aff });

        // 1. Background
        const bgPath = backgroundPath || getRandomEnvironment();
        if (bgPath && fs.existsSync(bgPath)) {
            const bg = await Jimp.read(bgPath);
            bg.resize({ w: CANVAS_W, h: CANVAS_H });
            canvas.composite(bg, 0, 0);
        }
        canvas.composite(new Jimp({ width: CANVAS_W, height: CANVAS_H, color: 0x00000066 }), 0, 0);

        // 2. Mobs or PvP Defender
        const enemySpriteSize = 190;
        const startX = 780, startY = 160, spX = 130, spY = 110;
        const avgLevel = Math.floor(players.reduce((sum, p) => sum + (p.level || 1), 0) / Math.max(1, players.length));

        if (combatType === 'PVP' && players.length >= 2) {
            // PVP MODE: Draw Defender on the right side
            const defender = players[1];
            const defSpritePath = getCharacterSprite(defender.class?.id || 'FIGHTER', defender.spriteIndex || 0);
            if (fs.existsSync(defSpritePath)) {
                const defSprite = await Jimp.read(defSpritePath);
                const dW = enemySpriteSize * 1.5; // Make them look big
                defSprite.resize({ w: dW, h: Jimp.AUTO });
                defSprite.flip({ horizontal: true, vertical: false }); // Mirror them!

                if (defender.currentHP <= 0 || (defender.hp <= 0)) defSprite.color([{ apply: 'red', params: [100] }]);

                await drawShadow(canvas, startX + (dW/2), startY + defSprite.bitmap.height - 10, dW * 0.8);
                canvas.composite(defSprite, startX, startY);

                // Draw HP bar for defender
                const dCurHP = defender.currentHP !== undefined ? defender.currentHP : (defender.hp || 0);
                const dMaxHP = defender.stats?.maxHp || defender.maxHp || 100;
                await drawSpriteBar(canvas, startX + (dW/2) - 60, startY - 20, dCurHP, dMaxHP, 'hp', 120, 20, true);
            }
        } else {
            // PVE MODE: Draw Mobs
            const mobRenderQueue = [];
            for (let i = 0; i < enemies.length; i++) {
                const enemy = enemies[i];
                if (enemy.currentHP <= 0 && !enemy.justDied) continue;
                const eSpritePath = enemy.isBoss ? getBossSprite(avgLevel, i) : getEnemySprite(avgLevel, i);
                
                if (fs.existsSync(eSpritePath)) {
                    let ex, ey;
                    const sub = i % 4;
                    if (sub === 0) { ex = startX; ey = startY; }
                    else if (sub === 1) { ex = startX - spX; ey = startY + spY; }
                    else if (sub === 2) { ex = startX - spX; ey = startY; }
                    else { ex = startX - spX * 2; ey = startY + spY; }
                    ex += Math.floor(i/4) * -250;

                    mobRenderQueue.push({ enemy, path: eSpritePath, x: ex, y: ey, isBoss: enemy.isBoss });
                }
            }
            mobRenderQueue.sort((a, b) => a.y - b.y);
            for (const item of mobRenderQueue) {
                try {
                    const { enemy, path: ePath, x, y, isBoss } = item;
                    const eSprite = await Jimp.read(ePath);
                    const eW = isBoss ? enemySpriteSize * 1.5 : enemySpriteSize;
                    eSprite.resize({ w: eW, h: Jimp.AUTO });
                    if (enemy.currentHP <= 0) eSprite.color([{ apply: 'red', params: [100] }]);
                    await drawShadow(canvas, x + (eW/2), y + eSprite.bitmap.height - 10, eW * 0.8);
                    canvas.composite(eSprite, x, y);
                    if (enemy.currentHP > 0 || (enemy.stats?.hp > 0)) {
                        const eCurHP = enemy.currentHP !== undefined ? enemy.currentHP : (enemy.stats?.hp || 0);
                        const eMaxHP = enemy.stats?.maxHp || enemy.stats?.hp || 100;
                        await drawSpriteBar(canvas, x + (eW/2) - 60, y - 20, eCurHP, eMaxHP, 'hp', 120, 20, true);
                    }
                } catch (e) {}
            }
        }

        // 3. UI Base Layer
        const uiElements = [
            { path: 'player_state.png', x: -716, y: 113, w: 453, h: 244 },
            { path: 'heart.png', x: -678, y: 209, w: 38, h: 47 },
            { path: 'mana.png', x: -673, y: 256, w: 29, h: 44 },
            { path: 'Options_menu.png', x: -97, y: 99, w: 443, h: 258 },
            { path: 'banner.png', x: -496, y: -339, w: 573, h: 118 }
        ];

        for (const ui of uiElements) {
            const UI_PATH = getPaths().ui;
            const fullPath = path.join(UI_PATH, ui.path);
            if (fs.existsSync(fullPath)) {
                const img = await Jimp.read(fullPath);
                img.resize({ w: ui.w, h: ui.h });
                canvas.composite(img, normX(ui.x), normY(ui.y));
            }
        }

        // UI Bars (Main Player)
        if (players.length > 0) {
            const p = players[0];
            const maxHP = p.stats?.maxHp || p.stats?.hp || p.maxHp || 100;
            const currentHP = p.currentHP !== undefined ? p.currentHP : (p.hp || p.stats?.hp || 100);
            const currentEnergy = p.stats?.energy !== undefined ? p.stats?.energy : (p.energy || 100);
            const maxEnergy = p.stats?.maxEnergy || p.maxEnergy || 100;

            const hpCoords = [-640, -550, -459], enCoords = [-644, -555, -465];
            const hpSeg = maxHP / 3, enSeg = maxEnergy / 3;

            for (let i = 0; i < 3; i++) {
                const hCur = Math.max(0, Math.min(hpSeg, currentHP - (i * hpSeg)));
                await drawSpriteBar(canvas, normX(hpCoords[i]), normY(209), hCur, hpSeg, 'hp', 121, 47);
                const eCur = Math.max(0, Math.min(enSeg, currentEnergy - (i * enSeg)));
                await drawSpriteBar(canvas, normX(enCoords[i]), normY(256), eCur, enSeg, 'mana', 119, 42);
            }
        }

        // 4. Player Sprite (Attacker / Left)
        if (players.length > 0) {
            const player = players[0];
            const spritePath = getCharacterSprite(player.class?.id || 'FIGHTER', player.spriteIndex || 0);
            if (fs.existsSync(spritePath)) {
                const sprite = await Jimp.read(spritePath);
                if (player.currentHP <= 0 || (player.hp <= 0)) sprite.color([{ apply: 'red', params: [100] }]);

                const s1W = 314;
                const mainDisplay = sprite.clone().resize({ w: s1W, h: Jimp.AUTO });
                const cropH = Math.floor(mainDisplay.bitmap.height * 0.3);
                mainDisplay.crop({ x: 0, y: 0, w: mainDisplay.bitmap.width, h: cropH });
                canvas.composite(mainDisplay, normX(-660), normY(191) - cropH);

                // Sprite 2 (Small helper) only in PvE
                if (combatType !== 'PVP') {
                    const s2Size = 122;
                    const playerSprite = sprite.clone().resize({ w: s2Size, h: Jimp.AUTO });
                    playerSprite.flip({ horizontal: false, vertical: false }); 
                    const s2X = startX - 500, s2Y = startY + 10;
                    await drawShadow(canvas, s2X + (s2Size/2), s2Y + playerSprite.bitmap.height, 150);
                    canvas.composite(playerSprite, s2X, s2Y);
                }
            }
        }

        // 5. Final Banner Text
        try {
            let bannerText = String(`${options.rank || players[0]?.adventurerRank || 'F'} RANK`);
            if (combatType === 'PVP') bannerText = "PVP MATCH";
            
            const textImg = await createRankTextImage(bannerText);
            canvas.composite(textImg, normX(-496), normY(-339));
        } catch (e) {
            console.error('Error rendering fancy text:', e);
        }

        if (!fs.existsSync('./temp')) fs.mkdirSync('./temp', { recursive: true });
        await canvas.write(outputPath);
        return { success: true, path: outputPath, width: CANVAS_W, height: CANVAS_H, backgroundPath: bgPath };
    } catch (e) { return { success: false, error: e.message }; }
}

async function updateCombatImage(players, enemies, turnInfo, options = {}) {
    return await generateCombatImage(players, enemies, options);
}

module.exports = {
    generateCombatImage, updateCombatImage, generateEndScreenImage,
    getCharacterSprite, getEnemySprite, getBossSprite, getRandomEnvironment,
    CHARACTER_SPRITES, ENEMY_SPRITES, BOSS_SPRITES
};

