const economy = require('./economy');

function getRelationshipsMap(user) {
    if (!user.profile) {
        user.profile = {};
    }
    if (!user.profile.relationships) {
        user.profile.relationships = {};
    }
    return user.profile.relationships;
}

function getScore(relationships, targetJid) {
    const escapedJid = targetJid.replace(/\./g, '_');
    if (typeof relationships.get === 'function') {
        return relationships.get(escapedJid) || relationships.get(targetJid) || 0;
    }
    return relationships[escapedJid] || relationships[targetJid] || 0;
}

function setScore(relationships, targetJid, score) {
    const escapedJid = targetJid.replace(/\./g, '_');
    if (typeof relationships.set === 'function') {
        relationships.set(escapedJid, score);
    } else {
        relationships[escapedJid] = score;
    }
}

/**
 * Safely changes relationship points between two users (represented by JIDs)
 */
function incrementRelationship(user1Jid, user2Jid, delta) {
    if (user1Jid === user2Jid) return; // Can't have relationships with yourself

    const user1 = economy.getUser(user1Jid) || (economy.economyData && economy.economyData.get(user1Jid));
    const user2 = economy.getUser(user2Jid) || (economy.economyData && economy.economyData.get(user2Jid));
    if (!user1 || !user2) return;

    // Load relationships for user1 -> user2
    const rels1 = getRelationshipsMap(user1);
    const score1 = getScore(rels1, user2Jid);
    const newScore1 = Math.max(-100, Math.min(100, score1 + delta));
    setScore(rels1, user2Jid, newScore1);

    // Relationships are reciprocal! user2 -> user1
    const rels2 = getRelationshipsMap(user2);
    const score2 = getScore(rels2, user1Jid);
    const newScore2 = Math.max(-100, Math.min(100, score2 + delta));
    setScore(rels2, user1Jid, newScore2);

    // Schedule saves to database
    economy.scheduleSave(user1Jid);
    economy.scheduleSave(user2Jid);
    
    console.log(`📈 [SocialGraph] Updated relations between ${user1Jid} & ${user2Jid}: ${newScore1} (${delta > 0 ? '+' : ''}${delta})`);
}

/**
 * Returns relationship scores for active participants to be injected into systemPrompt
 */
function getRelationshipsText(activeJids, senderJid) {
    if (!activeJids || activeJids.length === 0) return "";

    let relationshipLines = [];
    const sender = economy.getUser(senderJid) || (economy.economyData && economy.economyData.get(senderJid));
    if (!sender) return "";

    const rels = getRelationshipsMap(sender);

    for (const jid of activeJids) {
        if (jid === senderJid) continue;
        
        const otherUser = economy.getUser(jid) || (economy.economyData && economy.economyData.get(jid));
        if (!otherUser) continue;

        const score = getScore(rels, jid);
        if (score === 0) continue; // Skip neutral relations to save tokens

        const otherName = otherUser.nickname || economy.getDisplayName(jid);
        
        // Convert relationship score into a descriptive relationship label
        let relationshipLabel = "Neutral Acquaintance";
        if (score >= 80) relationshipLabel = "Best Friend / Loyal Companion";
        else if (score >= 50) relationshipLabel = "Close Friend";
        else if (score >= 20) relationshipLabel = "Friendly Acquaintance";
        else if (score <= -80) relationshipLabel = "Sworn Enemy / Arch-Nemesis";
        else if (score <= -50) relationshipLabel = "Bitter Rival";
        else if (score <= -20) relationshipLabel = "Distrusted Associate";

        relationshipLines.push(`- ${otherName}: ${relationshipLabel} (Relationship score: ${score}/100)`);
    }

    if (relationshipLines.length === 0) return "";

    return `\n--- Your Relationships With Group Members ---\n` + relationshipLines.join("\n") + "\n";
}

module.exports = {
    incrementRelationship,
    getRelationshipsText
};
