/**
 * fix_unknown_cards_curl.js  (v4 — optimized, fast)
 *
 * Only downloads first 200KB of each image (XMP is at byte ~84).
 * Skips tier detection (saves a second curl call).
 * Each card takes ~1-2s instead of 5-8s.
 */

const { execSync } = require('child_process');
const fs = require('fs');

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';
const TMP_FILE = '/tmp/card_img.bin';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function getCardName(cardId) {
  try {
    // Download only first 250KB (XMP is at byte ~84, well within range)
    // --range 0-249999 tells the server to only send the first 250KB
    execSync(`curl -s -L --max-time 6 -r 0-249999 -o ${TMP_FILE} "https://api.shoob.gg/site/api/cardr/${cardId}"`, {
      timeout: 8000, stdio: 'pipe'
    });

    const stat = fs.statSync(TMP_FILE);
    if (stat.size < 100) return null;

    const fd = fs.openSync(TMP_FILE, 'r');
    const buf = Buffer.alloc(250000);
    const bytes = fs.readSync(fd, buf, 0, 250000, 0);
    fs.closeSync(fd);

    const text = buf.toString('latin1', 0, bytes);
    const xmpStart = text.indexOf('<?xpacket begin');
    if (xmpStart === -1) return null;

    const xmpEnd = text.indexOf('<?xpacket end', xmpStart);
    if (xmpEnd === -1) return null;

    const xmp = text.substring(xmpStart, xmpEnd);

    // Extract Character Name (with photoshop: namespace prefix)
    const charMatch = xmp.match(/(?:photoshop:)?LayerName="Character Name" (?:photoshop:)?LayerText="([^"]*)"/);
    if (!charMatch) return null;

    const cardName = charMatch[1].trim()
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    // Also extract anime name
    let animeName = null;
    const allLayers = [...xmp.matchAll(/(?:photoshop:)?LayerName="([^"]*)" (?:photoshop:)?LayerText="([^"]*)"/g)];
    for (const m of allLayers) {
      const ln = m[1];
      if (['Character Name', 'Description', 'Info Title'].includes(ln)) continue;
      if (/^(G|U|L|M|R|C)$/.test(ln)) continue;
      if (ln.includes('(')) continue;
      if (m[2] && m[2].length > 2) { animeName = m[2]; break; }
    }

    return { cardName, animeName };
  } catch (e) {
    return null;
  }
}

function main() {
  log('🚀 Starting v4 optimized extraction...');

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const unknownCards = data.cards.filter(c =>
    String(c.id||'').startsWith('E-') &&
    (!c.cardName || c.cardName === 'Unknown' || c.cardName === 'Loading' || c.tier === 'Loading') &&
    c.detailUrl
  );

  log(`Found ${unknownCards.length} Unknown cards to fix`);
  log(`Estimated time: ~${Math.ceil(unknownCards.length * 1.5 / 60)} minutes`);

  let fixed = 0;
  let failed = 0;
  let saveCounter = 0;

  for (let i = 0; i < unknownCards.length; i++) {
    const card = unknownCards[i];
    const cardId = card.detailUrl.split('/').pop();

    if (i % 25 === 0) {
      log(`  Progress: ${i}/${unknownCards.length} (${fixed} fixed, ${failed} failed)`);
    }

    const info = getCardName(cardId);

    if (info && info.cardName) {
      card.cardName = info.cardName;
      if (info.animeName) card.animeName = info.animeName;
      card.imageUrl = `https://api.shoob.gg/site/api/cardr/${cardId}?size=400`;
      card.description = `${info.cardName} from ${card.eventName || card.animeName}`;
      fixed++;
      saveCounter++;
    } else {
      failed++;
    }

    // Save every 25 cards
    if (saveCounter >= 25) {
      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      saveCounter = 0;
      log(`💾 Saved. Fixed ${fixed}/${unknownCards.length} so far.`);
    }
  }

  // Final save
  data.totalCards = data.cards.length;
  data.uniqueCards = data.cards.length;
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

  log('\n' + '═'.repeat(60));
  log('🎉 EXTRACTION COMPLETE');
  log(`   Fixed: ${fixed}/${unknownCards.length}`);
  log(`   Failed: ${failed}`);
  const stillUnknown = data.cards.filter(c => String(c.id||'').startsWith('E-') && (!c.cardName || c.cardName === 'Unknown')).length;
  log(`   Still Unknown: ${stillUnknown}`);
  log(`   Total event cards: ${data.cards.filter(c => String(c.id||'').startsWith('E-')).length}`);
  log('═'.repeat(60));
}

main();
