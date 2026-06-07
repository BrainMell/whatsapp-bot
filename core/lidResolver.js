const fs = require('fs');
const path = require('path');
const LidMapping = require('./models/LidMapping');
let _economy = null; // lazy singleton — avoids circular dep on startup
function getEconomy() { return _economy || (_economy = require('./economy')); }

// In-memory caches for bi-directional mapping
const lidCache = new Map();
const phoneCache = new Map();

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
        const instancesDir = path.join(__dirname, "..", "instances");
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

// Synchronous mapping lookup from caches & files
function getMapping(jid, authPath) {
    let lid = null;
    let phone = null;
    
    if (jid.endsWith("@lid")) {
        lid = jid.split("@")[0];
        // Try cache
        if (lidCache.has(lid)) {
            phone = lidCache.get(lid);
        } else {
            // Try current auth path
            try {
                if (authPath) {
                    const reverseLidPath = path.join(authPath, `lid-mapping-${lid}_reverse.json`);
                    if (fs.existsSync(reverseLidPath)) {
                        const mappedPhone = JSON.parse(fs.readFileSync(reverseLidPath, "utf8"));
                        if (mappedPhone) {
                            phone = mappedPhone;
                            saveLidMapping(lid, phone);
                        }
                    }
                }
                // Try fallback other auth paths
                if (!phone) {
                    const instancesDir = path.join(__dirname, "..", "instances");
                    if (fs.existsSync(instancesDir)) {
                        const folders = fs.readdirSync(instancesDir).filter(f => 
                            fs.statSync(path.join(instancesDir, f)).isDirectory()
                        );
                        for (const folder of folders) {
                            const fallbackPath = path.join(instancesDir, folder, "auth", `lid-mapping-${lid}_reverse.json`);
                            if (fs.existsSync(fallbackPath)) {
                                const mappedPhone = JSON.parse(fs.readFileSync(fallbackPath, "utf8"));
                                if (mappedPhone) {
                                    phone = mappedPhone;
                                    saveLidMapping(lid, phone);
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (err) {}
        }
    } else if (jid.endsWith("@s.whatsapp.net")) {
        phone = jid.split("@")[0];
        // Try cache
        if (phoneCache.has(phone)) {
            lid = phoneCache.get(phone);
        } else {
            // Try current auth path
            try {
                if (authPath) {
                    const forwardLidPath = path.join(authPath, `lid-mapping-${phone}.json`);
                    if (fs.existsSync(forwardLidPath)) {
                        const mappedLid = JSON.parse(fs.readFileSync(forwardLidPath, "utf8"));
                        if (mappedLid) {
                            lid = mappedLid;
                            saveLidMapping(lid, phone);
                        }
                    }
                }
                // Try fallback other auth paths
                if (!lid) {
                    const instancesDir = path.join(__dirname, "..", "instances");
                    if (fs.existsSync(instancesDir)) {
                        const folders = fs.readdirSync(instancesDir).filter(f => 
                            fs.statSync(path.join(instancesDir, f)).isDirectory()
                        );
                        for (const folder of folders) {
                            const fallbackPath = path.join(instancesDir, folder, "auth", `lid-mapping-${phone}.json`);
                            if (fs.existsSync(fallbackPath)) {
                                const mappedLid = JSON.parse(fs.readFileSync(fallbackPath, "utf8"));
                                if (mappedLid) {
                                    lid = mappedLid;
                                    saveLidMapping(lid, phone);
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (err) {}
        }
    }
    
    return { lid, phone };
}

// Bi-directional resolver that maps incoming JID to the canonical JID registered in database
function resolveLidToPhone(jid, authPath) {
    if (!jid) return jid;
    const { lid, phone } = getMapping(jid, authPath);

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
    const { lid, phone } = getMapping(jid, authPath);
    
    const lidJid = lid ? `${lid}@lid` : null;
    const phoneJid = phone ? `${phone}@s.whatsapp.net` : null;
    
    // Check if either JID is registered in database
    const economy = require('./economy');
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
    
    const { phone } = getMapping(jid, authPath);
    return phone ? `${phone}@s.whatsapp.net` : jid;
}

module.exports = {
    loadLidMappings,
    saveLidMapping,
    resolveLidToPhone,
    resolveJid,
    resolveToPhone,
    lidCache,
    phoneCache
};
