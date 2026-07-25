// ════════════════════════════════════════════════════════════════════════
// REGRESSION TEST: Image pipeline scope fix
// ════════════════════════════════════════════════════════════════════════
//
// BUG (pre-fix):
//   sendImageSafe, buildThumbnail, and FALLBACK_THUMB were defined INSIDE
//   the message-upsert callback (deeply nested at indent 20). Top-level
//   handlers like handleAnimeTrending (defined at indent 4 inside the
//   outer storage.run callback) could NOT see them. Every call to
//   sendImageSafe from those handlers threw:
//     ReferenceError: sendImageSafe is not defined
//   which was caught by the handler's try/catch and surfaced to the
//   user as a generic "Could not fetch..." error.
//
// FIX:
//   Moved all three to module scope (above startBot). Now any handler
//   at any nesting level can call sendImageSafe.
//
// This test verifies the fix by:
//   1. Verifying the definitions are at column 0 (module scope).
//   2. Verifying they appear BEFORE startBot (so they're at module scope,
//      not inside any function).
//   3. Verifying no nested duplicates remain.
//   4. Verifying the Jimp v1.x API is used.
//   5. Sanity-checking the sendImageSafe flow.
// ════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ENGINE_PATH = path.join(__dirname, '..', 'core', 'engine.js');
const src = fs.readFileSync(ENGINE_PATH, 'utf8');
const lines = src.split('\n');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ ${name}`);
    pass++;
  } else {
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    fail++;
  }
}

function lineOf(pattern) {
  const m = src.match(pattern);
  if (!m) return -1;
  return src.slice(0, m.index).split('\n').length;
}

// Find startBot definition
const startBotLine = lineOf(/^async function startBot\(/m);
console.log(`startBot defined at line ${startBotLine}`);

console.log('\n=== TEST 1: sendImageSafe is at module scope (before startBot) ===');
const sendImageSafeLine = lineOf(/^async function sendImageSafe\(/m);
check(
  `sendImageSafe defined at column 0 (line ${sendImageSafeLine})`,
  sendImageSafeLine > 0,
);
check(
  `sendImageSafe is defined BEFORE startBot (line ${startBotLine}) — i.e. at module scope`,
  sendImageSafeLine > 0 && sendImageSafeLine < startBotLine,
);

console.log('\n=== TEST 2: buildThumbnail is at module scope ===');
const buildThumbnailLine = lineOf(/^async function buildThumbnail\(/m);
check(
  `buildThumbnail defined at column 0 (line ${buildThumbnailLine})`,
  buildThumbnailLine > 0,
);
check(
  `buildThumbnail is defined BEFORE startBot — i.e. at module scope`,
  buildThumbnailLine > 0 && buildThumbnailLine < startBotLine,
);

console.log('\n=== TEST 3: FALLBACK_THUMB is at module scope ===');
const fallbackLine = lineOf(/^const FALLBACK_THUMB = /m);
check(
  `FALLBACK_THUMB defined at column 0 (line ${fallbackLine})`,
  fallbackLine > 0,
);
check(
  `FALLBACK_THUMB is defined BEFORE startBot — i.e. at module scope`,
  fallbackLine > 0 && fallbackLine < startBotLine,
);

console.log('\n=== TEST 4: No leftover nested definitions inside message handler ===');
// The old definitions were inside the message handler at indent 20.
// After the fix, there should be no `async function sendImageSafe` at
// non-zero indent.
const nestedDef = src.match(/^[ \t]+async function sendImageSafe\(/m);
check(
  'No nested `async function sendImageSafe` definition remains',
  !nestedDef,
  nestedDef ? `found at line ${lineOf(/^[ \t]+async function sendImageSafe\(/m)}` : '',
);
const nestedBuild = src.match(/^[ \t]+async function buildThumbnail\(/m);
check(
  'No nested `async function buildThumbnail` definition remains',
  !nestedBuild,
);
const nestedFallback = src.match(/^[ \t]+const FALLBACK_THUMB = /m);
check(
  'No nested `const FALLBACK_THUMB` definition remains',
  !nestedFallback,
);

console.log('\n=== TEST 5: All call sites can lexically reach the module-scope definition ===');
// Find every call to sendImageSafe
const callSitePattern = /\bsendImageSafe\s*\(/g;
let callCount = 0;
let m;
const callSiteLines = [];
while ((m = callSitePattern.exec(src)) !== null) {
  const lineNum = src.slice(0, m.index).split('\n').length;
  const line = lines[lineNum - 1] || '';
  if (line.includes('async function sendImageSafe')) continue; // skip definition
  if (line.trim().startsWith('//')) continue; // skip comments
  callCount++;
  callSiteLines.push(lineNum);
}
check(`Found ${callCount} call sites for sendImageSafe`, callCount > 0);
console.log(`  call sites at lines: ${callSiteLines.join(', ')}`);

// Pick a call site that USED TO BE BROKEN — handleAnimeTrending's call
// (around line 1168 after the fix).
const handleTrendingCall = callSiteLines.find((ln) => ln < 1500);
check(
  `handleAnimeTrending's call (line ${handleTrendingCall}) exists — was broken before, fixed now`,
  handleTrendingCall !== undefined,
);

console.log('\n=== TEST 6: buildThumbnail uses correct Jimp v1.x API ===');
// We only check the buildThumbnail function body, not the entire file
// (which has comments mentioning the old API for documentation purposes).
const buildThumbnailBody = src.match(
  /async function buildThumbnail\(imgBuffer\) \{[\s\S]*?\n\}/,
);
check(
  'buildThumbnail body found',
  !!buildThumbnailBody,
);
if (buildThumbnailBody) {
  const body = buildThumbnailBody[0];
  check(
    'uses Jimp.Jimp.read (v1.x) — not Jimp.read (v0.x)',
    /Jimp\.Jimp\.read\b/.test(body),
  );
  check(
    'uses Jimp.JimpMime.jpeg (v1.x) — not Jimp.MIME_JPEG (v0.x)',
    /Jimp\.JimpMime\.jpeg/.test(body),
  );
  check(
    'uses img.resize({ w: 32 }) (v1.x options object)',
    /img\.resize\(\s*\{\s*w:\s*32\s*\}\s*\)/.test(body),
  );
  check(
    'uses img.getBuffer (v1.x) — not img.getBufferAsync (v0.x)',
    /img\.getBuffer\b/.test(body) && !/img\.getBufferAsync\b/.test(body),
  );
  check(
    'no references to Jimp.AUTO (removed in v1.x)',
    !/Jimp\.AUTO\b/.test(body),
  );
  check(
    'no references to Jimp.MIME_JPEG (renamed in v1.x)',
    !/Jimp\.MIME_JPEG\b/.test(body),
  );
  check(
    'no references to Jimp.read (v0.x top-level — i.e. Jimp.read NOT preceded by Jimp.)',
    !/(?<!Jimp\.)Jimp\.read\b/.test(body),
  );
  check(
    'tries sharp first',
    /require\(['"]sharp['"]\)/.test(body),
  );
  check(
    'falls back to FALLBACK_THUMB',
    /return FALLBACK_THUMB/.test(body),
  );
}

console.log('\n=== TEST 7: sendImageSafe tries URL send first ===');
const sendImageSafeBody = src.match(
  /async function sendImageSafe\(sock, chatId, imageUrl, caption, quotedMsg\) \{[\s\S]*?\n\}\n/,
);
if (sendImageSafeBody) {
  const body = sendImageSafeBody[0];
  const urlSendIdx = body.indexOf("image: { url: imageUrl }, caption }");
  const bufferSendIdx = body.indexOf("image: imgBuffer, caption, jpegThumbnail: thumb");
  check(
    'URL send (path 1) appears before buffer send (path 2)',
    urlSendIdx > -1 && bufferSendIdx > -1 && urlSendIdx < bufferSendIdx,
    `urlSendIdx=${urlSendIdx}, bufferSendIdx=${bufferSendIdx}`,
  );
  check(
    'has 3 distinct send attempts (URL → buffer → URL-retry)',
    (body.match(/sock\.sendMessage/g) || []).length >= 3,
  );
  check(
    'throws on null imageUrl',
    /if \(!imageUrl\) throw new Error/.test(body),
  );
}

console.log('\n=== TEST 8: Diagnostic logging present ===');
check(
  "logs '[sendImageSafe] URL send failed' on URL send failure",
  /\[sendImageSafe\] URL send failed/.test(src),
);
check(
  "logs '[sendImageSafe] download failed' on download failure",
  /\[sendImageSafe\] download failed/.test(src),
);
check(
  "logs '[sendImageSafe] buffer send failed' on buffer send failure",
  /\[sendImageSafe\] buffer send failed/.test(src),
);
check(
  "logs '[buildThumbnail] sharp failed' on sharp failure",
  /\[buildThumbnail\] sharp failed/.test(src),
);
check(
  "logs '[buildThumbnail] jimp failed' on jimp failure",
  /\[buildThumbnail\] jimp failed/.test(src),
);

console.log('\n=== TEST 9: Syntax check ===');
try {
  require('child_process').execSync('node -c core/engine.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
  });
  check('node -c core/engine.js passes', true);
} catch (e) {
  check('node -c core/engine.js passes', false, e.stderr?.toString() || e.message);
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════`);
console.log(`  PASS: ${pass}   FAIL: ${fail}`);
console.log(`══════════════════════════════════════════════════`);
process.exit(fail > 0 ? 1 : 0);
