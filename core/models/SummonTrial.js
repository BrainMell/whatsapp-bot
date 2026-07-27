const mongoose = require('mongoose');

// ============================================
// ⚔️ SUMMON TRIAL — solo evolution trials
// ============================================
// Each summon species has a trial. The summon must solo-kill
// the trial boss to evolve + unlock a player passive.
// Mirrors the class trial system (classSystem.completedTrials).
//
// On completion:
//   - Summon evolves to next tier (BASE → ASCENDED → TRANSCENDENT)
//   - Player unlocks the trial's rewardPassive (permanent)
//   - Passive is active whenever player owns ANY summon of that species

const SummonTrialSchema = new mongoose.Schema({
  trialId: { type: String, required: true, unique: true, index: true }, // "trial_skeleton", "trial_flame", etc.
  species: { type: String, required: true, index: true },                // SUMMON_SPECIES key

  // Boss to solo-kill (mirrors classEncounters trial boss pattern)
  bossId: { type: String, required: true },
  bossLevel: { type: Number, required: true },

  // Requirements
  requiredSummonLevel: { type: Number, default: 10 },
  requiredTier: { type: String, enum: ['BASE', 'ASCENDED', 'TRANSCENDENT'], default: 'BASE' },

  // Reward
  rewardPassive: { type: String, required: true }, // passive ID unlocked for the player
  rewardEvolution: { type: String, enum: ['ASCENDED', 'TRANSCENDENT'], required: true },

  // Metadata
  name: { type: String, required: true },
  description: { type: String, default: '' }

}, { timestamps: true });

module.exports = mongoose.models.SummonTrial || mongoose.model('SummonTrial', SummonTrialSchema);
