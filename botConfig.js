const fs = require('fs');
const path = require('path');
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
      contentDescription: "You are Joker from Persona 5.",
      fastResponses: ["hmm.","yeah.","lol.","nah.","facts.","true.","say less.","noted.","sus.","idk man.","real.","ight.","💀","😐","bruh.","wild.","ok.","👀","lmao.","bet."],
      enabled: true
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

  isEnabled() { return this.config.enabled !== false; }
  getBotId() { return this.config.botId; }
  getBotName() { return this.config.botName; }
  getPrefix() { return this.config.prefix; }
  getVersion() { return this.config.version; }
  getCurrency() { return this.config.currency; }
  getSymbol() { return this.config.symbol; }
  getContentDescription() { return this.config.contentDescription; }
  getFastResponses() { return Array.isArray(this.config.fastResponses) ? this.config.fastResponses : this.defaults.fastResponses; }
  getSiblings() { return Array.isArray(this.config.siblings) ? this.config.siblings : []; }
  getAssetPath(subPath = '') { 
    const sharedFiles = ['scores.png', 'zeni.png', 'placeholder.png'];
    if (sharedFiles.includes(subPath)) {
      return path.join(__dirname, 'core', 'Ldatabase', subPath);
    }
    return path.join(this.instancePath, 'assets', subPath); 
  }
  getStickerPath(subPath = '') { return path.join(this.instancePath, 'stickers', subPath); }
  getAuthPath() { return path.join(this.instancePath, 'auth'); }
  getDataPath(subPath = '') { 
    if (subPath === 'pfp') {
      return path.join(__dirname, 'core', 'database', 'pfp');
    }
    return path.join(this.instancePath, 'database', subPath); 
  }
  getRPGAssetPath(subPath = '') { return path.join(__dirname, 'core', 'rpgasset', subPath); }
}

// Export a Proxy that always points to the current instance in storage
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
  getFastResponses: () => (storage.getStore()?.getFastResponses() || ["hmm.", "yeah.", "ok."]),
  getAssetPath: (p) => storage.getStore()?.getAssetPath(p),
  getStickerPath: (p) => storage.getStore()?.getStickerPath(p),
  getAuthPath: () => storage.getStore()?.getAuthPath(),
  getDataPath: (p) => storage.getStore()?.getDataPath(p),
  getRPGAssetPath: (p) => storage.getStore()?.getRPGAssetPath(p),
  getSiblings: () => (storage.getStore()?.getSiblings() || [])
};