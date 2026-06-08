# External Integrations: APIs & Context Engines

## What it is
The External Integrations Subsystem connects the bot with external services, microservices, and AI APIs. It manages communications with:
1. The **Groq API** (`GroqClient`), which processes natural language prompts and extracts structured JSON objects using key rotation and exponential backoff retry algorithms.
2. The **Go Image Service** (`GoImageService`), which renders visual combat frames, profile cards, and queries the Klipy database. It uses a custom sequential execution queue to manage concurrent API requests safely.
3. The **Anime News Service** (`news.js`), which crawls external sites using the Go service and maintains a deduplication log of published article links using Mongoose storage.

## How it works

**Groq API Client with Key Rotation** — [GroqClient.js L41-L95](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/GroqClient.js#L41-L95)
```javascript
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
```
This method handles structured query extraction using the Groq API. It targets a JSON completions endpoint with temperature constraints, handles token statistics logging, rotates authorization keys on failures, and retries queries using an exponential delay backoff loop.

---

**Go Service Image Generation** — [goImageService.js L63-L76](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/goImageService.js#L63-L76)
```javascript
  async generateCombatImage(data) {
    return this._enqueue(async () => {
      try {
        const response = await this.client.post("/api/combat", data, {
          responseType: "arraybuffer",
          timeout: 5000, // 5s timeout for fast fallback
        });
        return Buffer.from(response.data);
      } catch (error) {
        console.error("GoService Combat Error:", error.message);
        throw error;
      }
    });
  }
```
This method makes a POST request to the `/api/combat` endpoint of the Go microservice, passing player stats JSON data. It executes inside a custom enqueue wrapper to ensure only one heavy rendering request is sent to the backend service at a time, handling image assets as binary ArrayBuffers.

---

**News Fetching** — [news.js L24-L33](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/news.js#L24-L33)
```javascript
async function getLatestNews() {
    try {
        const articles = await goService.getAnimeNews();
        console.log(`DEBUG: Scraped ${articles.length} news items from Go Service.`);
        return articles;
    } catch (err) {
        console.error("❌ Failed to fetch anime news from Go Service:", err.message);
        return [];
    }
}
```
This function calls the Go Service proxy to retrieve a scraped feed of anime news articles. It returns a structured array of articles containing titles, urls, and timestamps, which is then processed by caller routines to filter out already-posted content.

## How to modify it
To configure API request options or connection delays, developers can change key parameter settings in the respective source files.

```javascript
// BEFORE (GroqClient.js L72)
                    timeout: 30000
```
```javascript
// AFTER (GroqClient.js L72)
                    timeout: 15000 // Lowered timeout to 15 seconds to fail faster
```

```javascript
// BEFORE (goImageService.js L68)
          timeout: 5000, // 5s timeout for fast fallback
```
```javascript
// AFTER (goImageService.js L68)
          timeout: 8000, // Increased timeout to 8 seconds to allow for network lag
```

## Common tasks
- **Change Groq extraction timeout** — Adjust the max response wait time for Groq completions in [GroqClient.js L72](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/GroqClient.js#L72).
- **Change Go Service combat render timeout** — Customize the API request timeout for rendering combat cards in [goImageService.js L68](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/goImageService.js#L68).
- **Configure Groq model key rotation limit** — Update the maximum retry attempts when rotating keys in [GroqClient.js L43](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/src/context_engine/GroqClient.js#L43).
- **Adjust news history cache limit** — Set how many article link hashes are saved in the system database to prevent duplicates in [news.js L16-L19](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/news.js#L16-L19).
