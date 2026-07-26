#!/usr/bin/env node
/**
 * SSH into Oracle and run diagnostic commands directly.
 * Usage: node scripts/ssh_oracle.js "command to run"
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const ORACLE_HOST = '84.8.130.156';
const ORACLE_USER = 'ubuntu';
const KEY_PATH = path.join(process.env.HOME, '.ssh', 'oracle_key');

const cmd = process.argv[2] || 'pm2 list && echo "---" && curl -s -m 5 http://127.0.0.1:7860/health';

const conn = new Client();

console.log(`Connecting to ${ORACLE_USER}@${ORACLE_HOST}...`);
console.log(`Command: ${cmd}`);
console.log('');

conn.on('ready', () => {
  console.log('✅ SSH connected\n');
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Exec error:', err.message);
      conn.end();
      process.exit(1);
    }
    let stdout = '';
    let stderr = '';
    stream.on('close', (code) => {
      console.log(`\n--- exit code: ${code} ---`);
      if (stderr) console.error('STDERR:', stderr);
      conn.end();
      process.exit(code || 0);
    }).on('data', (data) => {
      process.stdout.write(data);
      stdout += data;
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
      stderr += data;
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
