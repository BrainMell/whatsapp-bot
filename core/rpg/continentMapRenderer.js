'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  CONTINENT MAP — "The Five Realms of the First World"
//
//  The chart itself is the traced art (core/rpgasset/continents/five_realms.jpg), drawn
//  1:1. A guild overlay adds a LOCATION PIN at the guild's charter-stone with the guild
//  emblem floating above it, plus tiny hearths for member home bases.
//
//    renderContinentMap({ guildName, guild, memberNames })  → Buffer (JPEG) | null
//    renderContinentMap()                                   → the plain chart
//
//  Pure canvas, ~40 ms warm. Never throws (returns null; caller falls back to text).
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const C = require('./continents');

const SC = 1.25;                                    // output scale over the 864×1210 chart
let _img = null;
async function chart() {
    if (_img) return _img;
    const { loadImage } = require('canvas');
    _img = await loadImage(fs.readFileSync(C.CHART));
    return _img;
}
let _fonts = false;
function fonts() {
    if (_fonts) return;
    _fonts = true;
    try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ }
}

function drawHearth(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 3, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F2E3BF'; ctx.strokeStyle = '#3B2A1D'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-5, 2); ctx.lineTo(-5, -3); ctx.lineTo(0, -8); ctx.lineTo(5, -3); ctx.lineTo(5, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#B8412E'; ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(0, -9.5); ctx.lineTo(6, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
}

/** location pin with the guild emblem floating above it. (x, y) = the pin's tip on the map. */
function drawPin(ctx, x, y, { color, icon, initial, name }) {
    const R = 15;                                   // pin head radius
    const headY = y - 40;
    // soft ground shadow + pulse ring at the tip
    ctx.save();
    ctx.fillStyle = 'rgba(30,20,10,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 12, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(184,65,46,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 1, 20, 7, 0, 0, Math.PI * 2); ctx.stroke();
    // teardrop body
    const g = ctx.createLinearGradient(x - R, headY - R, x + R, headY + R);
    g.addColorStop(0, '#E5604A'); g.addColorStop(1, '#8F2417');
    ctx.fillStyle = g; ctx.strokeStyle = '#3A140E'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 5, y - 12, x - R, headY + 8, x - R, headY);
    ctx.arc(x, headY, R, Math.PI, 0, false);
    ctx.bezierCurveTo(x + R, headY + 8, x + 5, y - 12, x, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // inner hole + highlight
    ctx.fillStyle = '#3A140E'; ctx.beginPath(); ctx.arc(x, headY, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x - 7, headY - 8, 4, 2.4, -0.7, 0, Math.PI * 2); ctx.fill();

    // floating emblem medallion above the pin (with its own drop shadow on the pin head)
    const ey = headY - 31;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, headY - 15, 10, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    const er = 18;
    const eg = ctx.createRadialGradient(x - 6, ey - 7, 3, x, ey, er);
    eg.addColorStop(0, '#FFF2C4'); eg.addColorStop(1, color);
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(x, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#3A2A12'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#F5D982'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, ey, er - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const glyph = icon || initial;
    ctx.fillStyle = icon ? '#2B1A0C' : '#FFF6DC';
    ctx.font = icon ? '20px sans-serif' : 'bold 20px "Cinzel", serif';
    if (!icon) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,20,10,0.8)'; ctx.strokeText(glyph, x, ey + 1); }
    ctx.fillText(glyph, x, ey + 1);

    // name tag under the tip
    ctx.font = '13px "Cinzel", serif';
    const label = name.length > 22 ? name.slice(0, 21) + '…' : name;
    const tw = ctx.measureText(label).width + 14;
    ctx.fillStyle = '#5B1F1A'; ctx.strokeStyle = '#2A0F0C'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x - tw / 2, y + 10, tw, 19); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F6E8C6'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, x, y + 24);
    ctx.restore();
}

async function renderContinentMap(o = {}) {
    try {
        const { createCanvas } = require('canvas');
        fonts();
        const img = await chart();
        const W = Math.round(img.width * SC), H = Math.round(img.height * SC);
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, W, H);

        const gName = o.guildName || null;
        if (gName) {
            const guild = o.guild || {};
            const place = C.placementOf(gName, guild);
            const emblem = guild.emblem || {};
            const color = /^#[0-9a-fA-F]{3,8}$/.test(o.emblemColor || emblem.color || '') ? (o.emblemColor || emblem.color) : '#D9A441';
            const icon = String(o.emblemIcon || emblem.icon || '').trim();
            const members = Array.isArray(guild.members) ? guild.members.length : 0;
            const nSites = Math.max((o.memberNames || []).length - 1, 0) || Math.min(Math.max(members - 1, 0), 11);
            ctx.save(); ctx.scale(SC, SC);
            for (const s of C.baseSites(gName, guild, nSites)) drawHearth(ctx, s.x * img.width, s.y * img.height);
            drawPin(ctx, place.marker.x * img.width, place.marker.y * img.height, { color, icon, initial: (gName.match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase(), name: gName });
            ctx.restore();
        }
        return canvas.toBuffer('image/jpeg', { quality: 0.88 });
    } catch (e) {
        try { console.error('[continentMapRenderer] render failed:', e.message); } catch (_) { /* noop */ }
        return null;
    }
}

module.exports = { renderContinentMap };
