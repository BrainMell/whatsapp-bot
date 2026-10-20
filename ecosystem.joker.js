// wa-joker dedicated ecosystem (Box 2) — round-20 (2026-10-10)
// REPLACES the raw pm2 cron_restart (was '0 5 * * *'), which killed any
// in-memory dungeon/abyss/PVP run in progress at 05:00 UTC (owner:
// "the games keep quiting mid way?????? It happens alot"). The daily RSS
// creep bound is preserved by scripts/gated_daily_restart.sh (crontab
// 05:10 UTC), which defers until the bot has been chat-quiet for 180s.
// Settings mirrored from the live pm2 config (2026-10-10T18:50Z) verbatim.
// round-21 (2026-10-11T15:1xZ): 3 mid-run pm2 memory kills in 13 min
// (14:34/14:44/14:47 UTC) during combat-card bursts. Kill-moment telemetry:
// rss=401-426MB but heap only 176/185MB + external 39MB -> ~185MB is NATIVE
// malloc retention (glibc arenas; combat spam 400 cmds/day, card bursts).
// Fix: MALLOC_ARENA_MAX=2 + 16MB trim threshold (return free pages to OS),
// cap 380M->430M for burst headroom (box has ~448MB avail + reclaimable cache).
// round-22 (2026-10-20T03:1xZ): pm2 memory kills AGAIN, this time mid-`.j` bake.
// Owner fired `.j world` + `.j base` + `.j guild` back to back; the three
// unqueued canvas bakes (base alone peaked rss=433MB > this 430M cap!) got
// the process SIGINT'd mid-command twice in 25 minutes (boots 03:08:39 /
// 03:11:58). Two-part fix: (a) 47-k9 serializes base/guildbase/room/atlas
// bakes through renderQueue (no more N-concurrent bake stacking), and (b)
// this cap rises 430M->520M — a single cold bake legitimately peaks ~435MB,
// so 430M left zero headroom even WITH serialization. 520M still keeps node
// + ffmpeg + OS well inside 952MB + 2G swap; the RenderQ hard floor (140MB
// MemAvailable) remains the real OOM guard.
module.exports = {
  apps: [{
    name: 'wa-joker',
    script: 'index.js',
    cwd: '/home/ubuntu/whatsapp-bot',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '520M',
    exp_backoff_restart_delay: 100,
    max_restarts: 20,
    min_uptime: '30s',
    node_args: '--max-old-space-size=340 --heapsnapshot-signal=SIGUSR2',
    kill_timeout: 5000,
    merge_logs: true,
    time: true,
    out_file: '~/.pm2/logs/wa-joker-out.log',
    error_file: '~/.pm2/logs/wa-joker-error.log',
    env: {
      NODE_ENV: 'production',
      BOT_INSTANCE: 'Joker',
      GLOBAL_SCHEDULERS: '0',
      START_DELAY_MS: '0',
      PORT: 3002,
      MALLOC_ARENA_MAX: '2',
      MALLOC_TRIM_THRESHOLD_: '16777216',
    },
  }],
};
