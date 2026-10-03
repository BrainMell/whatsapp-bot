// Boots an in-memory mongod, writes its URI into .env so the repo's own
// test scripts (which parse .env and redirect to gwtest) run unmodified
// against a throwaway database. Sandbox-only helper — never ships.
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

(async () => {
  const mem = await MongoMemoryServer.create({
    instance: { dbName: 'gwtest', port: 27077 },
  });
  const uri = mem.getUri('gwtest');
  const envPath = path.join(__dirname, '..', '.env');
  const lines = [
    `MONGO_URI=${uri}`,
    'GO_IMAGE_SERVICE_URL=http://127.0.0.1:7860',
    'GW_TEST=1',
  ];
  fs.writeFileSync(envPath, lines.join('\n') + '\n');
  console.log('[memmongo] URI written to .env:', uri);
  console.log('[memmongo] PID-file marker:', process.pid);
  fs.writeFileSync(path.join(__dirname, '_memmongo.pid'), String(process.pid));
  // keep alive
  setInterval(() => {}, 1 << 30);
})().catch(e => { console.error(e); process.exit(1); });
