const { ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { createContainer, addTextDisplay, MessageFlags } = require('../../utils/componentHelpers');
const ph = require('../../utils/petHelpers');
const { resolveUser } = require('../../utils/resolveUser');

/* ---------------- HELPERS ---------------- */

function loadPets() { return ph.loadPets(); }
function savePets(data) { ph.savePets(data); }

/* ---------------- COMMAND ---------------- */

module.exports = {
  data: new (require('discord.js').SlashCommandBuilder)()
    .setName('trade')
    .setDescription('Trade weapons between pets with another user')
    .addUserOption(o => o.setName('user').setDescription('User to trade with').setRequired(true)),
  prefix: 'trade',
  description: 'Trade weapons between pets with another user',
  usage: 'trade weapon <@user>',
  category: 'economy',
  aliases: ['tradeweapon'],

  async executePrefix(message, args) {
    if (args[0]?.toLowerCase() !== 'weapon') {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Usage: `trade weapon @user`');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const target = await resolveUser(message, args);
    if (!target || target.id === message.author.id) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Mention a valid user: `trade weapon @user`');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    if (target.bot) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> You cannot trade with bots.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const pets = loadPets();
    const senderId = message.author.id;
    const receiverId = target.id;

    const senderData = pets[senderId];
    if (!senderData?.activeBattlePet) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> You do not have an active battle pet.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const senderPet = senderData.animals?.find(p => p.id === senderData.activeBattlePet);
    if (!senderPet) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Active pet not found.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    if (!senderPet.weapon) {
      const c = createContainer(0xED4245); addTextDisplay(c, '<:Cancel:1473037949187657818> Your active pet has no weapon to trade.');
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const receiverData = pets[receiverId];
    if (!receiverData?.activeBattlePet) {
      const c = createContainer(0xED4245); addTextDisplay(c, `<:Cancel:1473037949187657818> **${target.username}** does not have an active battle pet.`);
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }
    const receiverPet = receiverData.animals?.find(p => p.id === receiverData.activeBattlePet);
    if (!receiverPet) {
      const c = createContainer(0xED4245); addTextDisplay(c, `<:Cancel:1473037949187657818> **${target.username}**'s active pet not found.`);
      return message.reply({ components: [c], flags: MessageFlags.IsComponentsV2 });
    }

    const weapon = senderPet.weapon;

    /* ---------- CONFIRM UI ---------- */
    const container = createContainer();
    addTextDisplay(container, `# <:History:1473037847568318605> Weapon Trade\n\n` +
      `**${message.author.username}** → **${target.username}**\n\n` +
      `🗡️ **${weapon.name}** (Lv.${weapon.level || 1})\n` +
      `⚔️ ATK: +${weapon.baseAtk}\n\n` +
      `From: ${senderPet.emoji} **${senderPet.name}**\n` +
      `To: ${receiverPet.emoji} **${receiverPet.name}**` +
      (receiverPet.weapon ? `\n\n<:Infotriangle:1473038460456800459> This will **replace** ${target.username}'s current weapon!` : ''));

    const sessId = `trade_${Date.now()}_${senderId}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${sessId}_accept`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${sessId}_decline`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Decline').setStyle(ButtonStyle.Danger)
    );

    const msg = await message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

    const collector = msg.createMessageComponentCollector({ time: 30_000 });

    collector.on('collect', async i => {
      if (i.user.id !== receiverId) {
        await i.reply({ content: '<:Cancel:1473037949187657818> Only the trade recipient can respond.', ephemeral: true });
        return;
      }
      await i.deferUpdate();

      if (i.customId === `${sessId}_decline`) {
        collector.stop();
        const c = createContainer();
        addTextDisplay(c, '<:Cancel:1473037949187657818> Trade declined.');
        return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }

      if (i.customId === `${sessId}_accept`) {
        // Re-load to avoid stale data
        const freshPets = loadPets();
        const sPet = freshPets[senderId]?.animals?.find(p => p.id === freshPets[senderId]?.activeBattlePet);
        const rPet = freshPets[receiverId]?.animals?.find(p => p.id === freshPets[receiverId]?.activeBattlePet);

        if (!sPet?.weapon) {
          collector.stop();
          const c = createContainer();
          addTextDisplay(c, '<:Cancel:1473037949187657818> Weapon no longer available.');
          return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
        if (!rPet) {
          collector.stop();
          const c = createContainer();
          addTextDisplay(c, `<:Cancel:1473037949187657818> ${target.username}'s active pet no longer valid.`);
          return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }

        rPet.weapon = sPet.weapon;
        sPet.weapon = null;
        savePets(freshPets);

        collector.stop();
        const c = createContainer();
        addTextDisplay(c, `# <:Checkedbox:1473038547165384804> Trade Complete\n\n` +
          `🗡️ **${weapon.name}** transferred!\n` +
          `${sPet.emoji} ${sPet.name} → ${rPet.emoji} ${rPet.name}`);
        return msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        const c = createContainer();
        addTextDisplay(c, '<a:loading:1506015728871149770> Trade timed out.');
        msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    });
  },

  async execute(interaction) {
        await interaction.deferReply({ flags: 1 << 15 });
    const target = interaction.options.getUser('user');
    const fakeMessage = {
      author: interaction.user,
      mentions: { users: { first: () => target } },
      reply: (opts) => interaction.editReply(opts),
    };
    return module.exports.executePrefix(fakeMessage, ['weapon']);
  },
};