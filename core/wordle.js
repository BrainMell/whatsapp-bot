// ============================================
// WORDLE GAME - WHATSAPP EDITION
// Guess the 5-letter word in 6 tries!
// ============================================

const fs = require('fs');
const path = require('path');
const botConfig = require('../botConfig');
const economy = require('./economy');
const system = require('./system'); // NEW: Database System Module

// ============================================
// WORD LIST & GAME STATE
// ============================================

const activeGames = new Map();

// Load words from TXT file
function loadWordsFromTXT() {
  const wordsPath = path.join(__dirname, './Ldatabase/words.txt');
  
  try {
    if (!fs.existsSync(wordsPath)) {
      console.error('❌ words.txt not found at:', wordsPath);
      return [];
    }
    
    const wordsData = fs.readFileSync(wordsPath, 'utf-8');
    
    // Split by newlines, filter for 5-letter words, and convert to uppercase
    const fiveLetterWords = wordsData
      .split('\n')
      .map(word => word.trim().toUpperCase())
      .filter(word => word.length === 5 && /^[A-Z]+$/.test(word));
    
    console.log(`✅ Loaded ${fiveLetterWords.length} five-letter words from TXT file`);
    return fiveLetterWords;
  } catch (error) {
    console.error('❌ Error loading words.txt:', error);
    return [];
  }
}

// Load word list
const WORD_LIST = loadWordsFromTXT();

// Fallback to hardcoded list if TXT loading fails
const FALLBACK_WORDS = [
  'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER', 'AGAIN',
  'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE',
  'ALONG', 'ALTER', 'ANGEL', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY', 'ARENA',
  'ARGUE', 'ARISE', 'ARRAY', 'ASIDE', 'ASSET', 'AUDIO', 'AVOID', 'AWAKE', 'AWARD', 'AWARE',
  'BADLY', 'BAKER', 'BASES', 'BASIC', 'BASIS', 'BEACH', 'BEGAN', 'BEGIN', 'BEGUN', 'BEING',
  'BELOW', 'BENCH', 'BILLY', 'BIRTH', 'BLACK', 'BLAME', 'BLIND', 'BLOCK', 'BLOOD', 'BOARD',
  'BOOST', 'BOOTH', 'BOUND', 'BRAIN', 'BRAND', 'BREAD', 'BREAK', 'BREED', 'BRIEF', 'BRING',
  'BROAD', 'BROKE', 'BROWN', 'BUILD', 'BUILT', 'BUYER', 'CABLE', 'CARRY', 'CATCH', 'CAUSE',
  'CHAIN', 'CHAIR', 'CHART', 'CHASE', 'CHEAP', 'CHECK', 'CHEST', 'CHIEF', 'CHILD', 'CHINA',
  'CHOSE', 'CIVIL', 'CLAIM', 'CLASS', 'CLEAN', 'CLEAR', 'CLICK', 'CLOCK', 'CLOSE', 'COACH',
  'COAST', 'COULD', 'COUNT', 'COURT', 'COVER', 'CRAFT', 'CRASH', 'CRAZY', 'CREAM', 'CRIME',
  'CROSS', 'CROWD', 'CROWN', 'CRUDE', 'CYCLE', 'DAILY', 'DANCE', 'DEATH', 'DELAY', 'DEPTH',
  'DOING', 'DOUBT', 'DOZEN', 'DRAFT', 'DRAMA', 'DRANK', 'DRAWN', 'DREAM', 'DRESS', 'DRINK',
  'DRIVE', 'DROVE', 'DYING', 'EAGER', 'EARLY', 'EARTH', 'EIGHT', 'ELITE', 'EMPTY', 'ENEMY',
  'ENJOY', 'ENTER', 'ENTRY', 'EQUAL', 'ERROR', 'EVENT', 'EVERY', 'EXACT', 'EXIST', 'EXTRA',
  'FAITH', 'FALSE', 'FAULT', 'FIELD', 'FIFTH', 'FIFTY', 'FIGHT', 'FINAL', 'FIRST', 'FIXED',
  'FLASH', 'FLEET', 'FLOOR', 'FLUID', 'FOCUS', 'FORCE', 'FORTH', 'FORTY', 'FORUM', 'FOUND',
  'FRAME', 'FRANK', 'FRAUD', 'FRESH', 'FRONT', 'FRUIT', 'FULLY', 'FUNNY', 'GIANT', 'GIVEN',
  'GLASS', 'GLOBE', 'GOING', 'GRACE', 'GRADE', 'GRAND', 'GRANT', 'GRASS', 'GREAT', 'GREEN',
  'GROSS', 'GROUP', 'GROWN', 'GUARD', 'GUESS', 'GUEST', 'GUIDE', 'HAPPY', 'HEART', 'HEAVY',
  'HENCE', 'HORSE', 'HOTEL', 'HOUSE', 'HUMAN', 'IDEAL', 'IMAGE', 'INDEX', 'INNER', 'INPUT',
  'ISSUE', 'JAPAN', 'JIMMY', 'JOINT', 'JONES', 'JUDGE', 'KNOWN', 'LABEL', 'LARGE', 'LASER',
  'LATER', 'LAUGH', 'LAYER', 'LEARN', 'LEASE', 'LEAST', 'LEAVE', 'LEGAL', 'LEMON', 'LEVEL',
  'LIGHT', 'LIMIT', 'LINKS', 'LIVES', 'LOCAL', 'LOGIC', 'LOOSE', 'LOWER', 'LUCKY', 'LUNCH',
  'MAGIC', 'MAJOR', 'MAKER', 'MARCH', 'MATCH', 'MAYBE', 'MAYOR', 'MEANT', 'MEDIA', 'METAL',
  'MIGHT', 'MINOR', 'MINUS', 'MIXED', 'MODEL', 'MONEY', 'MONTH', 'MORAL', 'MOTOR', 'MOUNT',
  'MOUSE', 'MOUTH', 'MOVIE', 'MUSIC', 'NEEDS', 'NEVER', 'NEWLY', 'NIGHT', 'NOISE', 'NORTH',
  'NOTED', 'NOVEL', 'NURSE', 'OCCUR', 'OCEAN', 'OFFER', 'OFTEN', 'ORDER', 'OTHER', 'OUGHT',
  'PAINT', 'PANEL', 'PAPER', 'PARTY', 'PEACE', 'PHASE', 'PHONE', 'PHOTO', 'PIECE', 'PILOT',
  'PITCH', 'PLACE', 'PLAIN', 'PLANE', 'PLANT', 'PLATE', 'POINT', 'POUND', 'POWER', 'PRESS',
  'PRICE', 'PRIDE', 'PRIME', 'PRINT', 'PRIOR', 'PRIZE', 'PROOF', 'PROUD', 'PROVE', 'QUEEN',
  'QUICK', 'QUIET', 'QUITE', 'RADIO', 'RAISE', 'RANGE', 'RAPID', 'RATIO', 'REACH', 'READY',
  'REFER', 'RIGHT', 'RIVAL', 'RIVER', 'ROBIN', 'ROGER', 'ROMAN', 'ROUGH', 'ROUND', 'ROUTE',
  'ROYAL', 'RURAL', 'SCALE', 'SCENE', 'SCOPE', 'SCORE', 'SENSE', 'SERVE', 'SEVEN', 'SHALL',
  'SHAPE', 'SHARE', 'SHARP', 'SHEET', 'SHELF', 'SHELL', 'SHIFT', 'SHINE', 'SHIRT', 'SHOCK',
  'SHOOT', 'SHORT', 'SHOWN', 'SIGHT', 'SINCE', 'SIXTH', 'SIXTY', 'SIZED', 'SKILL', 'SLEEP',
  'SLIDE', 'SMALL', 'SMART', 'SMILE', 'SMITH', 'SMOKE', 'SOLID', 'SOLVE', 'SORRY', 'SOUND',
  'SOUTH', 'SPACE', 'SPARE', 'SPEAK', 'SPEED', 'SPEND', 'SPENT', 'SPLIT', 'SPOKE', 'SPORT',
  'STAFF', 'STAGE', 'STAKE', 'STAND', 'START', 'STATE', 'STEAM', 'STEEL', 'STICK', 'STILL',
  'STOCK', 'STONE', 'STOOD', 'STORE', 'STORM', 'STORY', 'STRIP', 'STUCK', 'STUDY', 'STUFF',
  'STYLE', 'SUGAR', 'SUITE', 'SUPER', 'SWEET', 'TABLE', 'TAKEN', 'TASTE', 'TAXES', 'TEACH',
  'TEETH', 'TERRY', 'TEXAS', 'THANK', 'THEFT', 'THEIR', 'THEME', 'THERE', 'THESE', 'THICK',
  'THING', 'THINK', 'THIRD', 'THOSE', 'THREE', 'THREW', 'THROW', 'TIGHT', 'TIMES', 'TITLE',
  'TODAY', 'TOPIC', 'TOTAL', 'TOUCH', 'TOUGH', 'TOWER', 'TRACK', 'TRADE', 'TRAIN', 'TREAT',
  'TREND', 'TRIAL', 'TRIED', 'TRIES', 'TRUCK', 'TRULY', 'TRUST', 'TRUTH', 'TWICE', 'UNDER',
  'UNION', 'UNITY', 'UNTIL', 'UPPER', 'UPSET', 'URBAN', 'USAGE', 'USUAL', 'VALID', 'VALUE',
  'VIDEO', 'VIRUS', 'VISIT', 'VITAL', 'VOCAL', 'VOICE', 'WASTE', 'WATCH', 'WATER', 'WHEEL',
  'WHERE', 'WHICH', 'WHILE', 'WHITE', 'WHOLE', 'WHOSE', 'WOMAN', 'WOMEN', 'WORLD', 'WORRY',
  'WORSE', 'WORST', 'WORTH', 'WOULD', 'WOUND', 'WRITE', 'WRONG', 'WROTE', 'YIELD', 'YOUNG',
  'YOUTH'
];

// Use loaded words for validation, but curated ones for selection
const VALID_WORDS = WORD_LIST.length > 0 ? WORD_LIST : FALLBACK_WORDS;
const VALID_GUESSES = [...VALID_WORDS];

// ============================================
// DIFFICULTY CLASSIFICATION SYSTEM
// ============================================

/*
WHAT MAKES WORDLE HARD:
✅ EASY: 
   - From curated common list (FALLBACK_WORDS)
   - 3+ vowels or very common (AUDIO, HOUSE, CANOE)
   - No complex repeated letters
   
🟡 MEDIUM:
   - From curated common list
   - 2 vowels (CRANE, SLATE, TRAIN)
   
🔴 HARD:
   - Full dictionary (obscure words)
   - 0-1 vowels
   - Rare letters Q/X/Z/J
   - Multiple repeated letters
*/

function classifyWordDifficulty(word, isCurated = false) {
  const vowels = (word.match(/[AEIOU]/g) || []).length;
  const uniqueLetters = new Set(word).size;
  const hasRepeats = uniqueLetters < 5;
  const doubleRepeats = uniqueLetters <= 3;
  const rareLetters = (word.match(/[QXZJ]/g) || []).length;
  
  // If word is NOT in our common list, it's automatically HARD
  if (!isCurated) return 'hard';

  // HARD CRITERIA even for common words:
  if (vowels <= 1 || rareLetters >= 1 || doubleRepeats) {
    return 'hard';
  }
  
  // EASY CRITERIA:
  if (vowels >= 3 && !hasRepeats) {
    return 'easy';
  }
  
  return 'medium';
}

// Categorize curated words for Easy/Medium, Full list for Hard
const WORDS_BY_DIFFICULTY = {
  easy: FALLBACK_WORDS.filter(w => classifyWordDifficulty(w, true) === 'easy'),
  medium: FALLBACK_WORDS.filter(w => classifyWordDifficulty(w, true) === 'medium'),
  hard: VALID_WORDS.filter(w => classifyWordDifficulty(w, FALLBACK_WORDS.includes(w)) === 'hard')
};

// Safety check: ensure pools aren't empty
if (WORDS_BY_DIFFICULTY.easy.length === 0) WORDS_BY_DIFFICULTY.easy = FALLBACK_WORDS.slice(0, 100);
if (WORDS_BY_DIFFICULTY.medium.length === 0) WORDS_BY_DIFFICULTY.medium = FALLBACK_WORDS;
if (WORDS_BY_DIFFICULTY.hard.length === 0) WORDS_BY_DIFFICULTY.hard = VALID_WORDS;

if (WORD_LIST.length === 0) {
  console.warn('⚠️ Using fallback word list. Please check words.txt file.');
}

// ============================================
// SCOREBOARD MANAGEMENT
// ============================================

// Scoreboard handled via system module

function normalizeJid(jid) {
  if (!jid) return null;
  return jid.split('@')[0].split(':')[0];
}

function updateScoreboard(playerJid, playerName, won, attempts, difficulty = 'medium') {
  const scores = system.get('wordle_scores', {});
  const normalizedJid = normalizeJid(playerJid);
  
  if (!scores[normalizedJid]) {
    scores[normalizedJid] = {
      name: playerName !== 'Player' ? playerName : 'User',
      fullJid: playerJid,
      wins: 0,
      losses: 0,
      totalGuesses: 0,
      points: 0,
      bestStreak: 0,
      currentStreak: 0
    };
  }
  
  if (typeof scores[normalizedJid].points === 'undefined') {
    scores[normalizedJid].points = 0;
  }

  const pointsMap = { easy: 1, medium: 2, hard: 3 };
  const earnedPoints = pointsMap[difficulty] || 2;

  if (won) {
    scores[normalizedJid].wins += 1;
    scores[normalizedJid].points += earnedPoints;
    scores[normalizedJid].currentStreak += 1;
    scores[normalizedJid].bestStreak = Math.max(
      scores[normalizedJid].bestStreak, 
      scores[normalizedJid].currentStreak
    );
    scores[normalizedJid].totalGuesses += attempts;
  } else {
    scores[normalizedJid].losses += 1;
    scores[normalizedJid].currentStreak = 0;
  }

  if (!scores[normalizedJid].fullJid) {
    scores[normalizedJid].fullJid = playerJid;
  }

  if (playerName !== 'Player' && playerName !== 'User') {
    scores[normalizedJid].name = playerName;
  }

  system.set('wordle_scores', scores);
}

function getLeaderboard() {
  const scores = system.get('wordle_scores', {});
  const sorted = Object.entries(scores)
    .filter(([, data]) => data.wins > 0)
    .sort(([, a], [, b]) => {
      const aPoints = a.points || 0;
      const bPoints = b.points || 0;
      if (aPoints !== bPoints) return bPoints - aPoints;
      if (a.wins !== b.wins) return b.wins - a.wins;
      const aRate = a.wins / (a.wins + a.losses);
      const bRate = b.wins / (b.wins + b.losses);
      return bRate - aRate;
    })
    .slice(0, 10);
  
  if (sorted.length === 0) return "No scores yet.";
  
  return sorted.map(([jid, data], i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const points = data.points || 0;
    const avgGuesses = data.wins > 0 ? (data.totalGuesses / data.wins).toFixed(1) : 'N/A';
    return `${medal} ${data.name || 'User'}\n   💎 ${points}pts • ${data.wins}W-${data.losses}L • Avg: ${avgGuesses} • 🔥${data.currentStreak}`;
  }).join('\n\n');
}

function getAllScores() {
  return system.get('wordle_scores', {});
}

// ============================================
// GAME CLASS
// ============================================

class WordleGame {
  constructor(playerJid, playerName, difficulty = 'medium', chatId, sock, botMarker) {
    this.playerJid = normalizeJid(playerJid);
    this.fullJid = playerJid;
    this.playerName = playerName;
    this.difficulty = difficulty;
    this.chatId = chatId;
    
    // Select word from appropriate difficulty pool
    const wordPool = WORDS_BY_DIFFICULTY[difficulty] || WORDS_BY_DIFFICULTY.medium;
    
    if (wordPool.length === 0) {
      // Fallback to all words if category is empty
      this.targetWord = VALID_WORDS[Math.floor(Math.random() * VALID_WORDS.length)];
    } else {
      this.targetWord = wordPool[Math.floor(Math.random() * wordPool.length)];
    }
    
    this.guesses = [];
    this.maxGuesses = 6;
    this.gameOver = false;
    this.won = false;
    this.startTime = Date.now();

    // Set timeout for 10 minutes
    this.timeout = setTimeout(async () => {
      if (activeGames.has(this.playerJid)) {
        activeGames.delete(this.playerJid);
        try {
          if (sock) await sock.sendMessage(this.chatId, { 
            text: botMarker + "⌛ *WORDLE TIMEOUT!* ⌛\n\nYour game has been cancelled due to inactivity." 
          });
        } catch (e) {}
      }
    }, 10 * 60 * 1000);
  }

  resetTimeout(sock, botMarker) {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(async () => {
      if (activeGames.has(this.playerJid)) {
        activeGames.delete(this.playerJid);
        try {
          if (sock) await sock.sendMessage(this.chatId, { 
            text: botMarker + "⌛ *WORDLE TIMEOUT!* ⌛\n\nYour game has been cancelled due to inactivity." 
          });
        } catch (e) {}
      }
    }, 10 * 60 * 1000);
  }

  makeGuess(word) {
    word = word.toUpperCase().trim();

    if (this.gameOver) {
      return { success: false, error: "Game already over!" };
    }

    if (word.length !== 5) {
      return { success: false, error: "❌ Word must be 5 letters!" };
    }

    if (!/^[A-Z]+$/.test(word)) {
      return { success: false, error: "❌ Only letters allowed!" };
    }

    if (!VALID_GUESSES.includes(word)) {
      return { success: false, error: "❌ Not a valid word!" };
    }

    if (this.guesses.some(g => g.word === word)) {
      return { success: false, error: "❌ Already guessed that word!" };
    }

    const result = this.calculateFeedback(word);
    this.guesses.push({ word, result });

    if (word === this.targetWord) {
      this.gameOver = true;
      this.won = true;
      updateScoreboard(this.fullJid, this.playerName, true, this.guesses.length, this.difficulty);
    } else if (this.guesses.length >= this.maxGuesses) {
      this.gameOver = true;
      this.won = false;
      updateScoreboard(this.fullJid, this.playerName, false, this.guesses.length, this.difficulty);
    }

    return {
      success: true,
      result: result,
      gameOver: this.gameOver,
      won: this.won,
      guessesLeft: this.maxGuesses - this.guesses.length
    };
  }

  calculateFeedback(guess) {
    const result = [];
    const targetLetters = this.targetWord.split('');
    const guessLetters = guess.split('');
    const used = new Array(5).fill(false);

    for (let i = 0; i < 5; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = 'correct';
        used[i] = true;
      }
    }

    for (let i = 0; i < 5; i++) {
      if (result[i] === 'correct') continue;

      const letter = guessLetters[i];
      const indexInTarget = targetLetters.findIndex((l, idx) => 
        l === letter && !used[idx]
      );

      if (indexInTarget !== -1) {
        result[i] = 'present';
        used[indexInTarget] = true;
      } else {
        result[i] = 'absent';
      }
    }

    return result;
  }

  getBoard() {
    let board = "┌───────────────┐\n";
    board += "🔤 *WORDLE* 🔤\n";
    board += "└───────────────┘\n\n";

    for (const guess of this.guesses) {
      board += this.formatGuess(guess.word, guess.result) + "\n";
    }

    const remaining = this.maxGuesses - this.guesses.length;
    for (let i = 0; i < remaining; i++) {
      board += "⬜⬜⬜⬜⬜\n";
    }

    board += "\n└───────────────┘\n";

    if (this.gameOver) {
      if (this.won) {
        board += `✅ *CORRECT!* The word was *${this.targetWord}*\n`;
        board += `🎯 Solved in ${this.guesses.length}/${this.maxGuesses} tries!\n`;
      } else {
        board += `❌ *GAME OVER!* The word was *${this.targetWord}*\n`;
      }
      board += "└───────────────┘";
    } else {
      board += `${remaining} guess${remaining !== 1 ? 'es' : ''} remaining`;
    }

    return board;
  }

  formatGuess(word, result) {
    const emojis = {
      correct: '🟩',
      present: '🟨',
      absent: '⬛'
    };

    let formatted = '';
    for (let i = 0; i < word.length; i++) {
      formatted += emojis[result[i]];
    }
    formatted += '  ' + word;
    return formatted;
  }

  getStats() {
    const playerStats = this.getPlayerStats();
    if (!playerStats) return "No stats available.";

    let stats = "┌───────────────┐\n";
    stats += "📊 *YOUR STATS* 📊\n";
    stats += "└───────────────┘\n\n";
    stats += `✅ Wins: ${playerStats.wins}\n`;
    stats += `❌ Losses: ${playerStats.losses}\n`;
    
    const winRate = playerStats.wins + playerStats.losses > 0
      ? ((playerStats.wins / (playerStats.wins + playerStats.losses)) * 100).toFixed(0)
      : 0;
    stats += `📈 Win Rate: ${winRate}%\n`;
    
    const avgGuesses = playerStats.wins > 0
      ? (playerStats.totalGuesses / playerStats.wins).toFixed(1)
      : 'N/A';
    stats += `🎯 Avg Guesses: ${avgGuesses}\n`;
    stats += `🔥 Current Streak: ${playerStats.currentStreak}\n`;
    stats += `🏆 Best Streak: ${playerStats.bestStreak}\n`;
    stats += "└───────────────┘";

    return stats;
  }

  getPlayerStats() {
    const scores = system.get('wordle_scores', {});
    return scores[this.playerJid] || null;
  }
}

// ============================================
// GAME MANAGEMENT
// ============================================

function createGame(playerJid, playerName, difficulty = 'medium', chatId, sock, botMarker) {
  const game = new WordleGame(playerJid, playerName, difficulty, chatId, sock, botMarker);
  activeGames.set(normalizeJid(playerJid), game);
  return game;
}

function getGame(playerJid) {
  return activeGames.get(normalizeJid(playerJid));
}

function deleteGame(playerJid) {
  const game = activeGames.get(normalizeJid(playerJid));
  if (game && game.timeout) clearTimeout(game.timeout);
  activeGames.delete(normalizeJid(playerJid));
}

// ============================================
// WHATSAPP HANDLERS
// ============================================

module.exports = {
  getAllScores,
  startGame: async (sock, chatId, senderJid, botMarker, m, playerName = 'Player', difficulty = 'medium') => {
    if (getGame(senderJid)) {
      return {
        success: false,
        message: botMarker + `❌ You already have an active game! Use \`${botConfig.getPrefix()} wordle end\` to quit.`
      };
    }

    // Validate difficulty
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      difficulty = 'medium';
    }

    const game = createGame(senderJid, playerName, difficulty, chatId, sock, botMarker);
    
    // Difficulty display
    const difficultyEmoji = { easy: '🟢', medium: '🟡', hard: '🔴' };
    const difficultyName = difficulty.toUpperCase();
    const pointsEarned = { easy: '1pt', medium: '2pts', hard: '3pts' };
    
    let message = botMarker + "┌───────────────┐\n";
    message += "🔤 *WORDLE STARTED!* 🔤\n";
    message += "└───────────────┘\n\n";
    message += `${difficultyEmoji[difficulty]} *Difficulty:* ${difficultyName} (Win = ${pointsEarned[difficulty]})\n\n`;
    message += "🎯 Guess the 5-letter word in 6 tries!\n\n";
    message += "🟩 = Correct letter & position\n";
    message += "🟨 = Correct letter, wrong position\n";
    message += "⬛ = Letter not in word\n\n";
    message += game.getBoard() + "\n\n";
    message += "└───────────────┘\n";
    message += `Use: \`${botConfig.getPrefix()} wordle <word>\`\n`;
    message += `Example: \`${botConfig.getPrefix()} wordle CRANE\`\n`;
    message += "└───────────────┘";

    await sock.sendMessage(chatId, {
      text: message,
      contextInfo: { mentionedJid: [senderJid] }
    }, { quoted: m });

    return { success: true };
  },

  makeGuess: async (sock, chatId, senderJid, word, botMarker, m) => {
    const game = getGame(senderJid);

    if (!game) {
      return {
        success: false,
        message: botMarker + `❌ No active game! Use \`${botConfig.getPrefix()} wordle start\` to begin.`
      };
    }

    const result = game.makeGuess(word);
    game.resetTimeout(sock, botMarker);

    if (!result.success) {
      return {
        success: false,
        message: botMarker + result.error
      };
    }

    const board = game.getBoard();
    let message = botMarker + board + "\n\n";

    if (result.gameOver) {
      if (result.won) {
        // Award Money
        const rewards = { easy: 100, medium: 200, hard: 300 };
        const amount = rewards[game.difficulty] || 200;
        economy.addMoney(senderJid, amount);

        message += `🎉 Congratulations @${normalizeJid(senderJid)}! 🎉\n`;
        message += `You solved it in ${game.guesses.length}/6 tries!\n`;
        message += `💰 *Reward:* +${amount} Zeni\n\n`;
      } else {
        message += `Better luck next time, @${normalizeJid(senderJid)}!\n\n`;
      }
      message += `Type \`${botConfig.getPrefix()} wordle start\` for a new game!`;
      deleteGame(senderJid);
    }

    await sock.sendMessage(chatId, {
      text: message,
      contextInfo: { mentionedJid: [senderJid] }
    }, { quoted: m });

    return { success: true };
  },

  showBoard: async (sock, chatId, senderJid, botMarker, m) => {
    const game = getGame(senderJid);

    if (!game) {
      return {
        success: false,
        message: botMarker + `❌ No active game! Use \`${botConfig.getPrefix()} wordle start\` to begin.`
      };
    }

    const board = game.getBoard();
    await sock.sendMessage(chatId, {
      text: botMarker + board,
      contextInfo: { mentionedJid: [senderJid] }
    }, { quoted: m });

    return { success: true };
  },

  endGame: async (sock, chatId, senderJid, botMarker, m, isAdmin = false) => {
    const game = getGame(senderJid);

    if (!game) {
      return {
        success: false,
        message: botMarker + "❌ No active game!"
      };
    }

    const word = game.targetWord;
    
    // If not admin, count as a loss for quitting
    if (!isAdmin) {
      updateScoreboard(game.fullJid, game.playerName, false, game.guesses.length, game.difficulty);
    }
    
    deleteGame(senderJid);

    let message = botMarker + `🛑 Game ended! The word was *${word}*`;
    if (!isAdmin) {
      message += `\n💀 Counted as a **LOSS** for quitting.`;
    }

    await sock.sendMessage(chatId, {
      text: message,
      contextInfo: { mentionedJid: [senderJid] }
    });

    return { success: true };
  },

  showStats: async (sock, chatId, senderJid, botMarker, m) => {
    const game = new WordleGame(senderJid, 'Temp');
    const stats = game.getStats();

    await sock.sendMessage(chatId, {
      text: botMarker + stats,
      contextInfo: { mentionedJid: [senderJid] }
    });

    return { success: true };
  },

showLeaderboard: async (sock, chatId, botMarker, m) => {
  const leaderboard = getLeaderboard();
  
  let message = botMarker + "┌───────────────\n";
  message += "🏆 *WORDLE LEADERBOARD* 🏆\n";
  message += "└───────────────\n\n";
  message += leaderboard + "\n\n";
  message += "┌───────────────\n";
  message += "🟢 Easy = 1pt | 🟡 Medium = 2pts | 🔴 Hard = 3pts\n";
  message += "└───────────────";

  try {
    const scores = system.get('wordle_scores', {});
    const sorted = Object.entries(scores)
      .filter(([, data]) => data.wins > 0)
      .sort(([, a], [, b]) => {
        const aPoints = a.points || 0;
        const bPoints = b.points || 0;
        if (aPoints !== bPoints) return bPoints - aPoints;
        if (a.wins !== b.wins) return b.wins - a.wins;
        const aRate = a.wins / (a.wins + a.losses);
        const bRate = b.wins / (b.wins + b.losses);
        return bRate - aRate;
      })
      .slice(0, 10);
    
    const mentionedJids = sorted.map(([jid, data]) => 
      data.fullJid || `${jid}@s.whatsapp.net`
    );

    await sock.sendMessage(chatId, {
      text: message,
      contextInfo: { mentionedJid: mentionedJids }
    });
  } catch (e) {
    console.error('Leaderboard send error:', e);
    await sock.sendMessage(chatId, { text: message });
  }

  return { success: true };
}
};
