const inventorySystem = require('./core/rpg/inventorySystem');
const lootSystem = require('./core/rpg/lootSystem');
const economy = require('./core/rpg/economy');

async function testEnhancement() {
    console.log("=== Testing Enhancement System ===");
    const userId = "test_user_123";
    
    // Setup mock user
    global.db = { data: { users: {} } };
    const inventory = {};
    economy.getUser = () => ({ wallet: 1000, inventory });
    economy.saveUser = () => {};
    inventorySystem.getInventory = () => inventory;
    
    // Add a basic iron sword
    inventory['iron_sword'] = {
        id: 'iron_sword',
        name: 'Iron Sword',
        type: 'EQUIPMENT',
        quantity: 1,
        stats: { atk: 12 }
    };
    
    // Add legendary stone
    inventory['legendary_enhancement_stone'] = {
        id: 'legendary_enhancement_stone',
        name: 'Legendary Stone',
        type: 'MATERIAL',
        quantity: 45
    };
    
    console.log("Before Enhancement:", inventory['iron_sword']);
    
    // Enhance 3 times
    for (let i=0; i<3; i++) {
        const res = inventorySystem.enhanceItem(userId, 'iron_sword', 'legendary_enhancement_stone');
        console.log(`Enhance ${i+1} result:`, res.success, res.message);
    }
    
    console.log("After Enhancement:", inventory['iron_sword']);
    console.log("Stones remaining:", inventory['legendary_enhancement_stone']?.quantity || 0);
}

testEnhancement().catch(console.error);
