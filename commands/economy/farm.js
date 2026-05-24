'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { formatCoins, formatCoinsShort , coinIcon } = require('../../utils/currencyHelper');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const { EMOJIS } = require('../../utils/economyEmojis');

const PLANT_COOLDOWN  = 60 * 1000;
const HARVEST_WAIT    = 5 * 60 * 1000;
const plantCooldowns  = new Map();

const SEED_TABLE = {
  wheat_seed:   { name: 'Wheat',   emoji: '🌾', yield: [100, 300],  growTime: HARVEST_WAIT },
  carrot_seed:  { name: 'Carrot',  emoji: '🥕', yield: [300, 700],  growTime: HARVEST_WAIT * 2 },
  pumpkin_seed: { name: 'Pumpkin', emoji: '🎃', yield: [600, 1500], growTime: HARVEST_WAIT * 4 },
};

async function handleFarm(reply, userId, subcommand, seedId, guildId) {
  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  userData.crops = userData.crops || {};

  /* ── HARVEST ── */
  if (subcommand === 'harvest') {
    const ready = Object.entries(userData.crops).filter(([, crop]) => Date.now() >= crop.readyAt);

    if (ready.length === 0) {
      const pending = Object.entries(userData.crops);
      if (pending.length === 0) {
        const c = createContainer(0xCAD7E6);
        addTextDisplay(c, [
          `# 🌱 Farm`,
          '',
          `You have no crops planted! Use \`/farm plant\` with a seed from the shop.`,
        ].join('\n'));
        return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
      }
      const earliest = Math.min(...pending.map(([, c]) => c.readyAt));
      const secs = Math.ceil((earliest - Date.now()) / 1000);
      const mins = Math.floor(secs / 60);
      const c = createContainer(0xCAD7E6);
      addTextDisplay(c, [
        `# 🌱 Farm`,
        '',
        `${EMOJIS.sandwatch} No crops are ready yet! Earliest harvest in **${mins}m ${secs % 60}s**.`,
        '',
        `**Planted crops:**`,
        ...pending.map(([slot, crop]) => {
          const info = SEED_TABLE[crop.seedId] || { name: crop.seedId, emoji: '🌱' };
          const remaining = Math.max(0, Math.ceil((crop.readyAt - Date.now()) / 1000));
          return `> ${info.emoji} **${info.name}** in slot \`${slot}\` — ${remaining}s remaining`;
        }),
      ].join('\n'));
      return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    let totalEarned = 0;
    const harvestLines = [];

    for (const [slot, crop] of ready) {
      const info = SEED_TABLE[crop.seedId] || { name: crop.seedId, emoji: '🌾', yield: [50, 150] };
      const earned = Math.floor(Math.random() * (info.yield[1] - info.yield[0] + 1)) + info.yield[0];
      totalEarned += earned;
      harvestLines.push(`> ${info.emoji} **${info.name}** — +${formatCoins(earned, guildId)}`);
      delete userData.crops[slot];
    }

    userData.coins = (userData.coins || 0) + totalEarned;
    userData.totalEarned = (userData.totalEarned || 0) + totalEarned;
    userData.harvestCount = (userData.harvestCount || 0) + ready.length;
    userData.lastFarm = Date.now();

    economyManager.checkAllAchievements(economy, userId);
    economyManager.saveEconomy(economy);

    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# 🌾 Harvest Complete!`,
      '',
      ...harvestLines,
      '',
      `${EMOJIS.sketch} **Total Earned:** +${formatCoins(totalEarned, guildId)}`,
      `${coinIcon(guildId)} **Wallet:** ${formatCoins(userData.coins, guildId)}`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  /* ── PLANT ── */
  const now = Date.now();
  const lastPlant = plantCooldowns.get(userId) || 0;
  const remaining = PLANT_COOLDOWN - (now - lastPlant);

  if (remaining > 0) {
    const secs = Math.ceil(remaining / 1000);
    const c = createContainer(0xED4245);
    addTextDisplay(c, `# ${EMOJIS.sandwatch} Planting Cooldown\n\n${EMOJIS.alarm} Wait **${secs}s** before planting again.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  if (!seedId) {
    const c = createContainer(0xCAD7E6);
    addTextDisplay(c, [
      `# 🌱 Farm — Plant a Seed`,
      '',
      `**Usage:** \`/farm plant <seed_id>\``,
      '',
      `**Available seeds (buy from shop):**`,
      `> 🌾 \`wheat_seed\` — grows in 5 min`,
      `> 🥕 \`carrot_seed\` — grows in 10 min`,
      `> 🎃 \`pumpkin_seed\` — grows in 20 min`,
    ].join('\n'));
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const seedInfo = SEED_TABLE[seedId];
  if (!seedInfo) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} Unknown seed \`${seedId}\`. Try \`wheat_seed\`, \`carrot_seed\`, or \`pumpkin_seed\`.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const inv = userData.inventory || {};
  if (!inv[seedId] || inv[seedId] < 1) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} You don't have any **${seedInfo.name} Seeds**! Buy some from the shop.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  const slotCount = Object.keys(userData.crops).length;
  if (slotCount >= 5) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `${EMOJIS.cancel} You have **5 crops** planted — the max! Harvest some first.`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }

  inv[seedId]--;
  if (inv[seedId] <= 0) delete inv[seedId];
  userData.inventory = inv;

  const slot = `slot_${Date.now()}`;
  userData.crops[slot] = { seedId, plantedAt: now, readyAt: now + seedInfo.growTime };
  plantCooldowns.set(userId, now);

  const growMins = Math.round(seedInfo.growTime / 60000);
  const c = createContainer(0xCAD7E6);
  addTextDisplay(c, [
    `# 🌱 Planted!`,
    '',
    `${seedInfo.emoji} **${seedInfo.name}** has been planted and will be ready in **${growMins} minute(s)**.`,
    '',
    `Use \`/farm harvest\` to collect when it's ready!`,
    `-# Cooldown: 1 minute before next planting`,
  ].join('\n'));
  economyManager.saveEconomy(economy);
  return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('farm')
    .setDescription('Plant seeds and harvest crops for coins')
    .addSubcommand(sub => sub
      .setName('plant')
      .setDescription('Plant a seed from your inventory')
      .addStringOption(o => o.setName('seed').setDescription('Seed ID (wheat_seed, carrot_seed, pumpkin_seed)').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('harvest')
      .setDescription('Harvest your ready crops')),
  prefix: 'farm',
  aliases: ['farming', 'crops'],
  category: 'economy',
  description: 'Plant seeds and harvest crops for coins',
  usage: 'farm <plant|harvest>',

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() || 'harvest';
    const seedId = args[1]?.toLowerCase();
    return handleFarm(message.reply.bind(message), message.author.id, sub, seedId, message.guild?.id);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const seed = sub === 'plant' ? interaction.options.getString('seed') : null;
    return handleFarm(interaction.reply.bind(interaction), interaction.user.id, sub, seed, interaction.guild?.id);
  },
};
