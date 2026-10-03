// ============================================
// 🎨 QA RENDER: new gw cards (field manual + status/final standings)
// Renders both new noticeCard functions to PNG for visual inspection.
// Run: node scripts/qa_war_cards.js
// ============================================
const path = require('path');
const fs = require('fs');

async function main() {
    const notice = require('../core/rpg/guildWar/noticeCard');
    const outDir = '/home/z/my-project/download/ruins_cards';
    fs.mkdirSync(outDir, { recursive: true });

    const help = await notice.renderWarHelpCard({});
    fs.writeFileSync(path.join(outDir, 'war_field_manual.png'), help);
    console.log('rendered war_field_manual.png', help.length, 'bytes');

    const status = await notice.renderWarStatusCard({
        type: 'normal', state: 'ACTIVE', players: 12, endsInMin: 184,
        standings: [
            { name: 'Iron Vanguard', points: 340 },
            { name: 'Ashen Covenant', points: 275 },
            { name: 'The Pale Court', points: 190 },
            { name: 'Emberhold', points: 88 },
        ],
    });
    fs.writeFileSync(path.join(outDir, 'war_status_board.png'), status);
    console.log('rendered war_status_board.png', status.length, 'bytes');

    const final = await notice.renderWarStatusCard({
        type: 'alignment', final: true, players: 21,
        standings: [
            { name: 'Iron Vanguard', points: 612 },
            { name: 'Ashen Covenant', points: 405 },
        ],
    });
    fs.writeFileSync(path.join(outDir, 'war_final_board.png'), final);
    console.log('rendered war_final_board.png', final.length, 'bytes');

    process.exit(0);
}

main().catch((e) => { console.error('QA render failed:', e); process.exit(1); });
