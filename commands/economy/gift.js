'use strict';

const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, formatNumber, SeparatorSpacingSize, addSeparator } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { EMOJIS } = require('../../utils/economyEmojis');
const { getItem } = require('../../utils/shopItems');
const { resolveUser } = require('../../utils/resolveUser');

const COOLDOWN = 60 * 1000;
const cooldowns = new Map();

async function handleGift(reply, senderId, target, itemId, quantity) {
  if (!target || target.id === senderId || target.bot) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} You must mention a valid user to gift an item to.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  if (!itemId) {
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# ${EMOJIS.present} Gift an Item`,
      '',
      `**Usage:** \`/gift @user <item_id> [quantity]\``,
      '',
      `Gift any item from your inventory to another player.`,
      `Use \`/inventory\` to see your items and their IDs.`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const now = Date.now();
  const lastUsed = cooldowns.get(senderId) || 0;
  const remaining = COOLDOWN - (now - lastUsed);
  if (remaining > 0) {
    const secs = Math.ceil(remaining / 1000);
    const c = createContainer(0xED4245);
    addTextDisplay(c, `# ${EMOJIS.sandwatch} Gift Cooldown\n\n${EMOJIS.alarm} Wait **${secs}s** before gifting again.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const qty = Math.max(1, Math.min(quantity || 1, 100));
  const economy = economyManager.loadEconomy();
  const { userData: sender } = economyManager.getUser(economy, senderId);

  const inv = sender.inventory || {};
  const haveQty = typeof inv === 'object' && !Array.isArray(inv) ? (inv[itemId] || 0) : 0;

  if (haveQty < qty) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} You only have **${haveQty}x \`${itemId}\`** but tried to gift **${qty}**.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const itemInfo = getItem(itemId);
  const itemName = itemInfo?.name || itemId;
  const itemEmoji = itemInfo?.emoji || EMOJIS.present;

  cooldowns.set(senderId, now);

  inv[itemId] -= qty;
  if (inv[itemId] <= 0) delete inv[itemId];
  sender.inventory = inv;

  const { userData: receiver } = economyManager.getUser(economy, target.id);
  const recvInv = (typeof receiver.inventory === 'object' && !Array.isArray(receiver.inventory))
    ? receiver.inventory : {};
  recvInv[itemId] = (recvInv[itemId] || 0) + qty;
  receiver.inventory = recvInv;

  sender.giftsSent = (sender.giftsSent || 0) + qty;
  economyManager.checkAllAchievements(economy, senderId);
  economyManager.saveEconomy(economy);

  const c = createContainer(0xCAD7E6);
  addTextDisplay(c, [
    `# ${EMOJIS.present} Gift Sent!`,
    '',
    `${itemEmoji} **${target.username}** received **${qty}x ${itemName}** from you!`,
    '',
    `🎀 **Total gifts sent:** ${formatNumber(sender.giftsSent)}`,
    `-# Cooldown: 1 minute`,
  ].join('\n'));
  return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gift')
    .setDescription('Gift an item from your inventory to another user')
    .addUserOption(o => o.setName('user').setDescription('User to gift to').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item ID to gift').setRequired(true))
    .addIntegerOption(o => o.setName('quantity').setDescription('Quantity to gift').setRequired(false).setMinValue(1).setMaxValue(100)),
  prefix: 'gift',
  aliases: [],
  category: 'economy',
  description: 'Gift an inventory item to another user',
  usage: 'gift <@user> <item_id> [quantity]',

  async executePrefix(message, args) {
    const target = await resolveUser(message, args);
    const itemId  = args[1]?.toLowerCase();
    const qty     = parseInt(args[2]) || 1;
    return handleGift(message.reply.bind(message), message.author.id, target, itemId, qty);
  },

  async execute(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user');
    const itemId  = interaction.options.getString('item')?.toLowerCase();
    const qty     = interaction.options.getInteger('quantity') || 1;
    return handleGift(interaction.editReply.bind(interaction), interaction.user.id, target, itemId, qty);
  },
};
