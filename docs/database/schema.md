# Database & Schema Configurations

## What it is
The Database Subsystem manages persistent storage for the bot. It uses Mongoose (a MongoDB object modeling tool) to connect to a MongoDB cluster and enforce document schemas. It maintains collection models for players (`User`), system configuration flags (`System`), guild records (`Guild`), loan documents (`Loan`), and card deck settings (`UserCard`). Connection initialization is managed by `db.js`, which features auto-retry logic to guarantee availability during network interruptions. The database acts as the primary data store for the bot’s text commands, RPG modules, in-game economies, and session sync tokens.

## How it works

**MongoDB Mongoose Connection** — [db.js L6-21](file:///home/mellow/Desktop/Joker/whatsapp-bot/db.js#L6-21)
```javascript
const connectDB = async () => {
  if (isConnected) return;

  while (!isConnected) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI);
      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      isConnected = true;
      return;
    } catch (error) {
      console.error(`❌ Error connecting to MongoDB: ${error.message}`);
      console.log("🔁 Retrying in 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};
```
This module establishes a connection to MongoDB using the URI specified in the environment variables. If the database is not initially reachable, it enters a while loop, logging errors and retrying the connection attempt every 5 seconds until a successful connection is made.

---

**User Schema Definition (Partial)** — [User.js L3-47](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/models/User.js#L3-47)
```javascript
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  
  // Basic Econ
  wallet: { type: Number, default: 1000 },
  bank: { type: Number, default: 0 },
  registered: { type: Boolean, default: false },
  nickname: { type: String, default: 'Adventurer' },

  // Timers
  lastDaily: { type: Number, default: 0 },
  lastRob: { type: Number, default: 0 },
  jailUntil: { type: Number, default: 0 },
  prisonUntil: { type: Number, default: 0 },
  robberyStrikes: { type: Number, default: 0 },
  lastClassChange: { type: Number, default: 0 },
  lastFishReset: { type: Number, default: 0 },
  fishCount: { type: Number, default: 0 },
  classChangeCount: { type: Number, default: 0 },
  lastClassChangeReset: { type: Number, default: 0 },

  // RPG Stats
  class: { type: String, default: null },
  adventurerRank: { type: String, default: 'F' },
  spriteIndex: { type: Number, default: 0 },
  
  questGold: { type: Number, default: 0 },
  questsCompleted: { type: Number, default: 0 },
  questsWon: { type: Number, default: 0 },
  questsFailed: { type: Number, default: 0 },
  
  // Flexible Objects
  inventory: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  
  equipment: {
    main_hand: { type: Object, default: null },
    off_hand: { type: Object, default: null },
    armor: { type: Object, default: null },
    helmet: { type: Object, default: null },
    boots: { type: Object, default: null },
    ring: { type: Object, default: null },
    amulet: { type: Object, default: null },
    cloak: { type: Object, default: null },
    gloves: { type: Object, default: null }
  },
```
This portion of the User Mongoose Schema specifies standard keys for player statistics and states. It stores basic economy variables (such as wallet and bank balances), adventure stats (classes and ranks), item containers (inventory map), and currently equipped gear.

---

**System Key-Value Schema** — [System.js L3-8](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/models/System.js#L3-L8)
```javascript
const SystemSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // e.g., 'blocked_users', 'muted_users', 'group_settings'
    value: { type: mongoose.Schema.Types.Mixed, required: true } // Flexible data
}, { timestamps: true });

module.exports = mongoose.model('System', SystemSchema);
```
The system model defines a simple schema containing a unique index key and a mixed-type value property. This enables the bot to store arbitrary dynamic data structures (such as arrays of blacklisted users or command rate limits) directly in MongoDB without modifying Mongoose collection definitions.

## How to modify it
To change database properties or adjust default schema settings, developers can update the Mongoose initialization values.

```javascript
// BEFORE (db.js L18)
      await new Promise(resolve => setTimeout(resolve, 5000));
```
```javascript
// AFTER (db.js L18)
      await new Promise(resolve => setTimeout(resolve, 10000)); // Increase retry interval to 10 seconds
```

```javascript
// BEFORE (User.js L7)
  wallet: { type: Number, default: 1000 },
```
```javascript
// AFTER (User.js L7)
  wallet: { type: Number, default: 5000 }, // Increase starting wallet balance for new users
```

## Common tasks
- **Change starting wallet balance** — Modify the default value of the wallet key in the user model in [User.js L7](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/models/User.js#L7).
- **Adjust the database connection retry delay** — Configure how long the bot waits before attempting to reconnect to MongoDB in [db.js L18](file:///home/mellow/Desktop/Joker/whatsapp-bot/db.js#L18).
- **Define system parameters schema** — Customize system storage fields and keys for flexible dynamic settings in [System.js L3-6](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/models/System.js#L3-L6).
- **Change default user nickname** — Modify the fallback nickname string for unregistered users in [User.js L10](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/models/User.js#L10).
