# WhatsApp Bot Bug Analysis Report
## Critical Bugs Causing Connection Errors

---

## 🔴 **CRITICAL BUG #1: Race Conditions in Combat System**

### Error Pattern:
```
Failed to send turn image in nextTurn: Connection Closed
Failed to send status messages in processCombatTurn: Connection Closed
Failed to send player prompt in promptPlayerAction: Connection Closed
```

### Root Cause:
The combat system attempts to send multiple messages sequentially **without waiting for connection state validation**. When the connection drops (Status 408/428), the combat system continues trying to send messages, causing cascading failures.

### Location:
Lines referencing: `nextTurn`, `processCombatTurn`, `promptPlayerAction`, `startCombat`

### Fix Required:
```javascript
// BEFORE (Buggy):
async function nextTurn() {
  await sock.sendMessage(...); // No connection check
  await sock.sendMessage(...); // Fails if first one disconnected
}

// AFTER (Fixed):
async function nextTurn() {
  if (!sock || sock.ws.readyState !== WebSocket.OPEN) {
    console.log("⚠️ Connection not ready, aborting combat action");
    return;
  }
  
  try {
    await sock.sendMessage(...);
    // Add small delay between messages
    await new Promise(resolve => setTimeout(resolve, 500));
    await sock.sendMessage(...);
  } catch (err) {
    if (err.message.includes('Connection Closed')) {
      console.log("Connection lost during combat, will retry on reconnect");
      // Store combat state for recovery
    }
  }
}
```

---

## 🔴 **CRITICAL BUG #2: Missing Connection State Validation**

### Error Pattern:
```
🔻 Connection closed. Status code: 408
🔻 Connection closed. Status code: 428
```

### Root Cause:
The bot does not validate the WebSocket connection state **before attempting to send messages**. Status codes:
- **408**: Request Timeout (WhatsApp server didn't respond in time)
- **428**: Precondition Required (Authentication or session issue)

### Location:
Throughout the message sending logic (lines 9994-10035, combat system calls)

### Fix Required:
```javascript
// Add global message wrapper
async function safeSendMessage(jid, content, options = {}) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // Check connection state
      if (!sock || !sock.ws || sock.ws.readyState !== 1) { // 1 = OPEN
        throw new Error('Socket not ready');
      }
      
      // Check if we're authenticated
      if (!sock.user) {
        throw new Error('Not authenticated');
      }
      
      return await sock.sendMessage(jid, content, options);
      
    } catch (err) {
      attempt++;
      
      if (attempt >= maxRetries) {
        console.error(`Failed to send message after ${maxRetries} attempts:`, err.message);
        return null;
      }
      
      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

// Replace all sock.sendMessage() calls with safeSendMessage()
```

---

## 🔴 **CRITICAL BUG #3: Reconnection Logic Not Clearing State**

### Error Pattern:
```
🔁 Reconnecting in 5s...
🚀 Starting Goten (Goten)...
Failed to send turn image in nextTurn: Connection Closed
```

### Root Cause:
When the bot reconnects, it **immediately tries to resume combat** from the previous session without:
1. Checking if the connection is fully established
2. Clearing old combat states
3. Validating that the group/user is still accessible

### Location:
`initSocket()` function (around line 9000+), reconnection logic

### Fix Required:
```javascript
async function initSocket() {
  // ... existing code ...
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'open') {
      console.log("✅ WhatsApp connected (open).");
      
      // ⚠️ IMPORTANT: Clear all pending operations
      await clearPendingOperations();
      
      // Wait for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      retryCount = 0;
      // ... rest of the code
    }
  });
}

async function clearPendingOperations() {
  // Clear combat states
  const activeCombats = progression.getActiveCombats?.() || [];
  for (const combat of activeCombats) {
    console.log(`⚠️ Clearing stale combat session for user ${combat.userId}`);
    // Don't try to send messages, just clean up the state
    progression.clearCombat?.(combat.userId, combat.chatId);
  }
  
  // Clear other pending operations
  commandCooldowns.clear();
}
```

---

## 🟡 **MEDIUM BUG #4: No Graceful Degradation for Media**

### Error Pattern:
```
Media upload failed in startCombat: Connection Closed
Fallback text failed in startCombat: Connection Closed
```

### Root Cause:
When media upload fails, the fallback text also fails because **the connection is still closed**. No proper error handling cascade.

### Fix Required:
```javascript
async function startCombat(userId, chatId) {
  try {
    // Try to send with media
    const imageBuffer = await generateCombatImage();
    await safeSendMessage(chatId, {
      image: imageBuffer,
      caption: combatText
    });
  } catch (err) {
    console.log("Media upload failed, trying text-only...");
    
    // Wait a bit and check connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      // Try text-only
      await safeSendMessage(chatId, { text: combatText });
    } catch (err2) {
      // Store the combat state for later delivery
      console.log("Both media and text failed, storing for later...");
      storePendingCombat(userId, chatId, combatText, imageBuffer);
      return;
    }
  }
}
```

---

## 🟡 **MEDIUM BUG #5: Unhandled Promise Rejections in Combat**

### Error Pattern:
```
❌ Unhandled Rejection at: Promise {
  <rejected> Error: Connection Closed
      at sendRawMessage
```

### Root Cause:
Combat functions don't properly catch and handle promise rejections, causing them to bubble up to the global handler.

### Location:
Line 121-132 (global handler), combat system

### Fix Required:
```javascript
// Wrap all async combat operations
sock.ev.on('messages.upsert', async ({ messages }) => {
  for (const m of messages) {
    try {
      // ... message processing ...
      
      // When calling combat functions:
      await handleCombatCommand(args, chatId, senderJid)
        .catch(err => {
          console.error("Combat command error:", err.message);
          // Don't let it crash the bot
          return sock.sendMessage(chatId, {
            text: "⚠️ Combat system temporarily unavailable. Try again in a moment."
          }).catch(() => {});
        });
        
    } catch (err) {
      // Handle at message level
      console.error("Message processing error:", err.message);
    }
  }
});
```

---

## 🟡 **MEDIUM BUG #6: Group Metadata Cache Issues**

### Error Pattern:
```
at groupMetadata (file:///app/node_modules/@whiskeysockets/baileys/lib/Socket/groups.js:19:30)
```

### Root Cause:
The bot tries to fetch group metadata during a connection issue, but there's no timeout or fallback.

### Location:
Line 79: `const groupMetadataCache = new NodeCache({ stdTTL: 300 });`

### Fix Required:
```javascript
async function getGroupMetadataWithFallback(chatId) {
  // Check cache first
  const cached = groupMetadataCache.get(chatId);
  if (cached) return cached;
  
  try {
    // Set timeout for metadata fetch
    const metadata = await Promise.race([
      sock.groupMetadata(chatId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Metadata timeout')), 5000)
      )
    ]);
    
    groupMetadataCache.set(chatId, metadata);
    return metadata;
    
  } catch (err) {
    console.log(`⚠️ Failed to get metadata for ${chatId}, using fallback`);
    
    // Return minimal fallback
    return {
      id: chatId,
      subject: 'Unknown Group',
      participants: []
    };
  }
}
```

---

## 🟢 **LOW BUG #7: Memory Leaks from Uncleaned Event Listeners**

### Issue:
Every reconnection creates new event listeners without cleaning old ones.

### Fix Required:
```javascript
// Track listeners
let messageListener = null;

async function initSocket() {
  // ... existing code ...
  
  // Remove old listener before adding new one
  if (messageListener) {
    sock.ev.off('messages.upsert', messageListener);
  }
  
  messageListener = async ({ messages }) => {
    // ... message handling ...
  };
  
  sock.ev.on('messages.upsert', messageListener);
}
```

---

## 🟢 **LOW BUG #8: No Circuit Breaker for Rapid Reconnections**

### Error Pattern:
```
🔁 Reconnecting in 5s...
🔁 Reconnecting in 10s...
(Multiple rapid reconnections)
```

### Issue:
The backoff is too simple and doesn't prevent rapid reconnection loops.

### Fix Required:
```javascript
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 10;

function getBackoff() {
  consecutiveFailures++;
  
  if (consecutiveFailures > MAX_CONSECUTIVE_FAILURES) {
    console.error('🛑 Too many consecutive failures, stopping reconnection.');
    process.exit(1); // Let the process manager (PM2/systemd) restart
  }
  
  // Exponential backoff with max of 5 minutes
  const delay = Math.min(5000 * Math.pow(1.5, consecutiveFailures), 300000);
  return delay;
}

// Reset on successful connection
sock.ev.on('connection.update', ({ connection }) => {
  if (connection === 'open') {
    consecutiveFailures = 0; // Reset counter
  }
});
```

---

## 📊 **Priority Summary**

### Fix Immediately (Critical):
1. ✅ Add connection state validation before all message sends
2. ✅ Implement proper error handling in combat system
3. ✅ Clear pending operations on reconnection

### Fix Soon (Medium):
4. ✅ Add graceful degradation for media uploads
5. ✅ Wrap all async operations with proper error handlers
6. ✅ Add timeout for group metadata fetches

### Fix When Possible (Low):
7. ✅ Clean up event listeners on reconnection
8. ✅ Implement circuit breaker for reconnection loops

---

## 🔧 **Recommended Architectural Changes**

### 1. Message Queue System
Instead of sending messages directly, queue them:
```javascript
const messageQueue = [];

async function queueMessage(jid, content, options) {
  messageQueue.push({ jid, content, options, timestamp: Date.now() });
}

async function processQueue() {
  if (!sock || sock.ws.readyState !== 1) return;
  
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    
    // Skip old messages (older than 5 minutes)
    if (Date.now() - msg.timestamp > 300000) {
      console.log("Skipping old queued message");
      continue;
    }
    
    try {
      await sock.sendMessage(msg.jid, msg.content, msg.options);
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
    } catch (err) {
      // If it fails, put it back
      messageQueue.unshift(msg);
      break;
    }
  }
}

// Process queue every second
setInterval(processQueue, 1000);
```

### 2. Health Check System
```javascript
let lastHealthCheck = Date.now();

setInterval(() => {
  if (!sock || sock.ws.readyState !== 1) {
    console.log("⚠️ Health check failed - connection is down");
    return;
  }
  
  // Ping to keep connection alive
  sock.sendPresenceUpdate('available').catch(() => {});
  lastHealthCheck = Date.now();
}, 30000); // Every 30 seconds

// Monitor health
setInterval(() => {
  if (Date.now() - lastHealthCheck > 60000) {
    console.error("🛑 No successful health check in 60s, forcing reconnect");
    sock.ws.close();
  }
}, 10000);
```

---

## 🎯 **Implementation Priority**

### Phase 1 (Immediate - Day 1):
- Implement `safeSendMessage()` wrapper
- Add connection validation checks
- Fix combat system to check connection state

### Phase 2 (Within 3 days):
- Implement message queue
- Add health check system
- Clear pending operations on reconnection

### Phase 3 (Within 1 week):
- Add circuit breaker
- Implement proper event listener cleanup
- Add comprehensive logging

---

## 🧪 **Testing Checklist**

- [ ] Test reconnection after manual disconnect
- [ ] Test combat system during poor network conditions
- [ ] Test message queue under load
- [ ] Monitor memory usage over 24 hours
- [ ] Test graceful shutdown and restart
- [ ] Verify no orphaned combat sessions after crash
- [ ] Test with multiple simultaneous combat sessions
- [ ] Verify proper cleanup of event listeners

---

## 📝 **Additional Notes**

The logs show the bot is **running on Render** (cloud hosting), which can have:
- Network instability
- Container restarts
- Memory limits

Consider:
1. Adding persistent combat state storage (Redis/MongoDB)
2. Implementing proper graceful shutdown handling
3. Adding deployment health checks
4. Using a process manager with auto-restart limits

---

**Generated:** February 5, 2026  
**Bot:** Goten WhatsApp Bot  
**Version:** Production


// ============================================
// CRITICAL BUG FIXES FOR WHATSAPP BOT
// ============================================

// FIX #1: Safe Message Sending Wrapper
// Replace all sock.sendMessage() calls with this

async function safeSendMessage(sock, jid, content, options = {}) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // Validate socket exists
      if (!sock) {
        throw new Error('Socket is null or undefined');
      }
      
      // Check WebSocket connection state
      if (!sock.ws || sock.ws.readyState !== 1) { // 1 = WebSocket.OPEN
        throw new Error('WebSocket not in OPEN state');
      }
      
      // Check authentication
      if (!sock.user) {
        throw new Error('Socket not authenticated');
      }
      
      // Attempt to send
      const result = await sock.sendMessage(jid, content, options);
      return result;
      
    } catch (err) {
      attempt++;
      
      // Log the error
      console.log(`⚠️ Send attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      
      // If we've exhausted retries, give up
      if (attempt >= maxRetries) {
        console.error(`❌ Failed to send message after ${maxRetries} attempts`);
        throw err; // Re-throw for upstream handling
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = 1000 * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// ============================================
// FIX #2: Connection State Manager
// ============================================

class ConnectionManager {
  constructor() {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.lastSuccessfulMessage = Date.now();
    this.consecutiveFailures = 0;
  }
  
  updateState(sock) {
    if (!sock || !sock.ws) {
      this.isConnected = false;
      this.isAuthenticated = false;
      return;
    }
    
    this.isConnected = sock.ws.readyState === 1;
    this.isAuthenticated = !!sock.user;
  }
  
  canSendMessage() {
    return this.isConnected && this.isAuthenticated;
  }
  
  recordSuccess() {
    this.lastSuccessfulMessage = Date.now();
    this.consecutiveFailures = 0;
  }
  
  recordFailure() {
    this.consecutiveFailures++;
  }
  
  getHealthStatus() {
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulMessage;
    
    return {
      isHealthy: this.canSendMessage() && timeSinceLastSuccess < 60000,
      consecutiveFailures: this.consecutiveFailures,
      timeSinceLastSuccess
    };
  }
}

// Initialize the manager
const connectionManager = new ConnectionManager();

// Update state on connection events
sock.ev.on('connection.update', (update) => {
  connectionManager.updateState(sock);
  
  if (update.connection === 'open') {
    console.log("✅ Connection established");
    connectionManager.recordSuccess();
  }
});

// ============================================
// FIX #3: Message Queue System
// ============================================

class MessageQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxQueueSize = 100;
    this.messageTimeout = 300000; // 5 minutes
  }
  
  enqueue(jid, content, options = {}) {
    // Don't queue if queue is too large
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('⚠️ Message queue full, dropping oldest message');
      this.queue.shift();
    }
    
    this.queue.push({
      jid,
      content,
      options,
      timestamp: Date.now(),
      retries: 0
    });
    
    console.log(`📬 Message queued. Queue size: ${this.queue.length}`);
  }
  
  async processQueue(sock, connectionManager) {
    if (this.processing) return;
    if (this.queue.length === 0) return;
    if (!connectionManager.canSendMessage()) {
      console.log('⏸️ Queue paused - connection not ready');
      return;
    }
    
    this.processing = true;
    
    try {
      while (this.queue.length > 0 && connectionManager.canSendMessage()) {
        const message = this.queue[0];
        
        // Skip old messages
        if (Date.now() - message.timestamp > this.messageTimeout) {
          console.log('⏭️ Skipping expired message');
          this.queue.shift();
          continue;
        }
        
        try {
          await safeSendMessage(sock, message.jid, message.content, message.options);
          this.queue.shift(); // Remove successful message
          connectionManager.recordSuccess();
          
          // Rate limit: 500ms between messages
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (err) {
          message.retries++;
          
          if (message.retries >= 3) {
            console.error(`❌ Message failed after 3 retries, dropping`);
            this.queue.shift();
          } else {
            console.log(`⏳ Message retry ${message.retries}/3`);
            // Move to back of queue for retry
            this.queue.push(this.queue.shift());
          }
          
          connectionManager.recordFailure();
          break; // Stop processing on error
        }
      }
    } finally {
      this.processing = false;
    }
  }
  
  clear() {
    const count = this.queue.length;
    this.queue = [];
    console.log(`🧹 Cleared ${count} messages from queue`);
  }
}

// Initialize queue
const messageQueue = new MessageQueue();

// Process queue every 1 second
setInterval(() => {
  messageQueue.processQueue(sock, connectionManager);
}, 1000);

// ============================================
// FIX #4: Combat System Fixes
// ============================================

// Wrap all combat message sending
async function sendCombatMessage(sock, chatId, content, options = {}) {
  try {
    // Check connection first
    if (!connectionManager.canSendMessage()) {
      console.log('⚠️ Connection not ready, queueing combat message');
      messageQueue.enqueue(chatId, content, options);
      return false;
    }
    
    await safeSendMessage(sock, chatId, content, options);
    return true;
    
  } catch (err) {
    console.error('❌ Combat message failed:', err.message);
    
    // If it's a connection error, queue it
    if (err.message.includes('Connection') || err.message.includes('Socket')) {
      messageQueue.enqueue(chatId, content, options);
    }
    
    return false;
  }
}

// Fixed combat functions
async function startCombat(sock, userId, chatId, enemyData) {
  try {
    const combatText = generateCombatText(enemyData);
    
    // Try to send with image
    try {
      const imageBuffer = await generateCombatImage(enemyData);
      
      const success = await sendCombatMessage(sock, chatId, {
        image: imageBuffer,
        caption: combatText
      });
      
      if (success) return;
      
    } catch (imgErr) {
      console.log('⚠️ Combat image generation failed, using text only');
    }
    
    // Fallback to text only
    await sendCombatMessage(sock, chatId, { text: combatText });
    
  } catch (err) {
    console.error('❌ startCombat error:', err.message);
    // Store combat state for recovery
    storePendingCombat(userId, chatId, enemyData);
  }
}

async function nextTurn(sock, userId, chatId, combatState) {
  // ALWAYS check connection before proceeding
  if (!connectionManager.canSendMessage()) {
    console.log('⚠️ Connection not ready, combat paused');
    return;
  }
  
  try {
    // Send turn image
    const turnImage = await generateTurnImage(combatState);
    await sendCombatMessage(sock, chatId, {
      image: turnImage,
      caption: combatState.turnText
    });
    
    // Small delay between messages
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Send status messages
    await sendCombatMessage(sock, chatId, {
      text: formatCombatStatus(combatState)
    });
    
    // Delay before prompt
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Prompt player action
    await sendCombatMessage(sock, chatId, {
      text: generateActionPrompt(combatState)
    });
    
  } catch (err) {
    console.error('❌ nextTurn error:', err.message);
    // Don't crash, just log and continue
  }
}

// ============================================
// FIX #5: Reconnection Handler
// ============================================

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

async function handleReconnection(sock, reason) {
  reconnectAttempts++;
  
  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.error('🛑 Too many reconnection attempts, stopping');
    process.exit(1); // Let PM2/systemd restart the process
  }
  
  // Clear all pending operations
  await clearPendingOperations();
  
  // Calculate backoff
  const backoffMs = Math.min(5000 * Math.pow(1.5, reconnectAttempts), 300000);
  console.log(`🔁 Reconnecting in ${Math.round(backoffMs/1000)}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
  
  await new Promise(resolve => setTimeout(resolve, backoffMs));
  
  // Attempt reconnection
  return initSocket();
}

async function clearPendingOperations() {
  console.log('🧹 Clearing pending operations...');
  
  // Clear message queue of old messages
  messageQueue.clear();
  
  // Clear active combat sessions (don't try to send messages)
  try {
    const activeCombats = progression.getActiveCombats?.() || [];
    for (const combat of activeCombats) {
      console.log(`⚠️ Cleaning stale combat for user ${combat.userId}`);
      // Just clear the state, don't send messages
      progression.clearCombatState?.(combat.userId, combat.chatId);
    }
  } catch (err) {
    console.log('⚠️ Error clearing combats:', err.message);
  }
  
  // Clear cooldowns
  if (typeof commandCooldowns !== 'undefined') {
    commandCooldowns.clear();
  }
  
  // Update connection manager
  connectionManager.updateState(sock);
}

// ============================================
// FIX #6: Health Check System
// ============================================

class HealthChecker {
  constructor() {
    this.lastPing = Date.now();
    this.lastPong = Date.now();
    this.failedPings = 0;
  }
  
  async performHealthCheck(sock) {
    try {
      if (!sock || !sock.ws || sock.ws.readyState !== 1) {
        this.failedPings++;
        return false;
      }
      
      // Send presence as a ping
      this.lastPing = Date.now();
      await sock.sendPresenceUpdate('available');
      this.lastPong = Date.now();
      this.failedPings = 0;
      
      return true;
      
    } catch (err) {
      this.failedPings++;
      console.log(`⚠️ Health check failed: ${err.message}`);
      return false;
    }
  }
  
  isHealthy() {
    const timeSinceLastPong = Date.now() - this.lastPong;
    return this.failedPings < 3 && timeSinceLastPong < 60000;
  }
}

const healthChecker = new HealthChecker();

// Run health check every 30 seconds
setInterval(async () => {
  const healthy = await healthChecker.performHealthCheck(sock);
  
  if (!healthy && healthChecker.failedPings >= 3) {
    console.error('🛑 Health check critical failure, forcing reconnect');
    if (sock && sock.ws) {
      sock.ws.close();
    }
  }
}, 30000);

// ============================================
// FIX #7: Event Listener Cleanup
// ============================================

class EventListenerManager {
  constructor() {
    this.listeners = new Map();
  }
  
  register(emitter, event, handler, name) {
    // Remove old listener if exists
    if (this.listeners.has(name)) {
      const old = this.listeners.get(name);
      old.emitter.off(old.event, old.handler);
    }
    
    // Add new listener
    emitter.on(event, handler);
    this.listeners.set(name, { emitter, event, handler });
  }
  
  cleanup() {
    for (const [name, listener] of this.listeners) {
      try {
        listener.emitter.off(listener.event, listener.handler);
      } catch (err) {
        console.log(`⚠️ Error removing listener ${name}:`, err.message);
      }
    }
    this.listeners.clear();
  }
}

const listenerManager = new EventListenerManager();

// Usage in initSocket:
async function initSocket() {
  // ... existing code ...
  
  // Register listeners through manager
  const messageHandler = async ({ messages }) => {
    // ... your message handling code ...
  };
  
  listenerManager.register(sock.ev, 'messages.upsert', messageHandler, 'messages');
  
  // On disconnect, cleanup
  sock.ev.on('connection.update', (update) => {
    if (update.connection === 'close') {
      listenerManager.cleanup();
    }
  });
}

// ============================================
// FIX #8: Group Metadata with Timeout
// ============================================

async function getGroupMetadataSafe(sock, chatId, cache) {
  // Check cache first
  const cached = cache?.get(chatId);
  if (cached) return cached;
  
  try {
    // Fetch with timeout
    const metadata = await Promise.race([
      sock.groupMetadata(chatId),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Metadata fetch timeout')), 5000)
      )
    ]);
    
    // Cache the result
    if (cache) {
      cache.set(chatId, metadata);
    }
    
    return metadata;
    
  } catch (err) {
    console.log(`⚠️ Failed to get metadata for ${chatId}: ${err.message}`);
    
    // Return minimal fallback
    return {
      id: chatId,
      subject: 'Unknown Group',
      participants: [],
      desc: '',
      creation: Date.now()
    };
  }
}

// ============================================
// HOW TO IMPLEMENT THESE FIXES
// ============================================

/*
1. Add these functions to your engine.js file (before startBot function)

2. Replace all instances of:
   sock.sendMessage(chatId, content, options)
   
   With:
   await safeSendMessage(sock, chatId, content, options)

3. In combat-related files, replace message sends with:
   await sendCombatMessage(sock, chatId, content, options)

4. In initSocket(), add:
   - ConnectionManager initialization
   - MessageQueue initialization
   - HealthChecker initialization
   - EventListenerManager for cleanup

5. Update the connection.update handler:
   sock.ev.on('connection.update', async (update) => {
     const { connection, lastDisconnect } = update;
     
     connectionManager.updateState(sock);
     
     if (connection === 'open') {
       console.log("✅ WhatsApp connected");
       reconnectAttempts = 0; // Reset counter
       await clearPendingOperations();
       
       // Wait for connection to stabilize
       await new Promise(resolve => setTimeout(resolve, 2000));
     }
     
     if (connection === 'close') {
       const statusCode = lastDisconnect?.error?.output?.statusCode;
       console.log(`🔻 Connection closed. Status code: ${statusCode}`);
       
       listenerManager.cleanup();
       await handleReconnection(sock, lastDisconnect?.error);
     }
   });

6. Test thoroughly before deploying to production!
*/

module.exports = {
  safeSendMessage,
  ConnectionManager,
  MessageQueue,
  sendCombatMessage,
  clearPendingOperations,
  HealthChecker,
  EventListenerManager,
  getGroupMetadataSafe
};