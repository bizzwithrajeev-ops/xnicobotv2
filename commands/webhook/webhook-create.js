'use strict';

const { PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const COLLECTOR_TIMEOUT = 30_000;

module.exports = {
    data: null,
    prefix: 'webhook-create',
    description: 'Create a new webhook in a channel with confirmation',
    usage: 'webhook-create <#channel> <webhook name>',
    category: 'webhook',
    aliases: ['wh-create', 'createwebhook'],
    permissions: ['ManageWebhooks'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Missing Permission\n\nYou need the **Manage Webhooks** permission.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const channelMention = args[0];
        const webhookName = args.slice(1).join(' ');

        if (!channelMention || !webhookName) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Invalid Usage\n\n` +
                    `Please provide a channel and webhook name.\n\n` +
                    `**Usage:** \`webhook-create <#channel> <name>\`\n` +
                    `**Example:** \`webhook-create #general My Webhook\``
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const channelId = channelMention.replace(/[<#>]/g, '');
        const channel = message.guild.channels.cache.get(channelId);

        if (!channel || !channel.isTextBased()) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Invalid Channel\n\nPlease mention a valid text channel.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        if (!channel.permissionsFor(message.guild.members.me).has(PermissionFlagsBits.ManageWebhooks)) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Missing Bot Permission\n\nI don't have permission to manage webhooks in <#${channel.id}>.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        if (webhookName.length > 80) {
            const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Cancel:1473037949187657818> Name Too Long\n\nWebhook name must be 80 characters or fewer. Yours is ${webhookName.length}.`
                ));
            return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        }

        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;

        // Confirmation prompt
        const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Attach:1473037923979886694> Create Webhook\n\n` +
                `Are you sure you want to create this webhook?\n`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `**<:Edit:1473037903625191580> Name:** ${webhookName}\n` +
                `**📺 Channel:** <#${channel.id}>\n` +
                `**<:Picture:1473039568398843957> Avatar:** Your profile picture`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `-# The webhook URL will be shown after creation. Keep it safe!`
            ));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whc:confirm:${sid}`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Create').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`whc:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        ctr.addActionRowComponents(row);

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        const collector = sent.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) {
                return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can confirm or cancel.', flags: MessageFlags.Ephemeral });
            }

            const action = i.customId.split(':')[1];
            collector.stop('handled');

            if (action === 'confirm') {
                try {
                    const webhook = await channel.createWebhook({
                        name: webhookName,
                        avatar: message.author.displayAvatarURL({ extension: "png" }),
                        reason: `Webhook created by ${message.author.username}`
                    });

                    const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> Webhook Created\n\n` +
                            `Successfully created webhook **${webhookName}** in <#${channel.id}>!\n`
                        ))
                        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\`\n` +
                            `**<:Attach:1473037923979886694> URL:** ||${webhook.url}||\n\n` +
                            `-# <:Infotriangle:1473038460456800459> Keep this URL safe! Anyone with it can send messages as this webhook.\n` +
                            `-# <:Attach:1473037923979886694> Craft messages visually at [thenico.vercel.app/webhook](https://thenico.vercel.app/webhook)`
                        ));

                    const actionRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`whc:sendNow:${sid}:${webhook.id}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Send a Message').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`whc:done:${sid}`).setEmoji('<:Checkedbox:1473038547165384804>').setLabel('Done').setStyle(ButtonStyle.Secondary)
                    );
                    result.addActionRowComponents(actionRow);

                    await i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });

                    // Follow-up collector for the "Send a Message" button
                    const followCollector = sent.createMessageComponentCollector({ time: 60_000 });
                    followCollector.on('collect', async (fi) => {
                        if (fi.user.id !== uid) {
                            return fi.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use this.', flags: MessageFlags.Ephemeral });
                        }
                        const fAction = fi.customId.split(':')[1];
                        followCollector.stop('handled');

                        if (fAction === 'sendNow') {
                                                        const whId = fi.customId.split(':')[3];
                            const modal = new ModalBuilder()
                                .setCustomId(`wh_modal_send:${uid}:${whId}`)
                                .setTitle('Send Webhook Message')
                                .addComponents(
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder()
                                            .setCustomId('content')
                                            .setLabel('Message Content')
                                            .setStyle(TextInputStyle.Paragraph)
                                            .setPlaceholder('Enter message...')
                                            .setMaxLength(2000)
                                            .setRequired(true)
                                    ),
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder()
                                            .setCustomId('username')
                                            .setLabel('Custom Username (optional)')
                                            .setStyle(TextInputStyle.Short)
                                            .setMaxLength(80)
                                            .setRequired(false)
                                    ),
                                    new ActionRowBuilder().addComponents(
                                        new TextInputBuilder()
                                            .setCustomId('avatar_url')
                                            .setLabel('Custom Avatar URL (optional)')
                                            .setStyle(TextInputStyle.Short)
                                            .setRequired(false)
                                    )
                                );
                            return fi.showModal(modal);
                        }

                        if (fAction === 'done') {
                            const done = new ContainerBuilder().setAccentColor(0xCAD7E6)
                                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                    `# <:Checkedbox:1473038547165384804> Webhook Created\n\n` +
                                    `**${webhookName}** is ready in <#${channel.id}>!\n` +
                                    `> <:Fileuser:1473039570630348810> \`${webhook.id}\``
                                ));
                            return fi.update({ components: [done], flags: MessageFlags.IsComponentsV2 });
                        }
                    });
                    followCollector.on('end', (_, reason) => {
                        if (reason === 'handled') return;
                        const done = new ContainerBuilder().setAccentColor(0xCAD7E6)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                                `# <:Checkedbox:1473038547165384804> Webhook Created\n\n` +
                                `**${webhookName}** is ready in <#${channel.id}>! • <:Fileuser:1473039570630348810> \`${webhook.id}\``
                            ));
                        sent.edit({ components: [done], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    });

                } catch (err) {
                    console.error('Error creating webhook:', err);
                    const result = new ContainerBuilder().setAccentColor(0xED4245)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# <:Cancel:1473037949187657818> Failed\n\nFailed to create webhook. ${err.message}`
                        ));
                    return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                }
                return;
            }

            if (action === 'cancel') {
                const result = new ContainerBuilder().setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# Cancelled\n\nWebhook creation was cancelled.`
                    ));
                return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'handled') return;
            sent.edit({ components: [buildExpiredPanel('webhook-create')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
