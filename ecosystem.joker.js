// wa-joker dedicated ecosystem (Box 2) — round-20 (2026-10-10)
// REPLACES the raw pm2 cron_restart (was '0 5 * * *'), which killed any
// in-memory dungeon/abyss/PVP run in progress at 05:00 UTC (owner:
// "the games keep quiting mid way?????? It happens alot"). The daily RSS
// creep bound is preserved by scripts/gated_daily_restart.sh (crontab
// 05:10 UTC), which defers until the bot has been chat-quiet for 180s.
// Settings mirrored from the live pm2 config (2026-10-10T18:50Z) verbatim.
module.exports = {
  apps: [{
    name: 'wa-joker',
    script: 'index.js',
    cwd: '/home/ubuntu/whatsapp-bot',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '380M',
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
    },
  }],
};
