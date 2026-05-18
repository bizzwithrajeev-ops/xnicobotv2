'use strict';

const {
    PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags
} = require('discord.js');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const COLLECTOR_TIMEOUT = 30_000;

module.exports = {
    data: null,
    prefix: 'webhook-delete',
    description: 'Delete a webhook from the server with confirmation',
    usage: 'webhook-delete <webhook ID>',
    category: 'webhook',
    aliases: ['wh-delete', 'deletewebhook'],
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
                    `# <:Cancel:1473037949187657818> Invalid Usage\n\nPlease provide a webhook ID.\n\n**Usage:** \`webhook-delete <webhook ID>\`\n> Use \`webhook-list\` to see all webhooks and their IDs.`
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
                    `# <:Cancel:1473037949187657818> Not Found\n\nNo webhook with ID \`${webhookId}\` exists in this server.\n\n> Use \`webhook-list\` to see available webhooks.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;
        const ch = message.guild.channels.cache.get(webhook.channelId);

        // Confirmation prompt
        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Infotriangle:1473038460456800459> Confirm Webhook Deletion\n\n` +
                `Are you sure you want to delete this webhook?\n`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**<:Edit:1473037903625191580> Name:** ${webhook.name}\n` +
                `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\`\n` +
                `**📺 Channel:** ${ch ? `<#${ch.id}>` : 'Unknown'}\n` +
                `**<:Bookopen:1473038576391557130> Created:** <t:${Math.floor(webhook.createdTimestamp / 1000)}:R>`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `-# This action cannot be undone. You have 30 seconds to confirm.`
            ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whd:confirm:${sid}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`whd:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        ctr.addActionRowComponents(row);

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) {
                return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can confirm or cancel.', ephemeral: true });
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
                                `# <:Cancel:1473037949187657818> Already Deleted\n\nThis webhook no longer exists.`
                            ));
                        return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                    }

                    const name = wh.name;
                    await wh.delete(`Deleted by ${i.user.username}`);

                    const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> Webhook Deleted\n\n` +
                            `Successfully deleted webhook **${name}**\n` +
                            `> <:Fileuser:1473039570630348810> \`${webhookId}\``
                        ));
                    return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                } catch (err) {
                    console.error('Error deleting webhook:', err);
                    const result = new ContainerBuilder().setAccentColor(0xED4245)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# <:Cancel:1473037949187657818> Failed\n\nFailed to delete webhook. Please try again.`
                        ));
                    return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                }
            }

            if (action === 'cancel') {
                const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# Cancelled\n\nWebhook deletion was cancelled. **${webhook.name}** is safe.`
                    ));
                return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'handled') return;
            sent.edit({ components: [buildExpiredPanel('webhook-delete', `Webhook **${webhook.name}** was not deleted.`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
