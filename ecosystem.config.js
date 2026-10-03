// PM2 Ecosystem - 2-TENANT BOX1 + REMOTE JOKER (2026-10-03)
// ==========================================================
// WHY SPLIT: one shared process (wa-jake+joker+subaru together) meant
//   - one memory bump → ALL tenants down at once
//   - one deploy restart → 90s serial boot chain, whole fleet dark
//   - one WhatsApp reconnect storm (3 sessions, same IP, simultaneously)
// Now each tenant is its own process: independent restarts, independent
// memory ceilings, an outlier tenant can bounce without touching the rest.
//
// CROSS-BOX TOPOLOGY (2026-10-03 evening): Box 1 (952MB RAM) went into
//   full swap-thrash hosting 3 tenants + go services → event loops
//   stalled → sockets died → watchdog reconnect storms → WhatsApp
//   same-IP relogin throttle → fleet "down". wa-joker was MOVED TO BOX 2
//   (its own idle host, its own IP, go image/audio service present there).
//   This file now defines ONLY Box 1's tenants. wa-joker on Box 2 runs
//   from its own ecosystem file (~/whatsapp-bot/ecosystem.joker.js).
//
// Run with:  pm2 start ecosystem.config.js
//            pm2 restart ecosystem.config.js
//            pm2 save
//
// KEY SETTINGS
//   BOT_INSTANCE        - index.js instance filter (Jake/Joker/Subaru).
//   GLOBAL_SCHEDULERS   - global-DB schedulers (wealth tax, raid, bounty,
//                         passive regen, sprite warm-up) run on wa-jake ONLY.
//                         3 processes running them = 3x tax / 3x regen.
//   START_DELAY_MS      - stagger cold boots so WhatsApp sessions
//                         never reconnect simultaneously (same-IP limit).
//   cron_restart        - STAGGERED per tenant (04:30 jake / 04:45 subaru):
//                         simultaneous same-IP relogins burn the relogin
//                         budget and can trigger hours-long 408 storms.
//   max_memory_restart  - per-tenant ceiling (shared process sat at
//                         380-450MB; a single tenant idles ~100-150MB).
//   cron_restart 04:30  - daily off-peak restart bounds the slow RSS
//                         creep (replaces the old crontab line).
//   --heapsnapshot-signal=SIGUSR2 - `pm2 trigger`-less leak triage:
//                         kill -USR2 <pid> writes a .heapsnapshot for
//                         heap analysis without killing the session.

const APP_BASE = {
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
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  time: true,
};

module.exports = {
  apps: [
    {
      ...APP_BASE,
      name: 'wa-jake',
      out_file: '~/.pm2/logs/wa-jake-out.log',
      error_file: '~/.pm2/logs/wa-jake-error.log',
      cron_restart: '30 4 * * *',
      env: {
        NODE_ENV: 'production',
        BOT_INSTANCE: 'Jake',
        GLOBAL_SCHEDULERS: '1',
        START_DELAY_MS: '0',
        PORT: 3001,
      },
    },
    {
      ...APP_BASE,
      name: 'wa-subaru',
      out_file: '~/.pm2/logs/wa-subaru-out.log',
      error_file: '~/.pm2/logs/wa-subaru-error.log',
      cron_restart: '45 4 * * *',
      env: {
        NODE_ENV: 'production',
        BOT_INSTANCE: 'Subaru',
        GLOBAL_SCHEDULERS: '0',
        START_DELAY_MS: '30000',
        PORT: 3003,
      },
    },
  ],
};
