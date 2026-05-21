'use strict';

const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const economyManager = require('../../utils/economyManager');
const { createEconomyProfileCard } = require('../../utils/economyCanvas');
const { createContainer, addTextDisplay, MessageFlags } = require('../../utils/componentHelpers');
const { getUserData: getMainUserData } = require('../../utils/dataManager');

const ph = require('../../utils/petHelpers');
const { resolveUser } = require('../../utils/resolveUser');

function loadPets() { return ph.loadPets(); }

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('profile')
    .setDescription('View your economy profile card')
    .addUserOption(o => o.setName('user').setDescription('User to view').setRequired(false)),
  prefix: 'profile',
  aliases: ['eprofile', 'ep', 'card', 'economyprofile'],
  category: 'economy',
  description: 'View your economy profile card',

  async executePrefix(message, args) {
    const target = (await resolveUser(message, args)) || message.author;
    const economy = economyManager.loadEconomy();
    const { userData, changed } = economyManager.getUser(economy, target.id);
    if (changed) economyManager.saveEconomy(economy);

    const wallet = Number(userData.coins) || 0;
    const bank = Number(userData.bank) || 0;
    const total = wallet + bank;
    const level = userData.level || 1;
    const xp = userData.xp || 0;
    const xpNeeded = level * 150;

    // Calculate rank
    const allUsers = Object.entries(economy)
      .filter(([k]) => k !== 'jackpot')
      .map(([id, d]) => ({ id, total: (Number(d.coins) || 0) + (Number(d.bank) || 0) }))
      .sort((a, b) => b.total - a.total);
    const rank = allUsers.findIndex(u => u.id === target.id) + 1;

    // Load pets
    const petsData = loadPets();
    const userPets = petsData[target.id]?.animals || [];

    // Map achievements
    const achList = (userData.achievements || []).map(id => {
      const ach = economyManager.ACHIEVEMENTS[id];
      return ach || { emoji: '🏅', name: id, desc: '' };
    });

    let profileFontFamily = 'Inter';
    try {
      const mainUserData = await getMainUserData(target.id);
      profileFontFamily = mainUserData?.profile?.rankCard?.fontFamily || mainUserData?.profile?.profileCard?.fontFamily || 'Inter';
    } catch {}

    try {
      const buffer = await createEconomyProfileCard({
        username: target.username,
        avatarURL: target.displayAvatarURL({ extension: 'png', size: 256 }),
        tag: target.username,
        wallet, bank, total,
        level, xp, xpNeeded,
        streak: userData.streak || 0,
        rank: rank || null,
        battlesWon: userData.battlesWon || 0,
        battlesLost: userData.battlesLost || 0,
        fishCaught: userData.fishCaught || 0,
        huntCount: userData.huntCount || 0,
        achievements: achList,
        title: userData.title || '',
        pets: userPets.slice(0, 10),
        fontFamily: profileFontFamily,
      });

      const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
      return message.reply({ files: [attachment] });
    } catch (err) {
      console.error('[PROFILE] Canvas error:', err);
      const container = createContainer();
      addTextDisplay(container, [
        `# <:Sketch:1473038248493453352> ${target.username}'s Economy Profile`,
        ``,
        `> <:Money:1473377877239140529> **Wallet:** ${economyManager.formatNumber(wallet)}`,
        `> 🏦 **Bank:** ${economyManager.formatNumber(bank)}`,
        `> <:Sketch:1473038248493453352> **Total:** ${economyManager.formatNumber(total)}`,
        ``,
        `> <:Invoice:1473039492217835550> **Level:** ${level} (${xp}/${xpNeeded} XP)`,
        `> <:Fire:1473038604812161218> **Streak:** ${userData.streak || 0} days`,
        `> ⚔️ **Battles:** ${userData.battlesWon || 0}W / ${userData.battlesLost || 0}L`,
        `> <:Award:1473038391632203887> **Rank:** #${rank}`,
      ].join('\n'));
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },

  async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
    const target = interaction.options?.getUser('user') || interaction.user;
    const fakeMessage = {
      author: target,
      mentions: { users: { first: () => target } },
      reply: (opts) => interaction.editReply(opts),
    };
    return module.exports.executePrefix(fakeMessage);
  },
};
