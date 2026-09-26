// ============================================
// 🛠️ OPS CHECK - deploy-pipeline verification
// Added 2026-09-10 after the boot-volume rebuild surgery
// to verify the change -> push -> deploy -> pm2 chain end-to-end.
// Harmless by design: read-only, no DB access, no side effects.
//
// 2026-09-26 (quiz audit P18): `-info` mode documents the current command
// surface - new commands, quiz syntax + flags, quizmod settings (with the
// group's LIVE configured values), stock/trends, and major behavior
// changes. Kept data-driven (imports the QuizConfig registry) so the docs
// update automatically when settings change - no manual sync.
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

    // ── -info: command documentation ──
    if (arg === '-info' || arg === 'info' || arg === '--info') {
        let quizConfigDoc = '';
        try {
            const quizConfigMod = require('../games/quizConfig');
            const DEFAULTS = quizConfigMod.DEFAULTS;
            const overrides = quizConfigMod.loadGroupOverrides(chatId) || {};
            quizConfigDoc = Object.entries(quizConfigMod.SETTING_DEFS)
                .map(([name, def]) => {
                    const val = overrides[def.key] !== undefined ? overrides[def.key] : DEFAULTS[def.key];
                    const range = def.type === 'int' ? ` ${def.min}-${def.max}` : ' on|off';
                    const scope = def.scope === 'global' ? ' •GLOBAL•' : '';
                    const mod = overrides[def.key] !== undefined ? ' ✏️' : '';
                    return `   \`${def.label}\`: *${val}*${mod} (set:${name}${range})${scope}`;
                })
                .join('\n');
        } catch (e) {
            quizConfigDoc = `   (config unavailable: ${e.message})`;
        }

        const info = [
            '╔═════════════════╗',
            '   📚 *COMMAND INFO*',
            '╚═════════════════╝',
            '',
            '🎯 *QUIZ* — lore trivia from a franchise\'s wiki',
            '   `.j quiz "<title>" [count] [easy|medium|hard]`',
            '   Flags:',
            '   • `-s <topic>` — force one topic: plot, characters, cosmology, powerscaling, production',
            '   • `-images <n>` — add picture questions (character ID)',
            '   • `-audio <n>` — add audio questions (theme songs / character voices)',
            '   • `random` — e.g. `.j quiz random 20 -images 5 -audio 3` mixes franchises + media types',
            '   • answers: `.j a|b|c|d <letter>` or `.j answer <letter>` — ONE answer per player per question',
            '   • count up to 50; 40+ quizzes play in named sections with breaks',
            '   • one attempt per player per question; wrong first answer = out for that question',
            '   Related: `.j quizboard` • `.j quiz end` • `.j quiz pick <n>`',
            '',
            '⚙️ *QUIZMOD* (mods only — per-group unless marked GLOBAL)',
            quizConfigDoc,
            '   `.j quizmod` — show config • `.j quizmod reset` — restore defaults',
            '',
            '🚀 *QUIZ PERFORMANCE (2026-09-26 speed pass)*',
            '   • generation pipeline: lore retrieval + LLM calls run in parallel rounds (bounded burst, `QUIZ_LLM_BURST`=3) — a 10-question section builds in ~2-4 LLM round-trips instead of 10+ sequential ones',
            '   • theme-song audio: the Go audio service hands back the clipped 30s/96k mp3 directly (no full-track re-download, no local ffmpeg); clips cached server-side per track',
            '   • theme-song fetch overlaps text generation; intro image downloads while section 1 generates; franchise intro images are memory-cached',
            '   • image questions download their image exactly once (generation-time bytes are reused at send time)',
            '   • *generation concurrency cap*: max 2 quizzes generating at once bot-wide (`QUIZ_GEN_SLOTS`); extra groups queue FIFO and start automatically; groups queued >10min (`QUIZ_GEN_QUEUE_TIMEOUT_MS`) get an explicit "queue is full" deferral — nothing is ever dropped silently. Playing is never gated.',
            '',
            '🔧 *QUIZ EXTERNAL DEPENDENCIES (operators)*',
            '   • Go audio service (`GO_AUDIO_SERVICE_URL`, default 127.0.0.1:7860): `GET /api/scrape/audio?query=…` (+ optional `clip_seconds`, `clip_bitrate`) — search/download/transcode/trim; `GET /downloads/<hash>*.mp3` serves cached audio',
            '   • Go service `GET /api/scrape/verify/image?url=…` — image magic-byte/sha1 verification (utility; Fandom CDN rejects Go TLS with 403, quiz verifies Fandom images locally)',
            '   • both live in the Bot_genaration repo (branch perf/quiz-audio-clip); restart `bot-generation-go` (pm2) after Go-side changes — the quiz degrades gracefully to legacy local ffmpeg trimming if clip support is missing',
            '   • if audio questions never appear: check `pm2 logs bot-generation-go`, `/health`, and that `downloads/` has free disk',
            '',
            '📈 *STOCK* — real market charts (Yahoo Finance)',
            '   `.j stock <ticker> [1d|5d|1m|6m|1y|5y]` — stocks, crypto (BTC-USD), FX (EURUSD=X), futures',
            '',
            '📊 *TRENDS* — Google Trends comparison charts',
            '   `.j trends <kw1> vs <kw2> [US|global] [1h|12h|24h|7d|30d|90d|12m|5y]`',
            '',
            '🎵 *AUDIO* — `.j audio <song>` • ✂️ *CLIP* — reply to audio: `.clip <start> <end>`',
            '',
            '🛠️ Recent behavior changes:',
            '   • slow commands (quiz/trends/stock/audio/img...) get per-command time windows — no more fake 45s timeouts',
            '   • quiz answers no longer trip the global 5s command cooldown',
            '   • only one quiz per group at a time; generation runs in background with a loading message',
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
        `📚 Command docs: \`.j opscheck -info\``,
        `_If you can read this, code changes reach the box and load correctly._`,
    ].join('\n');

    await sock.sendMessage(chatId, { text: msg });
}

module.exports = { handleOpsCheck };
