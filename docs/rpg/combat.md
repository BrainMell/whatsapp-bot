# RPG Subsystem: Combat & Battle Engine

## What it is
The Combat subsystem drives turn-based encounters (PvE and PvP) in the RPG module. It operates as an orchestrator between game states, combat AI, and a Go-based rendering microservice. When combat is triggered, player stats (retrieved from their MongoDB cache via `economy.getUser`) are normalized in memory along with enemy mob definitions. During each turn:
1. Active players submit commands (attacks, skills, items).
2. Mobs process their actions using AI decision-making (charging up actions, casting custom spells, or running default attacks).
3. The resulting state updates are handled in memory inside the `gameStates` structure.
4. The system updates the board graphic via the Go Image Service rendering client and pushes the generated buffer with a text summary back to the WhatsApp chat using the Baileys WebSocket connection (`sock.sendMessage`).

## How it works

**Payload Creation for Combat Renderer** — [combatImageGenerator.js L13-L48](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/combatImageGenerator.js#L13-L48)
```javascript
async function generateCombatImage(players, enemies, options = {}) {
    try {
        const payload = {
            players: players.map(p => ({
                name: String(p.name || 'Unknown'),
                class: String(p.class?.id || p.class || 'FIGHTER'),
                level: Math.floor(Number(p.level) || 1),
                hp: Math.floor(Number(p.hp || 0)),
                maxHp: Math.floor(Number(p.stats?.maxHp || p.maxHp || 100)),
                currentHP: Math.floor(Number(p.currentHP !== undefined ? p.currentHP : (p.hp || 0))),
                energy: Math.floor(Number(p.stats?.energy || p.energy || 100)),
                maxEnergy: Math.floor(Number(p.stats?.maxEnergy || p.maxEnergy || 100)),
                adventurerRank: String(p.adventurerRank || 'F'),
                spriteIndex: Math.floor(Number(p.spriteIndex) || 0)
            })),
            enemies: enemies.map(e => ({
                name: String(e.name || 'Enemy'),
                currentHP: Math.floor(Number(e.currentHP !== undefined ? e.currentHP : (e.stats?.hp || 0))),
                maxHp: Math.floor(Number(e.stats?.maxHp || e.stats?.hp || 100)),
                isBoss: Boolean(e.isBoss),
                justDied: Boolean(e.justDied),
                spriteIndex: Math.floor(Number(e.spriteIndex) || 0)
            })),
            combatType: String(options.combatType || 'PVE'),
            rank: String(options.rank || 'F'),
            background: String(options.backgroundPath ? options.backgroundPath.split(/[\/\\]/).pop() : 'forest1.png')
        };

        const imageBuffer = await goService.generateCombatImage(payload);
        
        return { success: true, buffer: imageBuffer };
    } catch (error) {
        console.error('❌ Combat image generation failed:', error.message);
        return { success: false, error: error.message };
    }
}
```
This function normalizes in-memory player attributes (levels, HP status, energy, ranks, sprites) and active enemy stats (isBoss, HP details, death indicator) to build a structured payload. It then queries the external Go rendering service to retrieve a buffer containing the combat layout graphic.

---

**Enemy AI Turn Resolution** — [performEnemyAction_new.js L1-L43](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/performEnemyAction_new.js#L1-L43)
```javascript
async function performEnemyAction(sock, enemy, sessionKey) {
    const state = gameStates.get(sessionKey);
    if (!state || !state.inCombat) return;

    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : GAME_CONFIG.ENEMY_TURN_TIME;

    return new Promise(async (resolve) => {
        try {
            // 🧠 AI DECISION MAKING
            const decision = monsterSkills.evaluateAction(enemy, state.players, state.enemies);

            let turnInfo = {
                actor: enemy,
                action: { name: 'Action' },
                target: null,
                damage: 0,
                effects: []
            };

            // --- RELEASE CHARGE ---
            if (decision.action === 'release_charge') {
                const followUpSkill = decision.skill;
                const target = decision.target;
                
                try {
                    await sock.sendMessage(chatId, { text: `💥 *${enemy.name}* UNLEASHES THE CHARGE!` });
                } catch (err) {}
                
                const effect = followUpSkill.currentEffect || (typeof followUpSkill.effect === 'function' ? followUpSkill.effect(enemy.level || 1) : followUpSkill.effect);
                await applyAbilityEffect(sock, enemy, followUpSkill, effect, state.players.indexOf(target), chatId);
                
                turnInfo.action.name = followUpSkill.name;
                turnInfo.target = target;
                enemy.isCharging = false;
                enemy.chargingSkill = null;
                enemy.chargeTarget = null;

                setTimeout(async () => {
                    await nextTurn(sock, turnInfo, sessionKey);
                    resolve();
                }, turnDelay);
                return;
            }
```
This function runs the enemy combat turn. It checks if the battle is active, queries the monster's skillset to evaluate moves, and executes actions. If the monster has a charged skill ready, it discharges it, applying the ability's effect, and progresses the turn state.

---

**Combat Scene rendering** — [combatIntegration.js L26-L39](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/combatIntegration.js#L26-L39)
```javascript
async function renderCombatTurn(players, enemies, turnInfo, options = {}) {
    try {
        const playersToShow = players.filter(p => p.currentHP > 0 || p.justDied);
        const enemiesToShow = enemies.filter(e => e.currentHP > 0 || e.justDied);
        const result = await combatImageGen.updateCombatImage(
            playersToShow, enemiesToShow, turnInfo,
            { rank: options.rank, backgroundPath: options.backgroundPath }
        );
        return result;
    } catch (error) {
        console.error('Combat turn render error:', error);
        return { success: false, error: error.message };
    }
}
```
This function acts as an integration layer between the combat engine and the rendering module. It filters out dead participants, preserving only alive players and enemies (along with those who just died to render their death animation), and updates the combat image using the generated image microservice.

---

## How to modify it

### Add Custom Weapon Verbs
To expand the list of active combat verbs when players hit with custom weapon types, edit `core/rpg/combatIntegration.js`.

```javascript
// Before (core/rpg/combatIntegration.js L83-91)
    let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
    if (actor?.equipment?.main_hand) {
        const wName = actor.equipment.main_hand.name?.toLowerCase() || '';
        if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
        else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
        else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
        else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
        else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
    }
```

```javascript
// After (core/rpg/combatIntegration.js L83-91)
    let actionVerb = actor?.isEnemy ? 'unleashes' : 'uses';
    if (actor?.equipment?.main_hand) {
        const wName = actor.equipment.main_hand.name?.toLowerCase() || '';
        if (/hammer|club|mace|maul/.test(wName)) actionVerb = '🔨 *SMASHES* with';
        else if (/sword|blade|sabre|falchion/.test(wName)) actionVerb = '⚔️ *SLASHES* with';
        else if (/dagger|knife|spear|lance/.test(wName)) actionVerb = '🗡️ *PIERCES* with';
        else if (/staff|wand|rod/.test(wName)) actionVerb = '🔮 *CASTS* via';
        else if (/bow|crossbow/.test(wName)) actionVerb = '🏹 *SHOOTS* with';
        else if (/axe|halberd|cleaver/.test(wName)) actionVerb = '🪓 *CHOPS* with'; // Custom axe verb added
    }
```

### Alter Turn Delay Behaviors
To change the pace of combat actions, modify the delay logic inside `core/rpg/performEnemyAction_new.js`.

```javascript
// Before (core/rpg/performEnemyAction_new.js L5-7)
    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : GAME_CONFIG.ENEMY_TURN_TIME;
```

```javascript
// After (core/rpg/performEnemyAction_new.js L5-7)
    const chatId = state.chatId;
    const turnDelay = state.solo ? 0 : 2000; // Force a 2-second enemy turn delay regardless of config
```

## Common tasks
- **Add custom combat action verbs** — Customize the weapon type regex checks and action descriptions in [combatIntegration.js L84-91](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/combatIntegration.js#L84-L91).
- **Alter enemy AI turn delays** — Change the amount of time the bot waits before taking enemy combat turns in [performEnemyAction_new.js L6-8](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/performEnemyAction_new.js#L6-L8).
- **Modify normalized player properties payload** — Add or update fields passed from player data to the combat graphics generator in [combatImageGenerator.js L15-26](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/combatImageGenerator.js#L15-L26).
- **Modify normalized enemy properties payload** — Add or update fields passed from enemy data to the combat graphics generator in [combatImageGenerator.js L27-35](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/rpg/combatImageGenerator.js#L27-L35).
