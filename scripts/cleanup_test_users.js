// scripts/cleanup_test_users.js
// One-off cleanup for any leftover test users from item market tests.
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const uri = m[1].trim().replace(/^["']|["']$/g, '');

async function main() {
  await mongoose.connect(uri, { dbName: 'whatsapp_rpg' });
  const User = require('../core/models/User');
  const ItemMarket = require('../core/models/ItemMarket');
  const Settlement = require('../core/models/Settlement');

  const r1 = await User.deleteMany({ userId: /^test_[ab]_itemmarket_test_/ });
  const r2 = await ItemMarket.deleteMany({ sellerId: /^test_[ab]_itemmarket_test_/ });
  const r3 = await ItemMarket.deleteMany({ buyerId: /^test_[ab]_itemmarket_test_/ });
  const r4 = await Settlement.deleteMany({ userId: /^test_[ab]_itemmarket_test_/ });
  const r5 = await Settlement.deleteMany({ counterpartyId: /^test_[ab]_itemmarket_test_/ });

  console.log(`Deleted users: ${r1.deletedCount}`);
  console.log(`Deleted listings (seller): ${r2.deletedCount}`);
  console.log(`Deleted listings (buyer): ${r3.deletedCount}`);
  console.log(`Deleted settlements (userId): ${r4.deletedCount}`);
  console.log(`Deleted settlements (counterparty): ${r5.deletedCount}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
