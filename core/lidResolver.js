const fs = require('fs');
const path = require('path');
const LidMapping = require('./models/LidMapping');

// In-memory cache: lid (string) -> phone (string)
const lidCache = new Map();

// Load all mappings from MongoDB and scan local auth files for any unsaved ones
async function loadLidMappings() {
    try {
        console.log(`📥 [LID Resolver] Loading LID mappings from MongoDB...`);
        // 1. Load from MongoDB
        const mappings = await LidMapping.find({});
        for (const m of mappings) {
            lidCache.set(m.lid, m.phone);
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
                    const files = fs.readdirSync(authDir).filter(file => 
                        file.startsWith("lid-mapping-") && file.endsWith("_reverse.json")
                    );
                    for (const file of files) {
                        const lid = file.replace("lid-mapping-", "").replace("_reverse.json", "");
                        if (!lidCache.has(lid)) {
                            try {
                                const filePath = path.join(authDir, file);
                                const phone = JSON.parse(fs.readFileSync(filePath, "utf8"));
                                if (phone) {
                                    // Save to MongoDB and add to cache
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

// Save mapping to MongoDB and update local cache
async function saveLidMapping(lid, phone) {
    if (!lid || !phone) return;
    lidCache.set(lid, phone);
    try {
        console.log(`💾 [LID Resolver] Saving mapping to MongoDB: ${lid} -> ${phone}`);
        await LidMapping.findOneAndUpdate(
            { lid: lid },
            { $set: { phone: phone } },
            { upsert: true }
        );
        console.log(`💾 [LID Resolver] Successfully saved mapping to MongoDB for ${lid}`);
    } catch (e) {
        console.error(`❌ [LID Resolver] Error saving LID mapping to MongoDB for ${lid}:`, e.message);
    }
}

// Synchronous resolver using in-memory cache, filesystem search, and async DB save
function resolveLidToPhone(jid, authPath) {
    if (!jid || !jid.endsWith("@lid")) return jid;
    const lid = jid.split("@")[0];
    
    console.log(`🔍 [LID Resolver] Resolving LID: ${jid} (authPath: ${authPath})`);

    // 1. Try cache
    if (lidCache.has(lid)) {
        const phone = `${lidCache.get(lid)}@s.whatsapp.net`;
        console.log(`✅ [LID Resolver] Cache Hit: ${jid} -> ${phone}`);
        return phone;
    }
    
    // 2. Try the current auth path
    try {
        if (authPath) {
            const reverseLidPath = path.join(authPath, `lid-mapping-${lid}_reverse.json`);
            if (fs.existsSync(reverseLidPath)) {
                const mappedPhone = JSON.parse(fs.readFileSync(reverseLidPath, "utf8"));
                if (mappedPhone) {
                    const phone = `${mappedPhone}@s.whatsapp.net`;
                    console.log(`✅ [LID Resolver] File Hit (Current Auth): ${jid} -> ${phone}`);
                    saveLidMapping(lid, mappedPhone); // Asynchronous background save
                    return phone;
                }
            }
        }
        
        // 3. Fallback: Scan other instances' auth directories
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
                        const phone = `${mappedPhone}@s.whatsapp.net`;
                        console.log(`✅ [LID Resolver] File Hit (Fallback Auth in ${folder}): ${jid} -> ${phone}`);
                        saveLidMapping(lid, mappedPhone); // Asynchronous background save
                        return phone;
                    }
                }
            }
        }
    } catch (e) {
        console.error("❌ [LID Resolver] Error in resolveLidToPhone:", e.message);
    }
    
    console.log(`⚠️ [LID Resolver] Failed to resolve: ${jid}`);
    return jid;
}

module.exports = {
    loadLidMappings,
    saveLidMapping,
    resolveLidToPhone,
    lidCache
};
