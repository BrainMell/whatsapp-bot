// scripts/check_raw.js - check raw user data
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf-8');
const m = env.match(/^MONGO_URI=(.+)$/m);
const uri = m[1].trim().replace(/^["']|["']$/g, '');

async function main() {
  await mongoose.connect(uri);
  const User = require('../core/models/User');
  const u = await User.findOne({ userId: '25151529836547@lid' });
  console.log('userId:', u.userId);
  console.log('class:', u.class);
  console.log('inventory type:', typeof u.inventory);
  console.log('inventory keys:', Object.keys(u.inventory || {}).length);
  console.log('inventory raw:', JSON.stringify(u.inventory));
  console.log('skills keys:', Object.keys(u.skills || {}).length);
  console.log('skills raw:', JSON.stringify(u.skills));
  await mongoose.disconnect();
}
main();
