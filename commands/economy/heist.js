'use strict';

const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { EMOJIS } = require('../../utils/economyEmojis');

const COOLDOWN = 5 * 60 * 1000;
const JOIN_WINDOW = 30 * 1000;
const cooldowns = new Map();
const activeHeists = new Map();

const TARGETS = [
  { id: 'bank',    name: 'Bank Job',        emoji: '🏦', baseSuccessRate: 0.55, rewardBase: [1000, 5000],   riskFine: 0.10 },
  { id: 'museum',  name: 'Museum Heist',    emoji: '🏛', baseSuccessRate: 0.45, rewardBase: [3000, 8000],   riskFine: 0.12 },
  { id: 'casino',  name: 'Casino Robbery',  emoji: '🎰', baseSuccessRate: 0.35, rewardBase: [5000, 15000],  riskFine: 0.15 },
  { id: 'vault',   name: 'Royal Vault',     emoji: '👑', baseSuccessRate: 0.25, rewardBase: [10000, 30000], riskFine: 0.20 },
];

const SUCCESS_LINES = [
  'Your crew pulls it off flawlessly!',
  'In and out — not a single alarm triggered.',
  'A perfect score. The getaway was clean.',
  'They\'ll be talking about this one for years.',
];
const FAIL_LINES = [
  'A silent alarm gives you away.',
  'Your lookout spots the police too late.',
  'The vault door is thicker than expected.',
  'Security was upgraded last night.',
];

function buildLobbyEmbed(target, leader, members, secondsLeft) {
  const memberList = members.map(m => `> 🧑 ${m.username}`).join('\n') || '> *(no crew yet)*';
  const c = createContainer(0xCAD7E6);
  addTextDisplay(c, [
    `# ${target.emoji} Heist Planning — ${target.name}`,
    '',
    `${EMOJIS.user} **Leader:** ${leader.username}`,
    `👥 **Crew (${members.length}):**`,
    memberList,
    '',
    `${EMOJIS.sandwatch} Heist launches in **${secondsLeft}s** — click below to join!`,
    `-# Success rate improves with more crew members.`,
  ].join('\n'));
  return c;
}

async function runHeist(msg, target, leader, members, interaction) {
  const allParticipants = [leader, ...members];
  const crewBonus = Math.min((allParticipants.length - 1) * 0.08, 0.32);
  const successRate = Math.min(target.baseSuccessRate + crewBonus, 0.90);
  const success = Math.random() < successRate;

  const economy = economyManager.loadEconomy();

  if (success) {
    const totalReward = Math.floor(Math.random() * (target.rewardBase[1] - target.rewardBase[0] + 1)) + target.rewardBase[0];
    const share = Math.floor(totalReward / allParticipants.length);
    const shareLines = [];

    for (const p of allParticipants) {
      const { userData } = economyManager.getUser(economy, p.id);
      userData.coins = (userData.coins || 0) + share;
      userData.totalEarned = (userData.totalEarned || 0) + share;
      userData.heistCount = (userData.heistCount || 0) + 1;
      economyManager.checkAllAchievements(economy, p.id);
      shareLines.push(`> ${p.username} → **+${formatNumber(share)} coins**`);
    }

    economyManager.saveEconomy(economy);

    const flavor = SUCCESS_LINES[Math.floor(Math.random() * SUCCESS_LINES.length)];
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# ${target.emoji} Heist Success!`,
      `## ${target.name}`,
      '',
      `✅ *${flavor}*`,
      '',
      `<:Money:1473377877239140529> **Total stolen:** ${formatNumber(totalReward)} coins`,
      `👥 **Split between ${allParticipants.length} crew member(s):**`,
      ...shareLines,
      '',
      `-# Cooldown: 5 minutes`,
    ].join('\n'));

    if (msg.edit) return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });

  } else {
    const fineLines = [];
    for (const p of allParticipants) {
      const { userData } = economyManager.getUser(economy, p.id);
      const fine = Math.floor((userData.coins || 0) * target.riskFine);
      userData.coins = Math.max(0, (userData.coins || 0) - fine);
      fineLines.push(`> ${p.username} → **-${formatNumber(fine)} coins**`);
    }
    economyManager.saveEconomy(economy);

    const flavor = FAIL_LINES[Math.floor(Math.random() * FAIL_LINES.length)];
    const c = createContainer(0xED4245);
    addTextDisplay(c, [
      `# ${target.emoji} Heist Failed!`,
      `## ${target.name}`,
      '',
      `❌ *${flavor}*`,
      '',
      `💸 **Fines paid:**`,
      ...fineLines,
      '',
      `-# Cooldown: 5 minutes`,
    ].join('\n'));

    if (msg.edit) return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    return interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
}

async function startHeist(interaction, targetId) {
  const leaderId = interaction.user.id;

  const now = Date.now();
  const lastUsed = cooldowns.get(leaderId) || 0;
  if (now - lastUsed < COOLDOWN) {
    const secs = Math.ceil((COOLDOWN - (now - lastUsed)) / 1000);
    const mins = Math.floor(secs / 60);
    const c = createContainer(0xED4245);
    addTextDisplay(c, `# ${EMOJIS.sandwatch} Heist Cooldown\n\n${EMOJIS.alarm} Lay low for **${mins}m ${secs % 60}s** before your next heist.`);
    return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  if (activeHeists.has(leaderId)) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} You already have an active heist in progress!`);
    return interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2, ephemeral: true });
  }

  const idx = targetId !== null ? targetId : Math.floor(Math.random() * TARGETS.length);
  const target = TARGETS[Math.min(Math.max(idx, 0), TARGETS.length - 1)];

  cooldowns.set(leaderId, now);
  const members = [];
  activeHeists.set(leaderId, { target, members, leaderId });

  const joinBtn = new ButtonBuilder()
    .setCustomId(`heist_join_${leaderId}`)
    .setLabel('Join Heist')
    .setEmoji('🦹')
    .setStyle(ButtonStyle.Success);
  const startBtn = new ButtonBuilder()
    .setCustomId(`heist_start_${leaderId}`)
    .setLabel('Launch Now')
    .setEmoji('🚀')
    .setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(joinBtn, startBtn);

  await interaction.deferReply();
  const msg = await interaction.editReply({
    components: [buildLobbyEmbed(target, interaction.user, members, 30), row],
    flags: MessageFlags.IsComponentsV2,
  });

  let secondsLeft = 30;
  const ticker = setInterval(async () => {
    secondsLeft -= 5;
    if (secondsLeft <= 0) {
      clearInterval(ticker);
      activeHeists.delete(leaderId);
      return runHeist(msg, target, interaction.user, members, interaction);
    }
    const current = activeHeists.get(leaderId);
    const currentMembers = current ? current.members : members;
    await msg.edit({
      components: [buildLobbyEmbed(target, interaction.user, currentMembers, secondsLeft), row],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  }, 5000);

  const collector = msg.createMessageComponentCollector({ time: JOIN_WINDOW });

  collector.on('collect', async btn => {
    if (btn.customId === `heist_join_${leaderId}`) {
      const joiner = btn.user;
      const heist = activeHeists.get(leaderId);
      if (!heist) return btn.deferUpdate();

      if (joiner.id === leaderId || heist.members.find(m => m.id === joiner.id)) {
        return btn.reply({ content: 'You are already in this heist!', ephemeral: true });
      }
      heist.members.push(joiner);
      await btn.update({
        components: [buildLobbyEmbed(target, interaction.user, heist.members, secondsLeft), row],
        flags: MessageFlags.IsComponentsV2,
      });

    } else if (btn.customId === `heist_start_${leaderId}`) {
      if (btn.user.id !== leaderId) {
        return btn.reply({ content: 'Only the leader can launch early!', ephemeral: true });
      }
      clearInterval(ticker);
      collector.stop('early_launch');
      const heist = activeHeists.get(leaderId);
      activeHeists.delete(leaderId);
      await btn.deferUpdate();
      return runHeist(msg, target, interaction.user, heist ? heist.members : members, interaction);
    }
  });

  collector.on('end', () => {
    clearInterval(ticker);
    activeHeists.delete(leaderId);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('heist')
    .setDescription('Plan a group heist — others can join within 30 seconds before it launches')
    .addIntegerOption(o => o.setName('target').setDescription('1=Bank, 2=Museum, 3=Casino, 4=Royal Vault (random if omitted)').setRequired(false).setMinValue(1).setMaxValue(4)),
  prefix: 'heist',
  aliases: ['robbery'],
  category: 'economy',
  description: 'Plan a group heist with a 30-second join window',
  usage: 'heist [1-4]',

  async executePrefix(message, args) {
    const idx = args[0] ? parseInt(args[0]) - 1 : null;
    const fakeInteraction = {
      user: message.author,
      reply: message.reply.bind(message),
      deferReply: async () => {},
      editReply: message.reply.bind(message),
    };
    return startHeist(fakeInteraction, idx);
  },

  async execute(interaction) {
    const target = interaction.options.getInteger('target');
    return startHeist(interaction, target !== null ? target - 1 : null);
  },
};
