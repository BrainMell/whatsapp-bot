// ============================================
// 🛠️ OPS CHECK - deploy-pipeline verification
// Added 2026-09-10 after the boot-volume rebuild surgery
// to verify the change -> push -> deploy -> pm2 chain end-to-end.
// Harmless by design: read-only, no DB access, no side effects.
//
// 2026-10-02 (owner request): `-info` decluttered - the old wall of
// accumulated command docs (09-26/27/28 audit notes) was cleared and
// replaced with ONLY the latest session's changes. Older command syntax
// lives in `.j help` / the per-command usage messages.
// ============================================

const os = require('os');
const { execSync } = require('child_process');

function safe(cmd) {
    try {
        return execSync(cmd, { timeout: 3000, encoding: 'utf8' }).trim();
    } catch (e) {
        return '?';
    }
}

async function handleOpsCheck(sock, chatId, args) {
    const deployed = safe('git rev-parse --short HEAD');
    const branch = safe('git rev-parse --abbrev-ref HEAD');
    const uptime = safe('uptime -p').replace(/^up\s+/, '');
    const mem = safe('free -m | awk \'/^Mem:/ {print $3 "MB/" $2 "MB"}\'');
    const arg = String(args || '').trim().toLowerCase();

    // ── -info: latest changes only ──
    if (arg === '-info' || arg === 'info' || arg === '--info') {
        const info = [
            '╔═════════════════╗',
            '   📚 *WHAT\'S NEW*',
            '╚═════════════════╝',
            '',
            '🖼 *QUIZ IMAGE SYSTEM REBUILT*',
            '   • category-routed multi-source retrieval (AniList / Kitsu / TVMaze / Steam / Speedrun / iTunes / Wikipedia / Wikidata + web fallback)',
            '   • every image: pixel gate → vision verify → white-background flatten → 800×800 normalize',
            '   • logo questions get the same treatment — no more broken/transparent logos',
            '   • franchises with no character art auto-rescue into entity-art questions ("Which game is this artwork from?")',
            '   • fixed: Ben 10 (actor headshots), Casablanca (misrouted to the anime chain), Apollo 9 (dead pool)',
            '',
            '⚔️ *RPG FIXES*',
            '   • `.j debate` works again — progress was silently never saved, and LID/phone players didn\'t match each other',
            '   • passive HP regen now exists — out of combat, 24h to a full bar (the hospital cooldown message promised this but it never existed)',
            '   • `.j guild emblem` accepts family/complex emojis',
            '   • abyss sheet alignment text now follows the live cosmology setting (no more hardcoded "~7 days")',
            '',
            '🌌 *WORLD ALIGNMENT — NEW CADENCE*',
            '   • triune alignment now fires on a deterministic ~4-day cycle (was a lumpy ~2-week coincidence)',
            '   • alignment events reach players by DM through the new encounter framework — state-tracked, quit anytime, auto-cleanup',
            '',
            '⚔️ *COMBAT IMAGES AT SCALE*',
            '   • combat art generation retuned for 20+ concurrent players: priority queue, tight time budgets, graceful fallback to static art when the box saturates — everyone gets an image, nothing hangs',
            '',
            '🔞 *ANTINUDE*',
            '   • nsfwcheck 502s fixed — the classifier now runs as a persistent service on Box 2 (survives reboots)',
            '',
            `📦 Commit: \`${deployed}\` on \`${branch}\``,
        ].join('\n');
        await sock.sendMessage(chatId, { text: info });
        return;
    }

    const msg = [
        '╔═════════════════╗',
        '   🛠️ *OPS CHECK*',
        '╚═════════════════╝',
        '',
        `✅ Deploy pipeline: *WORKING*`,
        `📦 Commit: \`${deployed}\` on \`${branch}\``,
        `⏱️ Uptime: ${uptime || '?'}`,
        `🧠 Memory: ${mem || '?'}`,
        `🖥️ Host: \`${os.hostname()}\``,
        '',
        `📚 Recent changes: \`.j opscheck -info\``,
        `_If you can read this, code changes reach the box and load correctly._`,
    ].join('\n');

    await sock.sendMessage(chatId, { text: msg });
}

module.exports = { handleOpsCheck };
