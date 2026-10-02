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
            '⚔️ *GUILD WAR — THE RUINS IS LIVE*',
            '   • `.j gw` — full surface: `gw start [alignment]` (mod), `gw join`, `gw forcestart` (mod), `gw status`, `gw end | abort` (mod)',
            '   • `.j wr` and `.j war` do the same now — the old switch works again',
            '   • the menu\'s dead "war" entries were replaced with the real ruins commands',
            '   • mods open a war from a group → that group gets the live feed → players deploy into bot DMs:',
            '     `move n/s/e/w` · `look` · `map` · `relics` · `handin` · `challenge @name` · `share map @mate` · `quit`',
            '   • room types: guarded combat · puzzle seals · buried caches · vaults · hazards · lore · hidden chambers · world-thin anomalies · landmarks · guardian packs · THE WORLD CORE',
            '   • battle variants every fight: Skirmish · Ambush · Elite Guard · Horde · Cursed Ground · Bounty Mark — each changes enemies and spoils (+20%…+100%)',
            '   • every encounter now arrives as a parchment decree card; relics are session-only, hand them in for guild points',
            '   • TWO initiation cards: mods raise a single-GC "WAR CALLED" decree; organic world alignments broadcast a "THE WORLDS ALIGN" card to every GC marked RPG-friendly',
            '   • `.j gw rpg on|off|status` — admins/mods mark a GC to receive the organic alignment calls (paced, one card per ~4-day window, no spam)',
            '',
            '🖼 *QUIZ IMAGE SYSTEM REBUILT*',
            '   • category-routed multi-source retrieval (AniList / Kitsu / TVMaze / Steam / Speedrun / iTunes / Wikipedia / Wikidata + web fallback)',
            '   • every image: pixel gate → vision verify → white-background flatten → 800×800 normalize',
            '   • franchises with no character art auto-rescue into entity-art questions',
            '',
            '⚔️ *RPG FIXES*',
            '   • `.j debate` works again — progress was silently never saved, and LID/phone players didn\'t match each other',
            '   • passive HP regen now exists — out of combat, 24h to a full bar',
            '   • `.j guild emblem` accepts family/complex emojis',
            '',
            '🌌 *WORLD ALIGNMENT*',
            '   • triune alignment fires on a deterministic ~4-day cycle and auto-launches an alignment-scale war (the peak Guild War variant)',
            '',
            '⚔️ *COMBAT IMAGES AT SCALE*',
            '   • combat art retuned for 20+ concurrent players — everyone gets an image, nothing hangs',
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
