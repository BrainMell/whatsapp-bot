const fs = require('fs');
const botConfig = require('../botConfig');

// ============================================
// GAMBLING SYSTEM - 6 Different Games
// ============================================

const getZENI = () => botConfig.getCurrency().symbol;

const GLOBAL_MAX_BET = 100000; // 100k max bet to protect economy
const GLOBAL_MIN_BET = 100;   // 100 min bet

// Active game states
const activeBlackjackGames = new Map();
const activeCrashGames = new Map();
const activeMinesGames = new Map();

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

// ============================================
// 1. COINFLIP - Bet on heads or tails
// ============================================

function coinflip(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }
  
  const normalizedChoice = choice.toLowerCase();
  if (!['heads', 'tails', 'h', 't'].includes(normalizedChoice)) {
    return { success: false, message: "❌ Choose 'heads' or 'tails'!" };
  }
  
  const userChoice = normalizedChoice.startsWith('h') ? 'heads' : 'tails';
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const won = userChoice === result;
  
  if (won) {
    user.wallet += amount;
    user.stats.totalEarned += amount;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Coinflip Won (${userChoice})`, amount, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🪙 *COINFLIP* 🪙

╔════════════════╗
║ Your choice: ${userChoice}
║ Result: ${result}
╚════════════════╝

🎉 *YOU WON!* 🎉
+${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Coinflip Lost (${userChoice})`, -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🪙 *COINFLIP* 🪙

╔════════════════╗
║ Your choice: ${userChoice}
║ Result: ${result}
╚════════════════╝

😢 *YOU LOST!* 😢
-${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 2. DICE ROLL - Beat the dealer
// ============================================

function diceRoll(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }
  
  const playerRoll = Math.floor(Math.random() * 6) + 1;
  let dealerRoll = Math.floor(Math.random() * 6) + 1;
  
  // --- LUCK FACTOR: 15% chance to reduce dealer's roll ---
  if (Math.random() < 0.15 && dealerRoll > 1) {
    dealerRoll--;
  }
  
  if (playerRoll === dealerRoll) {
    economyModule.logTransaction(userId, "Dice Roll (Tie)", 0, user.wallet);
    return {
      success: true,
      won: null,
      message: `🎲 *DICE ROLL* 🎲

╔════════════════╗
║  Your roll: ${playerRoll}
║  Dealer roll: ${dealerRoll}
╚════════════════╝

🤝 *TIE!* 🤝
No money lost or gained

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  const won = playerRoll > dealerRoll;
  const winnings = amount;
  
  if (won) {
    user.wallet += winnings;
    user.stats.totalEarned += winnings;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, "Dice Roll Won", winnings, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🎲 *DICE ROLL* 🎲

╔════════════════╗
║  Your roll: ${playerRoll}
║  Dealer roll: ${dealerRoll}
╚════════════════╝

🎉 *YOU WON!* 🎉
+${getZENI()}${winnings.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Dice Roll Lost", -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🎲 *DICE ROLL* 🎲

╔════════════════╗
║  Your roll: ${playerRoll}
║  Dealer roll: ${dealerRoll}
╚════════════════╝

😢 *YOU LOST!* 😢
-${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 3. SLOTS - Classic slot machine
// ============================================

function slots(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: `❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!` };
  
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
  const won = profit > 0;
  
  if (won) {
    user.wallet += profit;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Slots Won (${result})`, profit, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🎰 *SLOT MACHINE* 🎰

╔═════════════════╗
║  [ ${reel1} | ${reel2} | ${reel3} ]
╚═════════════════╝

${result === 'JACKPOT' ? '🎊 *JACKPOT!* 🎊' : '🎉 *WIN!* 🎉'}
${multiplier}x multiplier!

+${getZENI()}${profit.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Slots Lost", -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🎰 *SLOT MACHINE* 🎰

╔═════════════════╗
║  [ ${reel1} | ${reel2} | ${reel3} ]
╚═════════════════╝

😢 *NO MATCH!* 😢

-${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
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
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
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
    return { success: false, message: "❌ You already have an active blackjack game! Type '${botConfig.getPrefix()} bj hit' or '${botConfig.getPrefix()} bj stand'" };
  }
  
  user.wallet -= amount;
  economyModule.logTransaction(userId, "Blackjack Bet", -amount, user.wallet);
  economyModule.saveUser(userId);
  
  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  
  const playerValue = calculateHandValue(playerHand);
  
  if (playerValue === 21) {
    const payout = Math.floor(amount * 4.0); // 3:1 payout
    user.wallet += payout;
    const profit = Math.floor(amount * 3.0);
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, "Blackjack Win (Natural)", payout, user.wallet);
    economyModule.saveUser(userId);
    
    return {
      success: true,
      won: true,
      message: `♠️ *BLACKJACK!* ♠️

╔════════════════════╗
║ Your hand: ${formatHand(playerHand)}
║ Value: ${playerValue}
╚════════════════════╝

🃏 *NATURAL BLACKJACK!* 🃏
+${getZENI()}${profit.toLocaleString()} (3:2 payout)

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  activeBlackjackGames.set(userId, {
    deck,
    playerHand,
    dealerHand,
    bet: amount
  });
  
  return {
    success: true,
    gameStarted: true,
    message: `♠️ *BLACKJACK* ♠️

╔════════════════════╗
║ Your hand: ${formatHand(playerHand)}
║ Value: ${playerValue}
║ 
║ Dealer: ${formatHand(dealerHand, true)}
╚════════════════════╝

━━━━━━━━━━━━━━━━
Type:
  ${botConfig.getPrefix()} bj hit - Get another card
  ${botConfig.getPrefix()} bj stand - Keep current hand
  ${botConfig.getPrefix()} bj double - Double bet & hit once`
  };
}

function blackjackHit(userId, economyModule) {
  if (!activeBlackjackGames.has(userId)) {
    return { success: false, message: "❌ No active blackjack game! Start one with '${botConfig.getPrefix()} bj <amount>'" };
  }
  
  const game = activeBlackjackGames.get(userId);
  const card = game.deck.pop();
  game.playerHand.push(card);
  
  const playerValue = calculateHandValue(game.playerHand);
  
  if (playerValue > 21) {
    activeBlackjackGames.delete(userId);
    const user = economyModule.getUser(userId);
    user.stats.totalSpent += game.bet;
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Blackjack Lost (Bust)", 0, user.wallet);
    economyModule.saveUser(userId);
    
    return {
      success: true,
      won: false,
      message: `♠️ *BLACKJACK* ♠️

╔════════════════════╗
║ Your hand: ${formatHand(game.playerHand)}
║ Value: ${playerValue}
╚════════════════════╝

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

╔════════════════════╗
║ Your hand: ${formatHand(game.playerHand)}
║ Value: ${playerValue}
║ 
║ Dealer: ${formatHand(game.dealerHand, true)}
╚════════════════════╝

━━━━━━━━━━━━━━━━
${botConfig.getPrefix()} bj hit - Get another card
${botConfig.getPrefix()} bj stand - Keep current hand`
  };
}

function blackjackStand(userId, economyModule) {
  if (!activeBlackjackGames.has(userId)) {
    return { success: false, message: "❌ No active blackjack game! Start one with '${botConfig.getPrefix()} bj <amount>'" };
  }
  
  const game = activeBlackjackGames.get(userId);
  const user = economyModule.getUser(userId);
  
  while (calculateHandValue(game.dealerHand) < 17) {
    game.dealerHand.push(game.deck.pop());
  }
  
  const playerValue = calculateHandValue(game.playerHand);
  const dealerValue = calculateHandValue(game.dealerHand);
  
  activeBlackjackGames.delete(userId);
  
  let result = '';
  let won = false;
  let profit = 0;
  let payout = 0;
  
  if (dealerValue > 21) {
    won = true;
    profit = game.bet;
    payout = game.bet * 2;
    user.wallet += payout;
    result = '🎉 DEALER BUST! YOU WIN! 🎉';
  } else if (playerValue > dealerValue) {
    won = true;
    profit = game.bet;
    payout = game.bet * 2;
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

╔════════════════════╗
║ Your hand: ${formatHand(game.playerHand)}
║ Value: ${playerValue}
║ 
║ Dealer: ${formatHand(game.dealerHand)}
║ Value: ${dealerValue}
╚════════════════════╝

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
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, game.bet, true, economyModule);
    economyModule.logTransaction(userId, "Blackjack Win", payout, user.wallet);
  } else {
    user.stats.totalSpent += game.bet;
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Blackjack Loss", 0, user.wallet);
  }
  
  economyModule.saveUser(userId);
  
  return {
    success: true,
    won,
    message: `♠️ *BLACKJACK* ♠️

╔════════════════════╗
║ Your hand: ${formatHand(game.playerHand)}
║ Value: ${playerValue}
║ 
║ Dealer: ${formatHand(game.dealerHand)}
║ Value: ${dealerValue}
╚════════════════════╝

${result}
${won ? '+' : ''}${getZENI()}${Math.abs(profit).toLocaleString()}

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
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Blackjack Lost (Bust on Double)", 0, user.wallet);
    economyModule.saveUser(userId);
    
    return {
      success: true,
      won: false,
      message: `♠️ *BLACKJACK* ♠️

DOUBLED!
╔════════════════════╗
║ Your hand: ${formatHand(game.playerHand)}
║ Value: ${playerValue}
╚════════════════════╝

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
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }
  
  const betLower = bet.toLowerCase();
  
  const result = Math.floor(Math.random() * 37);
  
  const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  const isRed = redNumbers.includes(result);
  const color = result === 0 ? 'green' : (isRed ? 'red' : 'black');
  
  let won = false;
  let multiplier = 0;
  let betType = '';
  
  if (betLower === 'red' || betLower === 'r') {
    won = color === 'red';
    multiplier = 3;
    betType = 'RED';
  } else if (betLower === 'black' || betLower === 'b') {
    won = color === 'black';
    multiplier = 3;
    betType = 'BLACK';
  } else if (betLower === 'green' || betLower === 'g' || betLower === '0') {
    won = result === 0;
    multiplier = 50;
    betType = 'GREEN (0)';
  } else if (betLower === 'even' || betLower === 'e') {
    won = result !== 0 && result % 2 === 0;
    multiplier = 3;
    betType = 'EVEN';
  } else if (betLower === 'odd' || betLower === 'o') {
    won = result !== 0 && result % 2 !== 0;
    multiplier = 3;
    betType = 'ODD';
  } else {
    const num = parseInt(betLower);
    if (!isNaN(num) && num >= 0 && num <= 36) {
      won = result === num;
      multiplier = 50;
      betType = `NUMBER ${num}`;
    } else {
      return { success: false, message: "❌ Invalid bet! Use: red/black/green/even/odd or a number (0-36)" };
    }
  }
  
  if (won) {
    const winnings = Math.floor(amount * multiplier);
    const profit = winnings - amount;
    user.wallet += winnings;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Roulette Won (${betType})`, winnings - amount, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🎡 *ROULETTE* 🎡

╔════════════════════╗
║ Your bet: ${betType}
║ 
║ 🎰 Result: ${result} (${color.toUpperCase()}) 🎰
╚════════════════════╝

🎉 *YOU WON!* 🎉
${multiplier}x payout!

+${getZENI()}${profit.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Roulette Lost (${betType})`, -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🎡 *ROULETTE* 🎡

╔════════════════════╗
║ Your bet: ${betType}
║ 
║ 🎰 Result: ${result} (${color.toUpperCase()}) 🎰
╚════════════════════╝

😢 *YOU LOST!* 😢

-${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 6. CRASH - Multiplier game
// ============================================


// ============================================
// 6. CRASH - Aviator-style multiplier game
// ============================================

// ============================================
// 6. CRASH - AVIATOR STYLE WITH LIVE SPAM UPDATES
// ============================================

function startCrash(userId, amount, economyModule, sock, chatId) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  
  if (user.wallet < amount) {
    return { success: false, message: `❌ You only have ${getZENI()}${user.wallet}!` };
  }
  
  if (activeCrashGames.has(userId)) {
    return { success: false, message: "❌ You already have an active crash game! Cash out or wait for it to crash!" };
  }
  
  // Deduct bet IMMEDIATELY (just like Aviator!)
  user.wallet -= amount;
  economyModule.logTransaction(userId, "Crash Bet", -amount, user.wallet);
  economyModule.saveUser(userId);
  
  // Generate crash point with realistic house odds
  // 3% chance: Instant crash at 1.00x
  // 47% chance: 1.01x - 1.5x
  // 30% chance: 1.5x - 3.0x
  // 20% chance: 3.0x - 50.0x
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
  
  activeCrashGames.set(userId, {
    bet: amount,
    crashPoint: crashPoint,
    startTime: Date.now(),
    chatId: chatId,
    userId: userId,
    crashed: false
  });
  
  // Start the live spam updates!
  spamCrashUpdates(userId, sock, chatId, economyModule);
  
  return {
    success: true,
    gameStarted: true,
    message: `🚀 *CRASH GAME STARTED!* 🚀

╔════════════════════╗
║ 💰 Bet: ${getZENI()}${amount.toLocaleString()}
║ 📈 Starting: 1.00x
╚════════════════════╝

🎯 MULTIPLIER IS RISING!

Type: ${botConfig.getPrefix()} crash out

⚡ SPAM INCOMING...`
  };
}

// Spam multiplier updates in chat
async function spamCrashUpdates(userId, sock, chatId, economyModule) {
  const game = activeCrashGames.get(userId);
  if (!game || game.crashed) return;
  
  const BOT_MARKER = "\u200B";
  let updateCount = 0;
  const maxUpdates = 20; // Spam for up to 20 updates (30 seconds)
  
  const interval = setInterval(async () => {
    if (!activeCrashGames.has(userId)) {
      clearInterval(interval);
      return;
    }
    
    const currentGame = activeCrashGames.get(userId);
    if (currentGame.crashed) {
      clearInterval(interval);
      return;
    }
    
    // Calculate current multiplier based on time
    const timePassed = (Date.now() - currentGame.startTime) / 1000;
    let currentMultiplier = 1.0 + (timePassed * 0.15) + (Math.sqrt(timePassed) * 0.08);
    currentMultiplier = Math.max(1.00, currentMultiplier);
    currentMultiplier = Math.round(currentMultiplier * 100) / 100;
    
    // Check if it should crash NOW
    if (currentMultiplier >= currentGame.crashPoint) {
      currentGame.crashed = true;
      activeCrashGames.delete(userId);
      
      const user = economyModule.getUser(userId);
      user.stats.totalSpent += currentGame.bet;
      economyModule.saveUser(userId);
      
      // SEND CRASH MESSAGE
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + `🚀 *CRASH!* 🚀

💥💥💥 CRASHED AT ${currentGame.crashPoint}x! 💥💥💥

@${userId.split('@')[0]} LOST!
-${getZENI()}${currentGame.bet.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}

Better luck next time! 😢`,
        mentions: [userId]
      });
      
      clearInterval(interval);
      return;
    }
    
    // Send multiplier update (SPAM!)
    await sock.sendMessage(chatId, {
      text: BOT_MARKER + `🚀 ${currentMultiplier}x 📈`
    });
    
    updateCount++;
    if (updateCount >= maxUpdates) {
      // Max updates reached, auto-crash
      currentGame.crashed = true;
      activeCrashGames.delete(userId);
      
      const user = economyModule.getUser(userId);
      user.stats.totalSpent += currentGame.bet;
      economyModule.saveUser(userId);
      
      await sock.sendMessage(chatId, {
        text: BOT_MARKER + `🚀 *AUTO-CRASH!* 🚀

💥 Took too long! Crashed at ${currentGame.crashPoint}x!

@${userId.split('@')[0]} LOST!
-${getZENI()}${currentGame.bet.toLocaleString()}`,
        mentions: [userId]
      });
      
      clearInterval(interval);
    }
  }, 1500); // Update every 1.5 seconds
}

function crashCashOut(userId, economyModule) {
  if (!activeCrashGames.has(userId)) {
    return { success: false, message: "❌ No active crash game! Start one with '${botConfig.getPrefix()} crash <amount>'" };
  }
  
  const game = activeCrashGames.get(userId);
  
  if (game.crashed) {
    return { success: false, message: "❌ Already crashed!" };
  }
  
  const user = economyModule.getUser(userId);
  
  // Calculate current multiplier
  const timePassed = (Date.now() - game.startTime) / 1000;
  let currentMultiplier = 1.0 + (timePassed * 0.15) + (Math.sqrt(timePassed) * 0.08);
  currentMultiplier = Math.max(1.00, currentMultiplier);
  currentMultiplier = Math.round(currentMultiplier * 100) / 100;
  
  game.crashed = true;
  activeCrashGames.delete(userId);
  
  // Check if already crashed
  if (currentMultiplier >= game.crashPoint) {
    user.stats.totalSpent += game.bet;
    economyModule.saveUser(userId);
    
    return {
      success: true,
      won: false,
      message: `🚀 *TOO LATE!* 🚀

💥 It crashed at ${game.crashPoint}x!
You tried to cash out at ${currentMultiplier}x

😢 *YOU LOST!*
-${getZENI()}${game.bet.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  // SUCCESSFUL CASHOUT!
  const winnings = Math.floor(game.bet * currentMultiplier);
  const profit = winnings - game.bet;
  
  user.wallet += winnings;
  user.stats.totalEarned += profit;
  economyModule.saveUser(userId);
  
  return {
    success: true,
    won: true,
    message: `🚀 *CASHED OUT!* 🚀

╔════════════════════╗
║ ✅ ${currentMultiplier}x MULTIPLIER!
╚════════════════════╝

Would've crashed at ${game.crashPoint}x

🎉 *YOU WON!*
💰 Bet: ${getZENI()}${game.bet.toLocaleString()}
📈 Multiplier: ${currentMultiplier}x
💵 Won: ${getZENI()}${winnings.toLocaleString()}
🏆 Profit: +${getZENI()}${profit.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}

Perfect timing! 🔥`
  };
}




// ============================================
// 13. MINES - 5x5 Grid with hidden mines
// ============================================

function startMines(userId, amount, mineCount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  
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

  activeMinesGames.set(userId, {
    bet: amount,
    mineCount: mines,
    grid: grid,
    revealed: [],
    multiplier: 1.0
  });

  return {
    success: true,
    message: `💣 *MINES GAME STARTED* 💣\n\n💰 *Bet:* ${getZENI()}${amount.toLocaleString()}\n💣 *Mines:* ${mines}\n📈 *Current Multiplier:* 1.00x\n\n╔════════════╗\n║ ⬜ ⬜ ⬜ ⬜ ⬜ ║\n║ ⬜ ⬜ ⬜ ⬜ ⬜ ║\n║ ⬜ ⬜ ⬜ ⬜ ⬜ ║\n║ ⬜ ⬜ ⬜ ⬜ ⬜ ║\n║ ⬜ ⬜ ⬜ ⬜ ⬜ ║\n╚════════════╝\n\nType: \`${botConfig.getPrefix()} mines pick <1-25>\` to reveal a cell!\nType: \`${botConfig.getPrefix()} mines out\` to cash out!`
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
    user.stats.totalSpent += game.bet;
    updateGamblingStats(userId, game.bet, false, economyModule);
    economyModule.logTransaction(userId, "Mines Lost (Hit Mine)", 0, user.wallet);
    economyModule.saveUser(userId);

    return {
      success: true,
      won: false,
      message: `💥 *BOOM!* 💥\n\nYou hit a mine at cell ${cellIndex}!\nYou lost your bet of ${getZENI()}${game.bet.toLocaleString()}.\n\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }

  // SAFE!
  game.revealed.push(idx);
  
  // Calculate new multiplier
  // Standard Mines formula approximation
  const n = 25;
  const m = game.mineCount;
  const r = game.revealed.length;
  
  function factorial(x) { return x <= 1 ? 1 : x * factorial(x - 1); }
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

  let gridDisplay = "╔════════════╗\n";
  for (let i = 0; i < 25; i++) {
    if (i > 0 && i % 5 === 0) gridDisplay += " ║\n║ ";
    else if (i === 0) gridDisplay += "║ ";
    
    if (game.revealed.includes(i)) gridDisplay += "💎 ";
    else gridDisplay += "⬜ ";
  }
  gridDisplay += " ║\n╚════════════╝";

  return {
    success: true,
    message: `💎 *SAFE!* 💎\n\n📈 *Multiplier:* ${game.multiplier}x\n💵 *Current Value:* ${getZENI()}${Math.floor(game.bet * game.multiplier).toLocaleString()}\n\n${gridDisplay}\n\nType: \`${botConfig.getPrefix()} mines pick <1-25>\` or \`${botConfig.getPrefix()} mines out\``
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
  const winnings = Math.floor(game.bet * game.multiplier);
  const profit = winnings - game.bet;

  user.wallet += winnings;
  user.stats.totalEarned += profit;
  updateGamblingStats(userId, game.bet, true, economyModule);
  economyModule.logTransaction(userId, `Mines Won (${game.multiplier}x)`, winnings, user.wallet);
  
  activeMinesGames.delete(userId);
  economyModule.saveUser(userId);

  return {
    success: true,
    message: `💰 *CASHED OUT!* 💰\n\n🎉 *YOU WON!*\n📈 Multiplier: ${game.multiplier}x\n💵 Won: ${getZENI()}${winnings.toLocaleString()}\n🏆 Profit: +${getZENI()}${profit.toLocaleString()}\n\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// MINES - Avoid the hidden mines
// ============================================

// ============================================
// 8. HORSE RACE - Bet on a horse
// ============================================

function horseRace(userId, amount, horseNum, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
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
  const won = horse === winner;

  const horses = [1, 2, 3, 4, 5].map(h => h === winner ? `🐎💨 [H${h}] 🏁` : `🐎 [H${h}]`).join('\n');

  if (won) {
    const profit = amount * 6;
    user.wallet += profit;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Horse Race Won (Horse ${horse})`, profit, user.wallet);
    return {
      success: true,
      won: true,
      message: `🏇 *HORSE RACE* 🏇\n\n${horses}\n\n🎉 *HORSE ${winner} WON!* 🎉\n+${getZENI()}${profit.toLocaleString()}\n\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Horse Race Lost (Horse ${horse})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `🏇 *HORSE RACE* 🏇\n\n${horses}\n\n😢 *HORSE ${winner} WON!* You lost.\n-${getZENI()}${amount.toLocaleString()}\n\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 9. LOTTERY - Small chance for big win
// ============================================

function lottery(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const ticket = Math.floor(Math.random() * 100) + 1;
  const winningNum = Math.floor(Math.random() * 100) + 1;
  const won = ticket === winningNum;

  if (won) {
    const profit = amount * 150;
    user.wallet += profit;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, "Lottery Won", profit, user.wallet);
    return {
      success: true,
      won: true,
      message: `🎫 *LOTTERY* 🎫\n\nYour Ticket: ${ticket}\nWinning Number: ${winningNum}\n\n🎊 *JACKPOT!!!* 🎊\n+${getZENI()}${profit.toLocaleString()}\n\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Lottery Lost", -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `🎫 *LOTTERY* 🎫\n\nYour Ticket: ${ticket}\nWinning Number: ${winningNum}\n\n😢 *BETTER LUCK NEXT TIME!*\n-${getZENI()}${amount.toLocaleString()}\n\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 10. ROCK PAPER SCISSORS
// ============================================

function rps(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
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

  if (fullUserChoice === botChoice) {
    economyModule.logTransaction(userId, `RPS Tie (${fullUserChoice})`, 0, user.wallet);
    return { success: true, won: null, message: `✊✋✌️ *RPS* ✊✋✌️\n\nYou: ${fullUserChoice}\n${botConfig.getBotName()}: ${botChoice}\n\n🤝 *TIE!*` };
  }

  const winMap = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
  const won = winMap[fullUserChoice] === botChoice;

  if (won) {
    user.wallet += amount;
    user.stats.totalEarned += amount;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `RPS Won (${fullUserChoice})`, amount, user.wallet);
    return {
      success: true,
      won: true,
      message: `✊✋✌️ *RPS* ✊✋✌️\n\nYou: ${fullUserChoice}\n${botConfig.getBotName()}: ${botChoice}\n\n🎉 *YOU WON!*\n+${getZENI()}${amount.toLocaleString()}\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `RPS Lost (${fullUserChoice})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `✊✋✌️ *RPS* ✊✋✌️\n\nYou: ${fullUserChoice}\n${botConfig.getBotName()}: ${botChoice}\n\n😢 *YOU LOST!*\n-${getZENI()}${amount.toLocaleString()}\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 11. PENALTY SHOOTOUT
// ============================================

function penalty(userId, amount, direction, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
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
  const won = userDir !== keeperDir;

  if (won) {
    const profit = Math.floor(amount * 0.8);
    user.wallet += profit;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Penalty Goal (${userDir})`, profit, user.wallet);
    return {
      success: true,
      won: true,
      message: `⚽ *PENALTY* ⚽\n\nYou kicked: ${userDir}\nKeeper dived: ${keeperDir}\n\n🥅 *GOAL!!!*\n+${getZENI()}${profit.toLocaleString()}\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Penalty Miss (${userDir})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `⚽ *PENALTY* ⚽\n\nYou kicked: ${userDir}\nKeeper saved it! 🧤\n\n😢 *MISSED!*\n-${getZENI()}${amount.toLocaleString()}\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 12. NUMBER GUESS
// ============================================

function guessNumber(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
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
  const won = num === result;

  if (won) {
    const profit = amount * 8;
    user.wallet += profit;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Guess Won (${num})`, profit, user.wallet);
    return {
      success: true,
      won: true,
      message: `🔢 *GUESS THE NUMBER* 🔢\n\nYour Guess: ${num}\nActual Number: ${result}\n\n🎯 *BULLSEYE!*\n+${getZENI()}${profit.toLocaleString()}\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Guess Lost (${num})`, -amount, user.wallet);
    return {
      success: true,
      won: false,
      message: `🔢 *GUESS THE NUMBER* 🔢\n\nYour Guess: ${num}\nActual Number: ${result}\n\n😢 *WRONG!*\n-${getZENI()}${amount.toLocaleString()}\n💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
}

// ============================================
// 7. HIGHER/LOWER - Guess if next number is higher or lower
// ============================================

function higherLower(userId, amount, guess, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first with \`${botConfig.getPrefix()} register <nickname>\`!" };
  
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
      message: `🎴 *HIGHER/LOWER* 🎴

╔════════════════╗
║ First card: ${firstCard}
║ Second card: ${secondCard}
╚════════════════╝

🤝 *IT'S A TIE!* 🤝
Bet returned!

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  }
  
  const won = userGuess === actualResult;
  
  if (won) {
    user.wallet += amount;
    user.stats.totalEarned += amount;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Higher/Lower Won (${userGuess})`, amount, user.wallet);
    
    return {
      success: true,
      won: true,
      message: `🎴 *HIGHER/LOWER* 🎴

╔════════════════╗
║ First card: ${firstCard}
║ Your guess: ${userGuess}
║ Second card: ${secondCard}
║ Result: ${actualResult}
╚════════════════╝

🎉 *YOU WON!* 🎉
+${getZENI()}${amount.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
    };
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, `Higher/Lower Lost (${userGuess})`, -amount, user.wallet);
    
    return {
      success: true,
      won: false,
      message: `🎴 *HIGHER/LOWER* 🎴

╔════════════════╗
║ First card: ${firstCard}
║ Your guess: ${userGuess}
║ Second card: ${secondCard}
║ Result: ${actualResult}
╚════════════════╝

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

  const multiplier = getResult(tables[r], weights[r]);
  const winnings = Math.floor(amount * multiplier);
  const profit = winnings - amount;

  user.wallet = user.wallet - amount + winnings;
  if (profit > 0) {
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
  } else if (profit < 0) {
    user.stats.totalSpent += Math.abs(profit);
    updateGamblingStats(userId, amount, false, economyModule);
  }
  
  economyModule.logTransaction(userId, `Plinko (${r} risk)`, profit, user.wallet);
  economyModule.saveUser(userId);

  const paths = [
    "      ⚪\n     / \\\n    /   \\\n   🟡    ⚪\n  / \\   / \\\n ⚪   🟡   ⚪\n",
    "      ⚪\n     / \\\n    ⚪   \\\n   ⚪    🟡\n  / \\   / \\\n ⚪   ⚪   🟡\n"
  ];
  const path = paths[Math.floor(Math.random() * paths.length)];

  return {
    success: true,
    message: `🔴 *PLINKO* 🔴

${path}
━━━━━━━━━━━━━━━━
🎯 *Risk:* ${r.toUpperCase()}
📈 *Multiplier:* ${multiplier}x
💰 *Result:* ${getZENI()}${winnings.toLocaleString()}

💰 *New Balance:* ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 15. SCRATCH CARD - Match 3 symbols
// ============================================

function scratchCard(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum scratch card price is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum scratch card price is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  user.wallet -= amount;
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

  let multiplier = 0;
  if (winner) {
    const symbolMultipliers = { '💎': 50, '7️⃣': 15, '🍀': 8, '🔔': 4, '🍒': 2.5, '🍋': 1.5 };
    multiplier = symbolMultipliers[winner] || 1.1;
  }

  const winnings = Math.floor(amount * multiplier);
  const profit = winnings - amount;

  if (winnings > 0) {
    user.wallet += winnings;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, `Scratch Card Won (${winner})`, profit, user.wallet);
  } else {
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Scratch Card Lost", -amount, user.wallet);
  }

  economyModule.saveUser(userId);

  const grid = `
  [ ${card[0]} | ${card[1]} | ${card[2]} ]
  [ ${card[3]} | ${card[4]} | ${card[5]} ]
  [ ${card[6]} | ${card[7]} | ${card[8]} ]
  `.trim();

  return {
    success: true,
    message: `🎟️ *SCRATCH CARD* 🎫

╔═══════════════╗
${grid}
╚═══════════════╝

${winnings > 0 ? `🎉 *MATCHED 3x ${winner}!*` : '😢 *NO MATCH!*'}
📈 Multiplier: ${multiplier}x
💵 Payout: ${getZENI()}${winnings.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 16. CUP GAME - Find the ball
// ============================================

function cupGame(userId, amount, choice, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  
  if (amount < GLOBAL_MIN_BET) {
    return { success: false, message: `❌ Minimum bet is ${getZENI()}${GLOBAL_MIN_BET.toLocaleString()}!` };
  }
  if (amount > GLOBAL_MAX_BET) {
    return { success: false, message: `❌ Maximum bet is ${getZENI()}${GLOBAL_MAX_BET.toLocaleString()}!` };
  }
  if (user.wallet < amount) return { success: false, message: "❌ Insufficient funds!" };

  const cup = parseInt(choice);
  if (isNaN(cup) || cup < 1 || cup > 3) return { success: false, message: "❌ Choose cup 1, 2, or 3!" };

  const ball = Math.floor(Math.random() * 3) + 1;
  const won = cup === ball;

  if (won) {
    const payout = amount * 4; // 4x payout
    const profit = payout - amount;
    user.wallet += payout;
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
    economyModule.logTransaction(userId, "Cup Game Won", profit, user.wallet);
  } else {
    user.wallet -= amount;
    user.stats.totalSpent += amount;
    updateGamblingStats(userId, amount, false, economyModule);
    economyModule.logTransaction(userId, "Cup Game Lost", -amount, user.wallet);
  }

  economyModule.saveUser(userId);

  const cups = [1, 2, 3].map(c => c === ball ? '🥎' : '🥤').join('  ');

  return {
    success: true,
    message: `🥤 *CUP GAME* 🥤

Shuffle shuffle...

${won ? '✅ *YOU FOUND IT!*' : '❌ *WRONG CUP!*'}
The ball was under cup ${ball}:
${cups}

💰 Payout: ${getZENI()}${won ? (amount * 2.8).toLocaleString() : '0'}
💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
  };
}

// ============================================
// 17. WHEEL OF FORTUNE - Big risks, big rewards
// ============================================

function wheelOfFortune(userId, amount, economyModule) {
  const user = economyModule.getUser(userId);
  if (!user) return { success: false, message: "❌ Register first!" };
  
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

  const multiplier = spin();
  const winnings = Math.floor(amount * multiplier);
  const profit = winnings - amount;

  user.wallet = user.wallet - amount + winnings;
  if (profit > 0) {
    user.stats.totalEarned += profit;
    updateGamblingStats(userId, amount, true, economyModule);
  } else if (profit < 0) {
    user.stats.totalSpent += Math.abs(profit);
    updateGamblingStats(userId, amount, false, economyModule);
  }

  economyModule.logTransaction(userId, "Wheel of Fortune", profit, user.wallet);
  economyModule.saveUser(userId);

  return {
    success: true,
    message: `🎡 *WHEEL OF FORTUNE* 🎡

Spinning...
[ 0x | 2x | 10x | 0.5x | 5x ]
         👇
>------- *${multiplier}x* -------<

${multiplier >= 1 ? '🎉 *NICE!*' : '😢 *OOF!*'}
📈 Multiplier: ${multiplier}x
💵 Payout: ${getZENI()}${winnings.toLocaleString()}

💰 Balance: ${getZENI()}${user.wallet.toLocaleString()}`
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
  startCrash,
  crashCashOut,
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

