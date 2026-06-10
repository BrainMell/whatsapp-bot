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

// Synchronous mapping lookup from caches — strictly in-memory O(1)
function getMapping(jid) {
    let lid = null;
    let phone = null;
    
    if (jid.endsWith("@lid")) {
        lid = jid.split("@")[0];
        if (lidCache.has(lid)) {
            phone = lidCache.get(lid);
        }
    } else if (jid.endsWith("@s.whatsapp.net")) {
        phone = jid.split("@")[0];
        if (phoneCache.has(phone)) {
            lid = phoneCache.get(phone);
        }
    }
    
    return { lid, phone };
}

// Bi-directional resolver that maps incoming JID to the canonical JID registered in database
function resolveLidToPhone(jid, authPath) {
    if (!jid) return jid;
    const { lid, phone } = getMapping(jid);

    const lidJid = lid ? `${lid}@lid` : null;
    const phoneJid = phone ? `${phone}@s.whatsapp.net` : null;

    // Check if either JID is registered in database
    const economy = getEconomy();
    if (lidJid && economy.economyData && economy.economyData.has(lidJid)) {
        return lidJid;
    }
    if (phoneJid && economy.economyData && economy.economyData.has(phoneJid)) {
        return phoneJid;
    }

    // Default to Phone JID if available, else keep incoming
    return phoneJid || jid;
}

// Maps incoming JID to the canonical JID registered in database
function resolveJid(jid, authPath) {
    if (!jid) return jid;
    const { lid, phone } = getMapping(jid);
    
    const lidJid = lid ? `${lid}@lid` : null;
    const phoneJid = phone ? `${phone}@s.whatsapp.net` : null;
    
    // Check if either JID is registered in database
    const economy = require('../rpg/economy');
    if (lidJid && economy.economyData && economy.economyData.has(lidJid)) {
        return lidJid;
    }
    if (phoneJid && economy.economyData && economy.economyData.has(phoneJid)) {
        return phoneJid;
    }
    
    // Default to the original JID if neither is registered
    return jid;
}

// Helper to resolve any JID to phone number JID format (for comparing admin lists)
function resolveToPhone(jid, authPath) {
    if (!jid) return jid;
    if (jid.endsWith("@s.whatsapp.net")) return jid;
    
    const { phone } = getMapping(jid);
    return phone ? `${phone}@s.whatsapp.net` : jid;
}

module.exports = {
    loadLidMappings,
    saveLidMapping,
    watchAuthPath,
    resolveLidToPhone,
    resolveJid,
    resolveToPhone,
    lidCache,
    phoneCache
};
