/**
 * fix_unknown_cards_via_xmp.js
 *
 * Extracts card names from PNG XMP metadata — NO BROWSER NEEDED!
 *
 * shoob.gg card images have embedded XMP metadata with:
 *   - Character Name (the card name)
 *   - Anime/series name
 *   - Description text
 *
 * The image URL (api.shoob.gg/site/api/cardr/{id}) also redirects to
 * cdn.shoob.gg/images/eventcards/{tier}/resized/... — so we get the
 * correct tier from the redirect Location header.
 *
 * This processes each card in ~0.5s (vs 10s with browser) and uses
 * almost no memory (plain HTTP, no Chromium).
 */

const https = require('https');
const http = require('http');
const fs = require('fs');

const DATA_PATH = '/home/z/my-project/repo/whatsapp-bot/core/data/cards_data.json';

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Follow redirects and get the final URL + first N bytes of body
function fetchWithRedirects(url, maxBytes = 50000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      // Follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        res.resume(); // drain
        // Return the redirect Location so we can extract the tier
        return resolve({ redirectUrl: newUrl, finalUrl: url, location: res.headers.location });
      }

      // Read first maxBytes of body
      let body = Buffer.alloc(0);
      let resolved = false;
      res.on('data', (chunk) => {
        if (body.length < maxBytes) {
          body = Buffer.concat([body, chunk]);
        } else {
          if (!resolved) {
            resolved = true;
            res.destroy();
            resolve({ body: body.toString('latin1'), finalUrl: url, statusCode: res.statusCode });
          }
        }
      });
      res.on('end', () => {
        if (!resolved) {
          resolved = true;
          resolve({ body: body.toString('latin1'), finalUrl: url, statusCode: res.statusCode });
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Now follow the redirect to get the actual image with XMP
function fetchImageXMP(url, maxBytes = 60000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const newUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        res.resume();
        return fetchImageXMP(newUrl, maxBytes).then(resolve).catch(reject);
      }
      const chunks = [];
      let totalLen = 0;
      let resolved = false;
      res.on('data', (chunk) => {
        totalLen += chunk.length;
        chunks.push(chunk);
        if (totalLen >= maxBytes && !resolved) {
          resolved = true;
          res.destroy();
          resolve(Buffer.concat(chunks).toString('latin1'));
        }
      });
      res.on('end', () => {
        if (!resolved) resolve(Buffer.concat(chunks).toString('latin1'));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Extract card name and other info from XMP metadata in PNG
function parseXMP(bodyStr) {
  // Find the XMP XML block
  const xmpStart = bodyStr.indexOf('<?xpacket begin');
  const xmpEnd = bodyStr.indexOf('<?xpacket end');
  if (xmpStart === -1 || xmpEnd === -1) return null;

  const xmp = bodyStr.substring(xmpStart, xmpEnd);

  // Extract TextLayers — these contain Character Name, Description, etc.
  const layers = {};
  const layerRegex = /<rdf:li photoshop:LayerName="([^"]*)" photoshop:LayerText="([^"]*)"[^>]*>/g;
  let match;
  while ((match = layerRegex.exec(xmp)) !== null) {
    const layerName = match[1];
    const layerText = match[2];
    layers[layerName] = layerText;
  }

  // Character Name layer = card name
  let cardName = layers['Character Name'] || null;

  // Also check for anime name (layer named after the anime series)
  let animeName = null;
  for (const key of Object.keys(layers)) {
    if (key === 'Character Name' || key === 'Description' || key === 'Info Title' ||
        /^(G|U|L|M|R|C)$/.test(key) ||
        key.includes('(') || key.includes('T1') || key.includes('T2') ||
        key.includes('T3') || key.includes('T4') || key.includes('T5') || key.includes('T6')) continue;
    // This layer is probably the anime name
    if (layers[key] && layers[key].length > 2) {
      animeName = layers[key];
      break;
    }
  }

  // Description
  let description = layers['Description'] || null;

  // Tier from layer names (G=T6, U=T5, L=T4, M=T3, R=T2, C=T1)
  // The tier letter that appears as a layer name indicates the card's tier
  let tier = null;
  const tierMap = { 'G': '6', 'U': '5', 'L': '4', 'M': '3', 'R': '2', 'C': '1' };
  // Actually, ALL tier letters appear as layers. We need to check which one is "active"
  // — but that's in the image, not the XMP. Skip this for now.
  // We'll get the tier from the redirect URL instead.

  // Clean up card name
  if (cardName) {
    cardName = cardName.trim();
    // Capitalize first letter of each word
    cardName = cardName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return { cardName, animeName, description };
}

// Extract tier from the CDN redirect URL
// Pattern: cdn.shoob.gg/images/eventcards/{tier}/resized/...
function extractTierFromUrl(url) {
  const match = url.match(/\/eventcards\/(\d+)\//);
  return match ? match[1] : null;
}

async function main() {
  log('🚀 Starting XMP-based card name extraction (NO BROWSER)...');

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const unknownCards = data.cards.filter(c =>
    String(c.id||'').startsWith('E-') &&
    (!c.cardName || c.cardName === 'Unknown') &&
    c.detailUrl
  );

  log(`Found ${unknownCards.length} Unknown cards to fix`);

  let fixed = 0;
  let failed = 0;
  let saveCounter = 0;

  for (let i = 0; i < unknownCards.length; i++) {
    const card = unknownCards[i];
    const cardId = card.detailUrl.split('/').pop();

    if (i % 50 === 0) {
      log(`  Progress: ${i}/${unknownCards.length} (${fixed} fixed, ${failed} failed)`);
    }

    try {
      // Step 1: Fetch the API URL to get the redirect (tells us tier)
      const apiUrl = `https://api.shoob.gg/site/api/cardr/${cardId}?size=400`;
      const result = await fetchWithRedirects(apiUrl);

      let tier = null;
      let xmpData = null;

      if (result.redirectUrl || result.location) {
        const cdnUrl = result.location ? (result.location.startsWith('http') ? result.location : `https://cdn.shoob.gg${result.location}`) : result.redirectUrl;
        tier = extractTierFromUrl(cdnUrl);

        // Step 2: Fetch the actual CDN image to get XMP metadata
        try {
          const imgData = await fetchImageXMP(cdnUrl, 60000);
          xmpData = parseXMP(imgData);
        } catch (e) {
          // XMP fetch failed, but we still have the tier from redirect
        }
      }

      if (xmpData && xmpData.cardName) {
        card.cardName = xmpData.cardName;
        if (tier) card.tier = tier;
        if (xmpData.animeName) card.animeName = xmpData.animeName;
        card.imageUrl = `https://api.shoob.gg/site/api/cardr/${cardId}?size=400`;
        if (xmpData.description && xmpData.description.length > 5) {
          card.description = xmpData.description.substring(0, 200);
        } else {
          card.description = `${xmpData.cardName} from ${card.eventName || card.animeName}`;
        }
        fixed++;
        saveCounter++;
      } else if (tier) {
        // At least fix the tier even if we couldn't get the name
        card.tier = tier;
        card.imageUrl = `https://api.shoob.gg/site/api/cardr/${cardId}?size=400`;
        saveCounter++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }

    // Save every 50 cards
    if (saveCounter >= 50) {
      fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      saveCounter = 0;
      log(`💾 Saved. Fixed ${fixed}/${unknownCards.length} so far.`);
    }

    // Small delay to avoid rate limiting
    if (i % 20 === 19) await new Promise(r => setTimeout(r, 500));
  }

  // Final save
  data.totalCards = data.cards.length;
  data.uniqueCards = data.cards.length;
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

  log('\n' + '═'.repeat(60));
  log('🎉 XMP EXTRACTION COMPLETE');
  log(`   Fixed: ${fixed}/${unknownCards.length}`);
  log(`   Failed: ${failed}`);
  const stillUnknown = data.cards.filter(c => String(c.id||'').startsWith('E-') && (!c.cardName || c.cardName === 'Unknown')).length;
  log(`   Still Unknown: ${stillUnknown}`);
  log(`   Total event cards: ${data.cards.filter(c => String(c.id||'').startsWith('E-')).length}`);
  log('═'.repeat(60));
}

main().catch(e => { log('FATAL: ' + e.message); console.error(e); process.exit(1); });
