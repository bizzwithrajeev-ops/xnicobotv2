'use strict';

const {
    PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder,
    SectionBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize,
    ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const { buildExpiredPanel } = require('../../utils/responseBuilder');

/* ═══════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════ */
const PER_PAGE = 5;
const COLLECTOR_TIMEOUT = 120_000;

/* ═══════════════════════════════════════════════════════
   VIEW BUILDERS
   ═══════════════════════════════════════════════════════ */

function buildListView(webhooks, guild, page, uid) {
    const arr = [...webhooks.values()];
    const totalPages = Math.max(1, Math.ceil(arr.length / PER_PAGE));
    const pg = Math.max(0, Math.min(page, totalPages - 1));
    const slice = arr.slice(pg * PER_PAGE, (pg + 1) * PER_PAGE);

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Checkedbox:1473038547165384804> Server Webhooks (${arr.length})`
        ))
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: guild.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png' } }));

    const lines = slice.map((wh, i) => {
        const idx = pg * PER_PAGE + i + 1;
        const ch = guild.channels.cache.get(wh.channelId);
        return [
            `**${idx}. ${wh.name}**`,
            `> <:Fileuser:1473039570630348810> \`${wh.id}\``,
            `> 📺 ${ch ? `<#${ch.id}>` : 'Unknown'}`,
            `> <:Bookopen:1473038576391557130> <t:${Math.floor(wh.createdTimestamp / 1000)}:R>`
        ].join('\n');
    }).join('\n\n');

    const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines || 'No webhooks on this page.'));

    // Page info
    if (totalPages > 1) {
        ctr.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
        ctr.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# Page ${pg + 1}/${totalPages} • ${arr.length} webhook${arr.length !== 1 ? 's' : ''}`
        ));
    }

    // Pagination buttons
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wh:prev:${uid}`).setEmoji('<:History:1473037847568318605>').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
        new ButtonBuilder().setCustomId(`wh:next:${uid}`).setEmoji('<:Caretright:1473038207221502106>').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(pg >= totalPages - 1),
        new ButtonBuilder().setCustomId(`wh:refresh:${uid}`).setEmoji('<:History:1473037847568318605>').setLabel('Refresh').setStyle(ButtonStyle.Primary)
    );
    ctr.addActionRowComponents(navRow);

    // Select menu to pick a webhook for details
    if (arr.length > 0) {
        const opts = slice.map((wh, i) => ({
            label: wh.name.slice(0, 100),
            value: wh.id,
            description: `ID: ${wh.id}`,
            emoji: '<:Attach:1473037923979886694>'
        }));
        ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`wh:select:${uid}`)
                .setPlaceholder('Select a webhook for details & actions')
                .addOptions(opts.slice(0, 25))
        ));
    }

    return { container: ctr, page: pg, totalPages };
}

function buildDetailView(webhook, guild, uid) {
    const ch = guild.channels.cache.get(webhook.channelId);
    const avatarUrl = webhook.avatarURL({ size: 128 }) || guild.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

    const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Attach:1473037923979886694> ${webhook.name}`))
        .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: avatarUrl } }));

    const info = [
        `**<:Fileuser:1473039570630348810> ID:** \`${webhook.id}\``,
        `**📺 Channel:** ${ch ? `<#${ch.id}>` : 'Unknown'}`,
        `**<:User:1473038971398520977> Owner:** ${webhook.owner ? `<@${webhook.owner.id}>` : 'Unknown'}`,
        `**<:Bookopen:1473038576391557130> Created:** <t:${Math.floor(webhook.createdTimestamp / 1000)}:f> (<t:${Math.floor(webhook.createdTimestamp / 1000)}:R>)`,
        `**<:Attach:1473037923979886694> URL:** ||${webhook.url}||`,
        `**<:Picture:1473039568398843957> Avatar:** ${webhook.avatar ? 'Custom' : 'Default'}`
    ].join('\n');

    const ctr = new ContainerBuilder().setAccentColor(0xCAD7E6)
        .addSectionComponents(section)
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(info));

    // Action buttons
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wh:send:${uid}:${webhook.id}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Send Message').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`wh:rename:${uid}:${webhook.id}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Rename').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`wh:del:${uid}:${webhook.id}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`wh:back:${uid}`).setEmoji('<:History:1473037847568318605>').setLabel('Back to List').setStyle(ButtonStyle.Secondary)
    );
    ctr.addActionRowComponents(actionRow);

    // Web portal link
    ctr.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setURL('https://thenico.vercel.app/webhook').setLabel('Web Portal').setEmoji('<:Attach:1473037923979886694>').setStyle(ButtonStyle.Link)
    ));

    return ctr;
}

function buildConfirmDeleteView(webhook, uid) {
    const ctr = new ContainerBuilder().setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `# <:Infotriangle:1473038460456800459> Confirm Deletion\n\n` +
            `Are you sure you want to delete webhook **${webhook.name}**?\n` +
            `> <:Fileuser:1473039570630348810> \`${webhook.id}\`\n\n` +
            `-# This action cannot be undone.`
        ));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wh:confirmDel:${uid}:${webhook.id}`).setEmoji('<:Trash:1473038090074591293>').setLabel('Yes, Delete').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`wh:cancelDel:${uid}:${webhook.id}`).setEmoji('<:Cancel:1473037949187657818>').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );
    ctr.addActionRowComponents(row);
    return ctr;
}

function errorContainer(text) {
    return new ContainerBuilder().setAccentColor(0xED4245)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Cancel:1473037949187657818> ${text}`));
}

function successContainer(text) {
    return new ContainerBuilder().setAccentColor(0xCAD7E6)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> ${text}`));
}

/* ═══════════════════════════════════════════════════════
   COMMAND
   ═══════════════════════════════════════════════════════ */

module.exports = {
    data: null,
    prefix: 'webhook-list',
    description: 'List all webhooks in the server with interactive management',
    usage: 'webhook-list',
    category: 'webhook',
    aliases: ['wh-list', 'listwebhooks', 'wh-manage', 'webhooks'],
    permissions: ['ManageWebhooks'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
            return message.reply({ components: [errorContainer('Missing Permission\n\nYou need the **Manage Webhooks** permission.')], flags: MessageFlags.IsComponentsV2 });
        }

        const uid = message.author.id;
        let currentPage = 0;
        let webhooks;

        try {
            webhooks = await message.guild.fetchWebhooks();
        } catch {
            return message.reply({ components: [errorContainer('Error\n\nFailed to fetch webhooks. Please try again.')], flags: MessageFlags.IsComponentsV2 });
        }

        if (webhooks.size === 0) {
            return message.reply({ components: [errorContainer('No Webhooks\n\nNo webhooks found in this server.\n\n> Use `webhook-create` to create one!')], flags: MessageFlags.IsComponentsV2 });
        }

        const { container } = buildListView(webhooks, message.guild, currentPage, uid);
        const sent = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        const collector = sent.createMessageComponentCollector({ time: COLLECTOR_TIMEOUT });

        collector.on('collect', async (i) => {
            // Deny non-invoker
            if (i.user.id !== uid) {
                return i.reply({ content: '<:Cancel:1473037949187657818> Only the command invoker can use these controls.', flags: MessageFlags.Ephemeral });
            }

            try {
                const parts = i.customId.split(':');
                const action = parts[1];

                /* ── PAGINATION ── */
                if (action === 'prev') {
                    currentPage = Math.max(0, currentPage - 1);
                    webhooks = await message.guild.fetchWebhooks();
                    const { container: c } = buildListView(webhooks, message.guild, currentPage, uid);
                    return i.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
                }
                if (action === 'next') {
                    currentPage++;
                    webhooks = await message.guild.fetchWebhooks();
                    const { container: c, page: pg } = buildListView(webhooks, message.guild, currentPage, uid);
                    currentPage = pg;
                    return i.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
                }
                if (action === 'refresh') {
                    webhooks = await message.guild.fetchWebhooks();
                    if (webhooks.size === 0) {
                        return i.update({ components: [errorContainer('No Webhooks\n\nAll webhooks have been deleted.')], flags: MessageFlags.IsComponentsV2 });
                    }
                    const { container: c } = buildListView(webhooks, message.guild, currentPage, uid);
                    return i.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── SELECT WEBHOOK ── */
                if (action === 'select' && i.isStringSelectMenu()) {
                    const whId = i.values[0];
                    webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) return i.update({ components: [errorContainer('Webhook no longer exists.\n\nIt may have been deleted.')], flags: MessageFlags.IsComponentsV2 });
                    return i.update({ components: [buildDetailView(wh, message.guild, uid)], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── BACK TO LIST ── */
                if (action === 'back') {
                    webhooks = await message.guild.fetchWebhooks();
                    const { container: c } = buildListView(webhooks, message.guild, currentPage, uid);
                    return i.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── DELETE WEBHOOK (confirm prompt) ── */
                if (action === 'del') {
                    const whId = parts[3];
                    webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) return i.update({ components: [errorContainer('Webhook no longer exists.')], flags: MessageFlags.IsComponentsV2 });
                    return i.update({ components: [buildConfirmDeleteView(wh, uid)], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── CONFIRM DELETE ── */
                if (action === 'confirmDel') {
                    const whId = parts[3];
                    webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) return i.update({ components: [errorContainer('Webhook already deleted.')], flags: MessageFlags.IsComponentsV2 });
                    const name = wh.name;
                    await wh.delete(`Deleted by ${i.user.username} via webhook-list`);
                    webhooks = await message.guild.fetchWebhooks();
                    const result = successContainer(`Webhook Deleted\n\nSuccessfully deleted **${name}** (\`${whId}\`).`);
                    if (webhooks.size > 0) {
                        const backRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`wh:back:${uid}`).setEmoji('<:History:1473037847568318605>').setLabel('Back to List').setStyle(ButtonStyle.Secondary)
                        );
                        result.addActionRowComponents(backRow);
                    }
                    return i.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── CANCEL DELETE ── */
                if (action === 'cancelDel') {
                    const whId = parts[3];
                    webhooks = await message.guild.fetchWebhooks();
                    const wh = webhooks.get(whId);
                    if (!wh) {
                        const { container: c } = buildListView(webhooks, message.guild, currentPage, uid);
                        return i.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
                    }
                    return i.update({ components: [buildDetailView(wh, message.guild, uid)], flags: MessageFlags.IsComponentsV2 });
                }

                /* ── RENAME (open modal) ── */
                if (action === 'rename') {
                    const whId = parts[3];
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

                /* ── SEND MESSAGE (open modal) ── */
                if (action === 'send') {
                    const whId = parts[3];
                    const modal = new ModalBuilder()
                        .setCustomId(`wh_modal_send:${uid}:${whId}`)
                        .setTitle('Send Webhook Message')
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
                                    .setPlaceholder('Leave blank to use webhook name')
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
                console.error('Webhook list interaction error:', err);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '<:Cancel:1473037949187657818> An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
                }
            }
        });

        collector.on('end', () => {
            sent.edit({ components: [buildExpiredPanel('webhook-list')], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    },

    /* ═══════════════════════════════════════════════════════
       MODAL HANDLER — called from index.js
       ═══════════════════════════════════════════════════════ */
    async handleModalSubmit(interaction) {
        const parts = interaction.customId.split(':');
        const action = parts[0].replace('wh_modal_', '');
        const uid = parts[1];
        const whId = parts[2];

        if (interaction.user.id !== uid) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> This modal is not for you.', flags: MessageFlags.Ephemeral });
        }

        const guild = interaction.guild;
        let webhooks;

        try {
            webhooks = await guild.fetchWebhooks();
        } catch {
            return interaction.reply({ components: [errorContainer('Error\n\nFailed to fetch webhooks.')], flags: MessageFlags.IsComponentsV2 });
        }

        const webhook = webhooks.get(whId);
        if (!webhook) {
            return interaction.reply({ components: [errorContainer('Not Found\n\nWebhook no longer exists.')], flags: MessageFlags.IsComponentsV2 });
        }

        /* ── RENAME ── */
        if (action === 'rename') {
            const newName = interaction.fields.getTextInputValue('new_name').trim();
            if (!newName || newName.length < 1 || newName.length > 80) {
                return interaction.reply({ components: [errorContainer('Invalid Name\n\nName must be 1-80 characters.')], flags: MessageFlags.IsComponentsV2 });
            }
            const oldName = webhook.name;
            try {
                await webhook.edit({ name: newName, reason: `Renamed by ${interaction.user.username}` });
                const result = successContainer(`Webhook Renamed\n\n**${oldName}** → **${newName}**`);
                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`wh:back:${uid}`).setEmoji('<:History:1473037847568318605>').setLabel('Back to List').setStyle(ButtonStyle.Secondary)
                );
                result.addActionRowComponents(backRow);
                return interaction.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
            } catch {
                return interaction.reply({ components: [errorContainer('Failed\n\nCould not rename webhook.')], flags: MessageFlags.IsComponentsV2 });
            }
        }

        /* ── SEND ── */
        if (action === 'send') {
            const content = interaction.fields.getTextInputValue('content');
            const username = interaction.fields.getTextInputValue('username')?.trim() || undefined;
            const avatarURL = interaction.fields.getTextInputValue('avatar_url')?.trim() || undefined;

            try {
                await webhook.send({
                    content,
                    username: username || webhook.name,
                    avatarURL: avatarURL || webhook.avatarURL() || undefined
                });
                const result = successContainer(`Message Sent\n\nSuccessfully sent message through **${webhook.name}**!`);
                const backRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`wh:back:${uid}`).setEmoji('<:History:1473037847568318605>').setLabel('Back to List').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`wh:send:${uid}:${whId}`).setEmoji('<:Editalt:1473038138577256670>').setLabel('Send Another').setStyle(ButtonStyle.Success)
                );
                result.addActionRowComponents(backRow);
                return interaction.update({ components: [result], flags: MessageFlags.IsComponentsV2 });
            } catch (err) {
                return interaction.reply({ components: [errorContainer(`Failed\n\nCould not send message.\n> ${err.message}`)], flags: MessageFlags.IsComponentsV2 });
            }
        }

        return false;
    }
};
