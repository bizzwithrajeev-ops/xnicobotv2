'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { getAllRecipes, getRecipe } = require('../../utils/craftingRecipes');
const { EMOJIS } = require('../../utils/economyEmojis');

async function handleCraft(reply, userId, recipeId) {
  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);
  userData.oreInventory = userData.oreInventory || {};
  userData.inventory = userData.inventory || {};

  /* ── LIST ── */
  if (!recipeId || recipeId === 'list') {
    const recipes = getAllRecipes();
    const lines = recipes.map(r => {
      const inputStr = Object.entries(r.inputs)
        .map(([mat, qty]) => `${qty}x \`${mat}\``)
        .join(', ');
      return `> ${r.emoji} **${r.name}** (\`${r.id}\`)\n> *${r.description}*\n> **Needs:** ${inputStr}`;
    });
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# 🔨 Crafting Bench`,
      '',
      ...lines,
      '',
      `Use \`/craft <recipe_id>\` to craft an item.`,
      `-# Mine ores using /mine — view ores in /inventory`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  /* ── CRAFT ── */
  const recipe = getRecipe(recipeId);
  if (!recipe) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} Recipe \`${recipeId}\` not found. Use \`/craft list\` to see all recipes.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const missing = [];
  for (const [mat, qty] of Object.entries(recipe.inputs)) {
    const have = (userData.oreInventory[mat] || 0) + (userData.inventory[mat] || 0);
    if (have < qty) {
      missing.push(`${qty}x \`${mat}\` (have ${have})`);
    }
  }

  if (missing.length > 0) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, [
      `${EMOJIS.cancel} **Not enough materials** to craft **${recipe.name}**!`,
      '',
      `**Missing:**`,
      ...missing.map(m => `> ${m}`),
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  for (const [mat, qty] of Object.entries(recipe.inputs)) {
    let leftToConsume = qty;
    if (userData.oreInventory[mat]) {
      const take = Math.min(leftToConsume, userData.oreInventory[mat]);
      userData.oreInventory[mat] -= take;
      leftToConsume -= take;
      if (userData.oreInventory[mat] <= 0) delete userData.oreInventory[mat];
    }
    if (leftToConsume > 0 && userData.inventory[mat]) {
      userData.inventory[mat] -= leftToConsume;
      if (userData.inventory[mat] <= 0) delete userData.inventory[mat];
    }
  }

  const outId  = recipe.output.id;
  const outQty = recipe.output.qty;
  userData.inventory[outId] = (userData.inventory[outId] || 0) + outQty;
  userData.craftCount = (userData.craftCount || 0) + 1;

  const inputStr = Object.entries(recipe.inputs).map(([m, q]) => `${q}x ${m}`).join(', ');
  economyManager.checkAllAchievements(economy, userId);
  economyManager.saveEconomy(economy);

  const c = createContainer(0xCAD7E6);
  addTextDisplay(c, [
    `# 🔨 Item Crafted!`,
    '',
    `${recipe.emoji} **${recipe.name}** (x${outQty}) added to your inventory!`,
    '',
    `🪵 **Materials used:** ${inputStr}`,
    `🔧 **Total crafts:** ${formatNumber(userData.craftCount)}`,
  ].join('\n'));
  return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('craft')
    .setDescription('Craft items using ores and materials')
    .addStringOption(o => o.setName('recipe').setDescription('Recipe ID to craft, or "list" to see all').setRequired(false)),
  prefix: 'craft',
  aliases: ['crafting', 'make'],
  category: 'economy',
  description: 'Craft items using ores and materials',
  usage: 'craft [list|<recipe_id>]',

  async executePrefix(message, args) {
    return handleCraft(message.reply.bind(message), message.author.id, args[0]?.toLowerCase() || 'list');
  },

  async execute(interaction) {
    const recipe = interaction.options.getString('recipe') || 'list';
    return handleCraft(interaction.reply.bind(interaction), interaction.user.id, recipe.toLowerCase());
  },
};
