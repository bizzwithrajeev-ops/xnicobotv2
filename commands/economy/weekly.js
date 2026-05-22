'use strict';

const { MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { getEconomySettings, rollReward } = require('../../utils/currencyHelper');

const COOLDOWN = 7 * 24 * 60 * 60 * 1000;

function buildCooldownBar(elapsed, total, length = 20) {
    const progress = Math.min(Math.floor((elapsed / total) * length), length);
    return '█'.repeat(progress) + '░'.repeat(length - progress);
}

async function handleWeekly(reply, userId, guildId) {
    const cfg = getEconomySettings(guildId);
    const economy = economyManager.loadEconomy();
    const { userData } = economyManager.getUser(economy, userId);
    userData.bonuses ||= { work: 0, daily: 0, gamble: 0, global: 0 };

    const now = Date.now();
    const elapsed = now - (userData.lastWeekly || 0);

    if (elapsed < COOLDOWN) {
      const left = COOLDOWN - elapsed;
      const pct = Math.round((elapsed / COOLDOWN) * 100);
      const daysLeft = Math.floor(left / 86_400_000);
      const hoursLeft = Math.floor((left % 86_400_000) / 3_600_000);
      const minutesLeft = Math.floor((left % 3_600_000) / 60_000);

      let timeStr = '';
      if (daysLeft > 0) timeStr += `${daysLeft}d `;
      if (hoursLeft > 0) timeStr += `${hoursLeft}h `;
      timeStr += `${minutesLeft}m`;

      const container = createContainer(0xCAD7E6);
      addTextDisplay(container, [
          `# <:Alarm:1473039068546732214> Weekly Cooldown`,
          '',
          `You've already claimed this week's reward.`,
          '',
          `> \`${buildCooldownBar(elapsed, COOLDOWN)}\` ${pct}%`,
          '',
          `<:Clock:1473039102113878056> **Available in:** ${timeStr.trim()}`,
          `-# Weekly rewards reset every 7 days`,
      ].join('\n'));
      return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const streak = userData.streak || 0;
    const weeklyClaimCount = (userData.weeklyClaimCount || 0) + 1;
    userData.weeklyClaimCount = weeklyClaimCount;

    // Pull range from dashboard config (falls back to legacy 3000..6000)
    const baseReward = rollReward(cfg.weeklyMin, cfg.weeklyMax);
    const streakBonus = Math.floor(baseReward * Math.min(streak * 0.05, 1.0));
    const globalBonus = Math.floor(baseReward * (Number(userData.bonuses?.global) || 0));
    const weeklyMultiplier = Math.min(Math.floor(weeklyClaimCount / 4), 5);
    const loyaltyBonus = Math.floor(baseReward * (weeklyMultiplier * 0.01));
    const totalReward = baseReward + streakBonus + globalBonus + loyaltyBonus;

    userData.coins += totalReward;
    userData.lastWeekly = now;
    economyManager.addXP(economy, userId, 25);
    economyManager.saveEconomy(economy);

    const container = createContainer(0xCAD7E6);

    let rewardText = `# 🎁 Weekly Reward Claimed!\n\n`;
    rewardText += `### <:Money:1473377877239140529> Reward Breakdown\n`;
    rewardText += `> <:Money:1473377877239140529> **Base Reward:** ${formatNumber(baseReward)} coins\n`;
    if (streakBonus > 0) rewardText += `> <:Fire:1473038604812161218> **Streak Bonus** (${streak} days): +${formatNumber(streakBonus)} coins\n`;
    if (globalBonus > 0) rewardText += `> <:Crown:1506010837368963142> **Global Bonus:** +${formatNumber(globalBonus)} coins\n`;
    if (loyaltyBonus > 0) rewardText += `> <:Star:1473038501766369300> **Loyalty Bonus** (Week ${weeklyClaimCount}): +${formatNumber(loyaltyBonus)} coins\n`;

    addTextDisplay(container, rewardText);
    addSeparator(container, SeparatorSpacingSize.Small);

    addTextDisplay(container, [
        `### <:transfer:1479780506718437396> Summary`,
        `> <:Money:1473377877239140529> **Total Received:** ${formatNumber(totalReward)} coins`,
        `> <:Money:1473377877239140529> **New Balance:** ${formatNumber(userData.coins)} coins`,
        `> <:Bookopen:1473038576391557130> **Weeks Claimed:** ${weeklyClaimCount}`,
        '',
        `-# Come back next week for another reward!`,
    ].join('\n'));

    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('weekly')
    .setDescription('Claim your weekly reward'),
  prefix: 'weekly',
  aliases: ['weeklyreward'],
  category: 'economy',
  description: 'Claim your weekly reward',

  async executePrefix(message) {
    return handleWeekly(message.reply.bind(message), message.author.id, message.guild?.id);
  },

  async execute(interaction) {
    return handleWeekly(interaction.reply.bind(interaction), interaction.user.id, interaction.guild?.id);
  }
};
