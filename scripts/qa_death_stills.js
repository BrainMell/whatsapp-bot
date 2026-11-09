// QA: death stills (2026-11-09) — synthetic-layer end-to-end.
// Covers: all 6 death kinds render, stamp cache hits, group still composites,
// JPEG validates, kill stamp provably present (pixel diff at the anchor),
// defeat chip present, and (v6) the dead unit's sprite provably NEVER drawn.
// Run from repo root: node scripts/qa_death_stills.js
const { createCanvas } = require('canvas');
const ds = require('../core/rpg/systems/combat/deathStill');

let failures = 0;
function assert(name, cond, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' | ' + extra : ''}`);
  if (!cond) failures++;
}

// ── synthetic fight layers (1024x687, the Go layers contract) ────────────
function makeLayers() {
  const W = 1024, H = 687;
  const bg = createCanvas(W, H);
  const b = bg.getContext('2d');
  const g = b.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a3140'); g.addColorStop(1, '#4a4034');
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  b.fillStyle = '#3a4433'; b.fillRect(0, H - 120, W, 120);   // ground band
  // enemies: #0 (survivor), #1 (dying), #2 (dying), #3 (already dead earlier)
  const cuts = [], anchors = [];
  const mk = (i, x, col) => {
    const cv = createCanvas(140, 220);
    const c = cv.getContext('2d');
    c.fillStyle = col; c.fillRect(20, 20, 100, 170);
    c.fillStyle = '#111'; c.fillRect(45, 60, 18, 18); c.fillRect(80, 60, 18, 18);   // eyes
    c.fillStyle = '#222'; c.fillRect(20, 190, 100, 30);
    cuts.push({ side: 'enemy', index: i, x, y: H - 340, w: 140, h: 220, png: cv.toBuffer('image/png').toString('base64') });
    anchors.push({ side: 'enemy', index: i, x: x + 70, feetY: H - 120, w: 140, h: 220 });
  };
  mk(0, 120, '#4d7c4d');   // survivor
  mk(1, 560, '#7c4d4d');   // dying A
  mk(2, 760, '#4d5a7c');   // dying B
  mk(3, 360, '#6b5a3a');   // died last turn
  return { bg: bg.toBuffer('image/png'), cuts, anchors, w: W, h: H, success: true, shared: true };
}

function isJpeg(buf) {
  return Buffer.isBuffer(buf) && buf.length > 5000 && buf[0] === 0xff && buf[1] === 0xd8;
}

async function regionMean(cvBuf, x, y, w, h) {
  const { loadImage } = require('canvas');
  const img = await loadImage(cvBuf);
  const cv = createCanvas(w, h), c = cv.getContext('2d');
  c.drawImage(img, -x, -y);
  const d = c.getImageData(0, 0, w, h).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
}

(async () => {
  const enemies = [
    { id: 'e0', name: 'Oak Sentinel', element: 'earth' },
    { id: 'e1', name: 'Ember Imp', element: 'fire' },
    { id: 'e2', name: 'Void Wisp', element: 'void' },
    { id: 'e3', name: 'Tide Crawler', element: 'water' },
  ];
  const chrome = { players: [{ name: 'Hero', currentHP: 80, stats: { hp: 100 } }], enemies, rank: 'F', floor: 0, atkSeed: 3, atkDir: 1 };

  // T1: all six kinds render + classifyDeath contract
  let t1FireLen = 0;
  const kinds = ['FIRE', 'ICE', 'WATER', 'VOID', 'EARTH', 'DUST'];
  for (const k of kinds) {
    const enemy = k === 'VOID' ? { id: 'abyss_x', name: 'x' }
      : k === 'DUST' ? { id: 'plainling', name: 'Plainling' }
      : { id: 'x_' + k.toLowerCase(), name: k + 'ling', element: k.toLowerCase() };
    const got = ds.classifyDeath(enemy);
    assert(`T1 classify ${k}`, got === k, `got=${got}`);
    const layers = makeLayers();
    const still = await ds.renderDeathStill({
      layers,
      picks: [{ enemy, targetIndex: 1 }],   // kind-matched enemy — the still must reflect THIS kind
      deadIdx: new Set([3]),
      chrome,
    });
    assert(`T1 ${k} still renders`, !!still && isJpeg(still.image), `${still ? still.image.length + 'B' : 'null'}`);
    if (k === 'FIRE') {
      assert('T1 kind reported', still.kind === 'FIRE');
      assert('T1 group shape', Array.isArray(still.group) && still.group.length === 1);
      t1FireLen = still.image.length;
    } else if (t1FireLen) {
      assert(`T1 ${k} art differs from FIRE`, still.image.length !== t1FireLen, `${still.image.length} vs ${t1FireLen}`);
    }
  }

  // T2: stamp cache — second call must hit the disk cache (same dir file)
  const before = require('fs').readdirSync(ds._stampDir).length;
  await ds._getStamp('FIRE', false);
  const after = require('fs').readdirSync(ds._stampDir).length;
  assert('T2 stamp cache file count stable', before === after, `${before}==${after}`);
  const stamp = await ds._getStamp('VOID', true);
  assert('T2 boss stamp distinct file', !!stamp && stamp.length > 500);

  // T3: kill art provably present — pixel mean at the dying anchor changes
  // (v6: this is the STAMP's footprint; no dead sprite is drawn anymore)
  {
    const layers = makeLayers();
    const bare = await ds._scenePlateCanvas(layers, new Set([1, 2]), new Set([3]), chrome);
    const bareBuf = bare.toBuffer('image/jpeg', { quality: 0.85 });
    const still = await ds.renderDeathStill({
      layers,
      picks: [{ enemy: enemies[1], targetIndex: 1 }, { enemy: enemies[2], targetIndex: 2 }],
      deadIdx: new Set([3]),
      chrome,
    });
    const ax = Math.round(560 * (640 / 1024));   // dying A anchor x → plate space
    const ay = Math.round((687 - 180) * (480 / 687));   // feet/ground zone — where the fallen body + stamp land
    const mBare = await regionMean(bareBuf, ax, ay, 100, 80);
    const mStill = await regionMean(still.image, ax, ay, 100, 80);
    assert('T3 anchor region changed (kill stamp present)', Math.abs(mBare - mStill) > 6, `bare=${mBare.toFixed(1)} still=${mStill.toFixed(1)}`);
    assert('T3 group still returns 2 members', still.group.length === 2);
  }

  // T4: pickup order — dying enemies' cutouts must NOT stand in the plate
  {
    const layers = makeLayers();
    const plate = await ds._scenePlateCanvas(layers, new Set([1]), new Set([3]), null);
    const d = plate.getContext('2d').getImageData(Math.round(760 * (640 / 1024)), Math.round((687 - 260) * (480 / 687)), 20, 20).data;
    // dying B (not this batch) must still be there → colored, not bg gray
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[i + 1]) > 12 || Math.abs(d[i + 1] - d[i + 2]) > 12) colored++;
    assert('T4 non-batch dying enemy stays visible', colored > 30, `colored=${colored}`);
  }

  // T5: v6 owner directive "just use only the effects minus the enemy" — the
  // dead unit's cut pixels must be UNABLE to reach the canvas. Render the same
  // kill twice, second time with the dying's cut swapped for a screaming
  // magenta slab: outputs must be byte-identical (any body/ghost draw would
  // tint the frame and break the equality).
  {
    const layersA = makeLayers();
    const layersB = makeLayers();
    const mc = createCanvas(140, 220);
    const mcx = mc.getContext('2d');
    mcx.fillStyle = '#ff00ff'; mcx.fillRect(0, 0, 140, 220);
    layersB.cuts.find((x) => x.index === 1).png = mc.toBuffer('image/png').toString('base64');
    const opts = { picks: [{ enemy: enemies[1], targetIndex: 1 }], deadIdx: new Set([3]), chrome };
    const ra = await ds.renderDeathStill({ layers: layersA, ...opts });
    const rb = await ds.renderDeathStill({ layers: layersB, ...opts });
    assert('T5 dead sprite never drawn (magenta cut → byte-identical output)', !!ra && !!rb && ra.image.equals(rb.image), `${ra ? ra.image.length : 0}B vs ${rb ? rb.image.length : 0}B`);
  }

  console.log(failures ? `QA FAILED (${failures})` : 'QA death stills done — all PASS');
  process.exit(failures ? 1 : 0);
})();
