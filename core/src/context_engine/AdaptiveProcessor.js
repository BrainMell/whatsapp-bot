const promptBuilder = require('./PromptBuilder');
const groqClient = require('./GroqClient');

/**
 * Handles batching and scheduling of extraction tasks.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class AdaptiveProcessor {
    constructor() {
        this.batchSize = 5; // accumulate 5 tasks
        this.timeoutSec = 30; // or every 30 seconds
        
        this.pendingBatch = [];
        this.lastProcessTime = Date.now();
        this.apiCallsToday = 0;
        this.dailyLimit = 500; // safety limit

        this.apiCallback = null; // function to call for storage
        
        console.log(`📦 Adaptive Processor initialized (Batch: ${this.batchSize}, Timeout: ${this.timeoutSec}s)`);

        // Start processing loop
        setInterval(() => this.checkBatch(), 5000); // Check every 5s
    }

    setStorageCallback(fn) {
        this.apiCallback = fn;
    }

    async enqueue(task) {
        this.pendingBatch.push(task);
        console.log(`📥 Task Enqueued (${this.pendingBatch.length}/${this.batchSize})`);

        if (this.pendingBatch.length >= this.batchSize) {
            await this.processBatch();
        }
    }

    async checkBatch() {
        if (this.pendingBatch.length === 0) return;

        const timeSince = (Date.now() - this.lastProcessTime) / 1000;
        if (timeSince >= this.timeoutSec) {
            console.log(`⏰ Batch timeout reached (${this.pendingBatch.length} tasks). Processing...`);
            await this.processBatch();
        }
    }

    async processBatch() {
        if (this.pendingBatch.length === 0) return;

        const currentBatch = [...this.pendingBatch];
        this.pendingBatch = [];
        this.lastProcessTime = Date.now();

        try {
            // 1. Merge contexts into one conversation string
            const mergedContext = this.mergeContexts(currentBatch);

            // 2. Build prompt
            const prompt = promptBuilder.buildPrompt(mergedContext, currentBatch);

            // 3. Call Groq
            const result = await groqClient.extract(prompt);

            // 4. Send to storage
            if (result && this.apiCallback) {
                await this.apiCallback(result);
            }

        } catch (err) {
            console.error("❌ Batch processing failed:", err.message);
        }
    }

    mergeContexts(tasks) {
        const uniqueMessages = new Map();
        for (const task of tasks) {
            for (const m of task.context) {
                uniqueMessages.set(m.id, m);
            }
        }

        const sorted = Array.from(uniqueMessages.values()).sort((a, b) => a.timestamp - b.timestamp);
        
        return sorted.map(m => {
            const time = m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `[${time}] ${m.username}: ${m.content}`;
        }).join('\n');
    }
}

// Singleton instance
module.exports = new AdaptiveProcessor();
