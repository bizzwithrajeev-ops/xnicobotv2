'use strict';

const { MessageFlags } = require('discord.js');
const { createContainer, addTextDisplay, addSeparator, formatNumber, SeparatorSpacingSize } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const ph = require('../../utils/petHelpers');

const COOLDOWN = 30_000;
const cooldowns = new Map();

const animals = [
  { name: 'Mouse', emoji: '🐭', rarity: 'common', baseHp: 20, baseAtk: 5, value: 10, rate: 90 },
  { name: 'Wolf', emoji: '🐺', rarity: 'uncommon', baseHp: 50, baseAtk: 15, value: 60, rate: 55 },
  { name: 'Tiger', emoji: '🐯', rarity: 'rare', baseHp: 100, baseAtk: 40, value: 200, rate: 25 },
  { name: 'Dragon', emoji: '🐉', rarity: 'legendary', baseHp: 300, baseAtk: 100, value: 1000, rate: 5 }
];

async function handleHunt(reply, userId) {
  const now = Date.now();

  if (cooldowns.has(userId) && cooldowns.get(userId) > now) {
    const c = createContainer(0xED4245);
    addTextDisplay(c, `<:Cancel:1473037949187657818> Hunt cooldown: **${economyManager.formatTime(cooldowns.get(userId) - now)}**`);
    return reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
  }
  cooldowns.set(userId, now + COOLDOWN);

  const pets = ph.loadPets();
  const economy = economyManager.loadEconomy();

  ph.ensureUser(pets, userId);
  const { userData } = economyManager.getUser(economy, userId);

  const roll = Math.random() * 100;
  let animal;
  let cumulative = 0;
  const shuffled = [...animals].sort((a, b) => a.rate - b.rate);
  for (const a of shuffled) {
    cumulative += a.rate;
    if (roll <= cumulative) { animal = a; break; }
  }
  if (!animal) animal = animals[0];

  const caught = Math.random() * 100 <= animal.rate;

  if (caught) {
    pets[userId].animals.push({
      id: ph.nextId(animal.rarity, animal.name, pets[userId].animals),
      name: animal.name,
      emoji: animal.emoji,
      rarity: animal.rarity,
      level: 1,
      exp: 0,
      baseHp: animal.baseHp,
      baseAtk: animal.baseAtk,
      hp: animal.baseHp,
      maxHp: animal.baseHp,
      atk: animal.baseAtk,
      weapon: null,
    });
    ph.savePets(pets);

    const xpResult = economyManager.addXP(economy, userId, 10);
    userData.huntCount = (userData.huntCount || 0) + 1;
    economyManager.saveEconomy(economy);

    const container = createContainer(ph.RARITY_COLOR[animal.rarity] || 0xCAD7E6);
    addTextDisplay(container, [
      `# <:Checkedbox:1473038547165384804> Hunt — Caught!`,
      '',
      `You encountered **${animal.emoji} ${animal.name}** and caught it!`,
      `> Rarity: **${animal.rarity}** | HP: **${animal.baseHp}** | ATK: **${animal.baseAtk}**`,
      `> <:Fire:1473038604812161218> +10 XP${xpResult.leveledUp ? ` — **Level Up! Lv.${xpResult.newLevel}**` : ''}`,
      '',
      `-# Use \`pets\` to manage your collection`,
    ].join('\n'));
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } else {
    userData.coins += animal.value;
    userData.huntCount = (userData.huntCount || 0) + 1;
    economyManager.addXP(economy, userId, 5);
    economyManager.saveEconomy(economy);

    const container = createContainer(0xED4245);
    addTextDisplay(container, [
      `# <:Cancel:1473037949187657818> Hunt — Escaped!`,
      '',
      `You encountered **${animal.emoji} ${animal.name}** but it got away.`,
      `> Earned **${formatNumber(animal.value)}** coins as consolation.`,
      `> <:Fire:1473038604812161218> +5 XP`,
      '',
      `-# Try hunting again in 30 seconds`,
    ].join('\n'));
    return reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('hunt')
    .setDescription('Hunt for wild animals — catch them as pets or earn coins'),
  prefix: 'hunt',
  aliases: ['catch'],
  category: 'economy',
  description: 'Hunt for wild animals — catch them as pets or earn coins',

  async executePrefix(message) {
    return handleHunt(message.reply.bind(message), message.author.id);
  },

  async execute(interaction) {
    return handleHunt(interaction.reply.bind(interaction), interaction.user.id);
  }
};
