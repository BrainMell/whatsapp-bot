# Configuration & Environment Setup

## What it is
The Configuration Subsystem initializes runtime settings and handles global secret parameters. It reads environment variables from a `.env` configuration file at startup. It utilizes the `BotConfig` class to load and isolate instance-specific options (such as bot name, ID, command prefix, currency symbol, and directories) for multiple threads or running instances. It uses Node.js `AsyncLocalStorage` to store the active configuration context across asynchronous calls, allowing multi-instance scaling.

## How it works

**Thread-Local Instance Configuration** — [botConfig.js L3-L33](file:///home/mellow/Desktop/Joker/whatsapp-bot/botConfig.js#L3-L33)
```javascript
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

class BotConfig {
  constructor(instancePath) {
    this.instancePath = instancePath;
    this.defaults = {
      botId: "bot1",
      botName: "Joker",
      prefix: ".j",
      version: "5.3.2",
      symbol: ".",
      currency: {
        symbol: "Ꞩ",
        name: "Zeni"
      },
      contentDescription: "You are Joker from Persona 5."
    };
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configPath = path.join(this.instancePath, 'botConfig.json');
      if (fs.existsSync(configPath)) {
        return { ...this.defaults, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
      }
    } catch (e) {}
    return this.defaults;
  }
}
```
This class manages the lifecycle of a bot instance config. It specifies fallbacks for prefixes and currencies, maps them to an absolute instance path, reads local json configs if they exist, and links them to an `AsyncLocalStorage` thread-local context.

---

**Environment Variables Catalog** — [.env L1-L15](file:///home/mellow/Desktop/Joker/whatsapp-bot/.env#L1-L15)
```ini
# Database Connection
MONGO_URI="mongodb+srv://..."

# External Microservice endpoint
GO_IMAGE_SERVICE_URL="https://..."

# LLM APIs Keys (Comma-separated for key rotation)
GROQ_API_KEYS=gsk_...,gsk_...

# Cloudinary Integration (for slideshow media uploads)
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
```
This is the schema mapping for the system environment settings file. It exposes database clusters, microservice endpoints, LLM API keys for rotation, and Cloudinary media cloud integrations.

---

**Configuration Proxy Resolvers** — [botConfig.js L61-L80](file:///home/mellow/Desktop/Joker/whatsapp-bot/botConfig.js#L61-L80)
```javascript
module.exports = {
  BotConfig,
  storage,
  // Helper to get active config
  get: () => storage.getStore(),
  
  // Proxy for legacy support (require('./botConfig').getBotName())
  getBotId: () => (storage.getStore()?.getBotId() || "global"),
  getBotName: () => (storage.getStore()?.getBotName() || "Bot"),
  getPrefix: () => (storage.getStore()?.getPrefix() || ".j"),
  getVersion: () => (storage.getStore()?.getVersion() || "5.3.2"),
  getCurrency: () => (storage.getStore()?.getCurrency() || { symbol: "Ꞩ", name: "Zeni" }),
  getSymbol: () => (storage.getStore()?.getSymbol() || "."),
  getContentDescription: () => (storage.getStore()?.getContentDescription() || ""),
  getAssetPath: (p) => storage.getStore()?.getAssetPath(p),
  getStickerPath: (p) => storage.getStore()?.getStickerPath(p),
  getAuthPath: () => storage.getStore()?.getAuthPath(),
  getDataPath: (p) => storage.getStore()?.getDataPath(p),
  getRPGAssetPath: (p) => storage.getStore()?.getRPGAssetPath(p)
};
```
This exports block exposes wrapper methods acting as proxy resolvers. They forward property requests directly to the current thread-scoped `AsyncLocalStorage` object, maintaining compatibility with legacy static exports.

## How to modify it
To change system defaults or credentials parameters, developers can alter initialization definitions.

```javascript
// BEFORE (botConfig.js L10-L14)
    this.defaults = {
      botId: "bot1",
      botName: "Joker",
      prefix: ".j",
```
```javascript
// AFTER (botConfig.js L10-L14)
    this.defaults = {
      botId: "bot1",
      botName: "Oracle", // Changed botName
      prefix: ".o",      // Changed prefix
```

```javascript
// BEFORE (botConfig.js L16-L19)
      currency: {
        symbol: "Ꞩ",
        name: "Zeni"
      },
```
```javascript
// AFTER (botConfig.js L16-L19)
      currency: {
        symbol: "$",       // Changed currency symbol
        name: "Credits"    // Changed currency name
      },
```

## Common tasks
- **Change the default bot prefix** — Modify the command prefix default property value in [botConfig.js L13](file:///home/mellow/Desktop/Joker/whatsapp-bot/botConfig.js#L13).
- **Change default currency settings** — Adjust the currency symbol and name defaults in [botConfig.js L16-L19](file:///home/mellow/Desktop/Joker/whatsapp-bot/botConfig.js#L16-L19).
- **Configure bot nickname default** — Change the name property of the bot configuration defaults in [botConfig.js L12](file:///home/mellow/Desktop/Joker/whatsapp-bot/botConfig.js#L12).
- **Update system version string** — Customize the fallback version identifier in [botConfig.js L14](file:///home/mellow/Desktop/Joker/whatsapp-bot/botConfig.js#L14).
