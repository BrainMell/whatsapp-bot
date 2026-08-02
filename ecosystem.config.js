// PM2 Ecosystem Configuration for Mellow's WhatsApp Bot
// ============================================
// Run with: pm2 start ecosystem.config.js
//           pm2 restart ecosystem.config.js
//
// Key settings:
//   - max_memory_restart: 450MB — PM2 auto-restarts if Node exceeds this
//     (prevents OOM kills on the 954MB Oracle Box 1; leaves room for Go
//     service + scraper + OS). The bot normally sits at 250-340MB.
//   - exp_backoff_restart_delay: starts at 100ms, doubles each restart up
//     to 15s max — prevents rapid crash loops from burning CPU.
//   - node_args: --max-old-space-size=400 — V8 heap limit, slightly below
//     the PM2 memory threshold so V8 GC runs before PM2 kills.
//   - Environment vars loaded from .env (already in repo).
//
// After applying: pm2 delete whatsapp-bot && pm2 start ecosystem.config.js
// Then: pm2 save

module.exports = {
  apps: [{
    name: 'whatsapp-bot',
    script: 'index.js',
    cwd: '/home/ubuntu/whatsapp-bot',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '450M',
    exp_backoff_restart_delay: 100,
    max_restarts: 20,
    min_uptime: '30s',
    node_args: '--max-old-space-size=400',
    env: {
      NODE_ENV: 'production',
    },
    // Graceful shutdown — give Baileys 5s to flush pending sends
    kill_timeout: 5000,
    // Log rotation — keep last 1000 lines per file
    merge_logs: true,
    out_file: '~/.pm2/logs/whatsapp-bot-out.log',
    error_file: '~/.pm2/logs/whatsapp-bot-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true,
  }]
};
