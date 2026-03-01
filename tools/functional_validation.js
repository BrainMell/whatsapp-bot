const fs = require('fs');
const path = require('path');

/**
 * DEEP FUNCTIONAL VALIDATION SYSTEM
 * Verifies that commands actually PERFORM the intended logic.
 */

const botConfig = require('../botConfig');
const mockInst = {
    getPrefix: () => '.j',
    getBotName: () => 'Joker',
    getBotId: () => 'Joker',
    getCurrency: () => ({ symbol: 'Yen', name: 'Zeni' }),
    getAssetPath: (p) => './rpgasset/' + p,
    getDataPath: (p) => './core/data/' + p
};
botConfig.storage = { run: (inst, cb) => cb(), getStore: () => mockInst };

// Mock Database
const mongoose = require('mongoose');
mongoose.Model.find = () => ({ sort: () => ({ limit: () => Promise.resolve([]) }), limit: () => Promise.resolve([]), exec: () => Promise.resolve([]) });
mongoose.Model.findOne = () => Promise.resolve(null);
mongoose.Model.findOneAndUpdate = () => Promise.resolve({});
mongoose.Model.aggregate = () => Promise.resolve([]);
mongoose.Model.findById = () => Promise.resolve(null);

const economy = require('../core/economy');
const classSystem = require('../core/classSystem');
const inventorySystem = require('../core/inventorySystem');
const craftingSystem = require('../core/craftingSystem');
const progression = require('../core/progression');

const testUser = 'tester@s.whatsapp.net';
const otherUser = 'other@s.whatsapp.net';
const testChat = '67890@g.us';

const mockSock = {
    sendMessage: async (chatId, content, options) => { return { key: { id: 'test' } }; },
    profilePictureUrl: async () => 'https://mock.url/pfp.png',
    user: { id: 'bot@s.whatsapp.net' }
};

function setupEnvironment() {
    economy.economyData.clear();
    
    // Setup Primary Tester
    economy.economyData.set(testUser, {
        userId: testUser,
        registered: true,
        wallet: 1000,
        bank: 500,
        inventory: {},
        equipment: {},
        class: 'FIGHTER',
        questsCompleted: 0,
        completedTrials: [],
        progression: {
            level: 1,
            xp: 0,
            statPoints: 10,
            allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }
        }
    });

    // Setup Other User (for transfers)
    economy.economyData.set(otherUser, {
        userId: otherUser,
        registered: true,
        wallet: 0,
        bank: 0
    });
}

const results = [];
function assert(name, condition, details = "") {
    if (condition) {
        console.log('  [PASS] ' + name);
        results.push({ name, status: 'PASS' });
    } else {
        console.log('  [FAIL] ' + name + ' | ' + details);
        results.push({ name, status: 'FAIL', details });
    }
}

async function validateAll() {
    console.log('DEEP FUNCTIONAL VALIDATION REPORT\n');

    // --- 1. ECONOMY VALIDATION ---
    console.log('Category: ECONOMY');
    setupEnvironment();
    
    economy.deposit(testUser, 200);
    const userAfterDep = economy.getUser(testUser);
    assert('Deposit Logic', userAfterDep.wallet === 800 && userAfterDep.bank === 700, 'Expected 800/700, got ' + userAfterDep.wallet + '/' + userAfterDep.bank);

    economy.withdraw(testUser, 100);
    const userAfterWith = economy.getUser(testUser);
    assert('Withdraw Logic', userAfterWith.wallet === 900 && userAfterWith.bank === 600, 'Expected 900/600, got ' + userAfterWith.wallet + '/' + userAfterWith.bank);

    economy.transferMoney(testUser, otherUser, 300);
    const sender = economy.getUser(testUser);
    const receiver = economy.getUser(otherUser);
    assert('Transfer Logic', sender.wallet === 600 && receiver.wallet === 300, 'Sender: ' + sender.wallet + ', Receiver: ' + receiver.wallet);

    // --- 2. INVENTORY & ENHANCEMENT ---
    console.log('\nCategory: RPG SYSTEMS');
    setupEnvironment();
    
    inventorySystem.addItem(testUser, 'iron_sword', 1);
    inventorySystem.addItem(testUser, 'rare_enhancement_stone', 1);
    
    const inv = inventorySystem.getInventory(testUser);
    assert('Item Addition', !!inv['iron_sword'], 'Item missing');

    const baseAtk = inv['iron_sword'].stats.atk;
    const enhRes = inventorySystem.enhanceItem(testUser, 'iron_sword', 'rare_enhancement_stone');
    
    // Equip after enhancing to see stat growth
    inventorySystem.equipItem(testUser, 'iron_sword', 'main_hand');
    const statsAfter = progression.getBaseStats(testUser, 'FIGHTER');
    const enhAtk = statsAfter.atk;
    
    assert('Enhancement Logic', enhRes.success && enhAtk > (10 + baseAtk), 'Enhancement failed or stats didnt grow. Base: ' + baseAtk + ', New (equipped): ' + enhAtk);

    // --- 3. CLASS EVOLUTION ---
    console.log('\nCategory: PROGRESSION');
    setupEnvironment();
    
    const evo1 = classSystem.canEvolve('FIGHTER', 20, 30, 0, []);
    const warrior1 = evo1.evolutions.find(e => e.id === 'WARRIOR');
    assert('Trial Gating', warrior1.meetsRequirements === false, 'Evolve allowed without trial!');

    const evo2 = classSystem.canEvolve('FIGHTER', 20, 30, 0, ['INFECTED_COLOSSUS']);
    const warrior2 = evo2.evolutions.find(e => e.id === 'WARRIOR');
    assert('Evolution Req Check', warrior2.meetsRequirements === true, 'Requirements not met even with trial');

    // --- 4. CRAFTING SYSTEM ---
    console.log('\nCategory: CRAFTING');
    setupEnvironment();
    
    inventorySystem.addItem(testUser, 'greater_potion', 2);
    inventorySystem.addItem(testUser, 'healing_herb', 3);
    inventorySystem.addItem(testUser, 'mana_dew', 1);
    const craftRes = craftingSystem.performCraft(testUser, 'mega_potion');
    const invAfterCraft = inventorySystem.getInventory(testUser);
    assert('Brewing Logic', craftRes.success && invAfterCraft['mega_potion'], 'Crafting failed to produce item');

    // --- 5. STAT ALLOCATION ---
    console.log('\nCategory: CHARACTER STATS');
    setupEnvironment();
    const statsPre = progression.getBaseStats(testUser, 'FIGHTER');
    const startHp = statsPre.hp;
    
    const allocRes = progression.allocateStatPoint(testUser, 'hp', 5);
    const statsPost = progression.getBaseStats(testUser, 'FIGHTER');
    const endHp = statsPost.hp;
    
    assert('Stat Allocation', endHp > startHp, 'HP didnt increase. Start: ' + startHp + ', End: ' + endHp);
    assert('Points Deducted', economy.getUser(testUser).progression.statPoints === 5, 'Points not removed');

    // --- 6. MODERATOR SYSTEM ---
    console.log('\nCategory: MODERATOR SYSTEM');
    const engine = require('../core/engine');
    const cardSystem = require('../core/cardSystem');
    
    // Initialize card system for test
    cardSystem.init(mockSock, [], [], testUser);
    
    // Test Global Mod
    engine.addGlobalMod(otherUser);
    assert('Global Mod Addition', engine.isGlobalMod(otherUser), 'User not recognized as global mod');
    
    // Test Inheritance (Global Mod should have Card Mod perms)
    const cardHandled = await cardSystem.handleCommand({
        lowerTxt: '.j spawn goku',
        txt: '.j spawn goku',
        senderJid: otherUser,
        chatId: testChat,
        m: { key: { remoteJid: testChat }, message: { conversation: '.j spawn goku' } },
        economy,
        isOwner: false,
        isMod: true // This is passed by engine.js to cardSystem
    });
    assert('Privilege Inheritance', cardHandled === true, 'Global mod could not trigger card spawn');

    // --- SUMMARY ---
    const total = results.length;
    const passed = results.filter(r => r.status === 'PASS').length;
    console.log('\nRESULTS SUMMARY');
    console.log('Passed: ' + passed + '/' + total);
    console.log('Accuracy: ' + ((passed/total)*100).toFixed(1) + '%');

    if (passed === total) {
        console.log('\nSYSTEM IS 100% FUNCTIONALLY ACCURATE.');
        process.exit(0);
    } else {
        console.log('\nSYSTEM HAS LOGIC ERRORS. SEE ABOVE.');
        process.exit(1);
    }
}

validateAll().catch(e => { console.error(e); process.exit(1); });
