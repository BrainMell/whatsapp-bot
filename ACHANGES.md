# 📜 Persona Bot: Master Blueprint & Change Log

This document tracks all implemented changes and provides technical blueprints for upcoming features. All implementations must adhere to the `instruction_guide.md`.

---

## ✅ COMPLETED UPDATES (JAN 31, 2026)

### 🎨 UI & Stylistic Overhaul
- **Short Box Standard**: All headers converted to `┏━━━━━━━━━━━━━━━┓`.
- **Rule of 20**: Standardized line lengths for mobile readability.
- **Newsletter UI**: Integrated professional forwarding linked to the channel.
- **Dynamic Naming**: Removed all hardcoded "Persona Bot" references.

### 🛡️ Stability & Security
- **Network Fuse**: Implemented `isRekeying` to stop empty message spam.
- **Logic Fixes**: Resolved variable scope issues (`senderJid`) and duplicate command blocks.
- **Usage Banners**: Added intelligent help banners for incorrectly used commands.

### ⚔️ RPG & Combat Enhancements
- **Weapon Weight**: Attack text dynamically changes (🔨 SMASHES, ⚔️ SLASHES, 🗡️ PIERCES, 🔮 CASTS).
- **Status Visuals**: Name tags in combat change to `[☣️ NAME]` when poisoned, etc.
- **Mining Lucky Finds**: 2% chance per roll to find Zeni pouches during expeditions.
- **Graveyard System**: `.j graveyard` command implemented to track fallen Hardcore heroes.

---

## 🚀 ROADMAP: THE "HIVE & WILDERNESS" EXPANSION

### 🏹 1. Wilderness Systems (Fishing & Hunting)
**Fishing Logic (`.j fish`):**
- **Implementation**: `fishing.js`. Uses water emojis (🐟, 🐡, 🦑).
- **Luck Scaler**: Player `LUCK` stat increases the chance of catching rare types.
- **Infection**: 5% chance of a `[MUTATED]` fish that drops shards.

**Hunting Logic (`.j hunt`):**
- **Implementation**: `hunting.js`. Uses animal emojis (🐇, 🦌, 🐗, 🐻).
- **Weapon Bonus**: Having a Bow/Rifle in `bag` increases success chance.
- **Sales**: Captured animals can be sold at the Resistance HQ.

### 🏰 2. Resistance HQ (Central Guild Hall)
**Global State:**
- **Infection Meter**: A global % in `System.js`. Increases when players die; decreases when bosses are killed.
- **High % Effects**: If infection > 80%, all quests spawn the **Maximum** number of mobs.
- **Bounty Board**: Global "Kill Goals" (e.g., Kill 500 Infected). If reached, everyone gets a "Vaccine" buff (+10% DEF).

**Social Features:**
- **Guild Motto**: Add `motto` string to `Guild` model. Displayed in `.j guild info`.
- **Dynamic Titles**: Automatic profile prefixes like "The Hive-Slayer" (100 kills).

### ⚔️ 3. Combat Flavor & AI Mutants
- **Infected AI Personalities**:
  - *Cowardly*: Small mobs have a 10% chance to "Cower" (Shield self) or flee if alone.
  - *Aggressive*: Heavy mobs ignore 50% of player DEF but take 20% more damage.
- **Execution Bonus**: Overkilling a mob by 200% HP rewards a 10% Gold bonus.
- **The Whisper**: 1% chance when starting a quest to receive a distorted "Hive Mind" message.

### 🌍 4. Environmental Engine
- **Server Weather**: 12-hour rotating cycle (Foggy, Blood Moon, Sunny).
- **Fog**: -15% Accuracy for everyone.
- **Blood Moon**: +50% Gold but enemies deal 25% more damage.
- **Time of Day**: Night-time (Real server time) increases "Shadow" type infected spawns.

### 📦 5. Loot & Crafting "Micro-Details"
- **"Forged By" Tags**: Add `craftedBy` field to equipment. Displayed in `.j bag`.
- **Item Lore**: Add one-line funny lore to every material in `lootSystem.js`.
- **Marked for Death**: If a player is too successful, they get a "Recognition" status, forcing max mobs for 3 quests.

---
*Implementation Checklist: Register -> Logics -> Suggester -> ChangeLog*
---