// ============================================
// 🛠️ OPS CHECK — deploy-pipeline verification
// Added 2026-09-10 after the boot-volume rebuild surgery
// to verify the change -> push -> deploy -> pm2 chain end-to-end.
// Harmless by design: read-only, no DB access, no side effects.
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

async function handleOpsCheck(sock, chatId) {
    const deployed = safe('git rev-parse --short HEAD');
    const branch = safe('git rev-parse --abbrev-ref HEAD');
    const uptime = safe('uptime -p').replace(/^up\s+/, '');
    const mem = safe('free -m | awk \'/^Mem:/ {print $3 "MB/" $2 "MB"}\'');

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
        `_If you can read this, code changes reach the box and load correctly._`,
    ].join('\n');

    await sock.sendMessage(chatId, { text: msg });
}

module.exports = { handleOpsCheck };
