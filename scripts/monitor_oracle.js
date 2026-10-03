#!/usr/bin/env node
/**
 * Monitor Oracle PM2 logs for image command activity.
 * Watches for .jk coll/.char/.bal/.deck/.diag and reports what happens.
 *
 * Usage: node scripts/monitor_oracle.js [duration_seconds]
 * Default: 300 seconds (5 minutes)
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const ORACLE_HOST = '84.8.130.156';
const ORACLE_USER = 'ubuntu';
const KEY_PATH = path.join(process.env.HOME, '.ssh', 'oracle_key');

const duration = parseInt(process.argv[2] || '300', 10);

const conn = new Client();

console.log(`Monitoring Oracle PM2 logs for ${duration}s...`);
console.log(`Watching for: .jk coll/char/bal/deck/diag, cmdColl, cardSystem, GoService, crashes`);
console.log('');

const patterns = [
  'Pipeline:2.*text=',
  'Pipeline:3.*cardSystem',
  'Pipeline:4.*CMD DETECTED',
  'cmdColl',
  'cardSystem.*dispatching',
  'cardSystem.*returned',
  'sock_ref is null',
  'GoService.*Health',
  'GoService.*Error',
  'TIMED OUT',
  'TIMEOUT',
  'SKIPPING',
  'profilePictureUrl',
  'generateCardGrid',
  'generateProfileCard',
  'sendMessage',
  'IMAGE SENT',
  'IMAGE SEND FAILED',
  'Error:',
  'TypeError',
  'Cannot read',
  'injected env',
  'Spawning bot',
  'WhatsApp connected',
];

const grepPattern = patterns.join('|');

conn.on('ready', () => {
  // Use tail -f with grep to stream matching lines
  const cmd = `timeout ${duration} tail -f ~/.pm2/logs/whatsapp-bot-out.log ~/.pm2/logs/whatsapp-bot-error.log 2>&1 | grep --line-buffered -E "${grepPattern}"`;
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Exec error:', err.message);
      conn.end();
      process.exit(1);
    }
    stream.on('close', () => {
      console.log('\n--- monitoring complete ---');
      conn.end();
      process.exit(0);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
});

conn.on('error', (err) => {
  console.error('❌ SSH error:', err.message);
  process.exit(1);
});

conn.connect({
  host: ORACLE_HOST,
  port: 22,
  username: ORACLE_USER,
  privateKey: fs.readFileSync(KEY_PATH, 'utf8'),
  readyTimeout: 15000,
});
