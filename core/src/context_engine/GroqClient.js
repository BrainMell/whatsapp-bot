const axios = require('axios');
const botConfig = require('../../../botConfig');

/*
 * Modular Groq client for structured extraction.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class GroqClient {
    constructor() {
        this.keys = (process.env.GROQ_API_KEYS || "")
            .split(",")
            .map((key) => key.trim())
            .filter((key) => key !== "");
        this.currentKeyIndex = 0;
        this.model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
        this.baseUrl = 'https://api.groq.com/openai/v1';
        
        console.log(`🔌 Groq Client initialized (Model: ${this.model}, hasKeys: ${this.keys.length > 0})`);
    }

    getApiKey() {
        if (process.env.GROQ_API_KEY) {
            return process.env.GROQ_API_KEY;
        }
        if (this.keys.length === 0) {
            return '';
        }
        return this.keys[this.currentKeyIndex];
    }

    rotateKey() {
        if (this.keys.length > 1) {
            this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
            console.log(`🔄 Groq Client rotated key to #${this.currentKeyIndex + 1}/${this.keys.length}`);
        }
    }

    /*
     * Call Groq with JSON mode enabled
     */
    async extract(prompt) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            const currentKey = this.getApiKey();
            if (!currentKey) {
                console.error("❌ Groq API Key missing!");
                return null;
            }

            try {
                const response = await axios.post(`${this.baseUrl}/chat/completions`, {
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a precise data extraction assistant. Respond ONLY with valid JSON. No markdown. No explanations.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.1,
                    response_format: { type: 'json_object' }
                }, {
                    headers: {
                        'Authorization': `Bearer ${currentKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                });

                const content = response.data.choices[0].message.content;
                const usage = response.data.usage || {};
                
                console.log(`✅ Groq Extraction Success (Tokens: ${usage.total_tokens || 0})`);
                return JSON.parse(content);

            } catch (err) {
                attempts++;
                console.error(`⚠️ Groq Attempt ${attempts} failed on key #${this.currentKeyIndex + 1}: ${err.message}`);
                
                // Rotate key for the next attempt
                this.rotateKey();
                
                if (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 2000 * attempts)); // Backoff
                } else {
                    return null;
                }
            }
        }
    }
}

// Singleton instance
module.exports = new GroqClient();