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
    prefix: 'webhook-send',
    description: 'Send a message through a webhook (inline or via modal)',
    usage: 'webhook-send <webhook ID> [message]',
    category: 'webhook',
    aliases: ['wh-send', 'sendwebhook', 'wh-msg'],
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
                    `# <:Cancel:1473037949187657818> Invalid Usage\n\nPlease provide a webhook ID.\n\n**Usage:**\n` +
                    `\`webhook-send <ID> <message>\` — Send inline\n` +
                    `\`webhook-send <ID>\` — Open compose modal\n\n` +
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

        const msgContent = args.slice(1).join(' ');

        /* ── INLINE SEND (message provided in args) ── */
        if (msgContent) {
            try {
                await webhook.send({
                    content: msgContent,
                    username: webhook.name,
                    avatarURL: webhook.avatarURL() || undefined
                });

                const ctr = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> Message Sent\n\n` +
                        `Successfully sent message through **${webhook.name}**!\n` +
                        `> 📺 <#${webhook.channelId}>`
                    ));

                const uid = message.author.id;
                const sid = `${uid}_${Date.now().toString(36)}`;
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`whs:compose:${sid}:${webhookId}`).setEmoji('<:Edit:1473037903625191580>').setLabel('Compose Another').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`whs:quick:${sid}:${webhookId}`).setEmoji('<:Lightningalt:1473038679906844824>').setLabel('Quick Send Again').setStyle(ButtonStyle.Secondary)
                );
                ctr.addActionRowComponents(row);

                const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
                this._setupFollowUpCollector(sent, message, webhook, uid);
                return;
            } catch (err) {
                console.error('Error sending webhook:', err);
                const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Failed\n\nCould not send message through webhook.\n> ${err.message}`
                    ));
                return message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
            }
        }

        /* ── COMPOSE MODE (no message in args) — show prompt with compose button ── */
        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;
        const ch = message.guild.channels.cache.get(webhook.channelId);

        const ctr = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Editalt:1473038138577256670> Send via ${webhook.name}\n\n` +
                `**📺 Channel:** ${ch ? `<#${ch.id}>` : 'Unknown'}\n` +
                `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\`\n\n` +
                `Click **Compose** to open the message editor with custom username & avatar options.`
            ))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whs:compose:${sid}:${webhookId}`).setEmoji('<:Edit:1473037903625191580>').setLabel('Compose Message').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`whs:cancel:${sid}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        ctr.addActionRowComponents(row);

        const sent = await message.reply({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
        this._setupFollowUpCollector(sent, message, webhook, uid);
    },

    _setupFollowUpCollector(sent, message, webhook, uid) {
        const collector = sent.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) {
                return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use these controls.', flags: MessageFlags.Ephemeral });
            }

            const parts = i.customId.split(':');
            const action = parts[1];

            if (action === 'cancel') {
                collector.stop('cancelled');
                const result = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Cancelled.`));
                return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
            }

            if (action === 'compose') {
                const whId = parts[3];
                const modal = new ModalBuilder()
                    .setCustomId(`wh_modal_send:${uid}:${whId}`)
                    .setTitle('Compose Webhook Message')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('content')
                                .setLabel('Message Content')
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder('Enter the message to send...')
                                .setMaxLength(2000)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('username')
                                .setLabel('Custom Username (optional)')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('Leave blank to use webhook default')
                                .setMaxLength(80)
                                .setRequired(false)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('avatar_url')
                                .setLabel('Custom Avatar URL (optional)')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('https://example.com/avatar.png')
                                .setRequired(false)
                        )
                    );
                return i.showModal(modal);
            }

            if (action === 'quick') {
                const whId = parts[3];
                const modal = new ModalBuilder()
                    .setCustomId(`wh_modal_send:${uid}:${whId}`)
                    .setTitle('Quick Send Message')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('content')
                                .setLabel('Message Content')
                                .setStyle(TextInputStyle.Paragraph)
                                .setPlaceholder('Enter the message...')
                                .setMaxLength(2000)
                                .setRequired(true)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('username')
                                .setLabel('Custom Username (optional)')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('Leave blank for default')
                                .setMaxLength(80)
                                .setRequired(false)
                        ),
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('avatar_url')
                                .setLabel('Custom Avatar URL (optional)')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('https://example.com/avatar.png')
                                .setRequired(false)
                        )
                    );
                return i.showModal(modal);
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'cancelled') return;
            sent.edit({ components: [buildExpiredPanel('webhook-send')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    },

    /* ═══════════════════════════════════════════════════════
       MODAL HANDLER — called from index.js for wh_modal_send
       Also used by webhook-list.js (shared modal prefix)
       ═══════════════════════════════════════════════════════ */
    async handleModalSubmit(interaction) {
        const parts = interaction.customId.split(':');
        const uid = parts[1];
        const whId = parts[2];

        if (interaction.user.id !== uid) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This modal is not for you.', flags: MessageFlags.Ephemeral });
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

        const content = interaction.fields.getTextInputValue('content');
        const username = interaction.fields.getTextInputValue('username')?.trim() || undefined;
        const avatarURL = interaction.fields.getTextInputValue('avatar_url')?.trim() || undefined;

        try {
            await webhook.send({
                content,
                username: username || webhook.name,
                avatarURL: avatarURL || webhook.avatarURL() || undefined
            });

            const result = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:Checkedbox:1473038547165384804> Message Sent\n\n` +
                    `Sent through **${username || webhook.name}** in <#${webhook.channelId}>`
                ));

            return interaction.reply({ components: [result], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            console.error('Error sending webhook message via modal:', err);
            return interaction.reply({
                components: [new ContainerBuilder().setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Failed\n\nCould not send message.\n> ${err.message}`))],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
