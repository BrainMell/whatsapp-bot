const axios = require('axios');

class GoImageService {
    constructor(overrideUrl = null) {
        this.baseUrl = overrideUrl || process.env.GO_IMAGE_SERVICE_URL || 'http://localhost:8080';
        console.log(`📡 [GoService] Using Base URL: ${this.baseUrl}`);
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 60000, // 60s timeout for heavy ops
            maxBodyLength: Infinity,
            maxContentLength: Infinity
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
        try {
            const response = await this.client.post('/api/combat', data, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('GoService Combat Error:', error.message);
            throw error;
        }
    }

    /*
     * Generate Combat End Screen
     */
    async generateCombatEndScreen(text) {
        try {
            const response = await this.client.post('/api/combat/endscreen', { text }, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('GoService Combat EndScreen Error:', error.message);
            throw error;
        }
    }

    /*
     * Render Ludo Board
     */
    async renderLudoBoard(data, pfpUrls = {}) {
        try {
            // Merge pfpUrls into players if provided
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
    }

    /*
     * Render Tic-Tac-Toe Board
     */
    async renderTicTacToeBoard(data) {
        try {
            const response = await this.client.post('/api/ttt', data, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('GoService TTT Error:', error.message);
            throw error;
        }
    }

    /*
     * Render Tic-Tac-Toe Leaderboard
     */
    async renderTicTacToeLeaderboard(scores) {
        try {
            const response = await this.client.post('/api/ttt/leaderboard', { scores }, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('GoService TTT Leaderboard Error:', error.message);
            throw error;
        }
    }

    /*
     * Generate Card Collection/Deck GIF
     */
    async generateCardGif(imageUrls, title) {
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
    }

    /*
     * Search YouTube (Go Service)
     */
    async searchYoutube(query) {
        try {
            const response = await this.client.get('/api/scrape/youtube/search', {
                params: { query }
            });
            return response.data.videos || [];
        } catch (error) {
            console.error('GoService YouTube Search Error:', error.message);
            return [];
        }
    }

    /*
     * Download YouTube Audio (Go Service)
     */
    async downloadYoutubeAudio(url) {
        try {
            const response = await this.client.get('/api/scrape/youtube/audio', {
                params: { url },
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('GoService YouTube Audio Error:', error.message);
            return null;
        }
    }

    /*
     * Search Pinterest
     */
    async searchPinterest(query, maxResults = 10) {
        try {
            const response = await this.client.get('/api/scrape/pinterest', {
                params: { query, maxResults }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Pinterest Error:', error.message);
            return { images: [], count: 0 };
        }
    }

    /*
     * Search Stickers (Klipy GIF API)
     */
    async searchStickers(query, maxResults = 10) {
        try {
            const response = await this.client.get('/api/scrape/stickers', {
                params: { query, maxResults }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Sticker Error:', error.message);
            return { stickers: [], count: 0 };
        }
    }

    /*
     * Search Rule34 (NSFW)
     * @param {string} query
     * @param {number} maxResults
     */
    async searchRule34(query, maxResults = 10) {
        try {
            const response = await this.client.get('/api/scrape/rule34', {
                params: { query, maxResults }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Rule34 Error:', error.message);
            return { images: [] };
        }
    }

    /*
     * VS Battles Search
     */
    async searchVSBattles(characterName) {
        try {
            const response = await this.client.get('/api/scrape/vsbattles/search', {
                params: { query: characterName }
            });
            return response.data;
        } catch (error) {
            console.error('GoService VSB Search Error:', error.message);
            return { characters: [] };
        }
    }

    /*
     * VS Battles Detail
     */
    async getVSBattlesDetail(url) {
        try {
            const response = await this.client.get('/api/scrape/vsbattles/detail', {
                params: { url }
            });
            return response.data;
        } catch (error) {
            console.error('GoService VSB Detail Error:', error.message);
            throw error;
        }
    }
}

module.exports = GoImageService;
