const axios = require('axios');

class GoImageService {
    constructor(overrideUrl = null) {
        this.baseUrl = overrideUrl || process.env.GO_IMAGE_SERVICE_URL || 'https://mellow2006-mellowbotbackend.hf.space';
        console.log(`📡 [GoService] Using Base URL: ${this.baseUrl}`);
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 120000, // 120s timeout for browser ops
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });
        
        // Queue for sequential processing
        this.heavyOpQueue = Promise.resolve();
    }

    /*
     * Helper to queue heavy operations sequentially
     */
    async _enqueue(op) {
        return new Promise((resolve, reject) => {
            this.heavyOpQueue = this.heavyOpQueue.then(async () => {
                try {
                    const result = await op();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            }).catch(err => {
                // This catch ensures the NEXT operation in the chain can still run
            });
        });
    }

    async healthCheck() {
        try {
            const res = await this.client.get('/health');
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
                const response = await this.client.post('/api/combat', data, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Combat Error:', error.message);
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
                const response = await this.client.post('/api/combat/endscreen', { text }, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Combat EndScreen Error:', error.message);
                throw error;
            }
        });
    }

    /*
     * Generate Chess Board
     */
    async generateChessBoard(data) {
        return this._enqueue(async () => {
            try {
                const response = await this.client.post('/api/chess', data, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Chess Error:', error.message);
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
                    data.players = data.players.map(p => ({
                        ...p,
                        pfpUrl: p.pfpUrl || pfpUrls[p.jid] || ''
                    }));
                }
                const response = await this.client.post('/api/ludo', data, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Ludo Error:', error.message);
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
                const response = await this.client.post('/api/ttt', data, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService TTT Error:', error.message);
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
                const response = await this.client.post('/api/ttt/leaderboard', { scores }, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService TTT Leaderboard Error:', error.message);
                throw error;
            }
        });
    }

    /*
     * Generate Card Collection/Deck GIF
     */
    async generateCardGif(imageUrls, title) {
        return this._enqueue(async () => {
            try {
                const response = await this.client.post('/api/cards/gif', {
                    images: imageUrls,
                    title: title
                }, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Card GIF Error:', error.message);
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
                const response = await this.client.post('/api/cards/burn', {
                    imageUrl: imageUrl
                }, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Card Burn Error:', error.message);
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
                const response = await this.client.post('/api/cards/convert', {
                    imageUrl: imageUrl
                }, {
                    responseType: 'arraybuffer'
                });
                return Buffer.from(response.data);
            } catch (error) {
                console.error('GoService Card Convert Error:', error.message);
                return null;
            }
        });
    }

    /*
     * Browser-Based Pinterest Search (Go Service)
     */
    async searchPinterest(query, count = 10) {
        try {
            const response = await this.client.get('/api/scrape/pinterest', {
                params: { query, count }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Pinterest Error:', error.message);
            return { images: [], count: 0 };
        }
    }

    /*
     * Deep Rule34 Scrape (Go Service)
     */
    async searchRule34(query, count = 10) {
        try {
            const response = await this.client.get('/api/scrape/rule34', {
                params: { query, count }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Rule34 Error:', error.message);
            return { images: [], count: 0 };
        }
    }

    /*
     * Powerscale Search (Go Service - Browser Based)
     */
    async getPowerscale(query) {
        try {
            const response = await this.client.get('/api/scrape/powerscale', {
                params: { query }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Powerscale Error:', error.message);
            return null;
        }
    }

    /*
     * PornPics Scrape (Go Service - Browser Based)
     */
    async searchPornPics(query, count = 10) {
        try {
            const response = await this.client.get('/api/scrape/pornpics', {
                params: { query, count }
            });
            return response.data;
        } catch (error) {
            console.error('GoService PornPics Error:', error.message);
            return { images: [], count: 0 };
        }
    }

    /*
     * YouTube Audio Info & direct URL (Go Service)
     */
    async getAudioInfo(query) {
        try {
            const response = await this.client.get('/api/scrape/audio', {
                params: { query }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Audio Info Error:', error.message);
            return null;
        }
    }

    /*
     * Anikai Best Match Watch Link (Go Service)
     */
    async getAnikaiLink(title) {
        try {
            const response = await this.client.get('/api/scrape/anikai', {
                params: { title }
            });
            return response.data.watchLink;
        } catch (error) {
            console.error('GoService Anikai Error:', error.message);
            return null;
        }
    }

    /*
     * Anime Corner News (Go Service)
     */
    async getAnimeNews() {
        try {
            const response = await this.client.get('/api/scrape/news');
            return response.data.articles || [];
        } catch (error) {
            console.error('GoService AnimeNews Error:', error.message);
            return [];
        }
    }

    /*
     * Search Stickers (Klipy)
     */
    async searchStickers(query, count = 10) {
        try {
            const response = await this.client.get('/api/scrape/stickers', {
                params: { query, count }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Sticker Error:', error.message);
            return { stickers: [], count: 0 };
        }
    }
}

module.exports = GoImageService;
