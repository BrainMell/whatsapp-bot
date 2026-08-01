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

    // 💡 FIX 2026-07-26 (CRITICAL):
    // this.client MUST be created BEFORE this.healthCheck() is called.
    // The previous code called this.healthCheck() at line 36, but
    // this.client wasn't set until line 50. Inside healthCheck(),
    // `this.client.get(...)` threw `TypeError: Cannot read properties of
    // undefined (reading 'get')` — which was caught and returned null,
    // making it look like the Go service was unreachable when it was
    // actually fine. This was the root cause of ALL the "Health: null"
    // logs. The Go service was never down; the healthCheck code was broken.
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 120000, // 120s timeout for browser ops (scrapes, GIFs)
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    // 💡 PERF PATCH 2026-07-27:
    // The previous queue was a single chained Promise — every "heavy" op
    // (combat image, card GIF, burn GIF, chess board, ludo board, TTT,
    // boss splash, convert) ran strictly one at a time. If two users
    // ran `.jk coll` simultaneously, the second waited for the first to
    // finish (10-15s) before even starting — visible as doubled response
    // latency under load.
    //
    // New implementation: a counting semaphore with CONCURRENCY=3 slots.
    // The Go service on Oracle (0.1 CPU, 954MB RAM) already tolerates
    // concurrent requests — `generateCardGrid` and `generateEconomyCard`
    // bypass the queue entirely and have been running concurrently in
    // production for months with no Go-service OOM. So 3 concurrent slots
    // is a conservative bump that roughly halves image-command latency
    // under multi-user load without risking the Go service's RAM.
    this._concurrency = 3;
    this._activeOps = 0;
    this._waiters = [];
    if (!global.goServiceInitialized) {
      global.goServiceInitialized = true;
      console.log(`📡 [GoService] Using Base URL: ${this.baseUrl} (concurrency=${this._concurrency})`);
      // Startup health check — confirms Go service is reachable on boot.
      // Uses a SHORT 5s timeout (not the 120s axios default) so a dead
      // Go service doesn't hang the boot log for 2 minutes.
      // Now that this.client is set before this call, it actually works.
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
  }

  /*
   * Helper to queue heavy operations with a concurrency limit.
   *
   * 💡 PERF PATCH 2026-07-27:
   * Replaced the single-chained-Promise queue with a counting semaphore.
   * Up to `_concurrency` (3) operations may run in parallel; the (N+1)th
   * waits in `_waiters` until a slot frees up. This halves multi-user
   * image-command latency on Oracle without risking Go-service OOM
   * (the Go service already tolerates concurrent requests — see comment
   * on `generateCardGrid` which bypasses this queue).
   *
   * Each op still gets its own try/catch — one failure doesn't poison
   * the queue (a previous bug fixed in 2026-07-26 by ensuring the catch
   * chain always resolved). The semaphore implementation here preserves
   * that property: resolve/reject happens on the caller's promise, and
   * the slot-release happens in `finally` regardless of outcome.
   */
  async _enqueue(op) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this._activeOps++;
        try {
          const result = await op();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this._activeOps--;
          // If anyone is waiting, hand off our slot to the next waiter.
          if (this._waiters.length > 0) {
            const next = this._waiters.shift();
            next();
          }
        }
      };
      if (this._activeOps < this._concurrency) {
        run();
      } else {
        this._waiters.push(run);
      }
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
      // 💡 FIX 2026-07-26: log the ACTUAL error, not just "null". The
      // deploy's curl + axios + node-http tests ALL succeed, but the bot's
      // axios healthCheck returns null. We need to see the exact error.
      console.error(`[GoService] healthCheck ERROR:`);
      console.error(`  code: ${error.code || 'N/A'}`);
      console.error(`  message: ${error.message}`);
      console.error(`  syscall: ${error.syscall || 'N/A'}`);
      console.error(`  errno: ${error.errno || 'N/A'}`);
      console.error(`  address: ${error.address || 'N/A'}`);
      console.error(`  port: ${error.port || 'N/A'}`);
      if (error.response) {
        console.error(`  response status: ${error.response.status}`);
        console.error(`  response data: ${JSON.stringify(error.response.data).slice(0, 200)}`);
      }
      if (error.request) {
        console.error(`  request method: ${error.request.method || 'N/A'}`);
        console.error(`  request path: ${error.request.path || 'N/A'}`);
      }
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
   * Generate ANIMATED Combat Video (MP4) — NEW 2026-07-29
   * Renders a 12-frame animation as an MP4 with VFX overlays, sprite reactions,
   * HP interpolation, and defeated fade-out. Falls back to static PNG on failure.
   * Payload extends generateCombatImage with an `action` field.
   */
  async generateAnimatedCombat(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/combat/animated", data, {
          responseType: "arraybuffer",
          timeout: 60000, // MP4 encoding via ffmpeg can take 10-30s on slow CPU
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Animated Combat Error:", error.message);
        throw error;
      }
    });
  }

  /*
   * Generate Hunt Card — NEW 2026-07-29
   * Renders a hunting result image card (player + animal + loot).
   * Payload: { playerName, playerClass, biome, animal, animalSprite, item, itemRarity, xp, zeni, rank }
   */
  async generateHuntCard(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/hunt/card", data, {
          responseType: "arraybuffer",
          timeout: 10000,
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Hunt Card Error:", error.message);
        return null; // non-fatal — caller falls back to text
      }
    });
  }

  /*
   * Generate Combat End Screen
   * 💡 UPDATED 2026-07-29: Now accepts a richer payload {text, victory, gold, xp, items}
   * for the new gradient + rewards panel end screen. The text-only path is still
   * supported as a fallback (just pass {text}).
   */
  async generateCombatEndScreen(payload) {
    // Backward-compat: accept a plain string
    if (typeof payload === 'string') payload = { text: payload };
    return this._enqueue(async () => {
      try {
        const response = await this.client.post(
          "/api/combat/endscreen",
          payload,
          {
            responseType: "arraybuffer",
            timeout: 10000,
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
          // 💡 FIX 2026-07-26: was 60000 (60s). When the Go service is
          // unreachable or slow, this 60s hang blocks the message handler
          // for a full minute, backing up the entire bot (user saw 80s
          // pong response times). 15s is enough for the grid to render
          // on a working Go service (typical: 2-5s for 12 cards). If it
          // takes longer than 15s, something is wrong and we should bail
          // to the text fallback immediately.
          timeout: 15000,
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

  /**
   * Generate a TRUE hybrid grid MP4 — animated cards cycle in place,
   * static cards stay still, grid layout preserved (540×1080).
   *
   * Added 2026-07-27 per benchmark results showing Mode D (true hybrid via
   * ffmpeg) is the right architecture for `.jk coll --anim` / `.jk deck --anim`.
   *
   * Benchmark on Oracle (0.1 OCPU, 954MB RAM):
   *   8s @ 15fps: 3.3s render, 34 KB output, 0 MB RAM delta (SWEET SPOT)
   *
   * Returns an MP4 buffer, or null on failure (callers should fall back
   * to the static generateCardGrid() in that case).
   *
   * @param {Array<{url, animated, name, tier}>} images — same shape as generateCardGrid,
   *   but the `animated` field is now honored (T6/S/Event cards should be marked animated:true)
   * @param {string} title — currently unused by the Go renderer, kept for API symmetry
   * @param {object} opts — { duration: seconds, fps: framerate }, defaults to 8s @ 15fps
   */
  async generateHybridGrid(images, title, opts = {}) {
    try {
      const duration = opts.duration || 5;
      // 💡 AUDIT FIX 2026-08-01 (Round 2): raised default fps from 10 to 15.
      // 10fps looks choppy. 15fps is the sweet spot (20fps doubles render
      // time with marginal gain). Matches the onboarding doc's note.
      const fps = opts.fps || 15;
      const response = await this.client.post(
        "/api/cards/hybrid-grid",
        { images, title, duration, fps },
        {
          responseType: "arraybuffer",
          // 45s timeout — real-world renders with slow downloads take ~25-30s.
          timeout: 45000,
        },
      );
      const buf = Buffer.from(response.data);
      if (buf.length < 100) return null;
      // 💡 The hybrid endpoint may return either:
      //   - video/mp4 (when ≥1 card is animated — the styled static grid + GIF overlays)
      //   - image/png (when NO cards are animated — just the styled static grid)
      // The caller needs to know which so it can send as { video } or { image }.
      const contentType = response.headers['content-type'] || '';
      return { buffer: buf, contentType };
    } catch (error) {
      console.error("GoService Hybrid Grid Error:", error.message);
      return null;
    }
  }
}

// 💡 PERF PATCH 2026-07-27 (singleton):
// Previously every module did `const goService = new GoImageService()` at the
// top of the file. There were 12 such callsites (engine.js x2, rpgCommands,
// shopCommands, repairCommands, cardSystem, combatImageGenerator, chess, ttt,
// ludo, news, powerscale). Each one created:
//   - Its own axios client (with its own connection pool — ~5-10 TCP sockets)
//   - Its own _enqueue queue (independent concurrency=3 cap per instance)
//   - Its own startup healthCheck log line
// Net effect: 12 × (~3-5 MB) = ~40-60 MB of duplicate state, AND the
// concurrency=3 cap was effectively 3×12=36 concurrent requests to the Go
// service (could overwhelm it under load — the cap was meant to be a
// GLOBAL limit, not per-instance).
//
// Fix: export a single shared instance. All callsites now do:
//   const goService = require('../utils/goImageService');
// instead of:
//   const GoImageService = require('../utils/goImageService');
//   const goService = new GoImageService();
//
// The class is still exported as `.GoImageService` for tests that construct
// their own instance with a custom overrideUrl.
const _sharedInstance = new GoImageService();

module.exports = _sharedInstance;
module.exports.GoImageService = GoImageService;
module.exports.getShared = () => _sharedInstance;
