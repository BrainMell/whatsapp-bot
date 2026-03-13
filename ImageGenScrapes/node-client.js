const axios = require('axios');

class GoImageService {
    constructor(serviceUrl) {
        this.baseUrl = serviceUrl || process.env.GO_IMAGE_SERVICE_URL || 'http://localhost:8080';
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

    /**
     * Generate Combat Image
     * @param {Object} data - { players: [], enemies: [], combatType: 'PVE', background: 'forest.png' }
     * @returns {Buffer} - PNG Image Buffer
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

    /**
     * Search Pinterest
     * @param {string} query 
     * @param {number} maxResults 
     */
    async searchPinterest(query, maxResults = 10) {
        try {
            const response = await this.client.get('/api/scrape/pinterest', {
                params: { query, maxResults }
            });
            return response.data;
        } catch (error) {
            console.error('GoService Pinterest Error:', error.message);
            return { images: [] };
        }
    }

    /**
     * VS Battles Search
     * @param {string} characterName 
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

    /**
     * VS Battles Detail
     * @param {string} url 
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
