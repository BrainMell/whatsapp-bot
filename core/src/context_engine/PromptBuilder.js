/**
 * Builds optimized prompts for personal info extraction.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class PromptBuilder {
    constructor() {
        this.systemInstructions = `You are analyzing a WhatsApp group chat conversation to extract personal preferences, interests, and characteristics about specific users.

Your task is to extract ONLY information that is EXPLICITLY stated in the conversation. Do not infer or assume.

Extract the following for each relevant user:
1. **Preferences**: Things they explicitly like/love or dislike/hate
2. **Experiences**: Activities they've done, places visited, content consumed
3. **Interests**: Topics, hobbies, or domains they're passionate about
4. **Other Facts**: Identity markers (how they describe themselves), recommendations they give, or specific facts.

For each extraction:
- Include exact message timestamp and username
- Rate your confidence (0-1)
- Mark if sarcastic, joking, or hypothetical
- Consider full context - don't extract fragments
- Note if responding to someone else`;

        this.responseFormat = `{ 
  "users": [ 
    {
      "userId": "user_jid",
      "username": "PushName",
      "preferences": [
        {
          "category": "like",
          "subject": "pizza",
          "intensity": 8,
          "confidence": 0.9,
          "evidence": "I love pizza!",
          "timestamp": "2024-02-01T12:00:00",
          "isSarcastic": false,
          "isHypothetical": false
        }
      ],
      "experiences": [],
      "interests": [],
      "other": []
    }
  ],
  "metadata": {
    "participants": ["PushName1", "PushName2"]
  }
}`;
    }

    /**
     * Build the batch extraction prompt
     */
    buildPrompt(conversationStr, tasks) {
        // Detailed trigger list for the AI to focus on
        const targetSummary = tasks.map(t => {
            const types = t.triggerTypes.map(tr => `${tr.type} (${tr.confidence.toFixed(2)})`).join(', ');
            return `- ${t.message.username} (${t.message.userId}) at ${t.message.timestamp.toLocaleTimeString()}: ${types}\n  "${t.message.content}"`;
        }).join('\n');

        return `${this.systemInstructions}\n\nCONVERSATION:\n${conversationStr}\n\nEXTRACTION TARGETS (Focus on these, but look for info on ANY participant):\n${targetSummary}\n\nCRITICAL RULES:\n1. Only extract EXPLICIT information.\n2. Return ONLY valid JSON.\n3. Use REAL JIDs (e.g. 1234@s.whatsapp.net) for 'userId' if available in the conversation context.\n4. Mark sarcasm/hypotheticals clearly.\n\nReturn format:\n${this.responseFormat}`;
    }
}

// Singleton instance
module.exports = new PromptBuilder();
