# Mellow's WhatsApp Bot

A multi-tenant WhatsApp bot built on Baileys, MongoDB, and a Go-based rendering microservice. It features a complete turn-based RPG engine, group games, moderation systems, and context-aware AI chat summaries.

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js**: v18+ (tested on v20 LTS).
* **MongoDB**: A running local server or Atlas cluster URI.
* **Go Image Service**: A separate rendering engine used to draw cards and combat boards. (If you don't run it locally, image-based cards will fall back to text outputs).

### 2. Installation
Install dependencies:
```bash
npm install
```

### 3. Configuration
Create a `.env` file in the root directory:
```env
MONGODB_URI=mongodb://localhost:27017/joker_bot
GROQ_API_KEYS=gsk_key1,gsk_key2
GO_IMAGE_SERVICE_URL=http://localhost:8080
```
* **GROQ_API_KEYS**: You can supply multiple keys separated by commas; the engine automatically rotates through them to handle rate limits.
* **GO_IMAGE_SERVICE_URL**: Points to the Go renderer.

### 4. Running the Bot
Start the bootloader:
```bash
node index.js
```
The terminal will display a WhatsApp QR code. Scan it with the "Linked Devices" option in WhatsApp.

---

## ⚙️ Core Architecture & Subsystems

### 1. Multi-Tenant Instance System
The codebase runs multiple independent bot accounts from a single process. 
* **Configuration**: Each tenant is defined under `instances/<bot_id>/` with its own `botConfig.json` (specifying prefix, name, and toggle states).
* **Session States**: Baileys auth tokens are kept isolated in `instances/<bot_id>/auth/`.
* **Tenant Context**: The bot uses Node's `AsyncLocalStorage` to carry the active tenant's context (like configuration and database state) through the call stack. Rather than passing config objects everywhere, any helper can import `./botConfig` and resolve the correct instance settings on the fly.

### 2. Message Routing (`core/engine.js`)
* **Entry Point**: The Baileys socket triggers `messages.upsert`.
* **Validation**: Filters out non-notify messages, processes mentions, resolves JIDs, and validates the configured prefix.
* **Registry & Execution**: Matches commands against the registry. To keep the router clean, actual command logic is delegated downstream to scripts in `core/commands/` (like `rpgCommands.js` or `adminCommands.js`).

### 3. RPG Subsystem (`core/rpg/`)
* **State Management**: Group quests, solo dungeons, and PvP duels maintain in-memory states in the global `gameStates` Map.
* **Turn Loops**: Turns are timed (`processCombatTurn`). Players submit commands (`.j combat skill 1`, `.j combat def`), updating their action gauges. AI runs the enemy actions or triggers boss phase transitions.
* **Dynamic Scaling**: Stats for monsters and bosses scale dynamically based on the average level of players and the size of the party (adding 20% HP/ATK per additional player).

### 4. AI Summary Engine (`core/chat/`)
* **Memory Buffer**: Keeps a rolling circular buffer of recent messages per group chat.
* **Summarization**: When a user runs `.j summarize`, the bot feeds the conversation history to the Groq API using key-rotation and outputs topic-segmented summaries.

---

## 📂 Codebase Layout

```text
whatsapp-bot/
├── core/                # System logic
│   ├── commands/        # Message command handlers
│   ├── games/           # Chess, Wordle, Ludo minigames
│   ├── models/          # Mongoose database schemas
│   ├── rpg/             # RPG engine, PvP, and combat loops
│   ├── utils/           # Database, Groq, and rendering helpers
│   └── engine.js        # Main message interceptor & router
├── docs/                # Developers documentation (organized by commands)
├── instances/           # Bot tenant configurations & session auth files
└── index.js             # Bootstrap script
```
