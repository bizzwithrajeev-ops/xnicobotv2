'use strict';

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { deleteBackup, listBackups } = require('../../utils/backupManager');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const TIMEOUT = 30_000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup-delete')
        .setDescription('Delete a server backup')
        .addStringOption(o => o.setName('backup').setDescription('Backup name to delete').setRequired(true).setAutocomplete(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    prefix: 'backup-delete',
    description: 'Delete a server backup with confirmation',
    usage: 'backup-delete <backup-name>',
    category: 'backup',
    aliases: ['bk-delete', 'deletebackup'],
    permissions: ['Administrator'],

    async autocomplete(interaction) {
        const backups = listBackups(interaction.guild.id);
        await interaction.respond(backups.map(b => ({ name: `${b.name} (${new Date(b.date).toLocaleDateString()})`, value: b.name })).slice(0, 25));
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const name = interaction.options.getString('backup');
        try {
            const result = deleteBackup(interaction.guild.id, name);
            if (result.success) {
                return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Backup Deleted\n\nDeleted **\`${result.backupName}\`**.`))], flags: MessageFlags.IsComponentsV2 });
            }
            return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Delete Failed\n\n${result.error}`))], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('Error deleting backup:', err);
            return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Missing Permission\n\nYou need **Administrator** permission.'))], flags: MessageFlags.IsComponentsV2 });
        }

        const name = args[0];
        if (!name) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Invalid Usage\n\n**Usage:** `backup-delete <name>`\n\n> Use `backup-list` to see all backups.'))], flags: MessageFlags.IsComponentsV2 });
        }

        // Check exists
        const backups = listBackups(message.guild.id);
        const bk = backups.find(b => b.name === name);
        if (!bk) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Not Found\n\nNo backup named \`${name}\`.\n\n> Use \`backup-list\` to see available backups.`))], flags: MessageFlags.IsComponentsV2 });
        }

        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;

        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Infotriangle:1473038460456800459> Confirm Deletion\n\n` +
                `Permanently delete backup **\`${name}\`**?\n` +
                `> <:Folderopen:1473039552783323348> ${bk.configCount} configs • <:Bookopen:1473038576391557130> ${new Date(bk.date).toLocaleDateString()}\n\n` +
                `-# This cannot be undone.`
            ));
        ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`bkdl:confirm:${sid}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`bkdl:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        ));

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });
            collector.stop('handled');

            if (i.customId.split(':')[1] === 'confirm') {
                try {
                    const result = deleteBackup(message.guild.id, name);
                    if (result.success) {
                        return i.update({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Backup Deleted\n\nDeleted **\`${name}\`** successfully.`))], flags: MessageFlags.IsComponentsV2 });
                    }
                    return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\n${result.error}`))], flags: MessageFlags.IsComponentsV2 });
                } catch (err) {
                    console.error('Error deleting backup:', err);
                    return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
                }
            }
            return i.update({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Cancelled. Backup **\`${name}\`** is safe.`))], flags: MessageFlags.IsComponentsV2 });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'handled') return;
            sent.edit({ components: [buildExpiredPanel('backup-delete', 'Backup was not deleted.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
