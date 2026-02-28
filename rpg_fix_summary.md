Identifying and fixing bugs in the RPG system:

1.  **Combat Stability**:
    *   Found potential for "Connection Closed" errors in `core/guildAdventure.js` during combat loops, particularly in `processCombatTurn` and `performEnemyAction`.
    *   Wrapped `sock.sendMessage` calls within these functions in `try-catch` blocks to prevent crashes.
    *   Ensured that `performEnemyAction` always schedules the next turn (or ends combat) even if an error occurs, preventing infinite loops or deadlocks.

2.  **Skill Effect Application & Targeting**:
    *   Identified a critical bug in `applyAbilityEffect` where AOE skills were hardcoded to target `state.enemies`. This caused enemy AOE skills to hit their own allies.
    *   Fixed the targeting logic to dynamically select the opposing side (`state.players` if caster is enemy, `state.enemies` if caster is player).

3.  **Loot Consistency**:
    *   Found inconsistency between gold calculated in `endCombat` (based on killed enemies) and gold distributed by `lootSystem.distributeLoot` (based on generic ranges).
    *   Updated `lootSystem.js` to accept an `overrideGold` parameter.
    *   Updated `endCombat` in `core/guildAdventure.js` to pass the calculated `totalGold` to `distributeLoot`, ensuring players receive the correct amount for the specific enemies defeated.

4.  **Boss Mechanics**:
    *   Added error handling to `checkBossPhase` in `core/guildAdventure.js` to prevent crashes during phase transitions if message sending fails.

These changes should resolve the reported issues with combat stability, targeting, and loot consistency.