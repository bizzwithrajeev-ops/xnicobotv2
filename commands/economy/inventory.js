'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const { ITEMS, itemDisplay, CATEGORIES } = require('../../utils/shopItems');
const economyManager = require('../../utils/economyManager');

const jsonStore = require('../../utils/jsonStore');
const ITEMS_PER_PAGE = 6;

function load() {
  if (!jsonStore.has('inventory')) return {};
  try { return jsonStore.read('inventory'); } catch { return {}; }
}

/* ═══════════════════ GROUP ITEMS ═══════════════════ */

function groupItems(items) {
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.id]) grouped[item.id] = { id: item.id, count: 0, oldest: item.boughtAt || 0 };
    grouped[item.id].count++;
    if (item.boughtAt && item.boughtAt < grouped[item.id].oldest) grouped[item.id].oldest = item.boughtAt;
  }
  // Sort by category order, then by name
  const catOrder = Object.keys(CATEGORIES);
  return Object.values(grouped).sort((a, b) => {
    const catA = ITEMS[a.id]?.category || 'special';
    const catB = ITEMS[b.id]?.category || 'special';
    const orderDiff = catOrder.indexOf(catA) - catOrder.indexOf(catB);
    if (orderDiff !== 0) return orderDiff;
    return (ITEMS[a.id]?.name || a.id).localeCompare(ITEMS[b.id]?.name || b.id);
  });
}

/* ═══════════════════ BUILD PAGE ═══════════════════ */

function buildInventoryPage(userId, page = 0) {
  const inventory = load();
  const userItems = inventory[userId] || [];
  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  const container = createContainer(0x7c3aed);

  if (!userItems.length) {
    addTextDisplay(container, '# 🎒 Your Inventory\n\nYour inventory is empty! Use `shop` to browse items.');
    return { container, components: [container] };
  }

  const grouped = groupItems(userItems);
  const totalPages = Math.ceil(grouped.length / ITEMS_PER_PAGE);
  page = Math.max(0, Math.min(page, totalPages - 1));
  const pageItems = grouped.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  // Header
  const totalItems = userItems.length;
  const uniqueItems = grouped.length;
  addTextDisplay(container, `# 🎒 Your Inventory\n💰 Wallet: **${formatNumber(userData.coins)}** coins  ·  📦 ${totalItems} items (${uniqueItems} unique)`);
  addSeparator(container, SeparatorSpacingSize.Small);

  // Items list
  for (const entry of pageItems) {
    const meta = ITEMS[entry.id];
    if (!meta) {
      addTextDisplay(container, `❓ \`${entry.id}\` × **${entry.count}** — *Unknown item*`);
      continue;
    }
    const catMeta = CATEGORIES[meta.category];
    const sellVal = meta.sellPrice ? ` ·  💸 Sell: ${formatNumber(meta.sellPrice)}/ea` : '';
    addTextDisplay(container, [
      `### ${meta.emoji} ${meta.name}  ×${entry.count}`,
      `-# ${catMeta?.emoji || '📦'} ${catMeta?.label || 'Other'}${sellVal}  ·  \`use ${entry.id}\``,
    ].join('\n'));
  }

  addSeparator(container, SeparatorSpacingSize.Small);
  addTextDisplay(container, `-# Page ${page + 1}/${totalPages}  ·  \`use <id>\` to use  ·  \`sell-item <id> [amount]\` to sell`);

  // Build components array
  const components = [container];

  // Quick-use select menu (only if there are usable items)
  if (grouped.length > 0) {
    const selectItems = grouped.slice(0, 25).map(entry => {
      const meta = ITEMS[entry.id];
      return {
        label: `${meta?.name || entry.id} (×${entry.count})`,
        value: entry.id,
        emoji: meta?.emoji?.startsWith('<') ? undefined : { name: meta?.emoji || '📦' },
        description: meta?.description?.slice(0, 100) || 'Use this item',
      };
    });

    const selectRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('inv_use')
        .setPlaceholder('⚡ Quick Use — Select an item')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(selectItems)
    );
    components.push(selectRow);
  }

  // Pagination buttons
  if (totalPages > 1) {
    const navRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`inv_page_${page - 1}`)
        .setEmoji('<:History:1473037847568318605>').setLabel('Prev')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('inv_page_info')
        .setLabel(`${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`inv_page_${page + 1}`)
        .setEmoji('<:Skipnext:1473039269726785737>').setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
    components.push(navRow);
  }

  return { container, components };
}

/* ═══════════════════ COMMAND ═══════════════════ */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('inventory')
    .setDescription('View your item inventory'),
  prefix: 'inventory',
  description: 'View your item inventory with quick-use menu',
  usage: 'inventory',
  category: 'economy',
  aliases: ['inv', 'bag', 'items'],

  async executePrefix(message) {
    const { components } = buildInventoryPage(message.author.id, 0);
    return message.reply({ components, flags: MessageFlags.IsComponentsV2 });
  },

  /* ═══════════════════ INTERACTION HANDLER ═══════════════════ */

  async handleInteraction(interaction) {
    const { customId } = interaction;

    /* ── Pagination ── */
    if (customId.startsWith('inv_page_')) {
      const page = parseInt(customId.replace('inv_page_', ''));
      if (isNaN(page)) { await interaction.deferUpdate(); return true; }

      const { components } = buildInventoryPage(interaction.user.id, page);
      await interaction.update({ components, flags: MessageFlags.IsComponentsV2 });
      return true;
    }

    /* ── Quick-use select ── */
    if (customId === 'inv_use') {
      const itemId = interaction.values?.[0];
      if (!itemId) { await interaction.deferUpdate(); return true; }

      // Delegate to the use command logic
      const useCmd = require('./use');
      if (useCmd && useCmd.executeUse) {
        await useCmd.executeUse(interaction, itemId);
        return true;
      }

      await interaction.deferUpdate();
      return true;
    }

    return false;
  },

  async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
    const fakeMessage = {
      author: interaction.user,
      reply: (opts) => interaction.editReply(opts),
    };
    return module.exports.executePrefix(fakeMessage);
  },
};