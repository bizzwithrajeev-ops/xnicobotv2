const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { createContainer, addTextDisplay, formatNumber, MessageFlags } = require('../../utils/componentHelpers');
const economyManager = require('../../utils/economyManager');
const ph = require('../../utils/petHelpers');

/* ---------------- HELPERS ---------------- */

// Base values by rarity (matching hunt.js animal definitions)
const RARITY_VALUES = {
  common: 10,
  uncommon: 60,
  rare: 200,
  legendary: 1000
};

function petValue(pet) {
  const baseValue = RARITY_VALUES[pet.rarity] || 10;
  return Math.floor(baseValue * (1 + (pet.level || 1) * 0.15));
}

/* ---------------- COMMAND ---------------- */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('sell')
    .setDescription('Sell pets for coins')
    .addStringOption(o => o.setName('rarity').setDescription('Rarity tier to sell').setRequired(true)
      .addChoices(
        { name: 'Common', value: 'common' },
        { name: 'Uncommon', value: 'uncommon' },
        { name: 'Rare', value: 'rare' },
        { name: 'Legendary', value: 'legendary' },
        { name: 'All', value: 'all' },
      )),
  prefix: 'sell',
  description: 'Sell pets for coins',
  usage: 'sell <common|uncommon|rare|legendary|all>',
  category: 'economy',
  aliases: ['sellpet'],

  async executePrefix(message, args) {
    const pets = ph.loadPets();
    const economy = economyManager.loadEconomy();
    const userId = message.author.id;

    if (!pets[userId]?.animals?.length) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> You have no pets to sell.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    const { userData } = economyManager.getUser(economy, userId);

    const type = args[0]?.toLowerCase();
    const valid = ['common', 'uncommon', 'rare', 'legendary', 'all'];

    if (!valid.includes(type)) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Usage: `sell common | uncommon | rare | legendary | all`');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const allPets = [...pets[userId].animals];

    /* ---------- FILTER PETS ---------- */
    let sellable =
      type === 'all'
        ? allPets
        : allPets.filter(p => p.rarity === type);

    if (!sellable.length) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> No pets of this type to sell.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    /* ---------- ENSURE 1 PET REMAINS ---------- */
    if (sellable.length >= allPets.length) {
      sellable = sellable.slice(0, allPets.length - 1);
    }

    if (!sellable.length) {
      const c = createContainer(0xFEE75C); addTextDisplay(c, '<:Infotriangle:1473038460456800459> You must keep at least **1 pet**.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const remaining = allPets.length - sellable.length;
    const totalCoins = sellable.reduce((a, p) => a + petValue(p), 0);

    /* ---------- CONFIRM UI ---------- */
    const container = createContainer();
    addTextDisplay(container, `# 💰 Confirm Pet Sale\n\n` +
      `🐾 Type: **${type.toUpperCase()}**\n` +
      `📦 Pets to sell: **${sellable.length}**\n` +
      `🐶 Pets remaining: **${remaining}**\n\n` +
      `🪙 You will receive: **${formatNumber(totalCoins)} coins**`);

    const sessId = `sell_${Date.now()}_${userId}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${sessId}_confirm`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Confirm').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${sessId}_cancel`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

    const collector = msg.createMessageComponentCollector({ time: 30000 });

    collector.on('collect', async i => {
      if (i.user.id !== userId) {
        await i.reply({ content: '<:Cancel:1473037949187657818> This doesn\'t belong to you.', ephemeral: true });
        return;
      }
      await i.deferUpdate();

      if (i.customId === `${sessId}_cancel`) {
        collector.stop();
        const c = createContainer();
        addTextDisplay(c, '<:Cancel:1473037949187657818> Sale cancelled.');
        return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      if (i.customId === `${sessId}_confirm`) {
        // Re-load fresh data to avoid stale state after 30s
        const freshPets = ph.loadPets();
        const freshEconomy = economyManager.loadEconomy();
        const { userData: freshUser } = economyManager.getUser(freshEconomy, userId);

        if (!freshPets[userId]?.animals?.length) {
          collector.stop();
          const c = createContainer();
          addTextDisplay(c, '<:Cancel:1473037949187657818> Pets no longer available.');
          return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        const soldIds = sellable.map(p => p.id);

        freshPets[userId].animals = freshPets[userId].animals.filter(
          p => !soldIds.includes(p.id)
        );

        if (soldIds.includes(freshPets[userId].activeBattlePet)) {
          freshPets[userId].activeBattlePet = freshPets[userId].animals[0]?.id || null;
        }

        freshUser.coins += totalCoins;

        ph.savePets(freshPets);
        economyManager.saveEconomy(freshEconomy);

        collector.stop();

        const c = createContainer();
        addTextDisplay(c, `# <:Checkedbox:1473038547165384804> Pets Sold\n\n` +
          `📦 Sold: **${sellable.length} pets**\n` +
          `🐶 Remaining: **${freshPets[userId].animals.length}**\n` +
          `🪙 Earned: **${formatNumber(totalCoins)} coins**`);

        return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    });
  },

  async execute(interaction) {
    const rarity = interaction.options.getString('rarity');
    const fakeMessage = {
      author: interaction.user,
      reply: interaction.reply.bind(interaction),
    };
    return module.exports.executePrefix(fakeMessage, [rarity]);
  },
};