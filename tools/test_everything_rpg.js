const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('⚔️ STARTING DEEP RPG INTEGRATION & MULTIPLAYER RAID TESTS...\n');

// 1. Setup Mock Config & Database
const botConfig = require('../botConfig');
const mockInst = {
    getPrefix: () => '.j',
    getBotName: () => 'Joker',
    getBotId: () => 'Joker',
    getCurrency: () => ({ symbol: 'Yen', name: 'Zeni' }),
    getAssetPath: (p) => './rpgasset/' + p,
    getDataPath: (p) => './core/data/' + p,
    getVersion: () => '1.0.0'
};
botConfig.storage = { run: (inst, cb) => cb(), getStore: () => mockInst };

// Mock Mongoose to prevent DB calls
const mongoose = require('mongoose');
mongoose.connect = () => Promise.resolve({ connection: { host: 'mocked-host' } });
mongoose.Model.find = () => ({ sort: () => ({ limit: () => Promise.resolve([]) }), limit: () => Promise.resolve([]), exec: () => Promise.resolve([]) });
mongoose.Model.findOne = () => Promise.resolve(null);
mongoose.Model.findOneAndUpdate = () => Promise.resolve({});
mongoose.Model.aggregate = () => Promise.resolve([]);
mongoose.Model.findById = () => Promise.resolve(null);
mongoose.Model.create = (data) => Promise.resolve({ save: function() { return Promise.resolve(this); }, totalSpawned: 0, totalCirculation: 0, uniqueOwners: 0, ...data });
mongoose.Model.prototype.save = function() { return Promise.resolve(this); };

// Mock Combat Image Services to prevent timeouts or HTTP network calls
const combatImageGenerator = require('../core/combatImageGenerator');
combatImageGenerator.generateCombatImage = async () => {
    return { success: true, image: Buffer.alloc(0), caption: 'Duel in Progress' };
};

const combatIntegration = require('../core/combatIntegration');
combatIntegration.generateCombatScene = async () => {
    return { success: true, image: Buffer.alloc(0), caption: 'Combat Scene' };
};

// Import Core Systems
const economy = require('../core/economy');
const classSystem = require('../core/classSystem');
const inventorySystem = require('../core/inventorySystem');
const progression = require('../core/progression');
const guildAdventure = require('../core/guildAdventure');
const skillCommands = require('../core/skillCommands');
const pvpSystem = require('../core/pvpSystem');
const craftingSystem = require('../core/craftingSystem');
const User = require('../core/models/User');

const testUser = 'tester@s.whatsapp.net';
const opponentUser = 'opponent@s.whatsapp.net';
const testChat = '12345@g.us';

const mockSock = {
    sendMessage: async (chatId, content, options) => {
        return { key: { id: 'msg_' + Date.now(), remoteJid: chatId } };
    },
    profilePictureUrl: async () => 'https://mock.url/pfp.png',
    user: { id: 'bot@s.whatsapp.net' }
};

// Sync timeout runner to execute trial and shop sequences immediately
const originalSetTimeout = global.setTimeout;
global.pendingTimers = {};
global.setTimeout = (fn, delay) => {
    if (delay === 60000) {
        global.pendingTimers['reg'] = fn;
        return {};
    }
    const deferDelay = delay >= 30000 ? 20 : 1;
    return originalSetTimeout(fn, deferDelay);
};

function setupUsers() {
    economy.economyData.clear();
    guildAdventure.stopQuest(testChat, testUser, true);
    guildAdventure.stopQuest(testChat, opponentUser, true);

    // Register Tester (Level 25 Fighter)
    economy.economyData.set(testUser, {
        userId: testUser,
        registered: true,
        nickname: 'Tester',
        wallet: 50000,
        bank: 0,
        inventory: {},
        equipment: {},
        class: 'FIGHTER',
        questsCompleted: 35,
        completedTrials: [],
        skills: { slash: 1 },
        progression: {
            level: 25,
            xp: 0,
            statPoints: 10,
            allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }
        },
        stats: {
            hp: 100,
            maxHp: 100,
            level: 25,
            xp: 0
        }
    });

    // Register Opponent (Level 20 Fighter)
    economy.economyData.set(opponentUser, {
        userId: opponentUser,
        registered: true,
        nickname: 'Opponent',
        wallet: 10000,
        bank: 0,
        inventory: {},
        equipment: {},
        class: 'FIGHTER',
        questsCompleted: 20,
        completedTrials: [],
        skills: { slash: 1 },
        progression: {
            level: 20,
            xp: 0,
            statPoints: 5,
            allocatedStats: { hp: 0, atk: 0, def: 0, mag: 0, spd: 0, luck: 0, crit: 0 }
        },
        stats: {
            hp: 100,
            maxHp: 100,
            level: 20,
            xp: 0
        }
    });
}

async function autoPlayCombat(sessionKey) {
    const state = guildAdventure.getGameState(sessionKey);
    let turns = 0;
    while (state && state.inCombat && turns < 50) {
        turns++;
        const active = state.activeCombatant;
        if (active && !active.isEnemy) {
            // Player's turn! Select atk or ability
            const useSkill = active.stats.energy >= 15 && turns % 3 === 0;
            const action = useSkill ? 'ability' : 'atk';
            const target = useSkill ? '1' : ''; // Cast the first learned skill
            
            await guildAdventure.handleCombatAction(mockSock, state.chatId, active.jid, action, target);
        }
        // Let the microtask queue run to process combat loop turns
        await new Promise(resolve => originalSetTimeout(resolve, 0));
    }
}

async function runAllTests() {
    let failed = false;

    const runAssert = async (name, testFn) => {
        try {
            await testFn();
            console.log(` ✅ [PASS] ${name}`);
        } catch (err) {
            console.error(` ❌ [FAIL] ${name}:`, err);
            failed = true;
        }
    };

    // ==========================================
    // TEST CATEGORY 1: User Schema Validation
    // ==========================================
    await runAssert('User Schema Persistence Integrity', async () => {
        const doc = new User({
            userId: 'test_schema_user',
            completedTrials: ['INFECTED_COLOSSUS'],
            evolutionHistory: [{ from: 'Fighter', to: 'Warrior', level: 25, timestamp: Date.now() }],
            evolvedAt: 25
        });

        const obj = doc.toObject();
        assert.ok(obj.completedTrials, 'completedTrials must exist in User document');
        assert.deepStrictEqual(obj.completedTrials, ['INFECTED_COLOSSUS'], 'completedTrials array value mismatch');
        assert.ok(obj.evolutionHistory, 'evolutionHistory must exist in User document');
        assert.strictEqual(obj.evolvedAt, 25, 'evolvedAt must match the stored level');
    });

    // ==========================================
    // TEST CATEGORY 2: Evolution Gating & Trial Initiation
    // ==========================================
    await runAssert('Evolution Trials Lifecycle & Gating', async () => {
        setupUsers();

        // 1. Gating verification
        const check = classSystem.canEvolve('FIGHTER', 25, 35, 0, []);
        const evolutionOption = check.evolutions.find(e => e.id === 'WARRIOR');
        assert.strictEqual(evolutionOption.meetsRequirements, false, 'Should fail without defeating evolution boss');

        // 2. Trigger evolution command to start Trial
        await inventorySystem.addItem(testUser, 'evolution_stone', 1);
        await skillCommands.handleEvolve(mockSock, testChat, testUser, 'Tester', ['1']);
        
        // Poll dynamically for combat to start
        const sessionKey = `${testChat}_${testUser}`;
        let state = null;
        for (let i = 0; i < 100; i++) {
            state = guildAdventure.getGameState(sessionKey);
            if (state && state.inCombat) break;
            await new Promise(resolve => originalSetTimeout(resolve, 1));
        }

        assert.ok(state, 'Trial adventure state should exist');
        assert.strictEqual(state.mode, 'TRIAL', 'Adventure mode must be TRIAL');
        assert.strictEqual(state.trialTarget, 'INFECTED_COLOSSUS', 'Trial boss target should match the evolution requirements');
        assert.strictEqual(state.inCombat, true, 'Trial boss combat phase should be active');

        // 3. Autoplay the boss fight
        await autoPlayCombat(sessionKey);
        // Wait for trial victory database resolution microtasks to write through
        await new Promise(resolve => originalSetTimeout(resolve, 50));

        // 4. Verify post-trial updates
        const user = economy.getUser(testUser);
        assert.strictEqual(user.class, 'WARRIOR', 'User class must be updated to WARRIOR');
        assert.ok(user.completedTrials.includes('INFECTED_COLOSSUS'), 'Completed trial boss should be registered in completedTrials list');
        assert.ok(user.stats.atk >= 18, 'User stats should scale to Warrior defaults');
    });

    // ==========================================
    // TEST CATEGORY 3: Solo Quest Full Lifecycle
    // ==========================================
    await runAssert('Solo Quest Simulation & Turn Loop', async () => {
        setupUsers();

        const result = await guildAdventure.initAdventure(
            mockSock,
            testChat,
            null,
            'NORMAL',
            true, // solo
            'F', // Rank F
            testUser
        );

        assert.strictEqual(result.success, true, 'Should successfully start rank F adventure');

        const sessionKey = `${testChat}_${testUser}`;
        const state = guildAdventure.getGameState(sessionKey);
        assert.ok(state, 'Adventure state should exist');

        // Autoplay stages (combat encounters)
        while (state && state.active) {
            if (state.inCombat) {
                await autoPlayCombat(sessionKey);
            }
            // Yield thread
            await new Promise(resolve => originalSetTimeout(resolve, 5));
        }

        // Verify quest completed counter
        const user = economy.getUser(testUser);
        assert.ok(user.questsCompleted > 35, 'questsCompleted counter should have increased');
    });

    // ==========================================
    // TEST CATEGORY 4: Raid (Group Quest) Battle Simulation
    // ==========================================
    await runAssert('Multiplayer Raid Simulation', async () => {
        setupUsers();

        // 1. Join adventure setup
        const result = await guildAdventure.initAdventure(
            mockSock,
            testChat,
            null,
            'NORMAL',
            false, // group
            'F',
            testUser
        );

        assert.strictEqual(result.success, true, 'Should initialize group adventure lobby');

        // Join both players (since group init doesn't auto-join)
        await guildAdventure.joinAdventure(testChat, testUser);
        await guildAdventure.joinAdventure(testChat, opponentUser);

        // Transition from lobby to shop and play phases
        const lobbyState = guildAdventure.getGameState(testChat);
        assert.ok(lobbyState, 'Group adventure state should exist');
        assert.strictEqual(lobbyState.players.length, 2, 'Raid party should consist of 2 players');

        // Trigger the registration timer manually now that players are in lobby
        if (global.pendingTimers && global.pendingTimers['reg']) {
            global.pendingTimers['reg']();
        }
        
        // Trigger first stage combat
        await new Promise((resolve) => {
            originalSetTimeout(resolve, 50);
        });

        // Autoplay the multi-player raid
        await autoPlayCombat(testChat);

        while (lobbyState && lobbyState.active) {
            if (lobbyState.inCombat) {
                await autoPlayCombat(testChat);
            }
            await new Promise(resolve => originalSetTimeout(resolve, 5));
        }

        // Verify rewards updated
        const p1 = economy.getUser(testUser);
        const p2 = economy.getUser(opponentUser);
        assert.ok(p1.questsCompleted > 35 || p2.questsCompleted > 20, 'At least one participant should have updated quest completion records');
    });

    // ==========================================
    // TEST CATEGORY 5: PvP System Duel Lifecycle with Skills
    // ==========================================
    await runAssert('PvP Duel Turn Management & Skills', async () => {
        setupUsers();

        // Challenge and accept
        pvpSystem.challengePlayer(testChat, testUser, opponentUser, 200);
        await pvpSystem.acceptChallenge(mockSock, testChat, opponentUser);

        const duel = pvpSystem.getDuel(testChat);
        assert.ok(duel, 'Duel instance should be active in the chat');

        // Cast custom skill during PvP (must pass 'ability' action name)
        const res = await pvpSystem.handlePvPAction(mockSock, testChat, testUser, 'ability', '1', { key: { id: 'pvp_skill_msg' } });
        assert.ok(duel.players[1].hp < duel.players[1].maxHp, 'Opponent HP should decrease after skill cast');
        
        // Cooldown should be set
        assert.ok(duel.players[0].cooldowns && duel.players[0].cooldowns.slash > 0, 'Skill cooldown must be tracked');

        // Let combat resolve to completion
        let turns = 0;
        while (duel.players[1].hp > 0 && turns < 50) {
            const activeUser = duel.turn === 0 ? testUser : opponentUser;
            await pvpSystem.handlePvPAction(mockSock, testChat, activeUser, 'attack', null, { key: { id: 'pvp_atk_' + turns } });
            turns++;
        }

        // Verify stakes resolution
        const winner = economy.getUser(testUser);
        const loser = economy.getUser(opponentUser);
        assert.strictEqual(winner.wallet, 50200, 'Winner should receive stakes (+200)');
        assert.strictEqual(loser.wallet, 9800, 'Loser should lose stakes (-200)');
    });

    // ==========================================
    // TEST CATEGORY 6: Crafting & Gear Stats Calculations
    // ==========================================
    await runAssert('Crafting & Gear Custom Stat Calculations', async () => {
        setupUsers();

        // Add ingredients for steel_sabre: iron_sword: 1, refined_steel: 3, sharp_whetstone: 1
        await inventorySystem.addItem(testUser, 'iron_sword', 1);
        await inventorySystem.addItem(testUser, 'refined_steel', 3);
        await inventorySystem.addItem(testUser, 'sharp_whetstone', 1);

        // Craft the weapon (passing WEAPON category)
        const craftRes = await craftingSystem.performCraft(testUser, 'steel_sabre', 'WEAPON');
        assert.strictEqual(craftRes.success, true, 'Crafting should succeed');

        // Equip the weapon
        const equipRes = await inventorySystem.equipItem(testUser, 'steel_sabre');
        assert.strictEqual(equipRes.success, true, 'Equipping crafted weapon should succeed');

        const user = economy.getUser(testUser);
        assert.strictEqual(user.equipment.main_hand.id, 'steel_sabre', 'Steel Sabre should be equipped in main hand');
        
        // Verification of equipped stat calculations (using base stats combined getter)
        const finalStats = progression.getBaseStats(testUser, user.class);
        assert.ok(finalStats.atk >= 25, 'Total ATK should incorporate Steel Sabre ATK bonus (+25)');
    });

    // Final result output
    if (failed) {
        console.error('\n❌ DEEP RPG SYSTEM VERIFICATION HAS DETECTED ISSUES.');
        process.exit(1);
    } else {
        console.log('\n🌟 ALL RPG SYSTEM SCENARIOS COMPLETED WITH 100% SUCCESS!');
        process.exit(0);
    }
}

runAllTests().catch(err => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
