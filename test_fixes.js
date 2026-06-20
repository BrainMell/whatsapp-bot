const assert = require('assert');
const fs = require('fs');

async function runSimulations() {
    console.log("=== Running RPG System Simulations ===");

    // 1. Test B11: Crafted Items in ITEM_DATABASE
    console.log("\n[Test 1] Verifying Crafted Items in ITEM_DATABASE...");
    const lootSystem = require('./core/rpg/lootSystem');
    
    // Give setTimeout a moment to inject
    await new Promise(resolve => setTimeout(resolve, 500));

    const item = lootSystem.getItemInfo('mythril_staff');
    if (item && item.name && item.type === 'EQUIPMENT') {
        console.log("✅ PASS: Crafted items are properly injected and equippable.");
    } else {
        console.error("❌ FAIL: Crafted items missing from ITEM_DATABASE.", item);
    }

    // 2. Test B8: DistributeLoot does NOT double deposit gold
    console.log("\n[Test 2] Verifying DistributeLoot Gold Depositing...");
    const mockPlayers = [{ jid: 'player1@s.whatsapp.net', name: 'Player 1' }];
    
    // Mock the economy and inventory modules
    const economy = require('./core/rpg/economy');
    const inventorySystem = require('./core/rpg/inventorySystem');
    
    let depositedGold = 0;
    const originalAddMoney = economy.addMoney;
    economy.addMoney = (jid, amount) => {
        depositedGold += amount;
    };
    
    const originalAddItem = inventorySystem.addItem;
    inventorySystem.addItem = async () => ({ success: true });

    const results = await lootSystem.distributeLoot(mockPlayers, 'SLIME', null, 1.0, 100);
    
    if (results.goldPerPlayer > 0 && depositedGold === 0) {
        console.log("✅ PASS: distributeLoot no longer directly deposits gold, preventing double depositing.");
    } else {
        console.error(`❌ FAIL: distributeLoot directly deposited ${depositedGold} gold.`);
    }

    // Restore economy and inventory
    economy.addMoney = originalAddMoney;
    inventorySystem.addItem = originalAddItem;

    console.log("\n=== Simulations Complete ===");
}

runSimulations().catch(console.error);
