'use strict';

const {
    ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionFlagsBits, MessageFlags
} = require('discord.js');
const { db } = require('../../utils/database');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const TIMEOUT = 30_000;
const VALID_TYPES = ['embed', 'welcome', 'leave', 'custom', 'announcement'];
const TYPE_EMOJI = { embed: '<:Folder:1473039340425973972>', welcome: '<:Userplus:1473038912212435086>', leave: '<:Userplus:1473038912212435086>', custom: '<:Edit:1473037903625191580>', announcement: '<:Bullhorn:1473038903157199093>' };

module.exports = {
    prefix: 'database-delete',
    description: 'Delete a database entry',
    usage: 'database-delete <type> <name>',
    category: 'backup',
    aliases: ['db-delete', 'dbdelete', 'db-del'],
    permissions: ['ManageGuild'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Missing Permission\n\nYou need **Manage Guild** permission.'))], flags: MessageFlags.IsComponentsV2 });
        }

        if (args.length < 2) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Usage\n\n**Usage:** \`database-delete <type> <name>\`\n**Types:** \`${VALID_TYPES.join('`, `')}\``))], flags: MessageFlags.IsComponentsV2 });
        }

        const type = args[0].toLowerCase();
        const name = args[1];

        if (!VALID_TYPES.includes(type)) {
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Type\n\nValid: \`${VALID_TYPES.join('`, `')}\``))], flags: MessageFlags.IsComponentsV2 });
        }

        const key = `${message.guild.id}_${type}_${name}`;

        try {
            const existing = await db.get(key);
            if (!existing) {
                return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Not Found\n\nNo entry **${name}** (type: \`${type}\`).`))], flags: MessageFlags.IsComponentsV2 });
            }

            const uid = message.author.id;
            const sid = `${uid}_${Date.now().toString(36)}`;
            const emoji = TYPE_EMOJI[existing.type] || '<:Box:1473039115581915256>';
            const ts = existing.createdAt ? `\n**Created:** <t:${Math.floor(existing.createdAt / 1000)}:f>` : '';

            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Infotriangle:1473038460456800459> Confirm Delete\n\n` +
                    `${emoji} **${existing.name}** (\`${existing.type}\`)${ts}\n\n` +
                    `> This is permanent and cannot be undone.`
                ))
                .addActionRowComponents(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`dbd:confirm:${sid}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(`dbd:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
                ));

            const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            const collector = sent.createMessageComponentCollector({ time: TIMEOUT });

            collector.on('collect', async (i) => {
                if (i.user.id !== uid) return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });
                collector.stop('handled');

                if (i.customId.split(':')[1] === 'confirm') {
                    try {
                        await db.delete(key);
                        return i.update({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Deleted\n\n${emoji} **${name}** (\`${type}\`) permanently removed.`))], flags: MessageFlags.IsComponentsV2 });
                    } catch (err) {
                        console.error('Database Delete Error:', err);
                        return i.update({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\n${err.message}`))], flags: MessageFlags.IsComponentsV2 });
                    }
                }
                return i.update({ components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Cancelled. No changes were made.'))], flags: MessageFlags.IsComponentsV2 });
            });

            collector.on('end', (_, reason) => {
                if (reason === 'handled') return;
                sent.edit({ components: [buildExpiredPanel('database-delete', 'No changes were made.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            });
        } catch (error) {
            console.error('Database Delete Error:', error);
            return message.reply({ components: [new ContainerBuilder().setAccentColor(0xED4245).addTextDisplayComponents(new TextDisplayBuilder().setContent('# <:Cancel:1473037949187657818> Error\n\nFailed to process deletion.'))], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
