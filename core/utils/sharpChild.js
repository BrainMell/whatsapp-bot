// ============================================
// SHARP CHILD (2026-09-28) - parent-side manager for the crash-isolated
// sharp worker (sharpChildWorker.js)
// ============================================
// Root cause this fixes: in-process sharp on untrusted images SIGSEGV'd the
// whole bot (GLib/libvips native crash) - pm2 log shows SIGSEGV kills right
// after quiz/logo media prep and sticker scans on 2026-09-27. Symptoms:
//   - "quiz says starting then nothing" (process died during prep)
//   - logos/lore image questions never materialising
//   - antinude never acting (process died mid-scan)
//
// Guarantees:
//   1. A native crash only kills the WORKER child. Jobs in flight reject
//      gracefully; the bot keeps running.
//   2. POISON QUARANTINE: a buffer that killed (or timed out on) the worker
//      is remembered (sha256, 15min TTL) and future jobs with it fail fast
//      instead of crash-looping.
//   3. CIRCUIT BREAKER: >4 abnormal worker exits within 30s opens a 15s
//      cooldown so a poisoned stream of images can't spin-respawn children.
//
// API:
//   runJob('gate', buf, {minW,minH})      -> imageGate verdict object
//   runJob('asticker-frames', buf)        -> [{pos, buf}] (PNG pages)
//   stats()                               -> telemetry
// runJob REJECTS on infra failure (worker died/timeout/circuit). Callers
// decide their own fail-open/fail-closed policy.
// ============================================
'use strict';

const { fork } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const WORKER_PATH = path.join(__dirname, 'sharpChildWorker.js');

const JOB_TIMEOUT_MS = { gate: 8000, 'asticker-frames': 15000 };
const DEFAULT_TIMEOUT_MS = 15000;
const POISON_TTL_MS = 15 * 60 * 1000;
const POISON_MAX = 400;
const CB_WINDOW_MS = 30 * 1000;
const CB_MAX_EXITS = 4;
const CB_COOLDOWN_MS = 15 * 1000;
const RESPAWN_MIN_GAP_MS = 250;

let child = null;
let spawnBlockedUntil = 0;
let seq = 1;
const pending = new Map(); // id -> { reject, timer, shaKey }
const poison = new Map();  // sha -> ts
const exitTimes = [];      // abnormal exit timestamps (circuit breaker)
let circuitOpenUntil = 0;
let _stats = { jobs: 0, done: 0, rejects: 0, timeouts: 0, respawns: 0, poisoned: 0, circuitOpens: 0 };

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function poisonCheck(shaKey) {
  if (!shaKey) return false;
  const ts = poison.get(shaKey);
  if (!ts) return false;
  if (Date.now() - ts > POISON_TTL_MS) { poison.delete(shaKey); return false; }
  return true;
}

function poisonMark(shaKey) {
  if (!shaKey) return;
  if (!poison.has(shaKey)) _stats.poisoned++;
  poison.set(shaKey, Date.now());
  if (poison.size > POISON_MAX) poison.delete(poison.keys().next().value);
}

function killChild(signal) {
  if (!child) return;
  try { child.kill(signal || 'SIGKILL'); } catch { /* already gone */ }
}

function spawnWorker() {
  child = fork(WORKER_PATH, [], {
    serialization: 'advanced', // Buffers over IPC without base64 tax
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  child.on('message', (msg) => {
    if (!msg || typeof msg.id !== 'number') return;
    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    clearTimeout(job.timer);
    if (msg.ok) {
      _stats.done++;
      job.resolve(msg.result);
    } else {
      _stats.rejects++;
      job.reject(new Error('worker-op-failed: ' + (msg.error || 'unknown')));
    }
  });
  child.on('exit', (code, signal) => {
    child = null;
    const crashed = signal === 'SIGSEGV' || signal === 'SIGILL' || signal === 'SIGABRT' || code === 9 || (code !== 0 && code !== null);
    const waiters = [...pending.values()];
    pending.clear();
    for (const job of waiters) {
      clearTimeout(job.timer);
      if (crashed && job.shaKey) poisonMark(job.shaKey); // likely culprit - quarantine
      job.reject(new Error(`sharp worker died (signal=${signal} code=${code})${job.shaKey && crashed ? ' - input quarantined' : ''}`));
    }
    if (crashed) {
      const now = Date.now();
      while (exitTimes.length && now - exitTimes[0] > CB_WINDOW_MS) exitTimes.shift();
      exitTimes.push(now);
      if (exitTimes.length > CB_MAX_EXITS) {
        circuitOpenUntil = now + CB_COOLDOWN_MS;
        _stats.circuitOpens++;
        console.log(`[sharpChild] circuit OPEN ${CB_COOLDOWN_MS / 1000}s after ${exitTimes.length} worker crashes in ${CB_WINDOW_MS / 1000}s`);
      }
      console.log(`[sharpChild] worker crashed (signal=${signal} code=${code}); quarantined=${waiters.length} input(s); respawning`);
    }
    spawnBlockedUntil = Date.now() + RESPAWN_MIN_GAP_MS;
  });
}

function ensureWorker() {
  const now = Date.now();
  if (child) return true;
  if (now < spawnBlockedUntil) return false;
  _stats.respawns++;
  spawnWorker();
  return true;
}

function runJob(op, buf, opts = {}, timeoutMs) {
  return new Promise(async (resolve, reject) => {
    if (!Buffer.isBuffer(buf) || !buf.length) { _stats.rejects++; reject(new Error('no-buffer')); return; }
    const now = Date.now();
    const shaKey = sha256(buf);
    if (poisonCheck(shaKey)) { _stats.rejects++; reject(new Error('poison-input: this exact buffer crashed the worker recently (quarantined 15min)')); return; }
    if (now < circuitOpenUntil) { _stats.rejects++; reject(new Error(`sharp-worker-circuit-open (${Math.ceil((circuitOpenUntil - now) / 1000)}s left after repeated native crashes)`)); return; }

    _stats.jobs++;
    const tmo = timeoutMs || JOB_TIMEOUT_MS[op] || DEFAULT_TIMEOUT_MS;
    const entry = { shaKey, timer: null, resolve, reject };
    entry.timer = setTimeout(() => {
      if (!pending.has(entry._id)) return;
      pending.delete(entry._id);
      _stats.timeouts++;
      poisonMark(shaKey);
      killChild('SIGKILL'); // exit handler rejects any other waiters
      reject(new Error(`sharp job '${op}' timed out after ${tmo}ms - input quarantined`));
    }, tmo);
    entry._id = seq;
    pending.set(seq, entry);
    seq++;

    if (!child && Date.now() < spawnBlockedUntil) {
      // inside the respawn gap after a crash/timeout - wait briefly for the
      // fresh worker instead of failing the caller's job spuriously
      const deadline = Date.now() + 2500;
      while (!child && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    }
    if (!ensureWorker()) { // still not spawnable (another job spawned just now and failed?) - fail
      pending.delete(entry._id);
      clearTimeout(entry.timer);
      _stats.rejects++;
      reject(new Error('sharp worker not available, job rejected'));
      return;
    }
    try {
      child.send({ id: entry._id, op, buf, opts, timeoutMs: tmo });
    } catch (e) {
      pending.delete(entry._id);
      clearTimeout(entry.timer);
      _stats.rejects++;
      reject(new Error('worker send failed: ' + String(e.message).slice(0, 60)));
    }
  });
}

function stats() {
  return {
    ..._stats,
    up: !!child,
    inFlight: pending.size,
    poisonedCached: poison.size,
    circuitOpen: Date.now() < circuitOpenUntil,
  };
}

module.exports = { runJob, stats };
