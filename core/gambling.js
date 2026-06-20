const fs = require('fs');
const botConfig = require('../botConfig');

// ============================================
// GAMBLING SYSTEM - 6 Different Games
// ============================================

const getZENI = () => botConfig.getCurrency().symbol;

const GLOBAL_MAX_BET = 500000; // 500k max bet to protect economy
const GLOBAL_MIN_BET = 50;   // 50 min bet

// Active game states
const activeBlackjackGames = new Map();
const activeCrashGames = new Map();
const activeMinesGames = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================

// Coerce a bet amount to a finite positive integer. Returns null if invalid.
// All gambling entry points should call this BEFORE doing any wallet math —
// otherwise a non-numeric input (string, NaN, undefined) slips past the
// `amount < GLOBAL_MIN_BET` check (NaN < x is always false) and then
// `user.wallet -= amount` produces NaN, permanently corrupting the wallet.
function normalizeBet(amount) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function updateGamblingStats(userId, amount, won, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return;
  
  // Initialize stats if they don't exist
  if (!user.stats) user.stats = {};
  if (user.stats.totalGambled === undefined) user.stats.totalGambled = 0;
  if (user.stats.gamesWon === undefined) user.stats.gamesWon = 0;
  if (user.stats.gamesLost === undefined) user.stats.gamesLost = 0;
  if (user.stats.biggestWin === undefined) user.stats.biggestWin = 0;
  if (user.stats.biggestLoss === undefined) user.stats.biggestLoss = 0;

  user.stats.totalGambled += amount;
  
  if (won) {
    user.stats.gamesWon++;
    if (amount > user.stats.biggestWin) {
      user.stats.biggestWin = amount;
    }
  } else {
    user.stats.gamesLost++;
    if (amount > user.stats.biggestLoss) {
      user.stats.biggestLoss = amount;
    }
  }
  
  economyModule.saveUser(userId);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureGamblingProfile(user) {
  if (!user.gamblingProfile) {
    user.gamblingProfile = {
      dayKey: getTodayKey(),
      roundsToday: 0,
      entryWalletToday: user.wallet || 0,
      withdrawnToday: 0,
      netToday: 0
    };
  }

  const today = getTodayKey();
  if (user.gamblingProfile.dayKey !== today) {
    user.gamblingProfile.dayKey = today;
    user.gamblingProfile.roundsToday = 0;
    user.gamblingProfile.entryWalletToday = user.wallet || 0;
    user.gamblingProfile.withdrawnToday = 0;
    user.gamblingProfile.netToday = 0;
  }
}

const DAILY_PROFIT_LIMIT = 2000000; // 2 Million Zeni daily net profit limit

function beginGamblingRound(user) {
  ensureGamblingProfile(user);
  user.gamblingProfile.roundsToday = (user.gamblingProfile.roundsToday || 0) + 1;

  const rounds = user.gamblingProfile.roundsToday;
  const edge = Math.min(0.03 + rounds * 0.001, 0.10); // Start at 3%, max 10%
  let forcedLossChance = Math.min(Math.max((rounds - 20) * 0.005, 0), 0.10); // Starts after 20 rounds, max 10%

  if (user.wallet >= getDailyWalletCap(user)) {
    forcedLossChance = 1.0;
  }

  return { rounds, edge, forcedLossChance };
}

function getDailyWalletCap(user) {
  ensureGamblingProfile(user);
  const entry = user.gamblingProfile.entryWalletToday || 0;
  const withdrawn = user.gamblingProfile.withdrawnToday || 0;
  return entry + withdrawn;
}

function maybeForceLoss(ctx) {
  return Math.random() < ctx.forcedLossChance;
}

function capPayoutByDailyLimit(user, payoutAmount) {
  ensureGamblingProfile(user);
  const net = user.gamblingProfile.netToday || 0;
  
  if (net >= DAILY_PROFIT_LIMIT) {
    return 0; // Daily profit cap reached
  }
  
  const room = DAILY_PROFIT_LIMIT - net;
  return Math.min(Math.floor(payoutAmount), room);
}

function applyEdgeToAmount(amount, ctx) {
  return Math.max(0, Math.floor(amount * (1 - ctx.edge)));
}

function trackDailyNet(user, delta) {
  ensureGamblingProfile(user);
  user.gamblingProfile.netToday = (user.gamblingProfile.netToday || 0) + delta;
}

// ============================================
// 1. COINFLIP - Bet on heads or tails
// ============================================

function coinflip(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer. Without this, a
  // non-numeric `amount` would slip past the `amount < GLOBAL_MIN_BET` check
  // (NaN < x is always false) and then `user.wallet -= amount` would
  // produce NaN, permanently corrupting the wallet.
  const bet = normalizeBet(amount);
  if (bet === null) {
    return { success: false, message: `❌ Invalid bet amount!` };
  }
  amount = bet;

  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet.toLocaleString()}!` };
  }
  
  const normalizedChoice = choice.toLowerCase();
  if (!['heads', 'tails', 'h', 't'].includes(normalizedChoice)) {
    return { success: false, message: "❌ Choose 'heads' or 'tails'!" };
  }
  
  const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const ctx = beginGamblingRound(user);
  const won = userChoice === result && !maybeForceLoss(ctx);
  
  const coinVisual = `🪙 *COINFLIP* 🪙
━━━━━━━━━━━━━━━
╔═══════════════╗
║  Choice: *${userChoice.toUpperCase()}*
║  Result: *${result.toUpperCase()}*
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, `Coinflip Won (Refunded/Daily Cap)`, 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${coinVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Coinflip Won (${userChoice})`, gain, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `${coinVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🎉 *YOU WON!* 🎉
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Coinflip Lost (${userChoice})`, -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `${coinVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *YOU LOST!* 😢
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 2. DICE ROLL - Beat the dealer
// ============================================

function diceRoll(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet.toLocaleString()}!` };
  }
  
  const playerRoll = Math.floor(Math.random() * 6) + 1;
  let dealerRoll = Math.floor(Math.random() * 6) + 1;
  const ctx = beginGamblingRound(user);
  
  // --- LUCK FACTOR: 15% chance to reduce dealer's roll ---
  if (Math.random() < 0.15 && dealerRoll > 1) {
    dealerRoll--;
  }
  
  const diceVisual = `🎲 *DICE ROLL* 🎲
━━━━━━━━━━━━━━━
╔═══════════════╗
║  Your Roll: *${playerRoll}* 🎲
║  Dealer's: *${dealerRoll}* 🎲
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (playerRoll === dealerRoll) {
    economyModule.logTransaction(userId, "Dice Roll (Tie)", 0, user.wallet);
    return {
      success: true,
      won: null,
      message: `${diceVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🤝 *IT'S A TIE!* 🤝
🔄 *Refunded:* ${getZENI()}${amount.toLocaleString()}

💰 *Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  const won = playerRoll > dealerRoll && !maybeForceLoss(ctx);
  const winnings = amount;
  
  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(winnings, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Dice Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${diceVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, "Dice Roll Won", gain, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `${diceVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🎉 *YOU WON!* 🎉
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Dice Roll Lost", -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `${diceVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *YOU LOST!* 😢
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 3. SLOTS - Classic slot machine
// ============================================

function slots(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }
  
  const symbols = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣'];
  // Adjusted weights to make winning harder
  const weights = [25, 25, 20, 15, 10, 5];
  
  function getSymbol() {
    const total = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * total;
    
    for (let i = 0; i < symbols.length; i++) {
      if (random < weights[i]) return symbols[i];
      random -= weights[i];
    }
    return symbols[0];
  }
  
  const reel1 = getSymbol();
  const reel2 = getSymbol();
  const reel3 = getSymbol();
  const ctx = beginGamblingRound(user);
  
  let multiplier = 0;
  let result = '';
  
  if (reel1 === reel2 && reel2 === reel3) {
    const symbolMultipliers = {
      '🍒': 5,
      '🍋': 10,
      '🍊': 15,
      '🍇': 25,
      '💎': 50,
      '7️⃣': 100
    };
    multiplier = symbolMultipliers[reel1] || 5;
    result = 'JACKPOT';
  } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
    multiplier = 1.2; // Reduced from 2.5x to 1.2x
    result = 'SMALL WIN';
  } else {
    multiplier = 0;
    result = 'LOSS';
  }
  
  const winnings = Math.floor(amount * multiplier);
  const profit = winnings - amount;
  const won = profit > 0 && !maybeForceLoss(ctx);
  
  const reelVisual = `🎰 *SLOT MACHINE* 🎰
━━━━━━━━━━━━━━━
╔═══════════════╗
║   ${reel1}  ${reel2}  ${reel3}   ║
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(profit, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Slots Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${reelVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    user.stats.totalEarned += gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Slots Won (${result})`, gain, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `${reelVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

${result === 'JACKPOT' ? '🎊 *CONGRATULATIONS! JACKPOT!* 🎊' : '🎉 *CONGRATULATIONS! YOU WIN!* 🎉'}
📈 *Payout:* ${multiplier}x (+${getZENI()}${gain.toLocaleString()})

💰 *New Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Slots Lost", -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `${reelVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *NO MATCH! BETTER LUCK NEXT TIME!* 😢
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// BLACKJACK HELPERS
// ============================================

function createDeck() {
  const suits = ['♠️', '♥️', '♣️', '♦️'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

function getCardValue(card) {
  if (card.rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank);
}

function calculateHandValue(hand) {
  let value = 0;
  let aces = 0;
  
  for (const card of hand) {
    const cardVal = getCardValue(card);
    value += cardVal;
    if (card.rank === 'A') aces++;
  }
  
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  
  return value;
}

function formatHand(hand, hideFirst = false) {
  if (hideFirst) {
    return `[🂠 Hidden] ${hand.slice(1).map(c => `[${c.rank}${c.suit}]`).join(' ')}`;
  }
  return hand.map(c => `[${c.rank}${c.suit}]`).join(' ');
}

// ============================================
// 4. BLACKJACK - Classic 21
// ============================================

function startBlackjack(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }
  
  if (activeBlackjackGames.has(userId)) {
    return { success: false, message: `❌ You already have an active blackjack game! Type '${botConfig.getPrefix()} bj hit' or '${botConfig.getPrefix()} bj stand'` };
  }
  
  user.wallet -= amount;
  const ctx = beginGamblingRound(user);
  economyModule.logTransaction(userId, "Blackjack Bet", -amount, user.wallet);
  economyModule.saveUser(userId);
  
  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  
  const playerValue = calculateHandValue(playerHand);
  
  if (playerValue === 21) {
    const rawPayout = Math.floor(amount * 2.5);
    const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
    let payout = capPayoutByDailyLimit(user, adjustedPayout);
    if (payout < amount) {
      payout = amount; // Refund bet on cap
    }
    const profit = payout - amount;

    user.wallet += payout;
    if (!user.stats) user.stats = {};
    if (profit > 0) {
      user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
      trackDailyNet(user, profit);
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Blackjack Win (Natural)", profit, user.wallet);
    } else {
      economyModule.logTransaction(userId, "Blackjack Natural Capped (Refunded)", 0, user.wallet);
    }
    economyModule.saveUser(userId);

    return {
      success: true,
      won: true,
      message: `♠️ *BLACKJACK!* ♠️

Your hand: ${formatHand(playerHand)}
Value: ${playerValue}

🃏 *NATURAL BLACKJACK!* 🃏
${profit > 0 ? `🎉 *CONGRATULATIONS!* 🎉\n+${getZENI()}${profit.toLocaleString()} (3:2 payout)` : `⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)`}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  activeBlackjackGames.set(userId, {
    deck,
    playerHand,
    dealerHand,
    bet: amount,
    roundCtx: ctx
  });
  
  return {
    success: true,
    gameStarted: true,
    message: `♠️ *BLACKJACK* ♠️

Hand: ${formatHand(playerHand)}
Val: ${playerValue}

Deal: ${formatHand(dealerHand, true)}

━━━━━━━━━━━━━━━
Type:
  ${botConfig.getPrefix()} bj hit
  ${botConfig.getPrefix()} bj stand
  ${botConfig.getPrefix()} bj double`
  };
}

function blackjackHit(userId, economyModule) {
  if (!activeBlackjackGames.has(userId)) {
    return { success: false, message: `❌ No active blackjack game! Start one with '${botConfig.getPrefix()} bj <amount>'` };
  }
  
  const game = activeBlackjackGames.get(userId);
  const card = game.deck.pop();
  game.playerHand.push(card);
  
  const playerValue = calculateHandValue(game.playerHand);
  
  if (playerValue > 21) {
    activeBlackjackGames.delete(userId);
    const user = economyModule.getUser(userId);
    user.stats.totalSpent += game.bet;
    trackDailyNet(user, -game.bet);
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Blackjack Lost (Bust)", 0, user.wallet);
    economyModule.saveUser(userId);
    
    return {
      success: true,
      won: false,
      message: `♠️ *BLACKJACK* ♠️

Hand: ${formatHand(game.playerHand)}
Value: ${playerValue}

💥 *BUST!* 💥
You went over 21!

-${getZENI()}${game.bet.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  return {
    success: true,
    continue: true,
    message: `♠️ *BLACKJACK* ♠️

Your hand: ${formatHand(game.playerHand)}
Value: ${playerValue}

Dealer: ${formatHand(game.dealerHand, true)}

━━━━━━━━━━━━━━━━
${botConfig.getPrefix()} bj hit - Get another card
${botConfig.getPrefix()} bj stand - Keep current hand`
  };
}

function blackjackStand(userId, economyModule) {
  if (!activeBlackjackGames.has(userId)) {
    return { success: false, message: `❌ No active blackjack game! Start one with '${botConfig.getPrefix()} bj <amount>'` };
  }
  
  const game = activeBlackjackGames.get(userId);
  const user = economyModule.getUser(userId);
  
  while (calculateHandValue(game.dealerHand) < 17) {
    game.dealerHand.push(game.deck.pop());
  }
  
  const playerValue = calculateHandValue(game.playerHand);
  const dealerValue = calculateHandValue(game.dealerHand);
  const ctx = game.roundCtx || { edge: 0, forcedLossChance: 0 };
  
  activeBlackjackGames.delete(userId);
  
  let result = '';
  let won = false;
  let profit = 0;
  let payout = 0;
  
  if (dealerValue > 21) {
    won = true;
    const rawPayout = game.bet * 2;
    const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
    payout = capPayoutByDailyLimit(user, adjustedPayout);
    if (payout < game.bet) {
      payout = game.bet; // Refund bet on cap
    }
    profit = payout - game.bet;
    user.wallet += payout;
    result = '🎉 DEALER BUST! YOU WIN! 🎉';
  } else if (playerValue > dealerValue) {
    won = true;
    const rawPayout = game.bet * 2;
    const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
    payout = capPayoutByDailyLimit(user, adjustedPayout);
    if (payout < game.bet) {
      payout = game.bet; // Refund bet on cap
    }
    profit = payout - game.bet;
    user.wallet += payout;
    result = '🎉 YOU WIN! 🎉';
  } else if (playerValue === dealerValue) {
    payout = game.bet;
    user.wallet += payout;
    result = '🤝 PUSH (TIE) 🤝\nBet returned';
    economyModule.logTransaction(userId, "Blackjack Push", payout, user.wallet);
    economyModule.saveUser(userId);
    return {
      success: true,
      won: null,
      message: `♠️ *BLACKJACK* ♠️

Your hand: ${formatHand(game.playerHand)}
Value: ${playerValue}

Dealer: ${formatHand(game.dealerHand)}
Value: ${dealerValue}

${result}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    won = false;
    result = '😢 DEALER WINS! 😢';
    profit = -game.bet;
    payout = 0;
  }
  
  if (won) {
    if (profit > 0) {
      user.stats.totalEarned += profit;
      trackDailyNet(user, profit);
      updateGamblingStats(userId, game.bet, true, economyModule);
      economyModule.logTransaction(userId, "Blackjack Win", profit, user.wallet);
    } else {
      updateGamblingStats(userId, game.bet, true, economyModule);
      economyModule.logTransaction(userId, "Blackjack Win (Refunded/Daily Cap)", 0, user.wallet);
    }
  } else {
    user.stats.totalSpent += game.bet;
    trackDailyNet(user, -game.bet);
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Blackjack Loss", 0, user.wallet);
  }
  
  economyModule.saveUser(userId);
  
  return {
    success: true,
    won,
    message: `♠️ *BLACKJACK* ♠️

Your hand: ${formatHand(game.playerHand)}
Value: ${playerValue}

Dealer: ${formatHand(game.dealerHand)}
Value: ${dealerValue}

${result}
${won ? (profit > 0 ? `+${getZENI()}${profit.toLocaleString()}` : `⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${game.bet.toLocaleString()} (No loss, no gain)`) : `-${getZENI()}${Math.abs(profit).toLocaleString()}`}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

function blackjackDouble(userId, economyModule) {
  if (!activeBlackjackGames.has(userId)) {
    return { success: false, message: "❌ No active blackjack game!" };
  }
  
  const game = activeBlackjackGames.get(userId);
  const user = economyModule.getUser(userId);
  
  if (game.playerHand.length !== 2) {
    return { success: false, message: "❌ Can only double on first move!" };
  }
  
  if (user.wallet < game.bet) {
    return { success: false, message: `❌ Need ${getZENI()}${game.bet} to double!` };
  }
  
  user.wallet -= game.bet;
  economyModule.logTransaction(userId, "Blackjack Double Bet", -game.bet, user.wallet);
  game.bet *= 2;
  economyModule.saveUser(userId);
  
  const card = game.deck.pop();
  game.playerHand.push(card);
  const playerValue = calculateHandValue(game.playerHand);
  
  if (playerValue > 21) {
    activeBlackjackGames.delete(userId);
    user.stats.totalSpent += game.bet;
    trackDailyNet(user, -game.bet);
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Blackjack Lost (Bust on Double)", 0, user.wallet);
    economyModule.saveUser(userId);
    
    return {
      success: true,
      won: false,
      message: `♠️ *BLACKJACK* ♠️

DOUBLED!
Your hand: ${formatHand(game.playerHand)}
Value: ${playerValue}

💥 *BUST!* 💥

-${getZENI()}${game.bet.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  return blackjackStand(userId, economyModule);
}

// ============================================
// 5. ROULETTE - Bet on colors or numbers
// ============================================

function roulette(userId, amount, bet, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  // 1. Parse and Validate Bet First!
  const betLower = bet.toLowerCase();
  let multiplier = 0;
  let betType = '';
  let checkValid = false;
  
  if (betLower === 'red' || betLower === 'r') {
    multiplier = 2;
    betType = '🔴 RED';
    checkValid = true;
  } else if (betLower === 'black' || betLower === 'b') {
    multiplier = 2;
    betType = '⚫ BLACK';
    checkValid = true;
  } else if (betLower === 'green' || betLower === 'g' || betLower === '0') {
    multiplier = 36;
    betType = '🟢 GREEN (0)';
    checkValid = true;
  } else if (betLower === 'even' || betLower === 'e') {
    multiplier = 2;
    betType = '🔢 EVEN';
    checkValid = true;
  } else if (betLower === 'odd' || betLower === 'o') {
    multiplier = 2;
    betType = '🔢 ODD';
    checkValid = true;
  } else {
    const num = parseInt(betLower);
    if (!isNaN(num) && num >= 0 && num <= 36) {
      multiplier = 36;
      betType = `🎯 NUMBER ${num}`;
      checkValid = true;
    }
  }

  if (!checkValid) {
    return { success: false, message: "❌ Invalid bet! Use: red/black/green/even/odd or a number (0-36)" };
  }

  // 2. Standard Bet Limits Checks
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }

  // --- LIMIT CHECK (20 spins / 10 hours) ---
  if (!user.gamblingLimits) user.gamblingLimits = {};
  if (!user.gamblingLimits.roulette) user.gamblingLimits.roulette = { count: 0, startTime: 0 };
  
  const now = Date.now();
  const LIMIT_WINDOW = 10 * 60 * 60 * 1000; // 10 hours
  const MAX_SPINS = 20;
  
  // Initialize start time if new cycle
  if (user.gamblingLimits.roulette.startTime === 0) {
      user.gamblingLimits.roulette.startTime = now;
  }

  // Reset if window passed
  if (now - user.gamblingLimits.roulette.startTime > LIMIT_WINDOW) {
    user.gamblingLimits.roulette.count = 0;
    user.gamblingLimits.roulette.startTime = now;
  }
  
  // Check count
  if (user.gamblingLimits.roulette.count >= MAX_SPINS) {
    const remainingTime = LIMIT_WINDOW - (now - user.gamblingLimits.roulette.startTime);
    const hours = Math.floor(remainingTime / (1000 * 60 * 60));
    const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
    
    return { success: false, message: `⏳ *ROULETTE LIMIT REACHED* ⏳\n\nYou've used your ${MAX_SPINS} spins for this cycle.\nCooldown: ${hours}h ${minutes}m.` };
  }

  // Increment usage count ONLY now!
  user.gamblingLimits.roulette.count++;
  economyModule.saveUser(userId);
  
  // Deduct bet IMMEDIATELY
  user.wallet -= amount;
  const ctx = beginGamblingRound(user);
  
  const result = Math.floor(Math.random() * 37); // 0-36
  const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const isRed = redNumbers.includes(result);
  const color = result === 0 ? 'green' : (isRed ? 'red' : 'black');
  
  let won = false;
  if (betLower === 'red' || betLower === 'r') {
    won = color === 'red' && !maybeForceLoss(ctx);
  } else if (betLower === 'black' || betLower === 'b') {
    won = color === 'black' && !maybeForceLoss(ctx);
  } else if (betLower === 'green' || betLower === 'g' || betLower === '0') {
    won = result === 0 && !maybeForceLoss(ctx);
  } else if (betLower === 'even' || betLower === 'e') {
    won = result !== 0 && result % 2 === 0 && !maybeForceLoss(ctx);
  } else if (betLower === 'odd' || betLower === 'o') {
    won = result !== 0 && result % 2 !== 0 && !maybeForceLoss(ctx);
  } else {
    const num = parseInt(betLower);
    won = result === num && !maybeForceLoss(ctx);
  }
  
  // Generate a simulated spin history to wow the user (dynamic UI!)
  const history = [];
  for (let i = 0; i < 4; i++) {
    const r = Math.floor(Math.random() * 37);
    const c = r === 0 ? '🟢' : (redNumbers.includes(r) ? '🔴' : '⚫');
    history.push(`${c} ${r}`);
  }
  const colorEmoji = color === 'green' ? '🟢' : (color === 'red' ? '🔴' : '⚫');
  const spinVisual = `🎰 *Spinning:*  ${history.join('  ➔  ')}  ➔  🌟 *[ ${colorEmoji} ${result} ]* 🌟`;

  if (won) {
    const rawPayout = Math.floor(amount * multiplier);
    const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
    let payout = capPayoutByDailyLimit(user, adjustedPayout);
    if (payout < amount) {
      payout = amount; // Refund the bet if profit cap is hit
    }
    const profit = payout - amount;
    user.wallet += payout;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
    trackDailyNet(user, profit);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Roulette Won (${betType})`, profit, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🎡 *ROULETTE WHEEL* 🎡
━━━━━━━━━━━━━━━
${spinVisual}
━━━━━━━━━━━━━━━

👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${betType} (${getZENI()}${amount.toLocaleString()})

🎰 *Result:* ${colorEmoji} *${result}* (${color.toUpperCase()})

🎉 *CONGRATULATIONS! YOU WON!* 🎉
📈 *Payout:* ${multiplier}x (+${getZENI()}${profit.toLocaleString()})

💰 *New Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.stats.totalSpent += amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Roulette Lost (${betType})`, -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🎡 *ROULETTE WHEEL* 🎡
━━━━━━━━━━━━━━━
${spinVisual}
━━━━━━━━━━━━━━━

👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${betType} (${getZENI()}${amount.toLocaleString()})

🎰 *Result:* ${colorEmoji} *${result}* (${color.toUpperCase()})

😢 *YOU LOST! BETTER LUCK NEXT TIME!* 😢
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 6. CRASH - Multiplier game

function crash(userId, amount, multiplierStr, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet.toLocaleString()}!` };
  }

  if (!multiplierStr) {
    return { success: false, message: `❌ Usage: \`${botConfig.getPrefix()} crash <amount> <multiplier>\`\nExample: \`${botConfig.getPrefix()} crash 100 2.5\`` };
  }

  const targetMultiplier = parseFloat(multiplierStr);
  if (isNaN(targetMultiplier) || targetMultiplier <= 1.0) {
    return { success: false, message: "❌ Invalid target multiplier! Must be greater than 1.00 (e.g. 1.5, 2.0)" };
  }

  if (targetMultiplier > 1000) {
    return { success: false, message: "❌ Maximum target multiplier is 1,000x!" };
  }

  const ctx = beginGamblingRound(user);

  // Generate crash point with realistic house odds
  let crashPoint;
  const rand = Math.random();
  if (rand < 0.03) {
    crashPoint = 1.00;
  } else if (rand < 0.50) {
    crashPoint = 1.01 + Math.random() * 0.49;
  } else if (rand < 0.80) {
    crashPoint = 1.5 + Math.random() * 1.5;
  } else {
    crashPoint = 3.0 + Math.pow(Math.random(), 2) * 47.0;
  }
  crashPoint = Math.round(crashPoint * 100) / 100;

  // Force loss check if active
  const forcedLoss = maybeForceLoss(ctx);
  
  // Player wins if the crash point is greater than or equal to their target multiplier, and not a forced loss
  const won = !forcedLoss && (crashPoint >= targetMultiplier);

  const rawPayout = won ? Math.floor(amount * targetMultiplier) : 0;
  const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
  let winnings = won ? capPayoutByDailyLimit(user, adjustedPayout) : 0;
  
  if (won && winnings < amount) {
    winnings = amount; // Refund bet on cap
  }
  const profit = winnings - amount;

  // Apply money transaction
  user.wallet = user.wallet - amount + winnings;

  if (!user.stats) user.stats = {};
  
  if (won) {
    if (profit > 0) {
      user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
      trackDailyNet(user, profit);
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, `Crash Won (${targetMultiplier}x)`, profit, user.wallet);
    } else {
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, `Crash Refund (Daily Cap)`, 0, user.wallet);
    }
  } else {
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Crash Lost (${targetMultiplier}x target)`, -amount, user.wallet);
  }

  economyModule.saveUser(userId);

  const crashVisual = `🚀 *CRASH MULTIPLIER* 🚀
━━━━━━━━━━━━━━━
📈 *Target Multiplier:* ${targetMultiplier.toFixed(2)}x
💥 *Crashed At:* ${crashPoint.toFixed(2)}x
━━━━━━━━━━━━━━━`;

  let outcomeMessage = '';
  if (won) {
    if (profit > 0) {
      outcomeMessage = `🎉 *SUCCESSFUL CASH OUT!* 🎉\n📈 *Multiplier:* ${targetMultiplier.toFixed(2)}x\n💵 *Payout:* ${getZENI()}${winnings.toLocaleString()}\n🏆 *Net Profit:* +${getZENI()}${profit.toLocaleString()}\n\n📈 _The rocket was flying high and crashed later at ${crashPoint.toFixed(2)}x!_`;
    } else {
      outcomeMessage = `🎉 *SUCCESSFUL CASH OUT!* 🎉\n⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)`;
    }
  } else {
    outcomeMessage = `💥 *BOOM! CRASHED!* 💥\n😢 _The rocket crashed at ${crashPoint.toFixed(2)}x before reaching your ${targetMultiplier.toFixed(2)}x target!_\n📉 *Loss:* -${getZENI()}${amount.toLocaleString()}`;
  }

  return {
    success: true,
    won: won,
    message: `${crashVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

${outcomeMessage}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}




// ============================================
// 13. MINES - 5x5 Grid with hidden mines
// ============================================

function renderMinesGrid(game, showAll = false, explodedIdx = null) {
  let gridDisplay = "╔═══════════════════╗\n";
  for (let i = 0; i < 25; i++) {
    if (i % 5 === 0) gridDisplay += "║  ";
    
    if (explodedIdx !== null && i === explodedIdx) {
      gridDisplay += "💥  ";
    } else if (game.grid[i]) {
      if (showAll) {
        gridDisplay += "💣  ";
      } else {
        gridDisplay += "⬜  ";
      }
    } else {
      if (game.revealed.includes(i)) {
        gridDisplay += "💎  ";
      } else if (showAll) {
        gridDisplay += "🟢  ";
      } else {
        gridDisplay += "⬜  ";
      }
    }
    
    if (i % 5 === 4) gridDisplay += "║\n";
  }
  gridDisplay += "╚═══════════════════╝";
  return gridDisplay;
}

function startMines(userId, amount, mineCount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };
  
  const mines = parseInt(mineCount);
  if (isNaN(mines) || mines < 1 || mines > 20) {
    return { success: false, message: "❌ Choose between 1-20 mines!" };
  }

  if (activeMinesGames.has(userId)) {
    return { success: false, message: "❌ Finish your current Mines game first!" };
  }

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);
  economyModule.logTransaction(userId, "Mines Bet", -amount, user.wallet);
  economyModule.saveUser(userId);

  // Create grid
  const grid = new Array(25).fill(false); // false = safe
  let placed = 0;
  while (placed < mines) {
    const idx = Math.floor(Math.random() * 25);
    if (!grid[idx]) {
      grid[idx] = true;
      placed++;
    }
  }

  const game = {
    bet: amount,
    mineCount: mines,
    grid: grid,
    revealed: [],
    multiplier: 1.0,
    roundCtx: ctx
  };

  activeMinesGames.set(userId, game);

  const gridVisual = renderMinesGrid(game, false);

  return {
    success: true,
    message: `💣 *MINES GAME* 💣
━━━━━━━━━━━━━━━
${gridVisual}
━━━━━━━━━━━━━━━
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟 *Bet:* ${getZENI()}${amount.toLocaleString()}
💣 *Mines:* ${mines}
📈 *Multiplier:* 1.00x
━━━━━━━━━━━━━━━
💡 *Commands:*
• \`${botConfig.getPrefix()} mines pick <1-25>\`
• \`${botConfig.getPrefix()} mines out\` (cashout)`
  };
}

function minesPick(userId, cellIndex, economyModule) {
  if (!activeMinesGames.has(userId)) {
    return { success: false, message: "❌ No active Mines game!" };
  }

  const game = activeMinesGames.get(userId);
  const idx = parseInt(cellIndex) - 1;

  if (isNaN(idx) || idx < 0 || idx > 24) {
    return { success: false, message: "❌ Choose a cell between 1-25!" };
  }

  if (game.revealed.includes(idx)) {
    return { success: false, message: "❌ Cell already revealed!" };
  }

  const user = economyModule.getUser(userId);

  // HIT A MINE!
  if (game.grid[idx]) {
    activeMinesGames.delete(userId);
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + game.bet;
    trackDailyNet(user, -game.bet);
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Mines Lost (Hit Mine)", 0, user.wallet);
    economyModule.saveUser(userId);

    const gridVisual = renderMinesGrid(game, true, idx);

    return {
      success: true,
      won: false,
      message: `💥 *BOOM! EXPLODED!* 💥
━━━━━━━━━━━━━━━
${gridVisual}
━━━━━━━━━━━━━━━
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${game.bet.toLocaleString()}

😢 *YOU HIT A MINE AT CELL ${cellIndex}!*
📉 *Loss:* -${getZENI()}${game.bet.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }

  // SAFE!
  game.revealed.push(idx);
  
  // Calculate new multiplier
  const n = 25;
  const m = game.mineCount;
  const r = game.revealed.length;
  
  function combination(n, k) { 
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    if (k > n / 2) k = n - k;
    let res = 1;
    for (let i = 1; i <= k; i++) res = res * (n - i + 1) / i;
    return res;
  }

  const prob = combination(n - m, r) / combination(n, r);
  game.multiplier = Math.round((0.97 / prob) * 100) / 100; // 3% house edge

  const gridVisual = renderMinesGrid(game, false);

  return {
    success: true,
    message: `💎 *SAFE DIG!* 💎
━━━━━━━━━━━━━━━
${gridVisual}
━━━━━━━━━━━━━━━
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Bet:* ${getZENI()}${game.bet.toLocaleString()}
📈 *Multiplier:* ${game.multiplier}x
💵 *Current Value:* ${getZENI()}${Math.floor(game.bet * game.multiplier).toLocaleString()}
━━━━━━━━━━━━━━━
💡 *Commands:*
• \`${botConfig.getPrefix()} mines pick <1-25>\`
• \`${botConfig.getPrefix()} mines out\` (cashout)`
  };
}

function minesCashOut(userId, economyModule) {
  if (!activeMinesGames.has(userId)) {
    return { success: false, message: "❌ No active Mines game!" };
  }

  const game = activeMinesGames.get(userId);
  if (game.revealed.length === 0) {
    return { success: false, message: "❌ Pick at least one cell before cashing out!" };
  }

  const user = economyModule.getUser(userId);
  const rawPayout = Math.floor(game.bet * game.multiplier);
  const adjustedPayout = applyEdgeToAmount(rawPayout, game.roundCtx || { edge: 0, forcedLossChance: 0 });
  let winnings = capPayoutByDailyLimit(user, adjustedPayout);
  if (winnings < game.bet) {
    winnings = game.bet; // Refund bet on cap
  }
  const profit = winnings - game.bet;

  user.wallet += winnings;
  if (!user.stats) user.stats = {};
  if (profit > 0) {
    user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
    trackDailyNet(user, profit);
    updateGamblingStats(userId, game.bet, true, economyModule);
    economyModule.logTransaction(userId, `Mines Won (${game.multiplier}x)`, profit, user.wallet);
  } else {
    updateGamblingStats(userId, game.bet, true, economyModule);
    economyModule.logTransaction(userId, `Mines Refund (Daily Cap)`, 0, user.wallet);
  }
  
  activeMinesGames.delete(userId);
  economyModule.saveUser(userId);

  const gridVisual = renderMinesGrid(game, true);

  let outcomeMessage = '';
  if (profit > 0) {
    outcomeMessage = `🎉 *YOU WON!* 🎉\n📈 *Multiplier:* ${game.multiplier}x\n💵 *Payout:* ${getZENI()}${winnings.toLocaleString()}\n🏆 *Net Profit:* +${getZENI()}${profit.toLocaleString()}`;
  } else {
    outcomeMessage = `🎉 *YOU WON!* 🎉\n⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${game.bet.toLocaleString()} (No loss, no gain)`;
  }

  return {
    success: true,
    message: `💰 *CASHED OUT!* 💰
━━━━━━━━━━━━━━━
${gridVisual}
━━━━━━━━━━━━━━━
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${game.bet.toLocaleString()}

${outcomeMessage}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 8. HORSE RACE - Bet on a horse
// ============================================

function horseRace(userId, amount, horseNum, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const horse = parseInt(horseNum);
  if (isNaN(horse) || horse < 1 || horse > 5) {
    return { success: false, message: "❌ Choose a horse between 1-5!" };
  }

  const winner = Math.floor(Math.random() * 5) + 1;
  const ctx = beginGamblingRound(user);
  const won = horse === winner && !maybeForceLoss(ctx);

  const horses = [1, 2, 3, 4, 5].map(h => h === winner ? `🐎💨 [H${h}] 🏁` : `🐎 [H${h}]`).join('\n');
  const horseVisual = `🏇 *HORSE RACE* 🏇
━━━━━━━━━━━━━━━
${horses}
━━━━━━━━━━━━━━━`;

  if (won) {
    const rawGain = amount * 6;
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, `Horse Race Won (Refunded/Daily Cap)`, 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${horseVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Horse Race Won (Horse ${horse})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${horseVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🎉 *HORSE ${winner} WON! YOU WIN!* 🎉
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Horse Race Lost (Horse ${horse})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${horseVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *HORSE ${winner} WON!* You lost.
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 9. LOTTERY - Small chance for big win
// ============================================

function lottery(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const ticket = Math.floor(Math.random() * 100) + 1;
  const winningNum = Math.floor(Math.random() * 100) + 1;
  const ctx = beginGamblingRound(user);
  const won = ticket === winningNum && !maybeForceLoss(ctx);

  const lottoVisual = `🎫 *LOTTERY TICKET* 🎫
━━━━━━━━━━━━━━━
╔═══════════════╗
║  Your Ticket: *${ticket}*
║  Winning Num: *${winningNum}*
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (won) {
    const rawGain = amount * 90;
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Lottery Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${lottoVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, "Lottery Won", gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${lottoVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🎊 *JACKPOT!!! YOU WON THE LOTTERY!* 🎊
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Lottery Lost", -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${lottoVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *BETTER LUCK NEXT TIME!*
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 10. ROCK PAPER SCISSORS
// ============================================

function rps(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const valid = ['rock', 'paper', 'scissors', 'r', 'p', 's'];
  const userChoice = choice.toLowerCase();
  if (!valid.includes(userChoice)) return { success: false, message: "❌ Choose Rock, Paper, or Scissors!" };

  const botChoices = ['rock', 'paper', 'scissors'];
  const botChoice = botChoices[Math.floor(Math.random() * 3)];
  const fullUserChoice = userChoice.startsWith('r') ? 'rock' : (userChoice.startsWith('p') ? 'paper' : 'scissors');
  const ctx = beginGamblingRound(user);

  const rpsVisual = `✊✋✌️ *ROCK-PAPER-SCISSORS* ✊✋✌️
━━━━━━━━━━━━━━━
╔═══════════════╗
║  You chose: *${fullUserChoice.toUpperCase()}*
║  ${botConfig.getBotName()}: *${botChoice.toUpperCase()}*
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (fullUserChoice === botChoice) {
    economyModule.logTransaction(userId, `RPS Tie (${fullUserChoice})`, 0, user.wallet);
    return {
      success: true,
      won: null,
      message: `${rpsVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🤝 *IT'S A TIE!* 🤝
🔄 *Refunded:* ${getZENI()}${amount.toLocaleString()}

💰 *Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }

  const winMap = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const won = winMap[fullUserChoice] === botChoice && !maybeForceLoss(ctx);

  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "RPS Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${rpsVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `RPS Won (${fullUserChoice})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${rpsVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🎉 *YOU WON!* 🎉
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `RPS Lost (${fullUserChoice})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${rpsVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *YOU LOST!* 😢
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 11. PENALTY SHOOTOUT
// ============================================

function penalty(userId, amount, direction, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const valid = ['left', 'center', 'right', 'l', 'c', 'r'];
  const dir = direction.toLowerCase();
  if (!valid.includes(dir)) return { success: false, message: "❌ Choose Left, Center, or Right!" };

  const keeperDir = ['left', 'center', 'right'][Math.floor(Math.random() * 3)];
  const userDir = dir.startsWith('l') ? 'left' : (dir.startsWith('c') ? 'center' : 'right');
  const ctx = beginGamblingRound(user);
  const won = userDir !== keeperDir && !maybeForceLoss(ctx);

  const penaltyVisual = `🥅 *PENALTY KICK* ⚽
━━━━━━━━━━━━━━━
╔═══════════════╗
║  Kicked: *${userDir.toUpperCase()}* ⚽
║  Keeper: *${keeperDir.toUpperCase()}* 🧤
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (won) {
    const rawGain = Math.floor(amount * 0.4);
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Penalty Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${penaltyVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Penalty Goal (${userDir})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${penaltyVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🥅 *GOAL!!! YOU SCORED!* 🎉
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Penalty Miss (${userDir})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${penaltyVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *MISSED! SAVED BY THE KEEPER!* 🧤
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 12. NUMBER GUESS
// ============================================

function guessNumber(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const num = parseInt(guess);
  if (isNaN(num) || num < 1 || num > 10) return { success: false, message: "❌ Guess a number between 1-10!" };

  const result = Math.floor(Math.random() * 10) + 1;
  const ctx = beginGamblingRound(user);
  const won = num === result && !maybeForceLoss(ctx);

  const guessVisual = `🔢 *GUESS THE NUMBER* 🔢
━━━━━━━━━━━━━━━
╔═══════════════╗
║  Your Guess: *${num}*
║  Target Num: *${result}*
╚═══════════════╝
━━━━━━━━━━━━━━━`;

  if (won) {
    const rawGain = amount * 8;
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(rawGain, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Guess Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `${guessVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    if (!user.stats) user.stats = {};
    user.stats.totalEarned = (user.stats.totalEarned || 0) + gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Guess Won (${num})`, gain, user.wallet);
    return {
      success: true,
      won: true,
      message: `${guessVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🎯 *BULLSEYE! CORRECT GUESS!* 🎉
📈 *Payout:* +${getZENI()}${gain.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    if (!user.stats) user.stats = {};
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Guess Lost (${num})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `${guessVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

😢 *WRONG GUESS!*
📉 *Loss:* -${getZENI()}${amount.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 7. HIGHER/LOWER - Guess if next number is higher or lower
// ============================================

function higherLower(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };
  
  const normalizedGuess = guess.toLowerCase();
  if (!['higher', 'lower', 'h', 'l'].includes(normalizedGuess)) {
    return { success: false, message: "❌ Choose 'higher' or 'lower'!" };
  }
  
  const userGuess = normalizedGuess.startsWith('h') ? 'higher' : 'lower';
  const ctx = beginGamblingRound(user);
  
  // Generate two numbers between 1-13
  const firstCard = Math.floor(Math.random() * 13) + 1;
  const secondCard = Math.floor(Math.random() * 13) + 1;
  
  // Determine result
  let actualResult;
  if (secondCard > firstCard) {
    actualResult = 'higher';
  } else if (secondCard < firstCard) {
    actualResult = 'lower';
  } else {
    // Tie - return bet
    economyModule.logTransaction(userId, "Higher/Lower Tie", 0, user.wallet);
    return {
      success: true,
      won: null,
      message: `🎴 *HIGHER OR LOWER* 🎴
━━━━━━━━━━━━━━━
╔═══════════════╗
║  First Card:  *${firstCard}*
║  Second Card: *${secondCard}*
╚═══════════════╝
━━━━━━━━━━━━━━━
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

🤝 *IT'S A TIE!* 🤝
🔄 *Refunded:* ${getZENI()}${amount.toLocaleString()}

💰 *Wallet Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  const won = userGuess === actualResult && !maybeForceLoss(ctx);
  
  if (won) {
    const gain = capPayoutByDailyLimit(user, applyEdgeToAmount(amount, ctx));
    if (gain <= 0) {
      if (!user.stats) user.stats = {};
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Higher/Lower Won (Refunded/Daily Cap)", 0, user.wallet);
      return {
        success: true,
        won: true,
        message: `🎴 *HIGHER/LOWER* 🎴

First card: ${firstCard}
Your guess: ${userGuess}
Second card: ${secondCard}
Result: ${actualResult}

⚠️ *DAILY CAP REACHED!*
🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
      };
    }

    user.wallet += gain;
    user.stats.totalEarned += gain;
    trackDailyNet(user, gain);
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Higher/Lower Won (${userGuess})`, gain, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🎴 *HIGHER/LOWER* 🎴

First card: ${firstCard}
Your guess: ${userGuess}
Second card: ${secondCard}
Result: ${actualResult}

🎉 *YOU WON!* 🎉
+${getZENI()}${gain.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Higher/Lower Lost (${userGuess})`, -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🎴 *HIGHER/LOWER* 🎴

First card: ${firstCard}
Your guess: ${userGuess}
Second card: ${secondCard}
Result: ${actualResult}

😢 *YOU LOST!* 😢
-${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 13. MINES - 5x5 Grid with hidden mines
// ============================================

// ============================================
// 14. PLINKO - Drop the ball!
// ============================================

function plinko(userId, amount, risk, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const riskLevel = risk.toLowerCase();
  const validRisks = ['low', 'mid', 'high', 'l', 'm', 'h'];
  if (!validRisks.includes(riskLevel)) return { success: false, message: "❌ Choose risk: Low, Mid, or High!" };

  const r = riskLevel.startsWith('l') ? 'low' : (riskLevel.startsWith('m') ? 'mid' : 'high');
  
  const tables = {
    low: [0.5, 1.0, 1.1, 1.2, 1.5, 2.0, 5.0],
    mid: [0.2, 0.5, 1.0, 1.5, 2.5, 10.0, 25.0],
    high: [0.0, 0.1, 0.2, 1.5, 5.0, 50.0, 100.0]
  };

  const weights = {
    low: [40, 30, 15, 10, 3, 1.5, 0.5],
    mid: [50, 25, 10, 8, 5, 1.5, 0.5],
    high: [70, 15, 8, 4, 2, 0.8, 0.2]
  };

  function getResult(table, weight) {
    const totalWeight = weight.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < table.length; i++) {
      if (rand < weight[i]) return table[i];
      rand -= weight[i];
    }
    return table[0];
  }

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);

  let multiplier = getResult(tables[r], weights[r]);
  if (maybeForceLoss(ctx)) multiplier = 0;

  const rawPayout = Math.floor(amount * multiplier);
  const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
  let winnings = capPayoutByDailyLimit(user, adjustedPayout);
  if (multiplier >= 1 && winnings < amount) {
    winnings = amount; // Refund bet on cap
  }
  const profit = winnings - amount;

  user.wallet += winnings;
  if (!user.stats) user.stats = {};
  if (profit > 0) {
    user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
    trackDailyNet(user, profit);
    updateGamblingStats(userId, amount, true, economyModule);
  } else if (multiplier >= 1) {
    updateGamblingStats(userId, amount, true, economyModule);
  } else {
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
  }
  
  economyModule.logTransaction(userId, `Plinko (${r} risk)`, profit, user.wallet);
  economyModule.saveUser(userId);

  // Generate Plinko path staggered pyramid
  const bucketIdx = tables[r].indexOf(multiplier);
  const steps = [];
  for (let i = 0; i < bucketIdx; i++) steps.push(1);
  for (let i = 0; i < 6 - bucketIdx; i++) steps.push(-1);

  // Shuffle steps
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [steps[i], steps[j]] = [steps[j], steps[i]];
  }

  const pos = [0];
  for (let stepIdx = 1; stepIdx <= 6; stepIdx++) {
    pos.push(pos[stepIdx - 1] + steps[stepIdx - 1]);
  }

  const rows = [];
  for (let rowIdx = 0; rowIdx < 7; rowIdx++) {
    let rowStr = "  ".repeat(6 - rowIdx);
    for (let p = 0; p <= rowIdx; p++) {
      const pegVal = -rowIdx + p * 2;
      const isBall = pos[rowIdx] === pegVal;
      rowStr += isBall ? "🔴" : "⚪";
      if (p < rowIdx) rowStr += "  ";
    }
    rows.push(rowStr);
  }

  let bucketsStr = "  ";
  if (r === 'low') {
    bucketsStr += "[0.5][1.0][1.1][1.2][1.5][2.0][5.0]";
  } else if (r === 'mid') {
    bucketsStr += "[0.2][0.5][1.0][1.5][2.5][10][25]";
  } else {
    bucketsStr += "[0.0][0.1][0.2][1.5][5.0][50][100]";
  }

  const pathStr = rows.join("\n") + "\n" + bucketsStr;

  return {
    success: true,
    message: `🔴 *PLINKO BOARD* 🔴
━━━━━━━━━━━━━━━
${pathStr}
━━━━━━━━━━━━━━━
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}
🎯 *Risk:* ${r.toUpperCase()}

${multiplier >= 1 ? '🎉 *YOU WON!* 🎉' : '😢 *YOU LOST!* 😢'}
📈 *Multiplier:* ${multiplier}x
💵 *Payout:* ${getZENI()}${winnings.toLocaleString()}
🏆 *Net Profit:* ${profit >= 0 ? '+' : ''}${getZENI()}${profit.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 15. SCRATCH CARD - Match 3 symbols
// ============================================

function scratchCard(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum scratch card price is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum scratch card price is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  user.wallet -= amount;
  const ctx = beginGamblingRound(user);
  economyModule.saveUser(userId);

  // Balanced symbol pool: 6 winners, 14 fillers = 20 total symbols
  const winningSymbols = ['💎', '7️⃣', '🍀', '🔔', '🍒', '🍋'];
  const fillerSymbols = ['🍎', '🍊', '🍇', '🍉', '🍓', '🥑', '🍌', '🍍', '🥥', '🥭', '🥝', '🌽', '🥕', '🍆'];
  const symbols = [...winningSymbols, ...fillerSymbols];
  
  const card = [];
  for (let i = 0; i < 9; i++) {
    card.push(symbols[Math.floor(Math.random() * symbols.length)]);
  }

  const counts = {};
  card.forEach(s => counts[s] = (counts[s] || 0) + 1);

  let winner = null;
  // Only check if a WINNING symbol has 3 or more matches
  for (const s of winningSymbols) {
    if (counts[s] >= 3) {
      winner = s;
      break;
    }
  }

  if (maybeForceLoss(ctx)) {
    winner = null;
  }

  let multiplier = 0;
  if (winner) {
    const symbolMultipliers = { '💎': 50, '7️⃣': 15, '🍀': 8, '🔔': 4, '🍒': 2.5, '🍋': 1.5 };
    multiplier = symbolMultipliers[winner] || 1.1;
  }

  const rawPayout = Math.floor(amount * multiplier);
  const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
  let winnings = capPayoutByDailyLimit(user, adjustedPayout);
  if (winner && winnings < amount) {
    winnings = amount; // Refund the card price on cap
  }
  const profit = winnings - amount;

  if (!user.stats) user.stats = {};
  if (winnings > 0) {
    user.wallet += winnings;
    if (profit > 0) {
      user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
      trackDailyNet(user, profit);
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, `Scratch Card Won (${winner})`, profit, user.wallet);
    } else {
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, `Scratch Card Refund (Daily Cap)`, 0, user.wallet);
    }
  } else {
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Scratch Card Lost", -amount, user.wallet);
  }

  economyModule.saveUser(userId);

  const scratchVisual = `🎫 *SCRATCH CARD* 🎫
━━━━━━━━━━━━━━━
  ${card[0]}  │  ${card[1]}  │  ${card[2]}
  ───┼──────┼───
  ${card[3]}  │  ${card[4]}  │  ${card[5]}
  ───┼──────┼───
  ${card[6]}  │  ${card[7]}  │  ${card[8]}
━━━━━━━━━━━━━━━`;

  let outcomeMessage = '';
  if (winner) {
    if (profit > 0) {
      outcomeMessage = `🎉 *MATCHED 3x ${winner}!* 🎉\n📈 *Multiplier:* ${multiplier}x\n💵 *Payout:* +${getZENI()}${winnings.toLocaleString()}\n🏆 *Net Profit:* +${getZENI()}${profit.toLocaleString()}`;
    } else {
      outcomeMessage = `🎉 *MATCHED 3x ${winner}!* 🎉\n⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)`;
    }
  } else {
    outcomeMessage = `😢 *NO MATCH! BETTER LUCK NEXT TIME!*\n📉 *Loss:* -${getZENI()}${amount.toLocaleString()}`;
  }

  return {
    success: true,
    message: `${scratchVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Card Cost:* ${getZENI()}${amount.toLocaleString()}

${outcomeMessage}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 16. CUP GAME - Find the ball
// ============================================

function cupGame(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const cup = parseInt(choice);
  if (isNaN(cup) || cup < 1 || cup > 3) return { success: false, message: "❌ Choose cup 1, 2, or 3!" };

  const ctx = beginGamblingRound(user);
  const ball = Math.floor(Math.random() * 3) + 1;
  const won = cup === ball && !maybeForceLoss(ctx);

  const rawPayout = amount * 4; // 4x payout
  const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
  const winnings = won ? capPayoutByDailyLimit(user, adjustedPayout) : 0;
  const profit = winnings - amount;

  if (!user.stats) user.stats = {};
  if (won) {
    if (profit > 0) {
      user.wallet += winnings;
      user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
      trackDailyNet(user, profit);
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Cup Game Won", profit, user.wallet);
    } else {
      updateGamblingStats(userId, amount, true, economyModule);
      economyModule.logTransaction(userId, "Cup Game Refund (Daily Cap)", 0, user.wallet);
    }
  } else {
    user.wallet -= amount;
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Cup Game Lost", -amount, user.wallet);
  }

  economyModule.saveUser(userId);

  const finalCups = [1, 2, 3].map(c => c === ball ? '🥎' : '🥤').join('    ');

  const cupResultVisual = `🥤 *CUP GAME* 🥤
━━━━━━━━━━━━━━━
  1      2      3
${finalCups}
━━━━━━━━━━━━━━━`;

  let outcomeMessage = '';
  if (won) {
    if (profit > 0) {
      outcomeMessage = `🎉 *YOU FOUND THE BALL!* 🥎\n📈 *Payout:* +${getZENI()}${winnings.toLocaleString()}\n🏆 *Net Profit:* +${getZENI()}${profit.toLocaleString()}`;
    } else {
      outcomeMessage = `🎉 *YOU FOUND THE BALL!* 🥎\n⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)`;
    }
  } else {
    outcomeMessage = `😢 *WRONG CUP!* (Ball was under Cup ${ball})\n📉 *Loss:* -${getZENI()}${amount.toLocaleString()}`;
  }

  return {
    success: true,
    message: `${cupResultVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}
👉 *Picked Cup:* ${cup}

${outcomeMessage}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 17. WHEEL OF FORTUNE - Big risks, big rewards
// ============================================

function wheelOfFortune(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };

  // Defensive: coerce amount to a finite positive integer (see normalizeBet).
  const _bet = normalizeBet(amount);
  if (_bet === null) return { success: false, message: "❌ Invalid bet amount!" };
  amount = _bet;
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const segments = [0, 0.2, 0.5, 1.2, 1.5, 2, 5, 10];
  const weights = [35, 20, 15, 12, 10, 5, 2, 1];

  function spin() {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * totalWeight;
    for (let i = 0; i < segments.length; i++) {
      if (rand < weights[i]) return segments[i];
      rand -= weights[i];
    }
    return segments[0];
  }

  const ctx = beginGamblingRound(user);
  let multiplier = spin();
  if (maybeForceLoss(ctx)) multiplier = 0;

  const rawPayout = Math.floor(amount * multiplier);
  const adjustedPayout = applyEdgeToAmount(rawPayout, ctx);
  let winnings = capPayoutByDailyLimit(user, adjustedPayout);
  if (multiplier >= 1 && winnings < amount) {
    winnings = amount; // Refund bet on cap
  }
  const profit = winnings - amount;

  user.wallet = user.wallet - amount + winnings;
  if (!user.stats) user.stats = {};
  if (profit > 0) {
    user.stats.totalEarned = (user.stats.totalEarned || 0) + profit;
    trackDailyNet(user, profit);
    updateGamblingStats(userId, amount, true, economyModule);
  } else if (multiplier >= 1) {
    updateGamblingStats(userId, amount, true, economyModule);
  } else {
    user.stats.totalSpent = (user.stats.totalSpent || 0) + amount;
    trackDailyNet(user, -amount);
    updateGamblingStats(userId, amount, false, economyModule);
  }

  economyModule.logTransaction(userId, "Wheel of Fortune", profit, user.wallet);
  economyModule.saveUser(userId);

  const wheelVisual = `🎡 *WHEEL OF FORTUNE* 🎡
━━━━━━━━━━━━━━━
  [ 0x │ 2x │ 10x │ 0.5x │ 5x ]
             👇
  >------- *${multiplier}x* -------<
━━━━━━━━━━━━━━━`;

  let outcomeMessage = '';
  if (multiplier >= 1) {
    if (profit > 0) {
      outcomeMessage = `🎉 *NICE SPIN! YOU WIN!* 🎉\n📈 *Multiplier:* ${multiplier}x\n💵 *Payout:* ${getZENI()}${winnings.toLocaleString()}\n🏆 *Net Profit:* +${getZENI()}${profit.toLocaleString()}`;
    } else {
      outcomeMessage = `🎉 *NICE SPIN! YOU WIN!* 🎉\n⚠️ *DAILY CAP REACHED!*\n🔄 *Bet Refunded:* ${getZENI()}${amount.toLocaleString()} (No loss, no gain)`;
    }
  } else {
    outcomeMessage = `😢 *OOF! BAD SPIN!*\n📈 *Multiplier:* ${multiplier}x\n📉 *Loss:* -${getZENI()}${amount.toLocaleString()}`;
  }

  return {
    success: true,
    message: `${wheelVisual}
👤 *Player:* @${user.nickname || userId.split('@')[0]}
🎟️ *Your Bet:* ${getZENI()}${amount.toLocaleString()}

${outcomeMessage}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

module.exports = {
  coinflip,
  diceRoll,
  slots,
  higherLower,
  startBlackjack,
  blackjackHit,
  blackjackStand,
  blackjackDouble,
  roulette,
  crash,
  horseRace,
  lottery,
  rps,
  penalty,
  guessNumber,
  startMines,
  minesPick,
  minesCashOut,
  plinko,
  scratchCard,
  cupGame,
  wheelOfFortune
};

