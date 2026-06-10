# 🤖 Mellow's Bot

A multi-tenant, high-performance turn-based RPG, utility, and moderation bot for WhatsApp group chats, powered by **Baileys WebSockets**, **MongoDB**, and the **Go Image Service**.

---

## 🌟 Key Features

* **Multi-Tenant Architecture:** Runs multiple isolated bot profiles concurrently using `AsyncLocalStorage` context namespaces.
* **⚔️ Rich Visual RPG Engine:** Complete turn-based dungeon combat, quests, leveling, abilities, and PvP duels rendered into dynamic image overlays via a Go microservice.
* **📈 Economy with Stocks & Investments:** Realistic stock ticker market updates, volatile growth funds, and P2P loan systems.
* **🛡️ Security & Auto-Mod:** Advanced anti-spam triggers, link scanners, status mention blocks, and warning strike systems.
* **🧠 Context-Aware AI:** Groq-powered chat logs, automatic topic segmentation, and smart group summaries.
* **🖼️ Media Engine:** FFmpeg-powered sticker/GIF converter and scraping integration.

---

## Developer Collaboration Guide

To ensure a smooth workflow when multiple developers are collaborating on the codebase, please adhere to the following setup and guidelines:

### 1. Local Environment Configuration
Each developer must create their own local `.env` file based on the config template.
> [!WARNING]
> **Never commit your `.env` file** or bot instance credentials to the repository. The `.gitignore` is set up to block these.

Key environment variables to configure locally:
* `MONGODB_URI`: Connection string to your local MongoDB server.
* `GROQ_API_KEY`: API keys for Groq LLM context-aware processing.
* `GO_IMAGE_SERVICE_URL`: URL to your local or hosted Go Image Service engine (needed for rendering profile and combat cards).

### 2. Managing Multi-Tenant Instances
This Bot supports running multiple bots simultaneously. Each bot instance is defined under the `instances/` directory:
* To add a new instance, create a subdirectory: `instances/<bot_id>/`.
* Inside, create `botConfig.json` containing configuration keys (like name, description, prefix, and settings).
* Place the instance's specific assets (like `banner.png`, `zeni.png`, `pfp.png`) in `instances/<bot_id>/assets/`.
* The credentials/session state will automatically generate in `instances/<bot_id>/auth/` when you boot the bot and scan the QR code.

### 3. Database Schema Updates
When adding fields or modifying schemas:
* Keep all database Mongoose models under `core/models/` (e.g. [User.js](docs/database/schema.md)).
* Document any new schema changes inside [docs/database/schema.md](docs/database/schema.md) using the 4-section standard.

### 4. Git Workflow
* **Branching:** Work on feature branches (e.g. `feature/pvp-rebalance` or `bugfix/anti-link`) instead of committing directly to `main`.
* **Testing:** Test your commands locally using a private testing group before opening a Pull Request.
* **Ignored Folders:** Do not remove the ignores for `node_modules`, `temp/`, `tools/`, or `instances/*/auth/`.

## 📂 Project Directory Structure

```bash
whatsapp-bot/
├── core/                # Core engine code modules
│   ├── commands/        # WhatsApp command execution logic (e.g. rpgCommands.js)
│   ├── games/           # Mini-games modules (e.g. chess.js, wordle.js)
│   ├── models/          # MongoDB Mongoose schemas
│   ├── rpg/             # RPG core systems (e.g. pvpSystem.js, combatIntegration.js)
│   ├── utils/           # Helper utilities (e.g. commandRegistry.js, goImageService.js)
│   └── engine.js        # Core message routing and orchestration (root of core)
├── docs/                # Comprehensive Developer Documentation
│   ├── admin/           # Admin settings, moderation controls, and command flows
│   ├── cards/           # Card collectibles commands (claim, collection, decks, lock)
│   ├── chat/            # AI context engine and topic buffers
│   ├── config/          # Environment variables catalog
│   ├── database/        # Mongoose database schema definitions
│   ├── economy/         # Economy commands (balance, daily, loans, stocks, register)
│   ├── fun/             # Fun commands (weather, joke, QR, scavenging fish/hunt)
│   ├── gambling/        # Gambling commands (blackjack, coinflip, roulette, slots, crash)
│   ├── games/           # Group games (chess, ludo, debate, tictactoe, wordle)
│   ├── guilds/          # Guild commands and daily boards
│   ├── info/            # Information commands (about, support, menu, accept/decline)
│   ├── integrations/    # Go service APIs and powerscale scraper utils
│   ├── interactions/    # SFW anime reactions (kiss, hug, pat, wink, slap)
│   ├── media/           # Stickers overview and reaction converters
│   ├── progression/     # Progression commands and leveling overview (level, rank)
│   ├── rpg/             # RPG systems (abilities, crafting, shop, combat board)
│   ├── scrapers/        # Media scrapers
│   ├── search/          # Search commands (anime, img, nsfw)
│   └── stickers/        # Sticker generator commands
├── instances/           # Auth credentials and assets per instance
├── reactions/           # Message reaction listeners
├── index.js             # Entry point bootstrap script
├── db.js                # Mongoose connector
├── botConfig.js         # Multi-tenant config proxy resolver
└── package.json         # Package configuration
```

---

## 📖 Developer Documentation Index

All modules, APIs, and systems are documented with code snippets, line references, and modification guides.

### ⚙️ Core Engines & Configuration
* [Central Bot Engine](docs/engine.md) — Event loops, raw packet parser, command routers, and multi-tenant loading.
* [Context-Aware AI Engine](docs/chat/context_engine.md) — Memory retrieval, summaries, and topic segments.
* [Environment Configuration](docs/config/env.md) — Thread-safe multi-tenant config proxy, environment catalog.
* [Database Schema](docs/database/schema.md) — MongoDB connections, Mongoose models, and fields catalogs.
* [External APIs & Go Service](docs/integrations/apis.md) — Groq key-rotation, Go Service image payloads, news fetching.

### 🗂️ Category-based Documentation

The documentation for all bot commands and subsystems is structured into 11 main categories:
1. **[Admin & Moderation](docs/admin/commands.md)** — Security scans, chat settings, warning resets, and group locks.
2. **[Card Collectibles](docs/cards/info.md)** — Collection searches, deck editing, marketplace auctions, and card claims.
3. **[Economy System](docs/economy/economy.md)** — Registrations, balances, bank deposits/withdrawals, P2P loans, and investments.
4. **[Gambling Minigames](docs/gambling/coinflip.md)** — Blackjack, roulette, coinflip, crash, slots, and session limits.
5. **[Group Games](docs/games/chess.md)** — 1v1 Chess matches, multiplayer Ludo boards, Tic-Tac-Toe, Wordle, and AI debates.
6. **[Role Playing Game (RPG)](docs/rpg/guide.md)** — Character stats, abilities upgrades, item crafting, dismantling, cauldons brewing, and shops.
7. **[Fun & Interactions](docs/fun/fun_commands.md)** — Jokes, trivia, roasts, compatibility calculator, QR codes, and animated anime reactions.
8. **[Factions & Guilds](docs/guilds/guilds.md)** — Guild creation, treasury contributions, and daily hunting boards.
9. **[Progression System](docs/progression/progression.md)** — XP calculations, milestone leveling, and attribute points allocation.
10. **[Search & Scrapers](docs/search/anime_search.md)** — Jikan anime search, powerscale wiki scraper, Google images search, and Rule34/PornPics scrapers.
11. **[User Profile & AI Memory](docs/user-info/memory.md)** — Personal profiles, nicknames, and group inside joke memory.

---

* [Full Documentation Table of Contents](docs/README.md) — Comprehensive link listing of every single documentation file.

---

## 🚀 Getting Started

### Prerequisites
* Node.js v18+
* MongoDB database instance
* Running Go Image Service (This is in a seperate repo you won't have to worry about for now)

### Installation
1. Clone the repository and navigate into the `whatsapp-bot` folder:
   ```bash
   npm install
   ```
2. Set up your `.env` file based on [docs/config/env.md](docs/config/env.md).
3. Start the bot engine:
   ```bash
   node index.js
   ```

---

## 🛠️ Development & Contribution

Please refer to the specific module docs under the `docs/` folder before changing formulas, DB collections, or command hooks. All documentation follows a 4-section standard (**What it is**, **How it works**, **How to modify it**, **Common tasks**) to ensure developer efficiency.
