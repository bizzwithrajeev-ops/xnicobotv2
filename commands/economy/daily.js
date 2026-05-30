'use strict';

const { MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { getEconomySettings, rollReward, formatCoins, formatCoinsShort , coinIcon, formatCoinsAmount } = require('../../utils/currencyHelper');

function buildCooldownBar(elapsed, total, length = 20) {
    const progress = Math.min(Math.floor((elapsed / total) * length), length);
    return '█'.repeat(progress) + '░'.repeat(length - progress);
}

async function handleDaily(reply, userId, guildId) {
    const cfg = getEconomySettings(guildId);
    const economy = economyManager.loadEconomy();
    const { userData: user } = economyManager.getUser(economy, userId);
    user.bonuses ||= { work: 0, daily: 0, gamble: 0, global: 0 };

    const now = Date.now();
    const COOLDOWN = 24 * 60 * 60 * 1000;
    const elapsed = now - user.lastDaily;

    if (elapsed < COOLDOWN) {
        const left = COOLDOWN - elapsed;
        const pct = Math.round((elapsed / COOLDOWN) * 100);

        const container = createContainer(0xCAD7E6);
        addTextDisplay(container, [
            `# <:Alarm:1473039068546732214> Daily Cooldown`,
            '',
            `You've already claimed today's reward.`,
            '',
            `> \`${buildCooldownBar(elapsed, COOLDOWN)}\` ${pct}%`,
            '',
            `<:Clock:1473039102113878056> **Available in:** ${economyManager.formatTime(left)}`,
            `-# Come back later to claim your next daily reward!`,
        ].join('\n'));
        return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const STREAK_WINDOW = 48 * 60 * 60 * 1000;
    let streak = user.dailyStreak || 0;
    if (elapsed <= STREAK_WINDOW) {
        streak++;
    } else {
        streak = 1;
    }
    user.dailyStreak = streak;

    // Pull range from dashboard config (falls back to legacy 500..1000)
    const baseReward = rollReward(cfg.dailyMin, cfg.dailyMax);
    const dailyBonus = Number(user.bonuses?.daily) || 0;
    const bonusAmount = Math.floor(baseReward * dailyBonus);
    const streakBonus = Math.floor(baseReward * Math.min(streak * 0.02, 0.5));
    const totalReward = baseReward + bonusAmount + streakBonus;

    user.coins += totalReward;
    // Track lifetime earnings so /profile and /economystats stay in
    // sync with the rest of the economy commands. Daily was the only
    // earning command that wasn't writing this field.
    user.totalEarned = (user.totalEarned || 0) + totalReward;
    user.lastDaily = now;
    economyManager.addXP(economy, userId, 10);
    economyManager.saveEconomy(economy);

    const container = createContainer(0xCAD7E6);

    let rewardText = `# 🎁 Daily Reward Claimed!\n\n`;
    rewardText += `### ${coinIcon(guildId)} Reward Breakdown\n`;
    rewardText += `> ${coinIcon(guildId)} **Base Reward:** ${formatCoinsAmount(baseReward, guildId)}\n`;
    if (streakBonus > 0) rewardText += `> <:Fire:1473038604812161218> **Streak Bonus** (${streak} days): +${formatCoins(streakBonus, guildId)}\n`;
    if (bonusAmount > 0) rewardText += `> <:Crown:1506010837368963142> **Daily Bonus:** +${formatCoins(bonusAmount, guildId)}\n`;

    addTextDisplay(container, rewardText);
    addSeparator(container, SeparatorSpacingSize.Small);

    addTextDisplay(container, [
        `### <:transfer:1479780506718437396> Summary`,
        `> ${coinIcon(guildId)} **Total Received:** ${formatCoinsAmount(totalReward, guildId)}`,
        `> ${coinIcon(guildId)} **New Balance:** ${formatCoinsAmount(user.coins, guildId)}`,
        `> <:Fire:1473038604812161218> **Current Streak:** ${streak} day${streak !== 1 ? 's' : ''} ${streak >= 7 ? '<:Fire:1473038604812161218>' : streak >= 3 ? '<:Star:1473038501766369300>' : ''}`,
        '',
        `-# Come back tomorrow to keep your streak going!`,
    ].join('\n'));

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
    data: new (require('discord.js').SlashCommandBuilder)()
        .setName('daily')
        .setDescription('Claim your daily reward'),
    prefix: 'daily',
    aliases: ['dailyreward'],
    category: 'economy',
    description: 'Claim your daily reward',

    async executePrefix(message) {
        return handleDaily(message.reply.bind(message), message.author.id, message.guild?.id);
    },

    async execute(interaction) {
        return handleDaily(interaction.reply.bind(interaction), interaction.user.id, interaction.guild?.id);
    }
};
