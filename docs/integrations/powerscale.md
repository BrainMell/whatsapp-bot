# Integrations Subsystem: Power Scaling & Stats Lookup

## What it is
The Power Scaling & Stats Lookup Subsystem integrates external fandom-based powerscaling metadata (specifically from the VS Battles Wiki) into the bot. It uses a Go-based helper service (`GoImageService`) to execute search and page-scraping requests, shielding the node runtime from high-memory scraping tasks. The system features a two-step conversational search flow: when a user queries a character name via commands (like `.ps` or `.powerscale`), the bot fetches search matches, presents a numbered list, and holds a temporary, chat-scoped state inside a `pendingSelections` Map. If the user replies with a matching list number within the timeout window, the bot scrapes the character profile page, parses their statistics (such as Tier, Attack Potency, and Speed), and formats a detailed summary message.

## How it works

**Powerscaling Search & Pending Selection** — [powerscale.js L18-L57](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L18-L57)
```javascript
async function getPowerScale(characterName, chatId) {
    try {
        console.log(`[Powerscale] Searching for: ${characterName}`);

        const data = await goService.searchPowerscale(characterName);
        console.log(`[Powerscale] Search response:`, JSON.stringify(data));

        if (!data || !data.characters || data.characters.length === 0) {
            return { success: false, error: `No results found for "${characterName}"` };
        }

        // Build character list message
        let message = `🔍 *Found ${data.characters.length} result(s) for "${characterName}":*\n\n`;
        data.characters.forEach(char => {
            message += `*${char.id}.* ${char.name}\n`;
        });
        message += `\n_Reply with a number (1-${data.characters.length}) within 5 minutes to get their powerscale._`;

        // Store pending selection for this chat
        pendingSelections.set(chatId, {
            characters: data.characters,
            timestamp: Date.now()
        });

        // Auto-cleanup after 5 minutes
        setTimeout(() => {
            pendingSelections.delete(chatId);
        }, SELECTION_TIMEOUT_MS);

        return {
            success: true,
            message,
            isPending: true
        };

    } catch (error) {
        console.error('[Powerscale] Search failed:', error.message);
        return { success: false, error: error.message };
    }
}
```
This function receives a user’s character query and requests search results from the Go Image Service. If matches are found, it generates a reply list, inserts the results into the `pendingSelections` Map under the current `chatId`, and schedules an automatic timeout callback to delete the pending data and free memory.

---

**Selection Handler & Page Scraper** — [powerscale.js L65-L135](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L65-L135)
```javascript
async function handlePowerscaleSelection(chatId, selection) {
    const pending = pendingSelections.get(chatId);
    if (!pending) return null; // no pending selection for this chat

    // Check timeout
    if (Date.now() - pending.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return { success: false, error: 'Selection timed out. Search again!' };
    }

    const idx = parseInt(selection, 10);
    if (isNaN(idx) || idx < 1 || idx > pending.characters.length) {
        return {
            success: false,
            error: `Invalid selection. Pick a number between 1 and ${pending.characters.length}.`
        };
    }

    const chosen = pending.characters[idx - 1];
    pendingSelections.delete(chatId); // clear pending

    console.log(`[Powerscale] User selected: ${chosen.name} (${chosen.url})`);

    try {
        const data = await goService.fetchPowerscalePage(chosen.url);
        console.log(`[Powerscale] Fetch response:`, JSON.stringify(data));

        if (!data || data.error) {
            return { success: false, error: data?.error || 'Failed to fetch character data' };
        }

        const stats = data.stats || {};
        let message = `[ POWER SCALING: ${data.name.toUpperCase()} ]\n\n`;

        if (data.summary && data.summary.length > 0) {
            message += `[ Summary ]\n${data.summary}\n\n`;
        }

        message += `[ POWER STATS ]\n`;
        message += `━━━━━━━━━━━━━━━━━━\n`;

        if (stats['Tier']) {
            message += `TIER: ${stats['Tier']}\n`;
            message += `━━━━━━━━━━━━━━━━━━\n`;
        }
        if (stats['Attack Potency']) message += `Attack Potency: ${stats['Attack Potency']}\n\n`;
        if (stats['Speed'])          message += `Speed: ${stats['Speed']}\n\n`;
        if (stats['Durability'])     message += `Durability: ${stats['Durability']}\n\n`;
        if (stats['Stamina'])        message += `Stamina: ${stats['Stamina']}\n\n`;
        if (stats['Range'])          message += `Range: ${stats['Range']}\n\n`;
        if (stats['Striking Strength']) message += `Striking Strength: ${stats['Striking Strength']}\n\n`;
        if (stats['Lifting Strength'])  message += `Lifting Strength: ${stats['Lifting Strength']}\n\n`;
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `Source: ${data.pageUrl}`;

        return {
            success: true,
            message,
            imageUrl: data.imageUrl,
            characterName: data.name,
            pageUrl: data.pageUrl
        };

    } catch (error) {
        console.error('[Powerscale] Fetch failed:', error.message);
        return { success: false, error: error.message };
    }
}
```
This handler executes when a user replies with a selection index. It verifies the selection matches a pending search entry, clears the entry, and commands the Go Service to parse the chosen character's profile URL. It then formats the return values—such as character descriptions, tiers, offensive stats, standard equipment, and source URLs—to be sent to the group chat.

---

**Selection Presence Checker** — [powerscale.js L140-L148](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L140-L148)
```javascript
function hasPendingSelection(chatId) {
    const pending = pendingSelections.get(chatId);
    if (!pending) return false;
    if (Date.now() - pending.timestamp > SELECTION_TIMEOUT_MS) {
        pendingSelections.delete(chatId);
        return false;
    }
    return true;
}
```
This utility checks if a chat is currently waiting for a powerscaling index selection. If a pending selection exists but its age exceeds the timeout interval, the selection is removed from memory and the checker returns `false`.

## How to modify it
To adjust selection expiration times or custom character stats formatting, developers can make modifications to `powerscale.js`.

```javascript
// BEFORE (powerscale.js L10)
const SELECTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
```
```javascript
// AFTER (powerscale.js L10)
const SELECTION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes timeout
```

```javascript
// BEFORE (powerscale.js L117-L119)
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;
```
```javascript
// AFTER (powerscale.js L117-L119)
        if (stats['Intelligence'])   message += `Intelligence: ${stats['Intelligence']}\n\n`;
        if (stats['Weaknesses'])     message += `Weaknesses: ${stats['Weaknesses']}\n\n`; // Added Weaknesses stat
        if (stats['Standard Equipment']) message += `Equipment: ${stats['Standard Equipment']}\n\n`;
```

## Common tasks
- **Change the selection timeout** — Adjust the expiration time for character choice selection in [powerscale.js L10](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L10).
- **Check pending search selections** — Read the active state verification function for pending lookups in [powerscale.js L140](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L140).
- **Modify formatting of power scaling stats** — Add or customize statistics displayed in the chat message response in [powerscale.js L106-L121](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L106-L121).
- **Inspect Go Service integration** — Examine search powerscale API calls inside [powerscale.js L22](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/utils/powerscale.js#L22).
