/**
 * Currency Helper — per-guild currency + economy settings.
 *
 * Reads from jsonStore 'economy-settings':
 *   { [guildId]: {
 *       currency, currencyName,
 *       dailyReward, weeklyReward,
 *       workMinReward, workMaxReward,
 *       robChance, startingBalance,
 *       robEnabled, gamblingEnabled, shopEnabled
 *     }
 *   }
 *
 * The dashboard writes these via `PUT /api/guild/:id/economy-settings`
 * (dashboard/server.js). Until this helper exposed them, none of the
 * economy commands actually consulted the saved values — a server
 * could change "Daily Reward" in the dashboard and the bot kept
 * paying out the hardcoded random range. Now `getEconomySettings()`
 * returns a fully-defaulted object so commands can read once at the
 * top and apply the values directly.
 *
 * Usage:
 *   const helper = require('../../utils/currencyHelper');
 *   const cfg = helper.getEconomySettings(message.guild?.id);
 *   if (!cfg.gamblingEnabled) return message.reply('Gambling is disabled here.');
 *   const reward = helper.rollReward(cfg.workMin, cfg.workMax);
 */

const jsonStore = require('./jsonStore');

const DEFAULT_CURRENCY = '💰';
const DEFAULT_CURRENCY_NAME = 'coins';

// Default ranges match the historical hardcoded values in the
// commands so behaviour is unchanged when no dashboard config exists.
const DEFAULTS = Object.freeze({
    currency: DEFAULT_CURRENCY,
    currencyName: DEFAULT_CURRENCY_NAME,
    // Daily: random base reward between dailyMin..dailyMax (legacy was 500..1000)
    dailyMin: 500,
    dailyMax: 1000,
    // Weekly: legacy was 3000..6000
    weeklyMin: 3000,
    weeklyMax: 6000,
    // Work: legacy was 100..300 base earn
    workMin: 100,
    workMax: 300,
    // Rob: percent chance of success
    robChance: 50,
    startingBalance: 0,
    robEnabled: true,
    gamblingEnabled: true,
    shopEnabled: true
});

function loadSettings() {
    if (!jsonStore.has('economy-settings')) return {};
    try { return jsonStore.read('economy-settings'); } catch { return {}; }
}

function getGuildSettings(guildId) {
    if (!guildId) return {};
    const all = loadSettings();
    return all[guildId] || {};
}

/**
 * Return a fully-defaulted economy settings object for a guild.
 * The dashboard stores `dailyReward` / `weeklyReward` as a single
 * "max" target with a min anchored at half — we expand that here so
 * commands can use a min/max range as before.
 */
function getEconomySettings(guildId) {
    const s = getGuildSettings(guildId);
    const num = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const bool = (v, fallback) => typeof v === 'boolean' ? v : fallback;

    // Dashboard exposes a single dailyReward/weeklyReward number; treat
    // it as the cap and randomize within [cap/2, cap] so the values
    // still feel rewarding without being identical every claim.
    const dailyMax = num(s.dailyReward, DEFAULTS.dailyMax);
    const dailyMin = Math.max(1, Math.floor(dailyMax / 2));
    const weeklyMax = num(s.weeklyReward, DEFAULTS.weeklyMax);
    const weeklyMin = Math.max(1, Math.floor(weeklyMax / 2));

    return {
        currency: typeof s.currency === 'string' && s.currency ? s.currency : DEFAULTS.currency,
        currencyName: typeof s.currencyName === 'string' && s.currencyName ? s.currencyName : DEFAULTS.currencyName,

        dailyMin, dailyMax,
        weeklyMin, weeklyMax,

        workMin: num(s.workMinReward, DEFAULTS.workMin),
        workMax: num(s.workMaxReward, DEFAULTS.workMax),

        robChance: Math.min(100, Math.max(0, num(s.robChance, DEFAULTS.robChance))),
        startingBalance: num(s.startingBalance, DEFAULTS.startingBalance),

        robEnabled: bool(s.robEnabled, DEFAULTS.robEnabled),
        gamblingEnabled: bool(s.gamblingEnabled, DEFAULTS.gamblingEnabled),
        shopEnabled: bool(s.shopEnabled, DEFAULTS.shopEnabled)
    };
}

/** Roll a random integer in [min, max] (inclusive). Safe for swapped args. */
function rollReward(min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    if (hi <= lo) return lo;
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function getCurrency(guildId) {
    return getEconomySettings(guildId).currency;
}

function getCurrencyName(guildId) {
    return getEconomySettings(guildId).currencyName;
}

function formatCoins(amount, guildId) {
    const cfg = getEconomySettings(guildId);
    const formatted = Number(amount || 0).toLocaleString();
    return `${cfg.currency} ${formatted} ${cfg.currencyName}`;
}

function formatCoinsShort(amount, guildId) {
    const cfg = getEconomySettings(guildId);
    return `${cfg.currency} ${Number(amount || 0).toLocaleString()}`;
}

module.exports = {
    DEFAULT_CURRENCY,
    DEFAULT_CURRENCY_NAME,
    DEFAULTS,
    getCurrency,
    getCurrencyName,
    formatCoins,
    formatCoinsShort,
    getGuildSettings,
    getEconomySettings,
    rollReward,
    loadSettings
};
