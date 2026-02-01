# 📖 Persona Bot: The Complete Developer Manual

This guide is the master documentation for the Persona Bot system. It covers architecture, pitfalls, and the "unwritten rules" of the codebase.

---

## 🛠️ 1. ARCHITECTURE: MULTI-TENANT ORCHESTRATOR
The bot has evolved from a single script into a **Multi-Tenant System**. One codebase runs multiple bot instances simultaneously.

**The Structure:**
- **Root:** `index.js` (Manager), `botConfig.js` (Context Controller), `db.js` (Shared DB).
- **`core/`**: All logic files (RPG, Economy, AI). This code is **Shared**.
- **`instances/`**: Folder per bot (e.g., `/joker`, `/subaru`). Contains unique `auth`, `stickers`, and `botConfig.json`.

**Implementation Rules:**
- **Code vs. Identity:** Logic goes in `core/`. Identity (name, prefix, sessions) goes in `instances/`.
- **Shared DB:** All bots share **one** MongoDB connection to save RAM and avoid connection limits.
- **Shared AI:** All bots share the Groq API rotation for maximum capacity.

---

## ⚡ 2. THE ASYNC CONTEXT (AsyncLocalStorage)
To prevent "Variable Bleeding" (where Bot A accidentally uses Bot B's name), we use `AsyncLocalStorage`.

**How it works:**
1.  `index.js` starts a bot and runs it inside a "Storage Container".
2.  `botConfig.js` provides Proxy getters (`getPrefix()`, `getBotName()`).
3.  When `core/economy.js` calls `botConfig.getPrefix()`, it automatically gets the prefix for the **active** bot handling that specific message.

**Rule:** NEVER use hardcoded strings like `".j"` in the core logic. Always use `botConfig.getPrefix()`.

---

## ⚔️ 3. COMBAT & RPG SCALING
- **New Classes:** `classSystem.js` and `skillTree.js`.
- **New Monsters:** `monsterSkills.js`.
- **New Items/Loot:** `lootSystem.js`.
- **Assets:** RPG sprites are shared in `core/rpgasset/` to save disk space.

---

## 🤖 4. AI PERSONALITY & TRIGGER LOGIC
Each bot now has its own "Brain" based on its `botConfig.json`.

**Triggers:**
- **Name Mention:** Responds to its own name (e.g., "Joker", "Subaru").
- **@Mentions:** Properly normalized JIDs to ensure reliable tagging detection.
- **Replies:** Responds if a user replies to any message sent by that specific bot.
- **Isolation:** Joker personality rules are only loaded when Joker is talking.

---

## 🎨 5. UI & BRANDING STANDARDS

### The "Rule of 20" (Visual Consistency)
WhatsApp mobile screens are narrow. To prevent ugly text-wrapping and keeping boxes sharp:
- **Line Limit:** Keep headers and separator lines between **15-20 characters**.
- **Box Style:** Always use the short box: `┏━━━━━━━━━━━━━━━┓`.

---

## 📂 6. SHARED vs. ISOLATED DATA

### Shared (In `core/Ldatabase/` or `core/database/`):
- `zeni.png`, `scores.png`, `placeholder.png` (Base UI).
- `pfp/` cache (Downloaded profile pictures are shared to save bandwidth).
- `rpgasset/` (All sprites and environments).

### Isolated (In `instances/[name]/`):
- `auth/` (Login session).
- `stickers/` (Mood-based sticker packs).
- `botConfig.json` (Identity and personality).
- `assets/banner.png` (Bot-specific menu banner).

---

## 🚨 11. CRITICAL SYNTAX & STABILITY PROTOCOLS

### 1. The Bulk Replacement Trap
**The Error:** `SyntaxError: Missing initializer in const declaration`.
**The Cause:** Attempting to turn a constant into a function via regex but getting `const getPrefix() = ...` (missing the arrow `=>`).
**✅ CORRECT:** `const getPrefix = () => botConfig.getPrefix();`

### 2. The Global Getter Scope
**The Error:** `ReferenceError: getBotName is not defined`.
**The Cause:** Calling `getBotName()` directly instead of `botConfig.getBotName()`. 
**Rule:** If a core file doesn't have a local helper, you MUST prefix the getter with `botConfig.`.

### 3. The Exports Function Call Trap
**The Error:** `SyntaxError: Unexpected token ','`.
**The Cause:** Putting `func()` (a call) inside `module.exports = { ... }`.
**✅ CORRECT:** `module.exports = { func, otherFunc };` (References only).

### 4. Instance-Aware Pathing
**The Error:** Bot fails to reconnect or find files.
**The Cause:** Using hardcoded paths like `./auth`.
**Rule:** Use the `botConfig` path helpers:
- `botConfig.getAuthPath()`
- `botConfig.getAssetPath('file.png')`
- `botConfig.getDataPath('pfp')`

---

## 🤝 57. UNIFIED INTERACTION PROTOCOL
Use the `.accept` and `.decline` commands for all social requests.
- **Usage Prompts:** If a command requires follow-up text (like `.j nickname`), it MUST show a usage prompt (`❌ Usage: .j nickname <name>`) instead of an unknown command error.

---

## 🧠 58. THE BRAIN (CONTEXT EXTRACTION)
The bot uses a sophisticated 6-layer "Brain" system to learn about users from conversation.
- **Mapping:** Data is automatically saved to `User.profile.memories`.
- **Instance-Aware:** Subaru learns about "his" users, Joker learns about "his", even if the users overlap.

---
*Follow these multi-tenant protocols to ensure the bot system remains stable, scalable, and conflict-free.*
---