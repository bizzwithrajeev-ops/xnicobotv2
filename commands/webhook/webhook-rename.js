'use strict';

const {
    PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const COLLECTOR_TIMEOUT = 60_000;

module.exports = {
    data: null,
    prefix: 'webhook-rename',
    description: 'Rename a webhook (inline or via modal)',
    usage: 'webhook-rename <webhook ID> [new name]',
    category: 'webhook',
    aliases: ['wh-rename', 'renamewebhook'],
    permissions: ['ManageWebhooks'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Missing Permission\n\nYou need the **Manage Webhooks** permission.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const webhookId = args[0];
        if (!webhookId) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Invalid Usage\n\n` +
                    `**Usage:**\n` +
                    `\`webhook-rename <ID> <new name>\` — Rename inline\n` +
                    `\`webhook-rename <ID>\` — Open rename modal\n\n` +
                    `> Use \`webhook-list\` to see all webhooks.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        let webhooks;
        try {
            webhooks = await message.guild.fetchWebhooks();
        } catch {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Error\n\nFailed to fetch webhooks.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const webhook = webhooks.get(webhookId);
        if (!webhook) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Not Found\n\nNo webhook with ID \`${webhookId}\` exists.\n\n> Use \`webhook-list\` to see available webhooks.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const newName = args.slice(1).join(' ');
        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;

        /* ── INLINE RENAME (name provided in args) ── */
        if (newName) {
            if (newName.length > 80) {
                const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Name Too Long\n\nWebhook name must be 80 characters or fewer.`
                    ));
                return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            }

            // Confirm prompt
            const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Editalt:1473038138577256670> Confirm Rename\n\n` +
                    `**Current Name:** ${webhook.name}\n` +
                    `**New Name:** ${newName}\n` +
                    `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\``
                ));

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`whr:confirm:${sid}`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Confirm').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`whr:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );
            ctr.addActionRowComponents(row);

            const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            const collector = sent.createMessageComponentCollector({ time: 30_000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== uid) {
                    return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });
                }

                const action = i.customId.split(':')[1];
                collector.stop('handled');

                if (action === 'confirm') {
                    try {
                        const freshWebhooks = await message.guild.fetchWebhooks();
                        const wh = freshWebhooks.get(webhookId);
                        if (!wh) {
                            const result = new ContainerBuilder().setAccentColor(0xED4245)
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                    `# <:Cancel:1473037949187657818> Not Found\n\nWebhook no longer exists.`
                                ));
                            return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                        }

                        const oldName = wh.name;
                        await wh.edit({ name: newName, reason: `Renamed by ${i.user.username}` });

                        const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                `# <:Checkedbox:1473038547165384804> Webhook Renamed\n\n` +
                                `**${oldName}** → **${newName}**\n` +
                                `> <:Fileuser:1473039570630348810> \`${webhookId}\``
                            ));
                        return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                    } catch (err) {
                        console.error('Error renaming webhook:', err);
                        const result = new ContainerBuilder().setAccentColor(0xED4245)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                `# <:Cancel:1473037949187657818> Failed\n\nCould not rename webhook. ${err.message}`
                            ));
                        return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                    }
                }

                if (action === 'cancel') {
                    const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Cancelled\n\nWebhook rename was cancelled.`));
                    return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'handled') return;
                sent.edit({ components: [buildExpiredPanel('webhook-rename', 'Webhook was not renamed.')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            });
            return;
        }

        /* ── MODAL MODE (no name in args) — show button to open rename modal ── */
        const ch = message.guild.channels.cache.get(webhook.channelId);
        const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Editalt:1473038138577256670> Rename Webhook\n\n` +
                `**<:Edit:1473037903625191580> Current Name:** ${webhook.name}\n` +
                `**📺 Channel:** ${ch ? `<#${ch.id}>` : 'Unknown'}\n` +
                `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\`\n\n` +
                `Click the button below to enter a new name.`
            ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whr:modal:${sid}:${webhookId}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Enter New Name').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`whr:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        ctr.addActionRowComponents(row);

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) {
                return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });
            }

            const action = i.customId.split(':')[1];

            if (action === 'cancel') {
                collector.stop('cancelled');
                const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Cancelled.`));
                return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'modal') {
                const whId = i.customId.split(':')[3];
                const modal = new ModalBuilder()
                    .setCustomId(`wh_modal_rename:${uid}:${whId}`)
                    .setTitle('Rename Webhook')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('new_name')
                                .setLabel('New Webhook Name')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('Enter new name (1-80 characters)')
                                .setMinLength(1)
                                .setMaxLength(80)
                                .setRequired(true)
                        )
                    );
                return i.showModal(modal);
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'cancelled') return;
            sent.edit({ components: [buildExpiredPanel('webhook-rename')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    },

    /* ═══════════════════════════════════════════════════════
       MODAL HANDLER — called from index.js for wh_modal_rename
       Also used by webhook-list.js (shared modal prefix)
       ═══════════════════════════════════════════════════════ */
    async handleModalSubmit(interaction) {
        const parts = interaction.customId.split(':');
        const uid = parts[1];
        const whId = parts[2];

        if (interaction.user.id !== uid) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This modal is not for you.', flags: MessageFlags.Ephemeral });
        }

        const newName = interaction.fields.getTextInputValue('new_name').trim();
        if (!newName || newName.length < 1 || newName.length > 80) {
            return interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Invalid Name\n\nName must be 1-80 characters.`))],
                flags: MessageFlags.IsComponentsV2
            });
        }

        let webhooks;
        try {
            webhooks = await interaction.guild.fetchWebhooks();
        } catch {
            return interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Error\n\nFailed to fetch webhooks.`))],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const webhook = webhooks.get(whId);
        if (!webhook) {
            return interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Not Found\n\nWebhook no longer exists.`))],
                flags: MessageFlags.IsComponentsV2
            });
        }

        try {
            const oldName = webhook.name;
            await webhook.edit({ name: newName, reason: `Renamed by ${interaction.user.username}` });

            const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Webhook Renamed\n\n` +
                    `**${oldName}** → **${newName}**\n` +
                    `> <:Fileuser:1473039570630348810> \`${whId}\``
                ));
            return interaction.reply({ components: [result], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('Error renaming webhook via modal:', err);
            return interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\nCould not rename webhook. ${err.message}`))],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
