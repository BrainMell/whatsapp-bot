// PM2 ecosystem — wa-miner (shoob.gg card miner) — runs on BOX 1 ONLY
// ====================================================================
// Mellow 2026-10-07: "turn off the other bots on box 1, keep Joker active,
// use the server to mine for shob.gg cards". wa-jake + wa-subaru are pm2
// STOPPED (auths preserved, nothing removed — turn back on with
// `pm2 start wa-jake wa-subaru`); the freed box runs this miner instead.
//
//   pm2 start ecosystem.miner.js && pm2 save
//   pm2 logs wa-miner
//   pm2 stop wa-miner        # pauses mining (keeps outputs/media)
//
// Knobs are env (MINER_*), defaults are sane: every 45 min, media mirror on,
// 5GB disk floor. Outputs: output/ (JSON) + media/ (gif/webm archive).
// Publishes to the shared Mongo System collection -> `.j mentoring` on Joker.

module.exports = {
  apps: [
    {
      name: 'wa-miner',
      script: 'miner.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      exp_backoff_restart_delay: 250,
      max_restarts: 50,
      min_uptime: '60s',
      node_args: '--max-old-space-size=256',
      kill_timeout: 10000, // let an in-flight media save + manifest write finish
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
      env: {
        NODE_ENV: 'production',
        MINER_INTERVAL_MIN: '45',
        MINER_FIRST_DELAY_MIN: '0.25',
        MINER_DISK_FLOOR_MB: '5120',
        MINER_PUBLISH: '1',
        MINER_MEDIA: '1',
      },
    },
  ],
};
