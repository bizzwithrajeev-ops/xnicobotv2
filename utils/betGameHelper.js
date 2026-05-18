/**
 * betGameHelper — shared utilities for bet-based mini-games.
 *
 * Every game in `commands/economy/` that follows the
 * "deduct on start, payout on resolution" pattern uses these helpers
 * so the bookkeeping stays consistent across:
 *   - up-front bet deduction
 *   - 2× win payout / refund / total loss
 *   - totalGambled / totalWon / totalLost stat updates
 *   - XP awards on resolution
 */

'use strict';

const economyManager = require('./economyManager');

/**
 * Deduct the bet from the user's wallet and update lifetime stats.
 * Call this once when the game *starts*.
 */
function deductBet(userId, bet) {
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);
    userData.coins -= bet;
    userData.totalGambled = (userData.totalGambled || 0) + bet;
    economyManager.saveEconomy(economy);
    return userData.coins;
}

/**
 * Resolve a finished game by crediting `payout` (gross, not profit)
 * to the user and updating stats.
 *
 * Examples:
 *   - bet 100, win 2x → settle(uid, 100, 200) → +100 profit recorded
 *   - bet 100, push   → settle(uid, 100, 100) → no profit, no loss
 *   - bet 100, lose   → settle(uid, 100, 0)   → -100 loss recorded
 */
function settle(userId, bet, payout) {
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);
    if (payout > 0) {
        userData.coins += payout;
        if (payout > bet) userData.totalWon = (userData.totalWon || 0) + (payout - bet);
    }
    if (payout < bet) {
        userData.totalLost = (userData.totalLost || 0) + (bet - payout);
    }
    economyManager.addXP(economy, userId, payout > bet ? 8 : 2);
    economyManager.checkAllAchievements(economy, userId);
    economyManager.saveEconomy(economy);
    return userData;
}

module.exports = { deductBet, settle };
