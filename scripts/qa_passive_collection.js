const fs = require('fs'); const path = require('path');
const idx = require('../core/rpg/systems/passiveCards'); const { PASSIVE_CATALOG, SYNERGIES } = require('../core/rpg/systems/passiveCards/catalog');
const cr = require('../core/rpg/systems/passiveCards/cardRenderer');
(async () => {
  const out = process.argv[2] || '/tmp'; const ids = Object.keys(PASSIVE_CATALOG).filter((i) => PASSIVE_CATALOG[i]);
  const owned = ids.slice(0, 12).map((i) => PASSIVE_CATALOG[i]); const loadout = [ids[0], ids[8], ids[14]];
  const t0 = Date.now();
  const buf = await cr.renderCollection({ owned, loadout, slots: 3, maxSlots: 5, rankForSlot: (n) => (n <= 2 ? 'F' : n === 3 ? 'D' : n === 4 ? 'B' : 'S'), rank: 'D', name: 'Mellow', synergies: SYNERGIES.slice(0, 1) });
  fs.writeFileSync(path.join(out, 'passive_collection.jpg'), buf); console.log('collection', buf.length, 'B', Date.now() - t0, 'ms'); process.exit(0);
})().catch((e) => { console.log('ERR', e.stack); process.exit(1); });
