const axios = require('axios');
const botConfig = require('../../../botConfig');

/**
 * Modular Groq client for structured extraction.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class GroqClient {
    constructor() {
        this.apiKey = process.env.GROQ_API_KEY;
        this.model = process.env.GROQ_MODEL || 'mixtral-8x7b-32768';
        this.baseUrl = 'https://api.groq.com/openai/v1';
        
        console.log(`🔌 Groq Client initialized (Model: ${this.model})`);
    }

    /**
     * Call Groq with JSON mode enabled
     */
    async extract(prompt) {
        if (!this.apiKey) {
            console.error("❌ Groq API Key missing!");
            return null;
        }

        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
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
                        'Authorization': `Bearer ${this.apiKey}`,
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
                console.error(`⚠️ Groq Attempt ${attempts} failed: ${err.message}`);
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