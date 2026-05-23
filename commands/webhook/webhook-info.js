'use strict';

const {
    PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder,
    SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

const COLLECTOR_TIMEOUT = 120_000;

module.exports = {
    data: null,
    prefix: 'webhook-info',
    description: 'Get detailed information about a webhook with quick actions',
    usage: 'webhook-info <webhook ID>',
    category: 'webhook',
    aliases: ['wh-info', 'webhookinfo'],
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
                    `# <:Cancel:1473037949187657818> Invalid Usage\n\nUsage: \`webhook-info <webhook ID>\`\n\n> Use \`webhook-list\` to see all webhooks.`
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

        const uid = message.author.id;
        const sid = `${uid}_${Date.now().toString(36)}`;

        const sent = await message.reply({ components: [this._buildInfoView(webhook, message.guild, uid, sid)], flags: MessageFlags.IsComponentsV2 });
        this._setupCollector(sent, message, webhookId, uid, sid);
    },

    _buildInfoView(webhook, guild, uid, sid) {
        const ch = guild.channels.cache.get(webhook.channelId);
        const avatarUrl = webhook.avatarURL({ size: 256 }) || guild.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Attach:1473037923979886694> Webhook Information`))
            .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: avatarUrl } }));

        const info = [
            `**<:Edit:1473037903625191580> Name:** ${webhook.name}`,
            `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\``,
            `**📺 Channel:** ${ch ? `<#${ch.id}>` : 'Unknown'}`,
            `**<:Settings:1473037894703779851> Type:** ${webhook.type === 1 ? 'Incoming' : webhook.type === 2 ? 'Channel Follower' : 'Application'}`,
            `**<:User:1473038971398520977> Owner:** ${webhook.owner ? `<@${webhook.owner.id}>` : 'Unknown'}`,
            `**<:Bookopen:1473038576391557130> Created:** <t:${Math.floor(webhook.createdTimestamp / 1000)}:f> (<t:${Math.floor(webhook.createdTimestamp / 1000)}:R>)`,
            `**<:Picture:1473039568398843957> Avatar:** ${webhook.avatar ? 'Custom' : 'Default'}`,
            `**<:Attach:1473037923979886694> URL:** ||${webhook.url}||`
        ].join('\n');

        const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
            .addSectionComponents(section)
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `-# Quick Actions`
            ));

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whi:send:${sid}:${webhook.id}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Send Message').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`whi:rename:${sid}:${webhook.id}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Rename').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`whi:del:${sid}:${webhook.id}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`whi:refresh:${sid}:${webhook.id}`).setEmoji('<:History:1473037847568318605>').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
        ctr.addActionRowComponents(actionRow);
        return ctr;
    },

    _buildConfirmDelete(webhook, uid, sid) {
        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# <:Infotriangle:1473038460456800459> Confirm Deletion\n\n` +
                `Delete webhook **${webhook.name}** (\`${webhook.id}\`)?\n\n` +
                `-# This cannot be undone.`
            ));
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`whi:confirmDel:${sid}:${webhook.id}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`whi:cancelDel:${sid}:${webhook.id}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        ctr.addActionRowComponents(row);
        return ctr;
    },

    _setupCollector(sent, message, webhookId, uid, sid) {
        const collector = sent.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

        collector.on('collect', async (i) => {
            if (i.user.id !== uid) {
                return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use these controls.', flags: MessageFlags.Ephemeral });
            }

            const parts = i.customId.split(':');
            const action = parts[1];
            const whId = parts[3];

            try {
                /* ── REFRESH ── */
                if (action === 'refresh') {
                    const webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) {
                        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Webhook Deleted\n\nThis webhook no longer exists.`));
                        return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
                    }
                    return i.update({ components: [this._buildInfoView(wh, message.guild, uid, sid)], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── DELETE PROMPT ── */
                if (action === 'del') {
                    const webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) {
                        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Webhook no longer exists.`));
                        return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
                    }
                    return i.update({ components: [this._buildConfirmDelete(wh, uid, sid)], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── CONFIRM DELETE ── */
                if (action === 'confirmDel') {
                    const webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) {
                        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Already deleted.`));
                        return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
                    }
                    const name = wh.name;
                    await wh.delete(`Deleted by ${i.user.username}`);
                    collector.stop('deleted');
                    const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `# <:Checkedbox:1473038547165384804> Webhook Deleted\n\nSuccessfully deleted **${name}** (\`${whId}\`).`
                        ));
                    return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── CANCEL DELETE ── */
                if (action === 'cancelDel') {
                    const webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) {
                        const ctr = new ContainerBuilder().setAccentColor(0xED4245)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> Webhook no longer exists.`));
                        return i.update({ components: [ctr], flags: MessageFlags.IsComponentsV2 });
                    }
                    return i.update({ components: [this._buildInfoView(wh, message.guild, uid, sid)], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── RENAME (modal) ── */
                if (action === 'rename') {
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

                /* ── SEND (modal) ── */
                if (action === 'send') {
                    const modal = new ModalBuilder()
                        .setCustomId(`wh_modal_send:${uid}:${whId}`)
                        .setTitle('Send Webhook Message')
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
                                    .setPlaceholder('Leave blank for webhook default')
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

            } catch (err) {
                console.error('Webhook info interaction error:', err);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '<:Cancel:1473037949187657818> An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'deleted') return;
            sent.edit({ components: [buildExpiredPanel('webhook-info')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    }
};
