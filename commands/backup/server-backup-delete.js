'use strict';

const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { deleteServerBackup, listServerBackups } = require('../../utils/serverBackupManager');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const TIMEOUT = 30_000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server-backup-delete')
        .setDescription('Delete a server backup')
        .addStringOption(o => o.setName('backup').setDescription('Backup ID to delete').setRequired(true).setAutocomplete(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    prefix: 'server-backup-delete',
    description: 'Delete a server backup',
    usage: 'server-backup-delete <backup-id>',
    category: 'backup',
    aliases: ['sbk-delete', 'sbackup-delete'],
    permissions: ['Administrator'],

    async autocomplete(interaction) {
        const backups = await listServerBackups(interaction.user.id);
        await interaction.respond(backups.map(b => ({
            name: `${b.id} - ${b.serverName} (${new Date(b.createdAt).toLocaleDateString()})`,
            value: b.id
        })).slice(0, 25));
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const backupId = interaction.options.getString('backup');
        try {
            const result = await deleteServerBackup(interaction.user.id, backupId);
            if (result.success) {
                return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Server Backup Deleted\n\n**📦** \`${result.backupId}\` has been permanently removed.`))], flags: MessageFlags.IsComponentsV2 });
            }
            return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Delete Failed\n\n${result.error}`))], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('Error deleting server backup:', err);
            return interaction.editReply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Missing Permission\n\nYou need **Administrator** permission.'))], flags: MessageFlags.IsComponentsV2 });
        }

        const backupId = args[0];
        if (!backupId) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Invalid Usage\n\n**Usage:** `server-backup-delete <backup-id>`'))], flags: MessageFlags.IsComponentsV2 });
        }

        // Look up backup details
        const uid = message.author.id;
        let backups;
        try { backups = await listServerBackups(uid); } catch { backups = []; }
        const bk = backups.find(b => b.id === backupId);

        const sid = `${uid}_${Date.now().toString(36)}`;
        const info = bk ? `**📦** \`${bk.id}\`\n**<:Bookopen:1473038576391557130>** ${bk.serverName}\n**<:Clock:1473039102113878056>** <t:${Math.floor(bk.createdAt / 1000)}:f>` : `**📦** \`${backupId}\``;

        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Infotriangle:1473038460456800459> Confirm Delete\n\n${info}\n\n> This is permanent and cannot be undone.`))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`sbkd:confirm:${sid}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`sbkd:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            ));

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', ephemeral: true });
            collector.stop('handled');

            if (i.customId.split(':')[1] === 'confirm') {
                try {
                    const result = await deleteServerBackup(uid, backupId);
                    if (result.success) {
                        return i.update({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Server Backup Deleted\n\n**📦** \`${result.backupId}\` removed.`))], flags: MessageFlags.IsComponentsV2 });
                    }
                    return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\n${result.error}`))], flags: MessageFlags.IsComponentsV2 });
                } catch (err) {
                    console.error('Error deleting server backup:', err);
                    return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
                }
            }
            return i.update({ components: [new ContainerBuilder().setAccentColor(0xCAD7E6).addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Cancelled. No changes were made.'))], flags: MessageFlags.IsComponentsV2 });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'handled') return;
            sent.edit({ components: [buildExpiredPanel('server-backup-delete', 'No changes were made.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
