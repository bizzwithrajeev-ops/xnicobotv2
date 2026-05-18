'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { EMOJIS } = require('../../utils/economyEmojis');

const COOLDOWN = 30 * 60 * 1000;
const cooldowns = new Map();

const ORE_TABLE = [
  { id: 'stone',       name: 'Stone',       emoji: '🪨', weight: 40, value: 5   },
  { id: 'iron_ore',    name: 'Iron Ore',    emoji: '⚙', weight: 30, value: 25  },
  { id: 'gold_ore',    name: 'Gold Ore',    emoji: '🟡', weight: 15, value: 75  },
  { id: 'diamond_ore', name: 'Diamond Ore', emoji: '<:Sketch:1473038248493453352>', weight: 10, value: 200 },
  { id: 'emerald_ore', name: 'Emerald Ore', emoji: '💚', weight: 5,  value: 500 },
];

function pickOre(boost = false) {
  let table = ORE_TABLE.map(o => ({ ...o }));
  if (boost) {
    table = table.map(o => ({ ...o, weight: o.id === 'stone' ? Math.max(5, o.weight - 10) : o.weight + 3 }));
  }
  const total = table.reduce((s, o) => s + o.weight, 0);
  let roll = Math.random() * total;
  for (const ore of table) {
    roll -= ore.weight;
    if (roll <= 0) return ore;
  }
  return table[0];
}

function getPickaxeBonus(inventory) {
  if ((inventory.diamond_pickaxe || 0) > 0) return { name: 'Diamond Pickaxe', bonus: 3, emoji: '<:Sketch:1473038248493453352>' };
  if ((inventory.gold_pickaxe    || 0) > 0) return { name: 'Gold Pickaxe',    bonus: 2, emoji: '🪙' };
  if ((inventory.iron_pickaxe    || 0) > 0) return { name: 'Iron Pickaxe',    bonus: 1, emoji: '⛏' };
  return null;
}

async function handleMine(reply, userId) {
  const now = Date.now();
  const lastUsed = cooldowns.get(userId) || 0;
  const remaining = COOLDOWN - (now - lastUsed);

  if (remaining > 0) {
    const secs = Math.ceil(remaining / 1000);
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    const timeStr = mins > 0 ? `${mins}m ${remSecs}s` : `${secs}s`;
    const c = createContainer(0xED4245);
    addTextDisplay(c, [
      `# ${EMOJIS.sandwatch} Mining Cooldown`,
      '',
      `${EMOJIS.alarm} You need to rest! Come back in **${timeStr}**.`,
      `-# Mining cooldown: 30 minutes`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  cooldowns.set(userId, now);

  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  const inv = userData.inventory || {};
  const pickaxe = getPickaxeBonus(inv);
  const hasMiningBoost = (userData.activeBoosts || []).some(b => b.id === 'mining_boost' && b.expiresAt > now);

  const count = 1 + (pickaxe?.bonus || 0) + (hasMiningBoost ? 1 : 0);
  const ores = [];
  let totalValue = 0;

  for (let i = 0; i < count; i++) {
    const ore = pickOre(hasMiningBoost);
    ores.push(ore);
    userData.oreInventory = userData.oreInventory || {};
    userData.oreInventory[ore.id] = (userData.oreInventory[ore.id] || 0) + 1;
    totalValue += ore.value;
  }

  userData.miningCount = (userData.miningCount || 0) + 1;
  userData.coins = (userData.coins || 0) + totalValue;
  userData.totalEarned = (userData.totalEarned || 0) + totalValue;

  economyManager.checkAllAchievements(economy, userId);
  economyManager.saveEconomy(economy);

  const oreLines = ores.map(o => `> ${o.emoji} **${o.name}** (+${formatNumber(o.value)} coins)`).join('\n');
  const pickaxeLine = pickaxe ? `\n-# ${pickaxe.emoji} Using **${pickaxe.name}** — +${pickaxe.bonus} extra ore(s)` : '';
  const boostLine = hasMiningBoost ? `\n-# 🚀 **Mining Boost** active!` : '';

  const c = createContainer(0xCAD7E6);
  addTextDisplay(c, [
    `# ⛏️ Mining Result`,
    '',
    oreLines,
    '',
    `${EMOJIS.sketch} **Earned:** +${formatNumber(totalValue)} coins`,
    `💼 **Total mines:** ${formatNumber(userData.miningCount)}`,
    `💰 **Wallet:** ${formatNumber(userData.coins)} coins`,
    `${pickaxeLine}${boostLine}`,
    `-# Cooldown: 30 minutes`,
  ].join('\n'));

  return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mine')
    .setDescription('Mine for ores and earn coins — upgrade pickaxes for better yields'),
  prefix: 'mine',
  aliases: ['dig'],
  category: 'economy',
  description: 'Mine for ores and earn coins',
  usage: 'mine',

  async executePrefix(message) {
    return handleMine(message.reply.bind(message), message.author.id);
  },

  async execute(interaction) {
    await interaction.deferReply();
    return handleMine(interaction.editReply.bind(interaction), interaction.user.id);
  },
};
