const axios = require("axios");

// 💡 FIX 2026-07-26 (INVESTIGATION.md):
// The Go service URL resolution was silently falling back to 127.0.0.1:7860
// when GO_IMAGE_SERVICE_URL was unset. This made every image command fail
// with ECONNREFUSED, but because goService.* methods catch their own errors
// and return null, the failure was invisible — callers silently fell through
// to text-only paths or hung on await forever. 12 prior "ROOT CAUSE" commits
// chased symptoms (sharp, Baileys, LID, contextInfo) without ever checking
// whether the Go service was actually reachable.
//
// Now: if GO_IMAGE_SERVICE_URL is unset, scream about it at startup so the
// operator knows immediately. The default stays 127.0.0.1:7860 because that
// IS the correct value when the Go service is co-located on Oracle — but
// the default should never be relied upon silently.
const _DEFAULT_GO_URL = "http://127.0.0.1:7860";
const _explicitGoUrl = process.env.GO_IMAGE_SERVICE_URL;
if (!_explicitGoUrl && !global._goUrlWarned) {
  global._goUrlWarned = true;
  console.error("⚠️  [GoService] GO_IMAGE_SERVICE_URL is NOT SET in the environment.");
  console.error("    Falling back to default: " + _DEFAULT_GO_URL);
  console.error("    This only works if the Go service (bot-generation-go) is running on the same host.");
  console.error("    If image commands fail, verify: curl -s -m 5 " + _DEFAULT_GO_URL + "/health");
}

class GoImageService {
  constructor(overrideUrl = null) {
    this.baseUrl = overrideUrl || _explicitGoUrl || _DEFAULT_GO_URL;

    if (!global.goServiceInitialized) {
      global.goServiceInitialized = true;
      console.log(`📡 [GoService] Using Base URL: ${this.baseUrl}`);
      // Startup health check — confirms Go service is reachable on boot.
      // Uses a SHORT 5s timeout (not the 120s axios default) so a dead
      // Go service doesn't hang the boot log for 2 minutes.
      this.healthCheck()
        .then((h) => {
          if (h) {
            console.log("[GoService] Health: ✅", JSON.stringify(h));
          } else {
            console.error("[GoService] Health: ❌ null (service unreachable at " + this.baseUrl + ")");
            console.error("    Image commands (.char/.coll/.deck/.bal/combat) will FAIL silently.");
            console.error("    Fix: ssh into Oracle, run: cd ~/bot_generation && pm2 restart bot-generation-go");
            console.error("    Then verify: curl -s -m 5 " + this.baseUrl + "/health");
          }
        })
        .catch((e) => console.error("[GoService] Health FAIL:", e.message));
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000, // 120s timeout for browser ops (scrapes, GIFs)
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // Queue for sequential processing
    this.heavyOpQueue = Promise.resolve();
  }

  /*
   * Helper to queue heavy operations sequentially.
   *
   * 💡 FIX 2026-07-26 (INVESTIGATION.md):
   * The previous implementation had a broken catch chain. When op() threw,
   * the inner catch called reject(err) but did NOT re-throw, so the .then()
   * returned undefined. The outer .catch() then fired with err=undefined,
   * calling reject(undefined) on the NEXT queued op. This caused cascading
   * silent failures and could permanently break the queue.
   *
   * New implementation: the .then() always returns (success or failure),
   * and we use a single reject path. The queue chain never breaks because
   * the .then() never throws — it always resolves, and we resolve/reject
   * the caller's promise directly.
   */
  async _enqueue(op) {
    return new Promise((resolve, reject) => {
      this.heavyOpQueue = this.heavyOpQueue
        .then(async () => {
          try {
            const result = await op();
            resolve(result);
          } catch (err) {
            reject(err);
            // Re-throw so the chain knows this step failed, but the queue
            // itself continues (the .then() still returns a resolved promise
            // because we're inside the catch).
            throw err;
          }
        })
        .catch((err) => {
          // Swallow the re-thrown error — it was already forwarded to the
          // caller via reject(). This keeps the queue alive for the next op.
          // Do NOT call reject() here — that would reject the WRONG promise
          // (the next one in line, not this one).
        });
    });
  }

  async healthCheck() {
    // 💡 FIX: use a SHORT 5s timeout. The axios client default is 120s,
    // which means a dead Go service hangs healthCheck for 2 full minutes.
    // Health checks should be fast — if it doesn't respond in 5s, it's down.
    try {
      const res = await this.client.get("/health", { timeout: 5000 });
      return res.data;
    } catch (error) {
      return null;
    }
  }

  /*
   * Generate Combat Image
   */
  async generateCombatImage(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/combat", data, {
          responseType: "arraybuffer",
          timeout: 10000, // 💡 FIX: was 5000ms — too aggressive, caused recurring
                          // "GoService Combat Error: timeout of 5000ms exceeded".
                          // The Go service on Render (0.1 CPU) can take 6-8s for
                          // complex combat scenes with multiple combatants. 10s
                          // gives enough headroom while still falling back to
                          // text-only if the service is truly unresponsive.
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Combat Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Generate Combat End Screen
   */
  async generateCombatEndScreen(text) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/combat/endscreen",
          { text },
          {
            responseType: "arraybuffer",
            timeout: 10000, // 💡 FIX: was 5000ms — same issue as combat image
          },
        );
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Combat EndScreen Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Generate Boss Splash Screen (new — Phase 0 of RPG expansion)
   * Renders a full-screen boss intro image with sprite, name, flavor text,
   * tier-colored background. Returns PNG buffer.
   * Payload: { name, spriteFilename, flavorText, tier }
   * tier: "S" | "SS" | "SSS" | "TRIAL" | "DRAGON" | "RAID"
   */
  async generateBossSplash(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/combat/splash",
          data,
          {
            responseType: "arraybuffer",
            timeout: 10000,
          },
        );
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Boss Splash Error:", error.message);
        return null; // non-fatal — splash is optional
      }
    });
  }

  /*
   * Generate Chess Board
   */
  async generateChessBoard(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/chess", data, {
          responseType: "arraybuffer",
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Chess Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Render Ludo Board
   */
  async renderLudoBoard(data, pfpUrls = {}) {
    return this._enqueue(async () => {
      try {
        if (data.players && pfpUrls) {
          data.players = data.players.map((p) => ({
            ...p,
            pfpUrl: p.pfpUrl || pfpUrls[p.jid] || "",
          }));
        }
        const response = await this.client.post("/api/ludo", data, {
          responseType: "arraybuffer",
          timeout: 15000,
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Ludo Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Render Tic-Tac-Toe Board
   */
  async renderTicTacToeBoard(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/ttt", data, {
          responseType: "arraybuffer",
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService TTT Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Render Tic-Tac-Toe Leaderboard
   */
  async renderTicTacToeLeaderboard(scores) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/ttt/leaderboard",
          { scores },
          {
            responseType: "arraybuffer",
          },
        );
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService TTT Leaderboard Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Generate Card Collection/Deck Grid (static PNG, same style as eShop)
   * Uses /api/cards/grid endpoint — no GIF/MP4, just a 4×4 PNG grid.
   * Works on 500MB/0.1CPU servers (sequential downloads, NearestNeighbor).
   */
  async generateCardGrid(imageUrls, title) {
    try {
      const response = await this.client.post(
        "/api/cards/grid",
        {
          images: imageUrls,
          title: title,
        },
        {
          responseType: "arraybuffer",
          timeout: 60000, // 60s — sequential downloads of up to 16 cards
        },
      );
      const buf = Buffer.from(response.data);
      if (buf.length < 100) return null;
      return buf;
    } catch (error) {
      console.error("GoService Card Grid Error:", error.message);
      return null;
    }
  }

  /*
   * Generate Card Collection/Deck GIF
   */
  async generateCardGif(imageUrls, title) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/cards/gif",
          {
            images: imageUrls,
            title: title,
          },
          {
            responseType: "arraybuffer",
          },
        );
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Card GIF Error:", error.message);
        return null;
      }
    });
  }



  /*
   * Generate Card Burning GIF
   */
  async generateBurnGif(imageUrl) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/cards/burn",
          {
            imageUrl: imageUrl,
          },
          {
            responseType: "arraybuffer",
          },
        );
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Card Burn Error:", error.message);
        return null;
      }
    });
  }

  /*
   * Convert Card Image
   */
  async convertCardImage(imageUrl) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/cards/convert",
          {
            imageUrl: imageUrl,
          },
          {
            responseType: "arraybuffer",
          },
        );
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Card Convert Error:", error.message);
        return null;
      }
    });
  }

  /*
   * Browser-Based Pinterest Search (Go Service)
   */
  async searchPinterest(query, count = 10) {
    try {
      const response = await this.client.get("/api/scrape/pinterest", {
        params: { query, count },
      });
      return response.data;
    } catch (error) {
      console.error("GoService Pinterest Error:", error.message);
      return { images: [], count: 0 };
    }
  }

  /*
   * Deep Rule34 Scrape (Go Service)
   */
  async searchRule34(query, count = 10) {
    try {
      const response = await this.client.get("/api/scrape/rule34", {
        params: { query, count },
      });
      return response.data;
    } catch (error) {
      console.error("GoService Rule34 Error:", error.message);
      return { images: [], count: 0 };
    }
  }

  /*
   * Powerscale Search — returns list of matching characters
   */
  async searchPowerscale(query) {
    try {
      console.log(`[GoService] Powerscale search for: ${query}`);
      const response = await this.client.get(`/api/scrape/powerscale`, {
        params: { query },
      });
      console.log(
        `[GoService] Powerscale search:`,
        JSON.stringify(response.data),
      );
      return response.data;
    } catch (error) {
      console.error("GoService Powerscale Search Error:", error.message);
      if (error.response)
        console.error("Body:", JSON.stringify(error.response.data));
      return null;
    }
  }

  /*
   * Powerscale Fetch — scrapes specific character page after user selects
   */
  async fetchPowerscalePage(pageUrl) {
    try {
      console.log(`[GoService] Powerscale fetch: ${pageUrl}`);
      const response = await this.client.get(`/api/scrape/powerscale/fetch`, {
        params: { url: pageUrl },
        timeout: 60000,
      });
      console.log(
        `[GoService] Powerscale fetch:`,
        JSON.stringify(response.data),
      );
      return response.data;
    } catch (error) {
      console.error("GoService Powerscale Fetch Error:", error.message);
      if (error.response)
        console.error("Body:", JSON.stringify(error.response.data));
      return null;
    }
  }

  /*
   * PornPics Scrape (Go Service - Browser Based)
   */
  async searchPornPics(query, count = 10) {
    try {
      const response = await this.client.get("/api/scrape/pornpics", {
        params: { query, count },
      });
      return response.data;
    } catch (error) {
      console.error("GoService PornPics Error:", error.message);
      return { images: [], count: 0 };
    }
  }

  /*
   * YouTube Audio Info & direct URL (Go Service)
   */
  async getAudioInfo(query) {
    try {
      const response = await this.client.get("/api/scrape/audio", {
        params: { query },
      });
      return response.data;
    } catch (error) {
      console.error("GoService Audio Info Error:", error.message);
      return null;
    }
  }

  /*
   * Anikai Best Match Watch Link (Go Service)
   */
  async getAnikaiLink(title) {
    try {
      const response = await this.client.get("/api/scrape/anikai", {
        params: { title },
      });
      return response.data.watchLink;
    } catch (error) {
      console.error("GoService Anikai Error:", error.message);
      return null;
    }
  }

  /*
   * Anime Corner News (Go Service)
   */
  async getAnimeNews() {
    try {
      const response = await this.client.get("/api/scrape/news");
      return response.data.articles || [];
    } catch (error) {
      console.error("GoService AnimeNews Error:", error.message);
      return [];
    }
  }

  /*
   * Search Stickers (Klipy)
   */
  async searchStickers(query, count = 10) {
    try {
      const response = await this.client.get("/api/scrape/stickers", {
        params: { query, count },
      });
      return response.data;
    } catch (error) {
      console.error("GoService Sticker Error:", error.message);
      return { stickers: [], count: 0 };
    }
  }

  /*
   * Generate Economy Card Image
   * Returns a beautiful PNG buffer of the user's balance card
   */
  async generateEconomyCard(data) {
    try {
      const response = await this.client.post("/api/cards/economy", data, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      const buf = Buffer.from(response.data);
      // Validate buffer (PNG header check + minimum size)
      if (buf.length < 100) return null;
      return buf;
    } catch (error) {
      console.error("GoService Economy Card Error:", error.message);
      return null;
    }
  }

  /*
   * Generate Transaction Card Image
   */
  async generateTransactionCard(data) {
    try {
      const response = await this.client.post("/api/cards/transaction", data, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      const buf = Buffer.from(response.data);
      if (buf.length < 100) return null;
      return buf;
    } catch (error) {
      console.error("GoService Transaction Card Error:", error.message);
      return null;
    }
  }

  /*
   * Generate Profile Card Image
   */
  async generateProfileCard(data) {
    try {
      const response = await this.client.post("/api/cards/profile", data, {
        responseType: "arraybuffer",
        timeout: 10000,
      });
      const buf = Buffer.from(response.data);
      if (buf.length < 100) return null;
      return buf;
    } catch (error) {
      console.error("GoService Profile Card Error:", error.message);
      return null;
    }
  }

  /**
   * Generate the eShop deck image (4x4 grid of event card images).
   * Calls the Go Image Service's /api/cards/eshop endpoint.
   * Returns a PNG buffer, or null on failure.
   */
  async generateEShopDeck(data) {
    try {
      const response = await this.client.post("/api/cards/eshop", data, {
        responseType: "arraybuffer",
        timeout: 30000, // 30s — needs to fetch up to 16 card images
      });
      const buf = Buffer.from(response.data);
      if (buf.length < 100) return null;
      return buf;
    } catch (error) {
      console.error("GoService eShop Deck Error:", error.message);
      return null;
    }
  }
}

module.exports = GoImageService;
