'use strict';

const { MessageFlags } = require('discord.js');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');

const GIVERS = [
  { name: 'A kind stranger', emoji: '🧑', minCoins: 10, maxCoins: 100 },
  { name: 'Elon Musk', emoji: '🚀', minCoins: 100, maxCoins: 500 },
  { name: 'A rich grandma', emoji: '👵', minCoins: 50, maxCoins: 300 },
  { name: 'The Mayor', emoji: '🏛', minCoins: 80, maxCoins: 400 },
  { name: 'A tourist', emoji: '🧳', minCoins: 20, maxCoins: 150 },
  { name: 'A passing pirate', emoji: '🏴‍☠', minCoins: 60, maxCoins: 350 },
  { name: 'A wizard', emoji: '🧙', minCoins: 40, maxCoins: 250 },
  { name: 'God', emoji: '<:Star:1473038501766369300>', minCoins: 200, maxCoins: 1000 },
  { name: 'A random NPC', emoji: '<:bots:1473368718120849500>', minCoins: 15, maxCoins: 120 },
  { name: 'Your long-lost uncle', emoji: '👨', minCoins: 100, maxCoins: 600 },
];

const DENIALS = [
  'Nobody felt generous today.',
  'Everyone ignored you.',
  'A pigeon pooped on you instead.',
  'You got nothing but weird looks.',
  'Someone threw a shoe at you.',
  'The crowd walked right past you.',
];

const COOLDOWN = 45_000;
const cooldowns = new Map();

async function handleBeg(reply, userId, guildId) {
  const now = Date.now();

  if (cooldowns.get(userId) > now) {
    const left = Math.ceil((cooldowns.get(userId) - now) / 1000);
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, `<:Clock:1473039102113878056> Wait **${left}s** before begging again.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
  cooldowns.set(userId, now + COOLDOWN);

  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  const success = Math.random() < 0.70;

  if (success) {
    const giver = GIVERS[Math.floor(Math.random() * GIVERS.length)];
    const amount = Math.floor(Math.random() * (giver.maxCoins - giver.minCoins + 1)) + giver.minCoins;

    userData.coins += amount;
    economyManager.addXP(economy, userId, 3);
    economyManager.saveEconomy(economy);

    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
      `# 🙏 Beg`,
      '',
      `${giver.emoji} **${giver.name}** gave you **${formatCoins(amount, guildId)}**!`,
      '',
      `<:Money:1473377877239140529> **Balance:** ${formatCoins(userData.coins, guildId)}`,
      '',
      `-# Beg again in 45 seconds`,
    ].join('\n'));
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  const denial = DENIALS[Math.floor(Math.random() * DENIALS.length)];
  economyManager.saveEconomy(economy);

  const container = createContainer(0x6b7280);
  addTextDisplay(container, [
    `# 🙏 Beg`,
    '',
    `😔 ${denial}`,
    '',
    `<:Money:1473377877239140529> **Balance:** ${formatCoins(userData.coins, guildId)}`,
    '',
    `-# Better luck next time!`,
  ].join('\n'));
  return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('beg')
    .setDescription('Beg for coins from strangers'),
  prefix: 'beg',
  aliases: ['plead', 'panhandle'],
  category: 'economy',
  description: 'Beg for coins from strangers',

  async executePrefix(message) {
    return handleBeg(message.reply.bind(message), message.author.id, message.guild?.id);
  },

  async execute(interaction) {
    return handleBeg(interaction.reply.bind(interaction), interaction.user.id, interaction.guild?.id);
  }
};
