'use strict';

const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { formatCoins, coinIcon, getCurrency, getCurrencyName } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { CATEGORIES, getItems } = require('../../utils/shopItems');
const economyManager = require('../../utils/economyManager');
const { shopGuard } = require('../../utils/economyGuards');

const jsonStore = require('../../utils/jsonStore');

const CUSTOM_CATEGORY_ID    = 'custom';
const CUSTOM_CATEGORY_LABEL = 'Custom Shop';
const CUSTOM_CATEGORY_EMOJI = '<:Settings:1473037894703779851>';
const CUSTOM_CATEGORY_COLOR = 0xFBBF24;

const ACTION_LABELS = {
  give_role:    { emoji: '<:Userplus:1473038912212435086>', label: 'Grants role' },
  remove_role:  { emoji: '<:Trash:1473038090074591293>',     label: 'Removes role' },
  send_dm:      { emoji: '<:Envelope:1473038885364695113>',  label: 'DMs you' },
  add_coins:    { emoji: '<:Money:1473377877239140529>',     label: 'Bonus coins' },
  custom_reply: { emoji: '<:Chat:1473038936241864865>',      label: 'Custom reply' }
};

function loadInv() {
  if (!jsonStore.has('inventory')) return {};
  try { return jsonStore.read('inventory'); } catch { return {}; }
}

function loadCustomShop(guildId) {
  if (!guildId) return { items: [] };
  if (!jsonStore.has('custom-shop')) return { items: [] };
  try {
    const all = jsonStore.read('custom-shop') || {};
    return all[guildId] || { items: [] };
  } catch { return { items: [] }; }
}

/* ═══════════════════ BUILD PAGE ═══════════════════ */

/**
 * Build a "category" page. The reserved category id `custom` renders
 * the per-guild custom shop pulled from the `custom-shop` jsonStore.
 * Every built-in category renders the regular `utils/shopItems` data.
 *
 * Returns { container, row } so the caller can wire the same select
 * menu to swap categories without rebuilding state on the server.
 */
function buildShopPage(category, userId, guildId) {
  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);
  const inventory = loadInv();
  const userInv = inventory[userId] || [];

  const isCustom = category === CUSTOM_CATEGORY_ID;
  const customShop = isCustom ? loadCustomShop(guildId) : null;

  const cat = isCustom
    ? { label: CUSTOM_CATEGORY_LABEL, emoji: CUSTOM_CATEGORY_EMOJI, color: CUSTOM_CATEGORY_COLOR }
    : CATEGORIES[category];

  const items = isCustom ? (customShop.items || []) : getItems(category);

  const container = createContainer(cat.color);
  const icon = coinIcon(guildId);

  addTextDisplay(container, `# <:Cart:1473038854620143626> Economy Shop — ${cat.emoji} ${cat.label}\n${icon} Your Wallet: **${formatCoins(userData.coins, guildId)}**`);
  addSeparator(container, SeparatorSpacingSize.Small);

  if (items.length === 0) {
    if (isCustom) {
      addTextDisplay(container, [
        '*This server hasn\'t configured a custom shop yet.*',
        '',
        `### <:Settings:1473037894703779851> Admins`,
        '> Use `/customshop add <name> <price> <action> <data>` to add the first item.',
        '> Each item can grant a role, send a DM, give bonus coins, or post a custom reply.'
      ].join('\n'));
    } else {
      addTextDisplay(container, '*No items in this category.*');
    }
  } else if (isCustom) {
    // Render custom-shop items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const affordable = userData.coins >= item.price;
      const tag = !affordable ? ' `<:Cancel:1473037949187657818>`' : '';
      const actionInfo = ACTION_LABELS[item.action] || { emoji: '<:Star:1473038501766369300>', label: item.action };

      const lines = [
        `### ${actionInfo.emoji} ${item.name}${tag}`,
        item.description ? item.description : `${actionInfo.label}`,
        `-# ${icon} ${formatCoins(item.price, guildId)}  ·  ${actionInfo.emoji} ${actionInfo.label}  ·  Index: \`#${i + 1}\``
      ];
      addTextDisplay(container, lines.join('\n'));
    }
  } else {
    // Built-in category items
    for (const item of items) {
      const owned = userInv.filter(i => i.id === item.id).length;
      const affordable = userData.coins >= item.price;
      const atMax = owned >= item.maxOwn;
      const statusTag = atMax ? ' `MAX`' : !affordable ? ' `<:Cancel:1473037949187657818>`' : '';

      addTextDisplay(container, [
        `### ${item.emoji} ${item.name}${statusTag}`,
        `${item.description}`,
        `-# ${formatCoins(item.price, guildId)}  ·  📦 Owned: ${owned}/${item.maxOwn}  ·  <:Fileuser:1473039570630348810> \`${item.id}\``,
      ].join('\n'));
    }
  }

  addSeparator(container, SeparatorSpacingSize.Small);

  if (isCustom) {
    addTextDisplay(container, `-# <:Lightbulbalt:1473038470787240009> **Buy:** \`/customshop buy <name>\`  ·  **Admin:** \`/customshop add\` to add more items`);
  } else {
    addTextDisplay(container, `-# <:Lightbulbalt:1473038470787240009> **Buy:** \`buy <id> [amount]\`  ·  **Use:** \`use <id>\`  ·  **Sell:** \`sell-item <id> [amount]\``);
  }

  // ── Category select ────────────────────────────────────────
  // Build the option list dynamically so the Custom Shop tab only
  // appears when a guild has actually configured one. This keeps the
  // menu clean for servers that aren't using premium custom shop.
  const customShopForCheck = loadCustomShop(guildId);
  const showCustomTab = (customShopForCheck.items || []).length > 0 || isCustom;

  const opts = Object.entries(CATEGORIES).map(([catId, catData]) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(catData.label)
      .setValue(catId)
      .setEmoji(catData.emoji)
      .setDefault(catId === category)
  );

  if (showCustomTab) {
    opts.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(CUSTOM_CATEGORY_LABEL)
        .setDescription('Server-specific items configured by admins')
        .setValue(CUSTOM_CATEGORY_ID)
        .setEmoji(CUSTOM_CATEGORY_EMOJI)
        .setDefault(isCustom)
    );
  }

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('shop_cat_select')
      .setPlaceholder(`Category: ${cat.label}`)
      .addOptions(opts)
  );

  return { container, row: selectRow };
}

function resolveCategory(input, guildId) {
  if (!input) return 'consumable';
  const lower = String(input).toLowerCase();
  if (lower === CUSTOM_CATEGORY_ID) return CUSTOM_CATEGORY_ID;
  return CATEGORIES[lower] ? lower : 'consumable';
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
        { name: 'Custom Shop', value: 'custom' },
      )),
  prefix: 'shop',
  description: 'Browse the economy shop — buy items, boosts, loot boxes, and the server\'s custom shop',
  usage: 'shop [category]',
  aliases: ['store', 'market'],
  category: 'economy',

  async executePrefix(message, args) {
    if (await shopGuard(message)) return;
    const category = resolveCategory(args[0], message.guild?.id);
    const { container, row } = buildShopPage(category, message.author.id, message.guild?.id);
    return message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(interaction) {
    if (await shopGuard(interaction)) return;
    const category = resolveCategory(interaction.options?.getString('category'), interaction.guild?.id);
    const { container, row } = buildShopPage(category, interaction.user.id, interaction.guild?.id);
    return interaction.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  },

  /* ═══════════════════ SELECT HANDLER ═══════════════════ */

  async handleStringSelect(interaction) {
    if (interaction.customId !== 'shop_cat_select') return false;
    const category = resolveCategory(interaction.values[0], interaction.guild?.id);
    const { container, row } = buildShopPage(category, interaction.user.id, interaction.guild?.id);
    await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
    return true;
  },
};
