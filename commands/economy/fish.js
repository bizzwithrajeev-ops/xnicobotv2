'use strict';

const { createContainer, addTextDisplay, addSeparator, formatNumber, MessageFlags, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');

const FISH = [
  { name: 'Sardine', emoji: '🐟', rarity: 'common', value: 15, rate: 50 },
  { name: 'Trout', emoji: '🐠', rarity: 'common', value: 25, rate: 45 },
  { name: 'Catfish', emoji: '🐡', rarity: 'common', value: 30, rate: 40 },
  { name: 'Bass', emoji: '🐟', rarity: 'uncommon', value: 60, rate: 30 },
  { name: 'Salmon', emoji: '🐠', rarity: 'uncommon', value: 80, rate: 25 },
  { name: 'Tuna', emoji: '🐟', rarity: 'uncommon', value: 100, rate: 20 },
  { name: 'Swordfish', emoji: '🗡', rarity: 'rare', value: 250, rate: 10 },
  { name: 'Pufferfish', emoji: '🐡', rarity: 'rare', value: 300, rate: 8 },
  { name: 'Anglerfish', emoji: '🔦', rarity: 'rare', value: 400, rate: 6 },
  { name: 'Marlin', emoji: '🏹', rarity: 'epic', value: 800, rate: 3 },
  { name: 'Manta Ray', emoji: '🦈', rarity: 'epic', value: 1000, rate: 2.5 },
  { name: 'Golden Koi', emoji: '<:Star:1473038501766369300>', rarity: 'legendary', value: 2500, rate: 1 },
  { name: 'Kraken Baby', emoji: '🐙', rarity: 'legendary', value: 5000, rate: 0.5 },
  { name: 'Leviathan Scale', emoji: '🌊', rarity: 'mythic', value: 10000, rate: 0.1 },
];

const JUNK = [
  { name: 'Old Boot', emoji: '🥾', value: 5 },
  { name: 'Seaweed', emoji: '🌿', value: 3 },
  { name: 'Tin Can', emoji: '🥫', value: 2 },
  { name: 'Bottle', emoji: '🍾', value: 8 },
];

const RODS = ['Basic Rod', 'Iron Rod', 'Gold Rod', 'Diamond Rod', 'Legendary Rod'];
const ROD_BONUS = [1.0, 1.15, 1.3, 1.5, 2.0];

const RARITY_EMOJI = {
  common: '⬜', uncommon: '🟩', rare: '🟦', epic: '🟪', legendary: '🟨', mythic: '🟥',
};

const COOLDOWN = 30_000;
const cooldowns = new Map();

function rollFish(rodLevel) {
  const bonus = ROD_BONUS[rodLevel] || 1.0;

  if (Math.random() < 0.15 / bonus) {
    return { type: 'junk', item: JUNK[Math.floor(Math.random() * JUNK.length)] };
  }

  const totalRate = FISH.reduce((sum, f) => sum + f.rate * bonus, 0);
  let roll = Math.random() * totalRate;

  for (const f of FISH) {
    roll -= f.rate * bonus;
    if (roll <= 0) return { type: 'fish', item: f };
  }

  return { type: 'fish', item: FISH[0] };
}

async function handleFish(reply, userId) {
  const now = Date.now();

  if (cooldowns.get(userId) > now) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `<:Cancel:1473037949187657818> Fishing cooldown: **${economyManager.formatTime(cooldowns.get(userId) - now)}**`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
  cooldowns.set(userId, now + COOLDOWN);

  const economy = economyManager.loadEconomy();
  const { userData } = economyManager.getUser(economy, userId);

  const fishCount = userData.fishCaught || 0;
  const rodLevel = fishCount >= 200 ? 4 : fishCount >= 100 ? 3 : fishCount >= 50 ? 2 : fishCount >= 20 ? 1 : 0;

  const { type, item } = rollFish(rodLevel);
  const value = Math.floor(item.value * (ROD_BONUS[rodLevel] || 1.0));

  userData.coins += value;
  userData.fishCaught = (userData.fishCaught || 0) + 1;
  userData.lastFish = now;

  if (userData.fishCaught >= 50) economyManager.checkAchievement(economy, userId, 'fisher');

  const xpGain = type === 'junk' ? 2 : item.rarity === 'legendary' ? 25 : item.rarity === 'mythic' ? 50 : item.rarity === 'epic' ? 15 : item.rarity === 'rare' ? 10 : 5;
  economyManager.addXP(economy, userId, xpGain);
  economyManager.saveEconomy(economy);

  const rarityTag = type === 'junk' ? 'Junk' : item.rarity.toUpperCase();
  const rarityIcon = type === 'junk' ? '🗑️' : (RARITY_EMOJI[item.rarity] || '⬜');

  const container = createContainer(type === 'junk' ? 0x6b7280 : 0xCAD7E6);
  addTextDisplay(container, [
    `# 🎣 Fishing Result`,
    '',
    `You caught a **${item.emoji} ${item.name}**!`,
    `> ${rarityIcon} Rarity: **${rarityTag}**`,
  ].join('\n'));

  addSeparator(container, SeparatorSpacingSize.Small);

  addTextDisplay(container, [
    `> <:Money:1473377877239140529> **+${formatNumber(value)}** coins`,
    `> 📊 **+${xpGain}** XP`,
    `> 🎣 Rod: **${RODS[rodLevel]}**`,
    `> <:Invoice:1473039492217835550> Total Fish: **${userData.fishCaught}**`,
    '',
    `-# Fish more to upgrade your rod! Next upgrade at ${fishCount < 20 ? '20' : fishCount < 50 ? '50' : fishCount < 100 ? '100' : fishCount < 200 ? '200' : 'MAX'} catches.`,
  ].join('\n'));

  return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('fish')
    .setDescription('Go fishing to earn coins'),
  prefix: 'fish',
  aliases: ['fishing', 'cast'],
  category: 'economy',
  description: 'Go fishing to earn coins',

  async executePrefix(message) {
    return handleFish(message.reply.bind(message), message.author.id);
  },

  async execute(interaction) {
    return handleFish(interaction.reply.bind(interaction), interaction.user.id);
  }
};
