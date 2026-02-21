#!/usr/bin/env node

/**
 * fix-encoding.js
 * Fixes encoding issues across all .js files in a target folder.
 *
 * What it fixes:
 *  - Removes UTF-8 BOM (EF BB BF) — the #1 cause of "weird first char" bugs
 *  - Removes UTF-16 BOM (FF FE / FE FF) and re-encodes as UTF-8
 *  - Normalises line endings to LF (optional — see config below)
 *
 * What it does NOT touch:
 *  - Files that are already clean (no rewrite = no risk)
 *  - Non-.js files
 *  - File logic, syntax, or content beyond the byte-level fixes above
 *
 * Usage:
 *   node fix-encoding.js ./src
 *   node fix-encoding.js ./src --dry-run   ← preview only, no writes
 */

const fs   = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const NORMALIZE_LINE_ENDINGS = true;   // true = convert \r\n → \n
const FILE_EXT               = '.js';  // change to '' to target every file
// ─────────────────────────────────────────────────────────────────────────────

const [,, targetDir = '.', flag] = process.argv;
const DRY_RUN = flag === '--dry-run';

if (!fs.existsSync(targetDir)) {
  console.error(`❌  Directory not found: ${targetDir}`);
  process.exit(1);
}

if (DRY_RUN) console.log('🔍  DRY RUN — no files will be written\n');

// Recursively collect all matching files
function collectFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(full));
    } else if (!FILE_EXT || entry.name.endsWith(FILE_EXT)) {
      results.push(full);
    }
  }
  return results;
}

function fixEncoding(filePath) {
  const raw = fs.readFileSync(filePath); // Buffer
  let changed = false;
  let text;

  // Detect & strip BOM
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    // UTF-8 BOM
    text = raw.slice(3).toString('utf8');
    changed = true;
    console.log(`  ✂️  Removed UTF-8 BOM`);
  } else if (raw[0] === 0xFF && raw[1] === 0xFE) {
    // UTF-16 LE BOM
    text = raw.slice(2).toString('utf16le');
    changed = true;
    console.log(`  🔄  Re-encoded from UTF-16 LE → UTF-8`);
  } else if (raw[0] === 0xFE && raw[1] === 0xFF) {
    // UTF-16 BE BOM — swap bytes then decode
    const swapped = Buffer.alloc(raw.length - 2);
    for (let i = 2; i < raw.length - 1; i += 2) {
      swapped[i - 2] = raw[i + 1];
      swapped[i - 1] = raw[i];
    }
    text = swapped.toString('utf16le');
    changed = true;
    console.log(`  🔄  Re-encoded from UTF-16 BE → UTF-8`);
  } else {
    text = raw.toString('utf8');
  }

  // Normalise line endings
  if (NORMALIZE_LINE_ENDINGS && text.includes('\r\n')) {
    text = text.replace(/\r\n/g, '\n');
    changed = true;
    console.log(`  🔧  Normalised CRLF → LF`);
  }

  return { text, changed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const files = collectFiles(path.resolve(targetDir));
console.log(`Found ${files.length} ${FILE_EXT || ''} file(s) in "${targetDir}"\n`);

let fixed = 0, skipped = 0;

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const { text, changed } = fixEncoding(file);

  if (changed) {
    console.log(`✅  ${rel}`);
    if (!DRY_RUN) fs.writeFileSync(file, text, 'utf8');
    fixed++;
  } else {
    skipped++;
  }
}

console.log(`\n─────────────────────────────────────`);
console.log(`Fixed : ${fixed} file(s)`);
console.log(`Clean : ${skipped} file(s) (untouched)`);
if (DRY_RUN) console.log(`\n⚠️  Dry run — re-run without --dry-run to apply changes`);