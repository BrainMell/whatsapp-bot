const path = require('path');
const fs = require('fs');
const dns = require('dns');

// Force IPv4 first to avoid Baileys connection timeout
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');

const targetInstance = process.argv[2] || process.env.BOT_INSTANCE || 'Joker';
const projectRoot = path.resolve(__dirname, '..');
const instanceDir = path.join(projectRoot, 'instances', targetInstance);
const configPath = path.join(instanceDir, 'botConfig.json');
const authDir = path.join(instanceDir, 'auth');

if (!fs.existsSync(configPath)) {
  console.error(`❌ botConfig.json not found for instance: ${targetInstance} at ${configPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const phone = process.argv[3] || config.pairingPhone;

if (!phone) {
  console.error(`❌ No pairingPhone found for ${targetInstance} in botConfig.json or CLI argument.`);
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`🚀 Standalone Authenticator for [${targetInstance}]`);
console.log(`📱 Target Phone: ${phone}`);
console.log(`📁 Auth Directory: ${authDir}`);
console.log(`======================================================\n`);

if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}

let pairingRequested = false;

async function startAuth() {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version: [2, 3000, 1043857760],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 15000,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !pairingRequested && !state.creds?.registered) {
      pairingRequested = true;
      try {
        console.log(`⏳ Requesting WhatsApp pairing code for ${phone}...`);
        const code = await sock.requestPairingCode(phone);
        console.log(`\n╔══════════════════════════════════════════════════╗`);
        console.log(`║  🔑 PAIRING CODE FOR [${targetInstance.padEnd(8)}]: ${code}           ║`);
        console.log(`╚══════════════════════════════════════════════════╝\n`);
        console.log(`📱 Steps on your phone:`);
        console.log(`   1. Open WhatsApp on ${phone}`);
        console.log(`   2. Settings → Linked Devices → Link a Device`);
        console.log(`   3. Tap "Link with phone number instead"`);
        console.log(`   4. Enter code: ${code}\n`);
      } catch (err) {
        pairingRequested = false;
        console.error(`❌ Failed to request pairing code:`, err.message);
      }
    }

    if (connection === 'open') {
      console.log(`\n🎉🎉🎉 [SUCCESS] ${targetInstance} is officially authenticated and connected! 🎉🎉🎉`);
      console.log(`💾 Writing final session files to disk...`);
      await saveCreds();
      // Allow 3 seconds for all keys to flush to disk
      setTimeout(() => {
        console.log(`✅ Auth files completely saved in ${authDir}.`);
        console.log(`🏁 Exiting standalone authenticator cleanly.\n`);
        process.exit(0);
      }, 3000);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Connection closed. Status code: ${statusCode} (${lastDisconnect?.error?.message || 'unknown'})`);

      if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
        console.log(`🔄 Normal post-pairing restart (515). Reconnecting in 2 seconds to finalize session...`);
        setTimeout(() => startAuth(), 2000);
      } else if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.error(`❌ Session was logged out (401). Wiping auth and retry needed.`);
        process.exit(1);
      } else {
        console.log(`🔁 Reconnecting in 3 seconds...`);
        setTimeout(() => startAuth(), 3000);
      }
    }
  });
}

startAuth().catch((err) => {
  console.error(`💥 Fatal error:`, err);
  process.exit(1);
});
