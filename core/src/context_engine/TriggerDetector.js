/**
 * Detects conversation triggers for personal information extraction.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class TriggerDetector {
    constructor() {
        this.confidenceThreshold = 0.6; // Minimum confidence to trigger extraction

        this.triggerTypes = {
            PREFERENCE_STRONG: 'preference_strong',
            PREFERENCE_WEAK: 'preference_weak',
            EXPERIENCE: 'experience',
            OPINION: 'opinion',
            RECOMMENDATION: 'recommendation',
            IDENTITY: 'identity'
        };

        this.patterns = [
            {
                type: this.triggerTypes.PREFERENCE_STRONG,
                baseConfidence: 0.9,
                regex: [
                    /\b[iI]\s+(love|hate|adore|despise|can'?t\s+stand)\s+/,
                    /\b[mM]y\s+favorite\s+/,
                    /\b[iI]'?m\s+(obsessed\s+with|crazy\s+about)\s+/,
                    /\b[iI]\s+absolutely\s+(love|hate)\s+/
                ]
            },
            {
                type: this.triggerTypes.PREFERENCE_WEAK,
                baseConfidence: 0.7,
                regex: [
                    /\b[iI]\s+(like|dislike|enjoy|prefer)\s+/,
                    /\bnot\s+a\s+fan\s+of\s+/,
                    /\bkind\s+of\s+like\s+/,
                    /\b[iI]\s+don'?t\s+really\s+like\s+/
                ]
            },
            {
                type: this.triggerTypes.EXPERIENCE,
                baseConfidence: 0.8,
                regex: [
                    /\b[iI]\s+(tried|went\s+to|visited|watched|played|read|listened\s+to)\s+/,
                    /\b[iI]'?ve\s+(been\s+to|seen|done|experienced)\s+/,
                    /\b[jJ]ust\s+(watched|tried|finished|completed)\s+/,
                    /\b[lL]ast\s+(week|month|year)\s+[iI]\s+/
                ]
            },
            {
                type: this.triggerTypes.OPINION,
                baseConfidence: 0.6,
                regex: [
                    /\b[iI]\s+think\s+/,
                    /\bin\s+my\s+opinion\s+/,
                    /\b[iI]\s+believe\s+/,
                    /\b[iI]\s+feel\s+like\s+/,
                    /\b[iI]f\s+you\s+ask\s+me\s+/
                ]
            },
            {
                type: this.triggerTypes.RECOMMENDATION,
                baseConfidence: 0.75,
                regex: [
                    /\byou\s+should\s+(try|check\s+out|watch|read|visit)\s+/,
                    /\b[iI]\s+(highly\s+)?recommend\s+/,
                    /\byou\s+(gotta|have\s+to|need\s+to)\s+(try|see|watch)\s+/,
                    /\bcheck\s+out\s+/
                ]
            },
            {
                type: this.triggerTypes.IDENTITY,
                baseConfidence: 0.85,
                regex: [
                    /\b[iI]'?m\s+(a|an)\s+\w+\s+(person|guy|girl|fan|enthusiast)\b/,
                    /\b[iI]'?m\s+into\s+/,
                    /\b[iI]'?m\s+(really\s+)?passionate\s+about\s+/,
                    /\bas\s+a\s+\w+\s+(person|fan)\s+/
                ]
            }
        ];

        console.log(`🎯 Trigger Detector initialized (${this.patterns.length} trigger types loaded)`);
    }

    /**
     * Detect triggers in a message
     * @returns {Array} Array of { type, confidence }
     */
    detect(content) {
        const results = [];

        for (const entry of this.patterns) {
            for (const reg of entry.regex) {
                if (reg.test(content)) {
                    const confidence = this.calculateConfidence(entry.type, entry.baseConfidence, content);
                    
                    if (confidence >= this.confidenceThreshold) {
                        results.push({ type: entry.type, confidence });
                    }
                    break; // Count once per trigger type
                }
            }
        }

        return results;
    }

    /**
     * Fine-tune confidence based on message properties
     */
    calculateConfidence(type, base, content) {
        let confidence = base;

        // Length bonus (more context)
        const words = content.split(/\s+/).length;
        confidence += Math.min(0.1, words / 200);

        // Question penalty (less definitive)
        if (content.includes('?')) confidence -= 0.2;

        // Named Entity (Proper Nouns) bonus
        if (/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/.test(content)) confidence += 0.05;

        // Negation penalty
        const negations = ['not', "n't", 'never', 'neither', 'nor'];
        if (negations.some(n => content.toLowerCase().includes(n))) confidence -= 0.1;

        // Intensity modifiers (Boost)
        const intensity = ['really', 'absolutely', 'totally', 'completely', 'extremely'];
        if (intensity.some(i => content.toLowerCase().includes(i))) confidence += 0.08;

        return Math.max(0, Math.min(1, confidence));
    }

    getTriggerSummary(triggers) {
        if (!triggers || triggers.length === 0) return 'None';
        return triggers.map(t => `${t.type} (${t.confidence.toFixed(2)})`).join(', ');
    }
}

// Singleton instance
module.exports = new TriggerDetector();