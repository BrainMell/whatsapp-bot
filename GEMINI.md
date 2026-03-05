# Gemini CLI Foundations & Project Mandates

This file serves as the core instruction set for all AI agents working on the Goten/Joker bot project. These rules take precedence over general instructions.

## 🚀 Mel's RPG Overhaul & Stability Plan (Active Directive)

**Objective:** Execute a massive overhaul of the RPG system, fix critical bugs (rewards, custom decks), and implement new features (Enhancement, Alchemy, Trials) across 10 distinct sessions.

### 📋 The 10-Session Roadmap
*The user must approve the start of each session.*

1.  **Session 1: Diagnostics & Critical Checks**
    *   **Tasks:** Verify "Custom Deck" commands (removing cards, deleting decks). Investigate "Reward System" failure (quests not giving rewards). Run full test suite (`debugger`, `functional`, `verify`) to establish baseline.
    *   **Goal:** Identify root causes for reported regressions.

2.  **Session 2: RPG Core Fixes (Part 1 - Data Integrity)**
    *   **Fix:** Loss of skill/attribute points over time/updates.
    *   **Fix:** Loss of previous skills after evolution.
    *   **Fix:** Evolution damage calculation (new skills doing 0 damage/freezing).

3.  **Session 3: RPG Core Fixes (Part 2 - Balance)**
    *   **Fix:** Increase evolution level requirement (Lv 15/20).
    *   **Fix:** Rebalance Base vs. Evo damage (Apprentice > Mage issue).
    *   **Fix:** Mob speed balancing (Higher level mobs need fair turns).

4.  **Session 4: RPG Core Fixes (Part 3 - Economy & Logic)**
    *   **Fix:** Remove permanent boosts from shop.
    *   **Fix:** Increase Ether price.
    *   **Fix:** Improve voting timer (increase duration/prevent instant auto-pick).
    *   **Fix:** Reward scaling (SSS dungeons giving Rare items -> Fix to Legendary).

5.  **Session 5: Feature - Equipment Enhancement**
    *   **Add:** Enhancement Stones (Item).
    *   **Cmd:** `.j enhance <item>`.
    *   **Logic:** Apply attribute boosts to equipment only.

6.  **Session 6: Feature - Advanced Crafting Split**
    *   **Refactor:** Split `.j craft` into:
        *   `.j brew` (Alchemy/Potions).
        *   `.j forge` (Blacksmith/Weapons).
        *   `.j craft` (Materials/Stones/General).
    *   **Logic:** Material up-conversion (3 Low -> 1 Mid).

7.  **Session 7: Feature - Item Ranks & Inventory Sort**
    *   **Add:** Visual Ranking System (Grey/Common -> Red/Mythical).
    *   **Add:** Inventory Sorting (Sort by Item Type and Rank).
    *   **Verify:** Ensure sorting persists in `.j bag`.

8.  **Session 8: Feature - Evolution Overhaul**
    *   **Add:** "Trials" before evolution (Specific boss fight per class).
    *   **Add:** Craftable Evolution Stones (Recipe-based, not just shop bought).
    *   **Add:** Evolution material drops in world.

9.  **Session 9: Feature - Mining/Cooking & Status**
    *   **Mining:** Rebalance XP (increase) and Energy (recovery options).
    *   **Cooking:** Add Food buffs (Atk/Crit/Def boosts).
    *   **Status:** Fix "DoT" messages to actually apply damage/effects visibly.

10. **Session 10: Tutorial & Final Polish**
    *   **Add:** Interactive RPG Tutorial for newbies (Stats, Skills, Unlocking).
    *   **Docs:** Update all menus (`.menu`, `.help`) with new commands.
    *   **Verify:** Final full-suite run of all 3 test tools.

## 🛠️ General Engineering Standards

-   **Testing Protocol:** Every session MUST conclude by running:
    1.  `tools/debugger.js` (Simulation)
    2.  `tools/functional_validation.js` (Logic)
    3.  `tools/verify_all_commands.js` (Routing)
-   **Menu Updates:** adding a command = updating the menu.
-   **Visual Constraints:** UI ASCII boxes/lines MUST NOT exceed **15 characters** width (Mobile Rule).
-   **Command Lifecycle:** Logic -> Registry -> Usage Docs -> Verification.
-   **Non-Intrusive UX:** Use `reply()` helper. No "Joker:" prefixes. No phone number tags.
-   **Safety:** `messages.upsert` must use `Promise.all` (No sequential loops).

## 🚀 Previous Context (Preserved)
-   **RPG SessionKey:** Solo raids use `${chatId}_${userId}`.
-   **Deck E-Shop:** Moderated via `CardMarket`.
-   **Fuzzy Matching:** Active for deck names.
