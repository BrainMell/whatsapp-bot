// Renders every ruins encounter card + all battle variants into the workspace
// downloads folder so the owner can eyeball the whole set: 2026-10-03
// Usage: node scripts/gw_card_gallery.js /home/z/my-project/download/ruins_cards
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || '/home/z/my-project/download/ruins_cards';
const cards = require('../core/rpg/guildWar/encounterCards');

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const jobs = [];

    // 1) one card per encounter type
    const samples = {
        combat:    { body: 'Scavengers bar the way - bold, but no veterans.', actionHint: 'Type fight to engage. Fleeing retreats you and forfeits this room\'s spoils.' },
        puzzle:    { body: 'Three runes sit above the lintel: sun, moon, then the eye that is neither. Set them in the order the old hymn names them.', actionHint: 'Reply with your answer - 3 attempts. Wrong answers have a cost.' },
        discovery: { body: 'Half-buried beneath the rubble, something still hums with old power.', actionHint: 'Type dig to unearth it.' },
        reward:    { body: 'A vault-chamber of the old world - untouched since the world died.', actionHint: 'Type take to claim what lies within.' },
        hazard:    { body: 'A pressure plate hisses - green gas floods the hall...', actionHint: 'Type cross to attempt passage.' },
        lore:      { body: 'This hall once belonged to the ember fields. The murals still burn faintly.', actionHint: 'Type read to study the inscriptions.' },
        secret:    { body: 'A hidden chamber - and something ancient guards it.', actionHint: 'Type fight - or flee now.' },
        anomaly:   { body: 'Reality thins here - the walls between worlds bleed through.', actionHint: 'Type touch to interact... or move on.' },
        landmark:  { title: 'The Silent Obelisk', body: 'A landmark of the ember fields, visible from far away. First guild to record it earns recognition.', actionHint: 'Type record to claim it for your guild.' },
        coop:      { body: 'A hungry pack floods the hall - too many to count.', actionHint: 'Type fight to engage - allies share the reward.' },
        core:      { body: 'The heart of this dead world still beats here. A mighty guardian bars the way. First guild to breach it earns lasting glory.', actionHint: 'Type fight to challenge the guardian.' },
    };
    const CFG = require('../core/rpg/guildWar/config');
    for (const [type, s] of Object.entries(samples)) {
        const variants = (type === 'combat' || type === 'coop')
            ? { SKIRMISH: CFG.COMBAT.VARIANTS.SKIRMISH }
            : null;
        const vKey = variants ? Object.keys(variants)[0] : null;
        jobs.push(['type_' + type + (vKey ? '_' + vKey.toLowerCase() : ''), cards.renderRoomCard({
            type,
            variant: vKey ? { key: vKey, ...CFG.COMBAT.VARIANTS[vKey] } : null,
            title: s.title || null,
            body: s.body,
            actionHint: s.actionHint,
            world: 'the ember fields',
            ring: type === 'combat' ? 2 : 1,
            boss: type === 'core' || type === 'secret',
        })]);
    }

    // 2) all battle variants on a combat card
    for (const [key, v] of Object.entries(CFG.COMBAT.VARIANTS)) {
        jobs.push(['variant_' + key.toLowerCase(), cards.renderRoomCard({
            type: 'combat',
            variant: { key, ...v },
            body: v.line,
            actionHint: 'Type fight to engage. Fleeing retreats you and forfeits this room\'s spoils.',
            world: 'the frost reach',
            ring: 3,
            boss: false,
        })]);
    }

    // 3) a relic banner
    jobs.push(['banner_relic', cards.renderBannerCard({
        glyph: '◈',
        title: 'Relic Claimed',
        body: 'Nyx carries the Ember Compass (Rare). Rare+ relics can be stolen in ruins duels - hand it in with handin to bank it.',
    })]);

    // 4) the two initiation cards
    const notice = require('../core/rpg/guildWar/noticeCard');
    jobs.push(['init_alignment_organic', notice.renderAlignmentCard({ regMinutes: 45 })]);
    jobs.push(['init_mod_war_called', notice.renderWarCalledCard({ type: 'normal', host: 'Warlord Kaine', regMinutes: 45 })]);
    jobs.push(['init_mod_war_called_align', notice.renderWarCalledCard({ type: 'alignment', host: 'Warlord Kaine', regMinutes: 45 })]);

    for (const [name, p] of jobs) {
        const buf = await p;
        if (!buf) { console.error('RENDER FAILED:', name); process.exitCode = 1; continue; }
        const f = path.join(OUT, name + '.png');
        fs.writeFileSync(f, buf);
        console.log(name, buf.length, 'bytes');
    }
    console.log('gallery ->', OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
