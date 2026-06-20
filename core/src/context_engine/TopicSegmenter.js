/*
 * Segments conversation into topic-based chunks.
 * Ported from WhatsApp Context Bot Guide (JS Implementation)
 */
class TopicSegmenter {
    constructor() {
        this.silenceThreshold = 300; // 5 minutes in seconds
        this.topicShiftMarkers = [
            'anyway', 'btw', 'by the way', 'changing topic',
            'speaking of', 'oh yeah', 'also', 'another thing',
            'wait', 'oh', 'hey', 'so'
        ];
        console.log(`🧵 Topic Segmenter initialized (Silence threshold: ${this.silenceThreshold}s)`);
    }

    /*
     * Splits a list of messages into segments based on time and content
     */
    segmentConversation(messages) {
        if (messages.length === 0) return [];

        const segments = [];
        let currentSegment = [messages[0]];

        for (let i = 1; i < messages.length; i++) {
            const current = messages[i];
            const prev = messages[i - 1];

            // 1. Check time gap
            const timeGap = (current.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
            const isSilenceGap = timeGap > this.silenceThreshold;

            // 2. Check topic markers
            const contentLower = current.content.toLowerCase();
            const isTopicShift = this.topicShiftMarkers.some(marker => contentLower.includes(marker));

            // 3. New speaker after long message (Heuristic)
            const isLongMsgTransition = (current.userId !== prev.userId && prev.content.length > 200);

            // 4. Thread detection (Replies)
            // If it's a reply to something NOT in the current segment, it's a new thread
            let isNewThread = false;
            if (current.replyTo) {
                const foundInSegment = currentSegment.some(m => m.id === current.replyTo);
                if (!foundInSegment) isNewThread = true;
            }

            if (isSilenceGap || isTopicShift || isLongMsgTransition || isNewThread) {
                segments.push(currentSegment);
                currentSegment = [current];
            } else {
                currentSegment.push(current);
            }
        }

        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }

        return segments;
    }

    /*
     * Find the specific segment that contains our target message
     */
    findRelevantSegment(targetId, segments) {
        for (const segment of segments) {
            if (segment.some(m => m.id === targetId)) {
                return segment;
            }
        }
        return [];
    }
}

// Singleton instance
module.exports = new TopicSegmenter();