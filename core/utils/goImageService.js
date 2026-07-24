const axios = require("axios");

class GoImageService {
  constructor(overrideUrl = null) {
    this.baseUrl =
      overrideUrl ||
      process.env.GO_IMAGE_SERVICE_URL ||
      "http://127.0.0.1:7860"; // 💡 FIX: Oracle migration — Go service now runs locally
    
    if (!global.goServiceInitialized) {
      global.goServiceInitialized = true;
      console.log(`📡 [GoService] Using Base URL: ${this.baseUrl}`);
      // Startup health check — confirms Go service is reachable on boot
      this.healthCheck()
        .then((h) => console.log("[GoService] Health:", JSON.stringify(h)))
        .catch((e) => console.error("[GoService] Health FAIL:", e.message));
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000, // 120s timeout for browser ops
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // Queue for sequential processing
    this.heavyOpQueue = Promise.resolve();
  }

  /*
   * Helper to queue heavy operations sequentially
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
          }
        })
        .catch((err) => {
          // Propagate rejection AND keep the chain alive for next ops
          reject(err);
        });
    });
  }

  async healthCheck() {
    try {
      const res = await this.client.get("/health");
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
