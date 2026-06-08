# RPG Subsystem: Mini-Games (Chess, Wordle, & Debates)

## What it is
The Mini-Games subsystem provides interactive, multiplayer, and AI-driven games for users directly within the WhatsApp bot. It includes full implementations of Chess, Ludo, TicTacToe, Wordle, and AI-judged Debates. State is managed either in-memory using JavaScript Maps (e.g., active chess or Wordle lobbies) or persisted in MongoDB collections under the `systems` keys (such as `debate_leaderboard` or active spectator debate bet structures). TicTacToe and Wordle evaluate moves locally, while Chess coordinates board image creation using HTTP API calls to rendering endpoints, and Debates utilize LLM interfaces (smart Groq calls) to judge winner results based on user-submitted text arguments.

## How it works

**AI Chess minimax Evaluation** — [chess.js L17-L33](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/chess.js#L17-L33)
```javascript
const PIECE_VALUES = {
    'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
};

// Simplified Piece-Square Tables
const PST = {
    'p': [
        [0,  0,  0,  0,  0,  0,  0,  0],
        [50, 50, 50, 50, 50, 50, 50, 50],
        [10, 10, 20, 30, 30, 20, 10, 10],
        [5,  5, 10, 25, 25, 10,  5,  5],
        [0,  0,  0, 20, 20,  0,  0,  0],
        [5, -5,-10,  0,  0,-10, -5,  5],
        [5, 10, 10,-20,-20, 10, 10,  5],
        [0,  0,  0,  0,  0,  0,  0,  0]
    ],
```
This snippet defines the heuristic evaluation values for pieces and a Piece-Square Table (PST) for pawns used by the chess engine's Minimax algorithm. Piece values are represented in centipawns (pawn = 100). The PST arrays provide positional modifiers based on the piece's coordinates on the board to encourage spatial control.

---

**Debate Leaderboard update** — [debate.js L31-L39](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/debate.js#L31-L39)
```javascript
// Update leaderboard stats
function updateLeaderboard(winnerJid, score) {
    if (!debateLeaderboard[winnerJid]) {
        debateLeaderboard[winnerJid] = { wins: 0, totalScore: 0, debates: 0 };
    }
    debateLeaderboard[winnerJid].wins += 1;
    debateLeaderboard[winnerJid].totalScore += score;
    debateLeaderboard[winnerJid].debates += 1;
    saveLeaderboard();
}
```
This snippet increments statistics on the global debate leaderboard for a winning user. The leaderboard state is saved in the database via `system.set('debate_leaderboard', debateLeaderboard)` under the `systems` collection, tracking total wins, accumulated scores, and total debate participations.

---

**Wordle Feedback calculation** — [wordle.js L355-L385](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/wordle.js#L355-L385)
```javascript
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
```
This function computes the green (correct), yellow (present), and grey (absent) feedback states for a 5-letter Wordle guess. It runs a two-pass algorithm to first identify perfect matches and then check for letters that exist elsewhere in the word, tracking already matched indices using a `used` boolean array.

---

## How to modify it

### Modify Chess Piece Valuations
To adjust the weights assigned to chess pieces inside the engine evaluations, edit `core/chess.js`.

```javascript
// Before (core/chess.js L17-20)
const PIECE_VALUES = {
    'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
    'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
};
```

```javascript
// After (core/chess.js L17-20)
const PIECE_VALUES = {
    'p': 100, 'n': 350, 'b': 330, 'r': 500, 'q': 900, 'k': 20000, // Boosted knight to 350
    'P': 100, 'N': 350, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
};
```

### Modify Wordle Fallback Word Dictionary
To expand the default word library used when the words text database is missing, modify `core/wordle.js`.

```javascript
// Before (core/wordle.js L48-51)
const FALLBACK_WORDS = [
  'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER', 'AGAIN',
  'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE',
```

```javascript
// After (core/wordle.js L48-51)
const FALLBACK_WORDS = [
  'JOKER', 'BOTS', 'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', // Added JOKER and BOTS
  'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE',
```

## Common tasks
- **Change Chess Piece weights** — Update positional evaluations by modifying the value weight map inside [chess.js L17-20](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/chess.js#L17-L20).
- **Edit Debate Leaderboard fields** — Customize the tracking properties added to winning users in [debate.js L31-34](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/debate.js#L31-L34).
- **Modify Wordle Fallback dictionary** — Add or delete allowed 5-letter words from the hardcoded array in [wordle.js L48-52](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/wordle.js#L48-L52).
- **Alter Wordle Feedback values** — Customize the output result strings returned from feedback calculations in [wordle.js L355-385](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/wordle.js#L355-L385).
- **Manage Debate entry points** — Customize debate invocation checks, arguments, or AI models in [debate.js L53-55](file:///home/mellow/Desktop/Joker/whatsapp-bot/core/debate.js#L53-L55).
