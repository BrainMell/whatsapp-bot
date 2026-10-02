// ============================================
// 📜 GUILD ASSOCIATION OFFICIAL NOTICE — Guild War Overhaul 2026-10-03
// Formal letter-style card for war announcements / Alignment notices /
// major world events. Clones the Royal Decree kit (worldMapRenderer style).
// ============================================

const fs = require('fs');
const path = require('path');

const PAL = {
    parchment: '#EADDC4', parchmentDeep: '#E1D1AF',
    ink: '#3A2A1E', inkSoft: '#5A4634',
    frame: '#A67C2E', wax: '#8B1A2B',
    plate: 'rgba(58,42,30,0.06)',
};
const W = 1000, H = 700;

let _fontsReady = false;
function _ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) throw new Error('no font registration API');
        const F = path.join(__dirname, '..', '..', 'rpgasset', 'fonts');
        const isRealFont = (p) => {
            try {
                if (!fs.existsSync(p)) return false;
                const head = fs.readFileSync(p).slice(0, 4);
                return head.equals(Buffer.from([0x00, 0x01, 0x00, 0x00])) || head.toString('latin1') === 'OTTO' || head.toString('latin1') === 'true';
            } catch (e) { return false; }
        };
        const regs = [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
            ['IMFellEnglish-Italic.ttf', { family: 'IM Fell Italic' }],
        ];
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (isRealFont(p)) { try { registerFont(p, opts); } catch (e) {} }
        }
        _fontsReady = true;
        return true;
    } catch (e) { return false; }
}

function _wrap(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
        else line = test;
    }
    if (line) lines.push(line);
    return lines;
}

// render(text, {title, kicker}) → PNG buffer
async function renderNotice(text, opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PAL.parchmentDeep;
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(100 + i * 210, 120 + (i % 3) * 200, 110, 70, i, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // double frame + corner marks (decree style)
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.lineWidth = 1;
    ctx.strokeRect(42, 42, W - 84, H - 84);
    ctx.lineWidth = 2;
    const t = 18;
    [[42, 42, 1, 1], [W - 42, 42, -1, 1], [42, H - 42, 1, -1], [W - 42, H - 42, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(x + sx * t, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * t);
        ctx.stroke();
    });

    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.inkSoft;
    ctx.font = '16px "Cinzel"';
    ctx.fillText(opts.kicker || 'BY DECREE OF THE GUILD ASSOCIATION', W / 2, 100);
    ctx.fillStyle = PAL.ink;
    ctx.font = '34px "Cinzel Deco"';
    // Cinzel Deco swashes eat the word gap — spread the title manually
    const title = (opts.title || 'OFFICIAL NOTICE');
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText(title, W / 2, 152);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText(title.split('').join('\u2009'), W / 2, 152);
    }
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 150, 176); ctx.lineTo(W / 2 + 150, 176); ctx.stroke();
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(W / 2 - 5, 170, 10, 12);

    // body (wrapped, IM Fell)
    ctx.font = '20px "IM Fell"';
    ctx.fillStyle = PAL.ink;
    ctx.textAlign = 'left';
    const lines = _wrap(ctx, text, W - 220);
    let ty = 240;
    for (const line of lines.slice(0, 12)) {
        ctx.fillText(line, 110, ty);
        ty += 32;
    }

    // wax seal
    ctx.fillStyle = PAL.wax;
    ctx.beginPath(); ctx.arc(W - 130, H - 120, 42, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '26px "Cinzel Deco"';
    ctx.textAlign = 'center';
    ctx.fillText('GA', W - 130, H - 110);

    ctx.textAlign = 'left';
    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.fillText('Let all guilds take heed.', 110, H - 80);

    return c.toBuffer('image/png');
}

// ============================================
// ORGANIC WORLD-ALIGNMENT CARD — broadcast look for the alignment wars that
// open on their own when the worlds align. Posted (paced) to every GC marked
// RPG-friendly (`gw rpg on`) by each bot instance.
// Cosmic palette: night-ink header band, gold ⨀ seal, three-worlds flavour.
// ============================================
async function renderAlignmentCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    // night-ink header band
    ctx.fillStyle = '#241A2E';
    ctx.fillRect(0, 0, W, 210);
    ctx.fillStyle = '#2E2340';
    ctx.globalAlpha = 0.6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 210);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(80 + i * 170, 60 + (i % 3) * 70, 90, 34, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#B9A44C';
    ctx.font = '15px "Cinzel"';
    ctx.fillText('ON THEIR OWN ACCORD · NO HAND RAISED', W / 2, 52);
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '36px "Cinzel Deco"';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText(opts.title || 'THE WORLDS ALIGN', W / 2, 110);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText((opts.title || 'THE WORLDS ALIGN').split('').join('\u2009'), W / 2, 110);
    }
    ctx.strokeStyle = '#B9A44C';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 170, 140); ctx.lineTo(W / 2 + 170, 140); ctx.stroke();

    // gold triple-world seal
    ctx.fillStyle = '#B9A44C';
    ctx.beginPath(); ctx.arc(W / 2, 175, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#241A2E';
    ctx.font = '30px "Cinzel"';
    ctx.fillText('⨀', W / 2, 187);

    // body
    ctx.textAlign = 'left';
    ctx.font = '20px "IM Fell"';
    ctx.fillStyle = PAL.ink;
    const lines = _wrap(ctx, opts.text ||
        'The walls between worlds have grown weak, and the dead worlds now overlap. The Guild Association calls ALL guilds to war across the joined worlds - greater dangers, greater glory, the largest Guild Points the system has ever offered.',
        W - 220).slice(0, 7);
    let ty = 260;
    for (const line of lines) { ctx.fillText(line, 110, ty); ty += 32; }

    // registration strip
    ctx.fillStyle = 'rgba(58,42,30,0.08)';
    ctx.fillRect(90, H - 170, W - 180, 66);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, H - 170, W - 180, 66);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.wax;
    ctx.font = '22px "Cinzel"';
    ctx.fillText(`REGISTRATION IS OPEN${opts.regMinutes != null ? ` - ${opts.regMinutes} MIN` : ''}`, W / 2, H - 142);
    ctx.fillStyle = PAL.ink;
    ctx.font = '17px "IM Fell"';
    ctx.fillText(`Join from any group:  ${opts.prefix || '.'} gw join   ·   then act in my DMs`, W / 2, H - 116);

    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.fillText('So it was written across the three worlds.', 110, H - 60);

    return c.toBuffer('image/png');
}

// ============================================
// MOD-INITIATED WAR-CALL CARD — the single-GC variant when a mod opens a war
// with `.j gw start`. Martial wax-red styling; shows who raised the call.
// ============================================
async function renderWarCalledCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    // martial red header band
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(0, 0, W, 210);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 210);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(80 + i * 170, 60 + (i % 3) * 70, 90, 34, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '15px "Cinzel"';
    ctx.fillText(opts.type === 'alignment' ? 'AN ALIGNMENT WAR, CALLED BY HAND' : 'BY DIRECT ORDER OF THE GUILD ASSOCIATION', W / 2, 52);
    ctx.font = '36px "Cinzel Deco"';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText(opts.title || 'GUILD WAR CALLED', W / 2, 110);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText((opts.title || 'GUILD WAR CALLED').split('').join('\u2009'), W / 2, 110);
    }
    ctx.strokeStyle = '#F3ECD9';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 170, 140); ctx.lineTo(W / 2 + 170, 140); ctx.stroke();

    // dark seal with crossed blades
    ctx.fillStyle = '#241A2E';
    ctx.beginPath(); ctx.arc(W / 2, 175, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '28px "Cinzel"';
    ctx.fillText('⚔', W / 2, 186);

    // body
    ctx.textAlign = 'left';
    ctx.font = '20px "IM Fell"';
    ctx.fillStyle = PAL.ink;
    const lines = _wrap(ctx, opts.text ||
        'A war has been called by hand. The Ruins of a dead world await - rooms to clear, relics to carry, rivals to duel, and the World Core for the first guild bold enough to breach it.',
        W - 220).slice(0, 6);
    let ty = 260;
    for (const line of lines) { ctx.fillText(line, 110, ty); ty += 32; }

    // registration strip
    ctx.fillStyle = 'rgba(58,42,30,0.08)';
    ctx.fillRect(90, H - 170, W - 180, 66);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, H - 170, W - 180, 66);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.wax;
    ctx.font = '22px "Cinzel"';
    ctx.fillText(`REGISTRATION IS OPEN${opts.regMinutes != null ? ` - ${opts.regMinutes} MIN` : ''}`, W / 2, H - 142);
    ctx.fillStyle = PAL.ink;
    ctx.font = '17px "IM Fell"';
    ctx.fillText(`Join here:  ${opts.prefix || '.'} gw join   ·   this group carries the live war feed`, W / 2, H - 116);

    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.fillText(opts.host ? `The call was raised by ${opts.host}.` : 'Let all guilds take heed.', 110, H - 60);

    return c.toBuffer('image/png');
}

// ============================================
// FIELD MANUAL CARD — the `.j gw` / `.j war` / `.j wr` popup. A war-table
// board listing the full command surface, martial styling to match the
// war-call card. Same parchment kit, command rows in two columns.
// ============================================
async function renderWarHelpCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    // martial red header band (matches the war-call card family)
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(0, 0, W, 190);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 190);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(80 + i * 170, 55 + (i % 3) * 65, 90, 34, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '15px "Cinzel"';
    ctx.fillText('GUILD WAR FIELD MANUAL', W / 2, 50);
    ctx.font = '38px "Cinzel Deco"';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText(opts.title || 'THE RUINS', W / 2, 108);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText((opts.title || 'THE RUINS').split('').join('\u2009'), W / 2, 108);
    }
    ctx.strokeStyle = '#F3ECD9';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 170, 138); ctx.lineTo(W / 2 + 170, 138); ctx.stroke();
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '16px "Cinzel"';
    const P = String(opts.prefix || '.');
    ctx.fillText(`open with  ${P} gw  ·  ${P} wr  ·  ${P} war`, W / 2, 168);

    // command rows: command (Cinzel, ink) + description (IM Fell, soft)
    const rows = [
        [`${P} gw start`, 'Mods open registration. This GC becomes the feed HQ.'],
        [`${P} gw start alignment`, 'Alignment-scale war (mods).'],
        [`${P} gw join`, 'Enter the registering war with your guild.'],
        [`${P} gw forcestart`, 'Mods deploy the war now.'],
        [`${P} gw status`, 'Live standings from the Ruins.'],
        [`${P} gw end  |  abort`, 'Mods conclude the war (end pays rewards).'],
        [`${P} gw rpg on | off`, 'Admins mark this GC for organic alignment calls.'],
    ];
    ctx.textAlign = 'left';
    let ry = 244;
    const rowGap = 40;
    for (const [cmd, desc] of rows) {
        ctx.fillStyle = PAL.ink;
        ctx.font = '19px "Cinzel"';
        ctx.fillText(cmd, 100, ry);
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '17px "IM Fell"';
        // description column, wrapped to fit
        const dLines = _wrap(ctx, desc, W - 560);
        let dy = ry;
        for (const dl of dLines.slice(0, 2)) { ctx.fillText(dl, 400, dy); dy += 21; }
        // faint row rule
        ctx.strokeStyle = 'rgba(166,124,46,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(100, ry + 14); ctx.lineTo(W - 100, ry + 14); ctx.stroke();
        ry += rowGap;
        if (ry > H - 200) break;
    }

    // DM verbs strip
    ctx.fillStyle = 'rgba(58,42,30,0.08)';
    ctx.fillRect(90, H - 150, W - 180, 62);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, H - 150, W - 180, 62);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.wax;
    ctx.font = '18px "Cinzel"';
    ctx.fillText('ONCE DEPLOYED, ACT IN MY DMs', W / 2, H - 126);
    ctx.fillStyle = PAL.ink;
    ctx.font = '16px "IM Fell"';
    ctx.fillText('look · move n/s/e/w · map · relics · handin · challenge @name · status · quit', W / 2, H - 100);

    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.textAlign = 'left';
    ctx.fillText('The Association honors the bold.', 110, H - 62);

    return c.toBuffer('image/png');
}

// ============================================
// WAR START CARD — DM'd to every champion the moment a war deploys.
// "The war has begun + here's how you play" (owner brief). Martial red
// header (same family as the war-call card), DM verb rows, first-move strip.
// ============================================
async function renderWarStartCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');
    const P = String(opts.prefix || '.');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    // martial red header band (matches the war-call / help card family)
    ctx.fillStyle = PAL.wax;
    ctx.fillRect(0, 0, W, 190);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 190);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(80 + i * 170, 55 + (i % 3) * 65, 90, 34, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '15px "Cinzel"';
    ctx.fillText('GUILD WAR: THE RUINS', W / 2, 50);
    ctx.font = '40px "Cinzel Deco"';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText(opts.title || 'THE WAR HAS BEGUN', W / 2, 110);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText((opts.title || 'THE WAR HAS BEGUN').split('').join('\u2009'), W / 2, 110);
    }
    ctx.strokeStyle = '#F3ECD9';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 170, 140); ctx.lineTo(W / 2 + 170, 140); ctx.stroke();
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '16px "Cinzel"';
    ctx.fillText('You are deployed. My DMs are your game screen.', W / 2, 168);

    // how-you-play rows: verb (Cinzel, ink) + what it does (IM Fell, soft)
    const rows = [
        ['look', 'See the chamber you stand in.'],
        ['move n/s/e/w', 'Travel between chambers. Bare  e  works too.'],
        ['map', 'Your chart of the Ruins - fog lifts as you explore.'],
        ['relics  ·  handin all', 'Carried relics are banked for guild GP.'],
        ['challenge @name', 'Duel a rival standing in your room.'],
        ['status  ·  quit', 'Live standings - or leave the war.'],
        ['rejoin', 'Return if you ever go inactive.'],
    ];
    ctx.textAlign = 'left';
    let ry = 250;
    const rowGap = 41;
    for (const [cmd, desc] of rows) {
        ctx.fillStyle = PAL.ink;
        ctx.font = '19px "Cinzel"';
        ctx.fillText(cmd, 100, ry);
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '17px "IM Fell"';
        const dLines = _wrap(ctx, desc, W - 560);
        let dy = ry;
        for (const dl of dLines.slice(0, 2)) { ctx.fillText(dl, 420, dy); dy += 21; }
        ctx.strokeStyle = 'rgba(166,124,46,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(100, ry + 14); ctx.lineTo(W - 100, ry + 14); ctx.stroke();
        ry += rowGap;
        if (ry > H - 200) break;
    }

    // first-move strip
    ctx.fillStyle = 'rgba(58,42,30,0.08)';
    ctx.fillRect(90, H - 150, W - 180, 62);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, H - 150, W - 180, 62);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.wax;
    ctx.font = '19px "Cinzel"';
    ctx.fillText('YOUR FIRST MOVE:  DM ME  "look"', W / 2, H - 126);
    ctx.fillStyle = PAL.ink;
    ctx.font = '15px "IM Fell"';
    ctx.fillText(`group commands stay live too:  ${P} gw status  ·  ${P} gw help`, W / 2, H - 100);

    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.textAlign = 'left';
    ctx.fillText('Carried relics can be stolen. Bank them often.', 110, H - 62);

    return c.toBuffer('image/png');
}

// ============================================
// STATUS / FINAL STANDINGS CARD — `.j gw status` live board and the final
// standings board when a war ends. Night-ink band, ranked rows, right-aligned GP.
// ============================================
async function renderWarStatusCard(opts = {}) {
    _ensureFonts();
    const canvas = require('canvas');
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext('2d');

    ctx.fillStyle = PAL.parchment;
    ctx.fillRect(0, 0, W, H);
    // night-ink band (war-desk look)
    ctx.fillStyle = '#241A2E';
    ctx.fillRect(0, 0, W, 200);
    ctx.fillStyle = '#2E2340';
    ctx.globalAlpha = 0.6;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 200);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.ellipse(80 + i * 170, 55 + (i % 3) * 65, 90, 34, i * 0.7, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#B9A44C';
    ctx.font = '15px "Cinzel"';
    ctx.fillText(opts.final ? 'FINAL STANDINGS OF THE WAR' : 'GUILD ASSOCIATION WAR DESK', W / 2, 50);
    ctx.fillStyle = '#F3ECD9';
    ctx.font = '36px "Cinzel Deco"';
    if ('letterSpacing' in ctx) {
        ctx.letterSpacing = '3px';
        ctx.fillText(opts.final ? 'THE WAR IS OVER' : 'WAR STATUS', W / 2, 106);
        ctx.letterSpacing = '0px';
    } else {
        ctx.fillText((opts.final ? 'THE WAR IS OVER' : 'WAR STATUS').split('').join('\u2009'), W / 2, 106);
    }
    ctx.strokeStyle = '#B9A44C';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2 - 170, 134); ctx.lineTo(W / 2 + 170, 134); ctx.stroke();

    // meta line: type · state · players · clock
    ctx.fillStyle = '#B9A44C';
    ctx.font = '17px "Cinzel"';
    const meta = [
        (opts.type || 'normal').toUpperCase(),
        opts.final ? 'FINAL' : (opts.state || 'ACTIVE').toUpperCase(),
        `${opts.players != null ? opts.players : '?'} CHAMPIONS`,
        opts.endsInMin != null ? (opts.endsInMin > 0 ? `${opts.endsInMin} MIN LEFT` : 'CLOSING') : null,
    ].filter(Boolean).join('   ·   ');
    ctx.fillText(meta, W / 2, 168);

    // standings rows
    const standings = Array.isArray(opts.standings) ? opts.standings.slice(0, 8) : [];
    ctx.textAlign = 'left';
    let sy = 250;
    if (!standings.length) {
        ctx.fillStyle = PAL.inkSoft;
        ctx.font = '20px "IM Fell"';
        ctx.fillText('No guild has scored yet. The Ruins wait in silence.', 120, sy);
    } else {
        for (let i = 0; i < standings.length; i++) {
            const g = standings[i];
            const rank = `${i + 1}.`;
            // rank numeral in gold for top 3
            ctx.fillStyle = i < 3 ? '#8B1A2B' : PAL.inkSoft;
            ctx.font = '22px "Cinzel"';
            ctx.fillText(rank, 120, sy);
            ctx.fillStyle = PAL.ink;
            ctx.font = '22px "Cinzel"';
            const name = String(g.name || '').slice(0, 24);
            ctx.fillText(name, 165, sy);
            // dotted leader
            const nameW = ctx.measureText(name).width;
            ctx.strokeStyle = 'rgba(58,42,30,0.4)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([2, 7]);
            ctx.beginPath();
            ctx.moveTo(175 + nameW, sy - 6);
            ctx.lineTo(W - 220, sy - 6);
            ctx.stroke();
            ctx.setLineDash([]);
            // GP right-aligned
            ctx.fillStyle = i < 3 ? PAL.wax : PAL.ink;
            ctx.font = '22px "Cinzel"';
            const gp = `${g.points != null ? g.points : 0} GP`;
            ctx.textAlign = 'right';
            ctx.fillText(gp, W - 120, sy);
            ctx.textAlign = 'left';
            sy += 48;
            if (sy > H - 160) break;
        }
    }

    // footer strip
    ctx.fillStyle = 'rgba(58,42,30,0.08)';
    ctx.fillRect(90, H - 130, W - 180, 52);
    ctx.strokeStyle = PAL.frame;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(90, H - 130, W - 180, 52);
    ctx.textAlign = 'center';
    ctx.fillStyle = PAL.wax;
    ctx.font = '17px "Cinzel"';
    ctx.fillText(opts.final ? 'REWARDS HAVE BEEN PAID TO THE GUILDS' : 'LIVE FEED RUNS IN THE HOST GROUP', W / 2, H - 97);

    ctx.font = 'italic 15px "IM Fell Italic"';
    ctx.fillStyle = PAL.inkSoft;
    ctx.textAlign = 'left';
    ctx.fillText(opts.final ? 'Let the archives record their names.' : 'Score by clearing chambers, carrying relics and breaching the World Core.', 110, H - 62);

    return c.toBuffer('image/png');
}

module.exports = { renderNotice, renderAlignmentCard, renderWarCalledCard, renderWarHelpCard, renderWarStartCard, renderWarStatusCard };
