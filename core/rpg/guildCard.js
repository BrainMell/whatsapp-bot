'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  Dedicated guild card (the `.j guild` portrait card) - cached + day/night graded.
//  owner 2026-10-31: "use caching and regenerate all existing guild cards (and the day level)
//  to make it faster". Key = card payload + time-of-day phase, so each guild has ONE disk-cached
//  card per phase and a repeat `.j guild` is a disk read. guildCardWarmer pre-bakes every guild.
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const mediaCache = require('./mediaCache');
const dayNight = require('./dayNight');

function payloadFor(name, guild, style) {
    const guildPerks = require('./guildPerks');
    const memberCap = guildPerks.getMemberCap(guild);
    const level = guild.level || 1, points = guild.points || 0, need = level * 1000;
    return {
        kind: 'GUILDINFO',
        style: style || 0,
        nickname: name,
        sealText: `L${level}`,
        level,
        xpPercent: Math.max(0, Math.min(100, Math.floor((points / need) * 100))),
        hexColor: guild.emblem?.color || '',
        emblem: guild.emblem?.img || '',
        motto: guild.motto || '',
        caption: '',
        rows: [
            { label: 'ARCHETYPE', value: String(guild.type || 'ADVENTURER').toUpperCase() },
            { label: 'LEADER', value: guild.owner ? '@' + guild.owner.split('@')[0] : 'UNKNOWN' },
            { label: 'MEMBERS', value: `${(guild.members || []).length}/${memberCap}` },
            { label: 'BANK', value: `${(guild.balance || 0).toLocaleString()} ZENI` },
        ],
        buildings: [
            { name: 'HALL', level: (guild.buildings?.hall?.level) || 0 },
            { name: 'TRAINING', level: (guild.buildings?.training?.level) || 0 },
            { name: 'TREASURY', level: (guild.buildings?.treasury?.level) || 0 },
        ],
    };
}

/** @returns {Promise<{buffer:Buffer,contentType:string,cached?:boolean}|null>} */
async function render(name, guild, { style = 0, phase } = {}) {
    const ph = phase || dayNight.phaseAt();
    const pl = payloadFor(name, guild, style);
    const key = crypto.createHash('sha1').update(JSON.stringify(['gcard1', pl, ph])).digest('hex').slice(0, 20);
    return mediaCache.cached('guildcard', key, async () => {
        const goService = require('../utils/goImageService');
        const raw = await goService.generatePortraitCard(pl);
        if (!raw || raw.length < 100) return null;                       // not cached when the renderer is down
        const { gradeBuffer } = require('../utils/dayNightGrade');
        const graded = await gradeBuffer(raw, { phase: ph });
        return { buffer: graded, contentType: 'image/jpeg' };
    });
}
module.exports = { render, payloadFor };
