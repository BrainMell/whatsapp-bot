# Scrapers Subsystem: Media & Card Scrapers

## What it is
The Scrapers Subsystem manages bulk data collection and crawling processes. These scripts run independently of the main WhatsApp bot process to compile and update asset pools. It consists of:
1. The **Shoob Card Scraper** (`shoob-scraper.js`), which connects to Shoob using a stealth Puppeteer browser, logs in, crawls cards by tier, and writes the compiled inventory catalog to the bot's static JSON store (`cards_data.json`).
2. The **Pinterest Meme and Reaction Scraper** (`pinterest-scraper-advanced.js`), which utilizes stealth browsing, automated scrolls, and resolution filters to build a large library of animated and static anime reaction image links (`anime_memes_reactions.json`).

## How it works

**Shoob Puppeteer Scraper Setup** — [shoob-scraper.js L8-L26](file:///home/mellow/Desktop/Joker/scrapers/shoob/shoob-scraper.js#L8-L26)
```javascript
class ShoobCardScraper {
  constructor(config = {}) {
    this.startPage = config.startPage || 1;
    this.endPage = config.endPage || 2332;
    this.tiers = config.tiers || ['1', '2', '3', '4', '5', '6', 'S'];
    
    // We point this to the bot's production cards_data.json as the source of truth!
    this.botDataPath = '/home/mellow/Desktop/Joker/whatsapp-bot/core/data/cards_data.json';
    
    this.outputFolder = config.outputFolder || path.join(__dirname, 'shoob_cards');
    this.outputFile = path.join(this.outputFolder, 'cards_data.json');
    this.backupFile = path.join(this.outputFolder, 'cards_data.backup.json');
    
    this.cards = [];
    this.processedPages = new Set();
    
    this.browser = null;
    this.isSaving = false;
  }
}
```
This constructor configures the card scraper instance. It sets default crawl ranges (pages 1 to 2332), sets card tiers, defines target folder destinations, and designates the absolute path to the bot's active production cards JSON file so updates apply instantly.

---

**Pinterest Meme and Reaction Scraper** — [pinterest-scraper-advanced.js L8-L26](file:///home/mellow/Desktop/Joker/scrapers/pinterest/pinterest-scraper-advanced.js#L8-L26)
```javascript
class DebuggedMemeScraperFixed {
  constructor(config = {}) {
    this.targetCount = config.targetCount || 100000;
    this.outputFile = config.outputFile || path.join(__dirname, 'anime_memes_reactions.json');
    this.batchSize = config.batchSize || 500;
    this.maxRetries = config.maxRetries || 3;
    this.scrollDelay = config.scrollDelay || 4000;
    this.minImageWidth = config.minImageWidth || 300;
    this.minImageHeight = config.minImageHeight || 300;
    this.images = [];
    this.imageUrlSet = new Set();
    this.processedSearches = new Set();
    this.currentSearch = '';
    this.browser = null;
    this.page = null;
    
    this.searchTerms = this.generateMemeReactionSearches();
    this.userAgents = this.generateUserAgents();
  }
}
```
This class initializes config options for crawling Pinterest. It specifies threshold parameters (target image count limit, scroll durations, and minimum pixel sizes), loads randomized user agents to avoid bot blocks, and dynamically generates list terms for crawling memes.

---

**Shoob Card Progress Saver** — [shoob-scraper.js L168-L203](file:///home/mellow/Desktop/Joker/scrapers/shoob/shoob-scraper.js#L168-L203)
```javascript
  async saveProgress(forceSync = false) {
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      // Assign IDs to new cards
      this.assignIds();
      
      this.cards.sort((a, b) => {
        if (a.tier !== b.tier) return String(a.tier).localeCompare(String(a.tier));
        
        // Sort by id number ascending
        const aNum = parseInt(a.id.split('-')[1], 10);
        const bNum = parseInt(b.id.split('-')[1], 10);
        return aNum - bNum;
      });

      const data = {
        totalCards: this.cards.length,
        uniqueCards: this.cards.length,
        processedPages: Array.from(this.processedPages).sort(),
        cards: this.cards,
        lastUpdated: new Date().toISOString()
      };

      // Write to both scraper repo JSON and whatsapp-bot local JSON
      const jsonContent = JSON.stringify(data, null, 2);
      await fs.writeFile(this.outputFile, jsonContent, 'utf-8');
      await fs.writeFile(this.botDataPath, jsonContent, 'utf-8');
      console.log(`💾 Saved: ${this.cards.length} cards to both databases.`);

      // Sync to GitHub
      await this.syncToGitHub();
    } finally {
      this.isSaving = false;
    }
  }
```
This method handles data persistence for the card parser. It assigns IDs to newly scraped cards, sorts all cards alphabetically by tier and numerically by ID, compiles metadata, and writes the JSON content directly to both the scraper's output folder and the bot's live path before triggering a GitHub sync.

## How to modify it
To modify scraping boundaries or search properties, developers can adjust config assignments.

```javascript
// BEFORE (shoob-scraper.js L10-L11)
    this.startPage = config.startPage || 1;
    this.endPage = config.endPage || 2332;
```
```javascript
// AFTER (shoob-scraper.js L10-L11)
    this.startPage = config.startPage || 1;
    this.endPage = config.endPage || 50; // Modified endPage to 50 for rapid debugging/scans
```

```javascript
// BEFORE (pinterest-scraper-advanced.js L10)
    this.targetCount = config.targetCount || 100000;
```
```javascript
// AFTER (pinterest-scraper-advanced.js L10)
    this.targetCount = config.targetCount || 5000; // Lowered target image count limit
```

## Common tasks
- **Change Shoob scraper page range** — Limit the page crawl boundary to run smaller batches in [shoob-scraper.js L10-L11](file:///home/mellow/Desktop/Joker/scrapers/shoob/shoob-scraper.js#L10-L11).
- **Modify the output path for scraped cards** — Change the target destination file path for Shoob data updates in [shoob-scraper.js L15](file:///home/mellow/Desktop/Joker/scrapers/shoob/shoob-scraper.js#L15).
- **Configure Pinterest image target threshold** — Adjust the maximum crawled assets before stopping the Pinterest runner in [pinterest-scraper-advanced.js L10](file:///home/mellow/Desktop/Joker/scrapers/pinterest/pinterest-scraper-advanced.js#L10).
- **Change minimum Pinterest image resolution** — Filter out smaller thumbnails by modifying pixel dimensions in [pinterest-scraper-advanced.js L15-L16](file:///home/mellow/Desktop/Joker/scrapers/pinterest/pinterest-scraper-advanced.js#L15-L16).
- **Modify Shoob tiers collection scope** — Add or remove card tiers from the extraction crawler list in [shoob-scraper.js L12](file:///home/mellow/Desktop/Joker/scrapers/shoob/shoob-scraper.js#L12).
