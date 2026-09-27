// ============================================
// MEDIA WORKER (2026-09-27 quiz speed + reliability pass)
// ============================================
// One shared, concurrency-capped FIFO runner for EVERY heavy media job the
// quiz system needs: image fetch+verify, logo fetch, audio clip fetch,
// ffmpeg trims. Goals (owner brief: "the planning system shouldn't hinder
// the bot's other activities"):
//   - a slow quiz can never flood the event loop / network with parallel
//     media work (hard concurrency cap, FIFO, per-job timeout)
//   - the main bot keeps handling normal commands while media jobs run
//     (every job is async I/O or a child process - the loop never blocks)
//   - observability: job stats + one-line heap telemetry every 5 minutes
//
// Sized for the 1GB Box 1: no worker PROCESS (extra ~60-100MB RSS would
// starve the bot); an in-process runner with strict caps achieves the same
// isolation for I/O-bound media work, and ffmpeg already runs as a child.
// ============================================

const DEFAULT_CONCURRENCY = Math.max(1, parseInt(process.env.QUIZ_MEDIA_CONCURRENCY, 10) || 3);
const DEFAULT_TIMEOUT_MS = Math.max(5000, parseInt(process.env.QUIZ_MEDIA_TIMEOUT_MS, 10) || 90000);
const MAX_QUEUE = 60; // beyond this, reject fast instead of growing unbounded

const state = {
  active: 0,
  queue: [], // { fn, resolve, reject, label, timeoutMs, enqueuedAt }
  done: 0,
  failed: 0,
  timeouts: 0,
};

function _pump() {
  while (state.active < DEFAULT_CONCURRENCY && state.queue.length) {
    const job = state.queue.shift();
    state.active += 1;
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      state.timeouts += 1;
      state.failed += 1;
      state.active -= 1;
      state.done += 1;
      console.log(`[MediaWorker] TIMEOUT job "${job.label}" after ${job.timeoutMs}ms`);
      job.reject(new Error(`media job timeout: ${job.label}`));
      _pump();
    }, job.timeoutMs);

    Promise.resolve()
      .then(job.fn)
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.done += 1;
        state.active -= 1;
        job.resolve(result);
      })
      .catch((e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.failed += 1;
        state.active -= 1;
        job.reject(e);
      })
      .finally(() => _pump());
  }
}

// run(fn, opts) -> Promise<fn()>
// fn must be an async function (or return a promise). opts:
//   label     - for logs/stats (default "job")
//   timeoutMs - per-job kill switch (default env or 90s)
function run(fn, opts = {}) {
  return new Promise((resolve, reject) => {
    if (typeof fn !== "function") { reject(new Error("mediaWorker.run needs a function")); return; }
    if (state.queue.length >= MAX_QUEUE) {
      reject(new Error("media worker queue full"));
      return;
    }
    state.queue.push({
      fn,
      resolve,
      reject,
      label: String(opts.label || "job").slice(0, 60),
      timeoutMs: Math.max(5000, parseInt(opts.timeoutMs, 10) || DEFAULT_TIMEOUT_MS),
      enqueuedAt: Date.now(),
    });
    _pump();
  });
}

function stats() {
  return {
    concurrency: DEFAULT_CONCURRENCY,
    active: state.active,
    queued: state.queue.length,
    done: state.done,
    failed: state.failed,
    timeouts: state.timeouts,
  };
}

// ── heap telemetry (OOM forensics, mirrors the engine's 5-min tick) ──
const _telemetry = setInterval(() => {
  try {
    const m = process.memoryUsage();
    const mb = (n) => Math.round(n / 1024 / 1024);
    const s = stats();
    console.log(`🧠 [mem] rss=${mb(m.rss)}MB heap=${mb(m.heapUsed)}/${mb(m.heapTotal)}MB external=${mb(m.external)}MB | media jobs active=${s.active} queued=${s.queued} done=${s.done} fail=${s.failed}`);
  } catch { /* telemetry must never throw */ }
}, 5 * 60 * 1000);
_telemetry.unref?.();

module.exports = { run, stats, _internal: { state } };
