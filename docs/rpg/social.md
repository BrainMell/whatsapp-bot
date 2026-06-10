# RPG Subsystem: Social Graphs & Reciprocal Relationships

## What it is
The Social subsystem manages the relationship graph between group chat members. Relationships are reciprocal and tracked on a numeric scale between `-100` (Sworn Enemy) and `100` (Best Friend). When interactions occur in group chats, the bot updates relationship points between participants in their local user economy profiles. These scores are stored nested within MongoDB user documents under `profile.relationships`. During AI prompt generation, the system reads relationship scores of active users and converts them into text categories (e.g. Sworn Enemy, Close Friend). These descriptions are injected into the chatbot's system prompt so the bot's language model behaves context-sensitively depending on how the debaters or users feel about each other.

## How it works

**Safe Affection Score Updates** — [socialSystem.js L33-L57](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L33-L57)
```javascript
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
```
This function updates the relationship score symmetrically between two players. It loads the profile caches for both participants, updates the relationship maps using setScore/getScore within a clamped bounds of `-100` and `100`, and schedules DB write-backs using the economy cache.

---

**Relationship Text Generator** — [socialSystem.js L62-L97](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L62-L97)
```javascript
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

        const otherName = otherUser.nickname || jid.split('@')[0];
        
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
```
This function maps a user's active contacts to text descriptors. It filters JIDs, checks their numeric score from the user's relationship dictionary, labels the relationship (e.g. Sworn Enemy, Close Friend), and outputs a formatted string block injected into the AI's prompt engine.

---

**Safe Relationship Map getter** — [socialSystem.js L3-L11](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L3-L11)
```javascript
function getRelationshipsMap(user) {
    if (!user.profile) {
        user.profile = {};
    }
    if (!user.profile.relationships) {
        user.profile.relationships = {};
    }
    return user.profile.relationships;
}
```
This utility function safely accesses and initializes the nested profile and relationship dictionaries inside a user's database object. It guarantees that any lookup or update operation will have a valid destination map to read or write without causing null reference exceptions.

---

## How to modify it

### Modify Scoring Boundaries
To change relationship point limits (e.g., expanding boundaries to allow wider fluctuations), modify the clamp range in `core/rpg/socialSystem.js`.

```javascript
// Before (core/rpg/socialSystem.js L43-44)
    const score1 = getScore(rels1, user2Jid);
    const newScore1 = Math.max(-100, Math.min(100, score1 + delta));
```

```javascript
// After (core/rpg/socialSystem.js L43-44)
    const score1 = getScore(rels1, user2Jid);
    const newScore1 = Math.max(-200, Math.min(200, score1 + delta)); // Expanded boundary bounds to 200/-200
```

### Add New Relationship Tiers
To introduce new descriptive categories for relationships based on point levels, update the conditional checks in `core/rpg/socialSystem.js`.

```javascript
// Before (core/rpg/socialSystem.js L84-86)
        if (score >= 80) relationshipLabel = "Best Friend / Loyal Companion";
        else if (score >= 50) relationshipLabel = "Close Friend";
        else if (score >= 20) relationshipLabel = "Friendly Acquaintance";
```

```javascript
// After (core/rpg/socialSystem.js L84-86)
        if (score >= 95) relationshipLabel = "Soulmate / Destiny Partner"; // Added custom soulmate tier
        else if (score >= 80) relationshipLabel = "Best Friend / Loyal Companion";
        else if (score >= 50) relationshipLabel = "Close Friend";
        else if (score >= 20) relationshipLabel = "Friendly Acquaintance";
```

## Common tasks
- **Change score bounds** — Modify the upper/lower bounds of clamped relationship scores in [socialSystem.js L43](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L43) and [socialSystem.js L49](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L49).
- **Add relationship labels** — Add new conditional blocks to customize the text descriptions of relationships based on score values in [socialSystem.js L83-90](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L83-L90).
- **Modify dot character escaping** — Customize JID dot escaping to prevent key failures in MongoDB nesting in [socialSystem.js L14](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L14) and [socialSystem.js L22](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L22).
- **Initialize empty maps** — Adjust how empty profiles and relationship attributes are initialized in [socialSystem.js L3-11](https://github.com/BrainMell/whatsapp-bot/blob/main/core/rpg/socialSystem.js#L3-L11).
