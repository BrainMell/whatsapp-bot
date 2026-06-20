// Test harness: mocks DB & botConfig so RPG subsystems can be imported standalone.
// Usage: require('./test_harness'); then require the module under test.
const path = require('path');
const Module = require('module');

// ---------- 1. Stub mongoose so models don't try to connect ----------
const mongooseStub = {
  connect: async () => ({ connection: { readyState: 1 } }),
  connection: { readyState: 1, on() {}, once() {} },
  Schema: function Schema(def) {
    this.def = def;
    this.methods = {};
    this.statics = {};
    this.virtuals = {};
    this.Types = mongooseStub.Types; // expose Types on Schema instance
    this.method = (n, f) => { this.methods[n] = f; return this; };
    this.static = (n, f) => { this.statics[n] = f; return this; };
    this.plugin = () => this;
    this.index = () => this;
    this.virtual = (n) => ({ get(g) { this.virtuals[n] = { get: g }; return this; }, set(s) { this.virtuals[n].set = s; return this; } });
    this.add = () => this;
    this.pre = () => this;
    this.post = () => this;
    this.path = () => ({ validate: () => this, get: () => this, set: () => this });
    this.obj = def || {};
  },
  model: (name, schema) => {
    const M = function (data) { Object.assign(this, data); };
    // Common statics used by models
    M.find = async () => [];
    M.findOne = async () => null;
    M.findById = async () => null;
    M.findOneAndUpdate = async () => null;
    M.findByIdAndUpdate = async () => null;
    M.findOneAndDelete = async () => null;
    M.findByIdAndDelete = async () => null;
    M.updateOne = async () => ({ matchedCount: 0, modifiedCount: 0 });
    M.updateMany = async () => ({ matchedCount: 0, modifiedCount: 0 });
    M.deleteOne = async () => ({ deletedCount: 0 });
    M.deleteMany = async () => ({ deletedCount: 0 });
    M.countDocuments = async () => 0;
    M.estimatedDocumentCount = async () => 0;
    M.aggregate = async () => [];
    M.distinct = async () => [];
    M.bulkWrite = async () => ({});
    M.insertMany = async () => [];
    M.create = async () => null;
    // expose statics defined on schema
    if (schema && schema.statics) for (const k of Object.keys(schema.statics)) M[k] = schema.statics[k];
    return M;
  },
  Types: {
    ObjectId: class ObjectId { constructor(v) { this.id = v; } },
    Mixed: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Date: Date,
    Array: Array,
    Map: Map,
    Decimal128: Number,
  },
  isValidObjectId: () => true,
  models: {}, // cache so `mongoose.models.X || mongoose.model(...)` works
};
// Attach static-style members to the Schema function itself (for `mongoose.Schema.Types.Mixed`)
mongooseStub.Schema.Types = mongooseStub.Types;
mongooseStub.Schema.ObjectId = mongooseStub.Types.ObjectId;

// ---------- 2. Stub botConfig ----------
const botConfigStub = {
  getPrefix: () => '.j',
  getCurrency: () => ({ symbol: 'Z', name: 'Zeni' }),
  getAssetPath: (p) => `/fake/${p}`,
  getBotName: () => 'TestBot',
  getInstanceName: () => 'test',
  get: (k, d) => d,
  getAll: () => ({}),
  load: () => ({}),
  set: () => {},
  getPrefixChar: () => '.',
};

// ---------- 3. Stub db.js connectDB ----------
const dbStub = async () => {};

// ---------- 4. Inject stubs into Node's resolver ----------
const realResolve = Module._resolveFilename;
const stubMap = {
  'mongoose': mongooseStub,
  '../../db': dbStub,
  './db': dbStub,
  '../db': dbStub,
  '../../botConfig': botConfigStub,
  '../botConfig': botConfigStub,
  './botConfig': botConfigStub,
};

Module._resolveFilename = function (request, parent, ...rest) {
  // Only intercept if not a relative/absolute path that resolves normally
  if (stubMap[request]) {
    // Force require() to return our stub by intercepting the cache
    const fakePath = path.resolve(__dirname, '..', 'node_modules', '_stub_' + request.replace(/[\/\\]/g, '_'));
    if (!require.cache[fakePath]) {
      require.cache[fakePath] = {
        id: fakePath,
        filename: fakePath,
        loaded: true,
        exports: stubMap[request],
        paths: [],
        children: [],
      };
    }
    return fakePath;
  }
  return realResolve.call(this, request, parent, ...rest);
};

// ---------- 5. Silence pino & other noisy libs ----------
const noop = () => {};
const pinoStub = () => ({ info: noop, warn: noop, error: noop, debug: noop, child: () => ({ info: noop, warn: noop, error: noop, debug: noop }) });
try {
  require.cache[require.resolve('pino', { paths: ['/home/z/my-project/repo/whatsapp-bot/node_modules'] })] =
    { id: 'pino', filename: 'pino', loaded: true, exports: pinoStub, paths: [], children: [] };
} catch (e) { /* pino not installed; ignore */ }

module.exports = { mongooseStub, botConfigStub, dbStub };
