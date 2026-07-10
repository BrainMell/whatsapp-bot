// Quick simulation: economy rebalance impact
// Simulates 100 SSS-rank dungeon clears and compares old vs new economy.

console.log('=== Economy Rebalance Simulation ===\n');

// OLD values (before Wave 1)
const OLD_BOSS_GOLD_SSS = [150000, 280000]; // ABYSSAL_GOD
const OLD_COMPLETION_BONUS_SSS = 100000;
const OLD_NO_CAP = Infinity;

// NEW values (after Wave 1)
const NEW_BOSS_GOLD_SSS = [75000, 140000]; // cut 50%
const NEW_COMPLETION_BONUS_SSS = 40000; // cut 60%
const NEW_CAP_SSS = 3000000; // 3M cap

function simulateRun(bossGoldRange, completionBonus, cap) {
  // Boss gold: random within range
  const bossGold = bossGoldRange[0] + Math.floor(Math.random() * (bossGoldRange[1] - bossGoldRange[0]));
  // Monster gold: assume ~500K from trash mobs (10 mobs × 50K avg)
  const monsterGold = 400000 + Math.floor(Math.random() * 200000); // 400-600K
  // Completion bonus
  const bonus = completionBonus;
  // Total before cap
  let total = monsterGold + bossGold + bonus;
  // Apply cap
  if (cap !== Infinity && total > cap) {
    const ratio = cap / total;
    total = Math.floor(total * ratio);
  }
  return { monsterGold, bossGold, bonus, total };
}

function simulateMany(label, runs, bossGoldRange, completionBonus, cap) {
  let grandTotal = 0;
  let maxRun = 0;
  let minRun = Infinity;
  for (let i = 0; i < runs; i++) {
    const r = simulateRun(bossGoldRange, completionBonus, cap);
    grandTotal += r.total;
    if (r.total > maxRun) maxRun = r.total;
    if (r.total < minRun) minRun = r.total;
  }
  const avg = Math.floor(grandTotal / runs);
  console.log(`${label}:`);
  console.log(`  ${runs} runs simulated`);
  console.log(`  Average per run: ${avg.toLocaleString()} Zeni`);
  console.log(`  Min run: ${minRun.toLocaleString()} Zeni`);
  console.log(`  Max run: ${maxRun.toLocaleString()} Zeni`);
  console.log(`  Total over ${runs} runs: ${grandTotal.toLocaleString()} Zeni`);
  console.log('');
  return { avg, total: grandTotal, maxRun, minRun };
}

const RUNS = 100;
console.log(`Simulating ${RUNS} SSS-rank dungeon clears:\n`);
const old = simulateMany('OLD economy (pre-Wave 1)', RUNS, OLD_BOSS_GOLD_SSS, OLD_COMPLETION_BONUS_SSS, OLD_NO_CAP);
const neu = simulateMany('NEW economy (post-Wave 1)', RUNS, NEW_BOSS_GOLD_SSS, NEW_COMPLETION_BONUS_SSS, NEW_CAP_SSS);

const reduction = ((old.total - neu.total) / old.total * 100).toFixed(1);
console.log('=== Impact Summary ===');
console.log(`Total Zeni entering economy (${RUNS} SSS runs):`);
console.log(`  OLD: ${old.total.toLocaleString()}`);
console.log(`  NEW: ${neu.total.toLocaleString()}`);
console.log(`  Reduction: ${reduction}% less Zeni per ${RUNS} runs`);
console.log('');
console.log('Per-run impact:');
console.log(`  OLD avg: ${old.avg.toLocaleString()} | NEW avg: ${neu.avg.toLocaleString()}`);
console.log(`  OLD max: ${old.maxRun.toLocaleString()} | NEW max: ${neu.maxRun.toLocaleString()} (cap bites here)`);
console.log('');

// Wealth tax simulation
console.log('=== Wealth Tax Simulation ===');
const testBalances = [5000000, 10000000, 25000000, 50000000, 100000000, 500000000];
for (const bal of testBalances) {
  let tax = 0;
  if (bal >= 50000000) tax = Math.floor(bal * 0.02);
  else if (bal >= 10000000) tax = Math.floor(bal * 0.01);
  const after = bal - tax;
  console.log(`  Bank: ${bal.toLocaleString()} -> Tax: ${tax.toLocaleString()} -> After: ${after.toLocaleString()}`);
}

console.log('\n=== Simulation Complete ===');
