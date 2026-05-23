'use strict';

const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { formatCoins, formatCoinsShort } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { CATEGORIES, getItems } = require('../../utils/shopItems');
const economyManager = require('../../utils/economyManager');
const { shopGuard } = require('../../utils/economyGuards');

const jsonStore = require('../../utils/jsonStore');

function loadInv() {
  if (!jsonStore.has('inventory')) return {};
  try { return jsonStore.read('inventory'); } catch { return {}; }
}

/* ═══════════════════ BUILD PAGE ═══════════════════ */

function buildShopPage(category, userId, guildId) {
  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);
  const inventory = loadInv();
  const userInv = inventory[userId] || [];

  const cat = CATEGORIES[category];
  const items = getItems(category);

  const container = createContainer(cat.color);

  addTextDisplay(container, `# 🛒 Economy Shop — ${cat.emoji} ${cat.label}\n<:Money:1473377877239140529> Your Wallet: **${formatCoins(userData.coins, guildId)}**`);
  addSeparator(container, SeparatorSpacingSize.Small);

  if (items.length === 0) {
    addTextDisplay(container, '*No items in this category.*');
  } else {
    for (const item of items) {
      const owned = userInv.filter(i => i.id === item.id).length;
      const affordable = userData.coins >= item.price;
      const atMax = owned >= item.maxOwn;
      const statusTag = atMax ? ' `MAX`' : !affordable ? ' `💸`' : '';

      addTextDisplay(container, [
        `### ${item.emoji} ${item.name}${statusTag}`,
        `${item.description}`,
        `-# ${formatCoins(item.price, guildId)}  ·  📦 Owned: ${owned}/${item.maxOwn}  ·  <:Fileuser:1473039570630348810> \`${item.id}\``,
      ].join('\n'));
    }
  }

  addSeparator(container, SeparatorSpacingSize.Small);
  addTextDisplay(container, `-# <:Lightbulbalt:1473038470787240009> **Buy:** \`buy <id> [amount]\`  ·  **Use:** \`use <id>\`  ·  **Sell:** \`sell-item <id> [amount]\``);

  // Category select menu — supports unlimited categories without ActionRow overflow
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('shop_cat_select')
      .setPlaceholder(`📂 Category: ${cat.label}`)
      .addOptions(
        Object.entries(CATEGORIES).map(([catId, catData]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(catData.label)
            .setValue(catId)
            .setEmoji(catData.emoji)
            .setDefault(catId === category)
        )
      )
  );

  return { container, row: selectRow };
}

/* ═══════════════════ COMMAND ═══════════════════ */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('shop')
    .setDescription('Browse the economy shop')
    .addStringOption(o => o.setName('category').setDescription('Category to browse').setRequired(false)
      .addChoices(
        { name: 'Consumables', value: 'consumable' },
        { name: 'Boosts', value: 'boost' },
        { name: 'Loot Boxes', value: 'loot' },
        { name: 'Special', value: 'special' },
        { name: 'Seeds', value: 'seeds' },
        { name: 'Mining Gear', value: 'mining' },
        { name: 'Materials', value: 'materials' },
      )),
  prefix: 'shop',
  description: 'Browse the economy shop — buy items, boosts, and loot boxes',
  usage: 'shop [category]',
  aliases: ['store', 'market'],
  category: 'economy',

  async executePrefix(message, args) {
    // Honour the per-guild "Shop enabled" toggle from the dashboard.
    if (await shopGuard(message)) return;
    const startCat = args[0]?.toLowerCase();
    const category = CATEGORIES[startCat] ? startCat : 'consumable';
    const { container, row } = buildShopPage(category, message.author.id, message.guild?.id);
    return message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(interaction) {
    if (await shopGuard(interaction)) return;
    const startCat = interaction.options?.getString('category') || 'consumable';
    const category = CATEGORIES[startCat] ? startCat : 'consumable';
    const { container, row } = buildShopPage(category, interaction.user.id, interaction.guild?.id);
    return interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  },

  /* ═══════════════════ SELECT HANDLER ═══════════════════ */

  async handleStringSelect(interaction) {
    if (interaction.customId !== 'shop_cat_select') return false;
    const category = CATEGORIES[interaction.values[0]] ? interaction.values[0] : 'consumable';
    const { container, row } = buildShopPage(category, interaction.user.id, interaction.guild?.id);
    await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    return true;
  },
};
