const fs = require('fs');
const path = require('path');
const LidMapping = require('../models/LidMapping');
let _economy = null; // lazy singleton — avoids circular dep on startup
function getEconomy() { return _economy || (_economy = require('../rpg/economy')); }

// In-memory caches for bi-directional mapping
const lidCache = new Map();
const phoneCache = new Map();
const watchedPaths = new Set();

// Load all mappings from MongoDB and scan local auth files for any unsaved ones
async function loadLidMappings() {
    try {
        console.log(`📥 [LID Resolver] Loading LID mappings from MongoDB...`);
        // 1. Load from MongoDB
        const mappings = await LidMapping.find({}).lean();
        for (const m of mappings) {
            lidCache.set(m.lid, m.phone);
            phoneCache.set(m.phone, m.lid);
        }
        console.log(`✅ [LID Resolver] Loaded ${mappings.length} LID mappings from MongoDB`);

        // 2. Scan local files for any missing mappings to sync to MongoDB
        const instancesDir = path.join(__dirname, "..", "..", "instances");
        if (fs.existsSync(instancesDir)) {
            const folders = fs.readdirSync(instancesDir).filter(f => 
                fs.statSync(path.join(instancesDir, f)).isDirectory()
            );
            let syncedCount = 0;
            for (const folder of folders) {
                const authDir = path.join(instancesDir, folder, "auth");
                if (fs.existsSync(authDir)) {
                    // A. Read reverse mapping files: lid-mapping-<LID>_reverse.json (contains phone)
                    const reverseFiles = fs.readdirSync(authDir).filter(file => 
                        file.startsWith("lid-mapping-") && file.endsWith("_reverse.json")
                    );
                    for (const file of reverseFiles) {
                        const lid = file.replace("lid-mapping-", "").replace("_reverse.json", "");
                        if (!lidCache.has(lid)) {
                            try {
                                const filePath = path.join(authDir, file);
                                const phone = JSON.parse(fs.readFileSync(filePath, "utf8"));
                                if (phone) {
                                    await saveLidMapping(lid, phone);
                                    syncedCount++;
                                }
                            } catch (err) {}
                        }
                    }

                    // B. Read forward mapping files: lid-mapping-<phone>.json (contains lid)
                    const forwardFiles = fs.readdirSync(authDir).filter(file => 
                        file.startsWith("lid-mapping-") && !file.endsWith("_reverse.json") && file.endsWith(".json")
                    );
                    for (const file of forwardFiles) {
                        const phone = file.replace("lid-mapping-", "").replace(".json", "");
                        if (!phoneCache.has(phone)) {
                            try {
                                const filePath = path.join(authDir, file);
                                const lid = JSON.parse(fs.readFileSync(filePath, "utf8"));
                                if (lid) {
                                    await saveLidMapping(lid, phone);
                                    syncedCount++;
                                }
                            } catch (err) {}
                        }
                    }
                }
            }
            if (syncedCount > 0) {
                console.log(`🔄 [LID Resolver] Synced ${syncedCount} new local LID mappings to MongoDB`);
            }
        }
    } catch (e) {
        console.error("❌ [LID Resolver] Error loading LID mappings:", e.message);
    }
}

// Save mapping to MongoDB and update local caches
async function saveLidMapping(lid, phone) {
    if (!lid || !phone) return;
    lidCache.set(lid, phone);
    phoneCache.set(phone, lid);
    try {
        await LidMapping.findOneAndUpdate(
            { lid: lid },
            { $set: { phone: phone } },
            { upsert: true }
        );
    } catch (e) {
        console.error(`❌ [LID Resolver] Error saving LID mapping to MongoDB for ${lid}:`, e.message);
    }
}

// Synchronous watcher & async scanner for new auth paths (fully non-blocking)
function watchAuthPath(authPath) {
    if (!authPath || watchedPaths.has(authPath)) return;
    watchedPaths.add(authPath);

    console.log(`📡 [LID Resolver] Initializing async watcher for auth path: ${authPath}`);

    const scanDir = async () => {
        try {
            if (!fs.existsSync(authPath)) return;
            const files = await fs.promises.readdir(authPath);

            // Process reverse files
            const reverseFiles = files.filter(file => 
                file.startsWith("lid-mapping-") && file.endsWith("_reverse.json")
            );
            for (const file of reverseFiles) {
                const lid = file.replace("lid-mapping-", "").replace("_reverse.json", "");
                if (!lidCache.has(lid)) {
                    try {
                        const filePath = path.join(authPath, file);
                        const phoneData = await fs.promises.readFile(filePath, "utf8");
                        const phone = JSON.parse(phoneData);
                        if (phone) {
                            await saveLidMapping(lid, phone);
                        }
                    } catch (err) {}
                }
            }

            // Process forward files
            const forwardFiles = files.filter(file => 
                file.startsWith("lid-mapping-") && !file.endsWith("_reverse.json") && file.endsWith(".json")
            );
            for (const file of forwardFiles) {
                const phone = file.replace("lid-mapping-", "").replace(".json", "");
                if (!phoneCache.has(phone)) {
                    try {
                        const filePath = path.join(authPath, file);
                        const lidData = await fs.promises.readFile(filePath, "utf8");
                        const lid = JSON.parse(lidData);
                        if (lid) {
                            await saveLidMapping(lid, phone);
                        }
                    } catch (err) {}
                }
            }
        } catch (err) {
            // silent fail for expected minor issues (e.g. file read race conditions)
        }
    };

    // Initial async run
    scanDir();

    // Set up file system watcher
    try {
        const watcher = fs.watch(authPath, (eventType, filename) => {
            if (filename && filename.startsWith("lid-mapping-") && filename.endsWith(".json")) {
                // Read after small delay to let write finish
                setTimeout(async () => {
                    try {
                        const filePath = path.join(authPath, filename);
                        if (!fs.existsSync(filePath)) return;
                        const content = await fs.promises.readFile(filePath, "utf8");
                        const mappedVal = JSON.parse(content);
                        if (filename.endsWith("_reverse.json")) {
                            const lid = filename.replace("lid-mapping-", "").replace("_reverse.json", "");
                            if (mappedVal) {
                                await saveLidMapping(lid, mappedVal);
                            }
                        } else {
                            const phone = filename.replace("lid-mapping-", "").replace(".json", "");
                            if (mappedVal) {
                                await saveLidMapping(mappedVal, phone);
                            }
                        }
                    } catch (e) {}
                }, 150);
            }
        });

        watcher.on('error', (err) => {
            console.error(`⚠️ [LID Resolver] Watcher error on ${authPath}:`, err.message);
        });
    } catch (err) {
        console.warn(`⚠️ [LID Resolver] Watcher failed on ${authPath}, fallback polling active:`, err.message);
    }

    // Polling backup (every 45s)
    setInterval(scanDir, 45000);
}

// Periodically sync delta mappings from MongoDB in the background to sync other servers/instances
setInterval(async () => {
    try {
        const mappings = await LidMapping.find({}).lean();
        for (const m of mappings) {
            lidCache.set(m.lid, m.phone);
            phoneCache.set(m.phone, m.lid);
        }
    } catch (e) {
        // silent background error
    }
}, 5 * 60 * 1000); // every 5 minutes

function safeStringJid(jid) {
    if (!jid) return '';
    if (typeof jid === 'string') return jid;
    const extracted = jid.id || String(jid);
    if (extracted.includes("[object") || extracted === "undefined") return '';
    return extracted;
}

// Synchronous mapping lookup from caches — strictly in-memory O(1)
// FIX: Strip the ":device" suffix BEFORE cache lookup. Previously
// "1234567890:1@s.whatsapp.net" was split on "@" → "1234567890:1", which
// never matched the cache key "1234567890". Same for LID JIDs.
function getMapping(jid) {
    let lid = null;
    let phone = null;
    jid = safeStringJid(jid);
    if (!jid) return { lid, phone };

    if (jid.endsWith("@lid")) {
        lid = jid.split("@")[0];
        // Strip ":device" suffix (LID JIDs can also carry ":1" etc.)
        const colonIdx = lid.indexOf(":");
        if (colonIdx > 0) lid = lid.substring(0, colonIdx);
        if (lidCache.has(lid)) {
            phone = lidCache.get(lid);
        }
    } else if (jid.endsWith("@s.whatsapp.net")) {
        phone = jid.split("@")[0];
        // Strip ":device" suffix — this is the bug that caused rank lookups
        // to miss when WhatsApp sent participant IDs like "1234567890:1@s.whatsapp.net"
        const colonIdx = phone.indexOf(":");
        if (colonIdx > 0) phone = phone.substring(0, colonIdx);
        if (phoneCache.has(phone)) {
            lid = phoneCache.get(phone);
        }
    }

    return { lid, phone };
}

// Bi-directional resolver that maps incoming JID to the canonical JID registered in database
function resolveLidToPhone(jid, authPath) {
    if (!jid) return jid;
    const originalJid = jid;
    jid = safeStringJid(jid);
    if (!jid) return originalJid;
    const { lid, phone } = getMapping(jid);

    const lidJid = lid ? `${lid}@lid` : null;
    const phoneJid = phone ? `${phone}@s.whatsapp.net` : null;

    // Check if either JID is registered in database
    // 💡 CRITICAL FIX: ALL users in MongoDB are stored with @lid JIDs.
    // resolveLidToPhone was returning the phone JID even when the user
    // was registered as a LID JID — causing every command to fail with
    // "not registered" because getUser() couldn't find the phone JID.
    // Now we check LID FIRST, then phone, then fall back.
    const economy = getEconomy();
    if (lidJid && economy.economyData && economy.economyData.has(lidJid)) {
        return lidJid;
    }
    if (phoneJid && economy.economyData && economy.economyData.has(phoneJid)) {
        return phoneJid;
    }

    // 💡 FIX: also try the ORIGINAL jid directly — if the user is already
    // registered with their incoming JID (e.g. they registered as @lid and
    // the incoming message is also @lid), no conversion is needed.
    if (economy.economyData && economy.economyData.has(originalJid)) {
        return originalJid;
    }

    // 💡 FIX: try swapping @lid ↔ @s.whatsapp.net as a last resort
    if (typeof originalJid === 'string') {
        if (originalJid.endsWith('@lid')) {
            const alt = originalJid.replace('@lid', '@s.whatsapp.net');
            if (economy.economyData && economy.economyData.has(alt)) return alt;
        } else if (originalJid.endsWith('@s.whatsapp.net')) {
            const alt = originalJid.replace('@s.whatsapp.net', '@lid');
            if (economy.economyData && economy.economyData.has(alt)) return alt;
        }
    }

    // Default to the original JID if nothing matched
    return originalJid;
}

// Maps incoming JID to the canonical JID registered in database
function resolveJid(jid, authPath) {
    if (!jid) return jid;
    const originalJid = jid;
    jid = safeStringJid(jid);
    if (!jid) return originalJid;
    const { lid, phone } = getMapping(jid);
    
    const lidJid = lid ? `${lid}@lid` : null;
    const phoneJid = phone ? `${phone}@s.whatsapp.net` : null;
    
    // 💡 CRITICAL FIX: check LID FIRST (all users in DB are @lid), then phone.
    // Previously this checked in the same order but would fall through to
    // originalJid when neither matched — now also tries @lid ↔ @s.whatsapp.net
    // swap as a last resort.
    const economy = require('../rpg/economy');
    if (lidJid && economy.economyData && economy.economyData.has(lidJid)) {
        return lidJid;
    }
    if (phoneJid && economy.economyData && economy.economyData.has(phoneJid)) {
        return phoneJid;
    }
    
    // Try the original JID directly
    if (economy.economyData && economy.economyData.has(originalJid)) {
        return originalJid;
    }
    
    // Try swapping @lid ↔ @s.whatsapp.net
    if (typeof originalJid === 'string') {
        if (originalJid.endsWith('@lid')) {
            const alt = originalJid.replace('@lid', '@s.whatsapp.net');
            if (economy.economyData.has(alt)) return alt;
        } else if (originalJid.endsWith('@s.whatsapp.net')) {
            const alt = originalJid.replace('@s.whatsapp.net', '@lid');
            if (economy.economyData.has(alt)) return alt;
        }
    }
    
    // Default to the original JID if neither is registered
    return originalJid;
}

// Helper to resolve any JID to phone number JID format (for comparing admin lists)
// FIX: Don't short-circuit on "@s.whatsapp.net" — that left device suffixes
// like "1234567890:1@s.whatsapp.net" intact and broke every comparison.
// Now we always normalize: strip ":device" and return the bare phone JID.
function resolveToPhone(jid, authPath) {
    if (!jid) return jid;
    const originalJid = jid;
    jid = safeStringJid(jid);
    if (!jid) return originalJid;
    if (jid.endsWith("@s.whatsapp.net")) {
        // Strip any ":device" suffix so the result is canonical
        const phone = jid.split("@")[0];
        const colonIdx = phone.indexOf(":");
        if (colonIdx > 0) {
            return phone.substring(0, colonIdx) + "@s.whatsapp.net";
        }
        return jid;
    }
    const { phone } = getMapping(jid);
    return phone ? `${phone}@s.whatsapp.net` : originalJid;
}

// Canonical rank key — the single source of truth for what JID format
// `memberRanks` (and any other rank-related map) should be keyed by.
// Used by both `set rank` (write) and `getMemberRankLevel` / `.g who` (read)
// to guarantee they always agree on the key.
//
// Returns the bare phone JID "<phone>@s.whatsapp.net" whenever the LID↔phone
// mapping is known. Falls back to the LID JID "<lid>@lid" when the input is
// an LID and no mapping is cached. Always strips ":device" suffixes.
function canonicalRankKey(jid) {
    if (!jid) return jid;
    const originalJid = jid;
    jid = safeStringJid(jid);
    if (!jid) return originalJid;
    if (jid.endsWith("@s.whatsapp.net")) {
        const phone = jid.split("@")[0];
        const colonIdx = phone.indexOf(":");
        if (colonIdx > 0) return phone.substring(0, colonIdx) + "@s.whatsapp.net";
        return jid;
    }
    if (jid.endsWith("@lid")) {
        const { phone } = getMapping(jid);
        if (phone) return `${phone}@s.whatsapp.net`;
        // No mapping cached — return normalized LID (device suffix stripped)
        const lid = jid.split("@")[0];
        const colonIdx = lid.indexOf(":");
        if (colonIdx > 0) return lid.substring(0, colonIdx) + "@lid";
        return jid;
    }
    return originalJid;
}

module.exports = {
    loadLidMappings,
    saveLidMapping,
    watchAuthPath,
    resolveLidToPhone,
    resolveJid,
    resolveToPhone,
    canonicalRankKey,
    lidCache,
    phoneCache
};
