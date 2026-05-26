'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { formatCoins, formatCoinsShort , coinIcon, formatCoinsAmount } = require('../../utils/currencyHelper');
const economyManager = require('../../utils/economyManager');
const { ITEMS, getItem, itemDisplay } = require('../../utils/shopItems');
const jsonStore = require('../../utils/jsonStore');
const { shopGuard } = require('../../utils/economyGuards');

/* ═══════════════════ HELPERS ═══════════════════ */

function load() { return jsonStore.read('inventory'); }
function save(d) { jsonStore.write('inventory', d); }

/* ═══════════════════ COMMAND ═══════════════════ */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('buy')
    .setDescription('Purchase items from the shop')
    .addStringOption(o => o.setName('item').setDescription('Item ID to buy').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('Quantity to buy').setRequired(false).setMinValue(1).setMaxValue(100)),
  prefix: 'buy',
  description: 'Purchase items from the shop',
  usage: 'buy <item_id> [amount]',
  category: 'economy',
  aliases: ['purchase'],

  async executePrefix(message, args) {
        const guildId = message.guild?.id;
    if (await shopGuard(message)) return;
    const itemId = args[0]?.toLowerCase();
    const qty = Math.max(1, parseInt(args[1]) || 1);

    const item = itemId ? ITEMS[itemId] : null;

    if (!item) {
      const ids = Object.keys(ITEMS).map(id => `\`${id}\``).join(', ');
      const c = createContainer(0xED4245);
      addTextDisplay(c, [
        '<:Cancel:1473037949187657818> **Invalid item.**',
        '',
        '**Usage:** `buy <item_id> [amount]`',
        `**Available:** ${ids}`,
        '',
        '-# Use `shop` to browse all items with details.',
      ].join('\n'));
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    if (qty < 1 || qty > 100) {
      const c = createContainer(0xED4245);
      addTextDisplay(c, '<:Cancel:1473037949187657818> Amount must be between **1** and **100**.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const economy = economyManager.loadEconomy();
    const inventory = load();
    const userId = message.author.id;

    const { userData } = economyManager.getUser(economy, userId);
    inventory[userId] ||= [];

    /* ── Max-own check ── */
    const owned = inventory[userId].filter(i => i.id === itemId).length;
    if (owned + qty > item.maxOwn) {
      const canBuy = item.maxOwn - owned;
      const c = createContainer(0xED4245);
      addTextDisplay(c, [
        `<:Cancel:1473037949187657818> **Purchase limit reached!**`,
        '',
        `${item.emoji} ${item.name}: **${owned}/${item.maxOwn}** owned`,
        canBuy > 0 ? `You can buy up to **${canBuy}** more.` : 'You already own the maximum.',
      ].join('\n'));
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    /* ── Funds check ── */
    const totalCost = item.price * qty;
    if (userData.coins < totalCost) {
      const deficit = totalCost - userData.coins;
      const c = createContainer(0xED4245);
      addTextDisplay(c, [
        '<:Cancel:1473037949187657818> **Not enough coins!**',
        '',
        `${coinIcon(guildId)} Cost: **${formatCoinsAmount(totalCost, guildId)}**`,
        `💼 Wallet: **${formatCoins(userData.coins, guildId)}**`,
        `📉 Short: **${formatCoins(deficit, guildId)}**`,
      ].join('\n'));
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    /* ═══════ PROCESS PURCHASE ═══════ */

    userData.coins -= totalCost;
    for (let i = 0; i < qty; i++) {
      inventory[userId].push({ id: itemId, boughtAt: Date.now() });
    }

    economyManager.saveEconomy(economy);
    save(inventory);

    /* ═══════ RESPONSE ═══════ */

    const newOwned = owned + qty;
    const container = createContainer(0xCAD7E6);
    addTextDisplay(container, [
      '# 🛒 Purchase Successful',
      '',
      `<:Checkedbox:1473038547165384804> Bought **${qty}× ${item.emoji} ${item.name}**`,
      `${coinIcon(guildId)} Cost: **${formatCoinsAmount(totalCost, guildId)}**`,
      '',
      `💼 Wallet: **${formatCoins(userData.coins, guildId)}**`,
      `<:Box:1473039115581915256> Owned: **${newOwned}/${item.maxOwn}**`,
      '',
      `-# <:Lightbulbalt:1473038470787240009> \`use ${itemId}\` to use  ·  \`inventory\` to view all items`,
    ].join('\n'));

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
    if (await shopGuard(interaction)) return;
    const itemId = interaction.options?.getString('item');
    const qty = interaction.options?.getInteger('amount') || 1;
    const fakeArgs = [itemId, String(qty)].filter(Boolean);
    const fakeMessage = {
      author: interaction.user,
      guild: interaction.guild,
      reply: (opts) => interaction.editReply(opts),
    };
    return module.exports.executePrefix(fakeMessage, fakeArgs);
  },
};