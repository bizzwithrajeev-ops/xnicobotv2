'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');
const { parseBet, processBetResult, getBalance, MAX_BET } = require('../../utils/betHelper');
const { gamblingGuard } = require('../../utils/economyGuards');

const COOLDOWN = 5_000;
const cooldowns = new Map();

// Multiplier wheel — weighted outcomes
const OUTCOMES = [
    { multiplier: 0,   weight: 35, label: '💀 Bust',      color: 0xED4245 },
    { multiplier: 0.5, weight: 20, label: '📉 Half Back', color: 0xFEE75C },
    { multiplier: 1,   weight: 15, label: '🔄 Break Even', color: 0xCAD7E6 },
    { multiplier: 1.5, weight: 15, label: '📈 1.5x',      color: 0x57F287 },
    { multiplier: 2,   weight: 10, label: '🎉 2x',        color: 0x57F287 },
    { multiplier: 3,   weight: 4,  label: '<:Fire:1473038604812161218> 3x',        color: 0x5865F2 },
    { multiplier: 5,   weight: 1,  label: '<:Sketch:1473038248493453352> JACKPOT 5x', color: 0xA855F7 },
];

function spinWheel() {
    const totalWeight = OUTCOMES.reduce((s, o) => s + o.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const outcome of OUTCOMES) {
        rand -= outcome.weight;
        if (rand <= 0) return outcome;
    }
    return OUTCOMES[0];
}

async function handleGamble(reply, userId, args, guildId) {
    const now = Date.now();

    if (cooldowns.get(userId) > now) {
        const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
        const c = createContainer(0xCAD7E6);
        addTextDisplay(c, `<:Clock:1473039102113878056> Wait **${left}s** before gambling again.`);
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const balance = getBalance(userId);
    const betResult = parseBet(args[0], balance);

    if (!betResult.valid) {
        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# <:Gamepad:1473039216429498409> Gamble`,
            '',
            `**Usage:** \`gamble <amount>\``,
            `**Max Bet:** ${formatNumber(MAX_BET)}`,
            '',
            `Spin the multiplier wheel!`,
            `**Outcomes:** Bust (0x) • Half (0.5x) • Even (1x) • 1.5x • 2x • 3x • <:Sketch:1473038248493453352> 5x Jackpot`,
            '',
            `**Examples:**`,
            `\`gamble 500\``,
            `\`gamble 50k\``,
            `\`gamble all\``,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const bet = betResult.amount;
    cooldowns.set(userId, now + COOLDOWN);

    const outcome = spinWheel();
    const payout = Math.floor(bet * outcome.multiplier);
    const profit = payout - bet;
    const won = profit > 0;
    const lost = profit < 0;

    // Process: if multiplier > 1, user wins (payout - bet). If < 1, user loses (bet - payout).
    const economyManager = require('../../utils/economyManager');
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);

    userData.coins += profit;
    userData.totalGambled = (userData.totalGambled || 0) + bet;
    if (won) userData.totalWon = (userData.totalWon || 0) + profit;
    if (lost) userData.totalLost = (userData.totalLost || 0) + Math.abs(profit);
    economyManager.addXP(economy, userId, won ? 8 : 2);
    economyManager.checkAllAchievements(economy, userId);
    economyManager.saveEconomy(economy);

    const container = createContainer(outcome.color);

    addTextDisplay(container, [
        `# <:Gamepad:1473039216429498409> Gamble`,
        '',
        `## ${outcome.label}`,
        `> Multiplier: **${outcome.multiplier}x**`,
    ].join('\n'));

    addSeparator(container, SeparatorSpacingSize.Small);

    const lines = [];
    if (profit > 0) {
        lines.push(`<:Checkedbox:1473038547165384804> **Won ${formatCoins(profit, guildId)}!**`);
    } else if (profit === 0) {
        lines.push(`🔄 **Break even — no coins lost.**`);
    } else {
        lines.push(`<:Cancel:1473037949187657818> **Lost ${formatCoins(Math.abs(profit), guildId)}**`);
    }
    lines.push('', `<:Money:1473377877239140529> **Balance:** ${formatCoins(userData.coins, guildId)}`);

    addTextDisplay(container, lines.join('\n'));
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('gamble')
        .setDescription('Spin the multiplier wheel (max 100k)')
        .addStringOption(o => o.setName('amount').setDescription('Bet amount or "all"').setRequired(true)),

    prefix: 'gamble',
    description: 'Spin the multiplier wheel — 0x to 5x payout (max 100k)',
    usage: 'gamble <amount>',
    category: 'economy',
    aliases: ['bet'],

    async execute(interaction) {
        // Honour the per-guild "Gambling enabled" toggle from the dashboard.
        if (await gamblingGuard(interaction)) return;
        const amount = interaction.options.getString('amount');
        await handleGamble((opts) => interaction.reply(opts), interaction.user.id, [amount], interaction.guild?.id);
    },

    async executePrefix(message, args) {
        if (await gamblingGuard(message)) return;
        await handleGamble((opts) => message.reply(opts), message.author.id, args, message.guild?.id);
    }
};
