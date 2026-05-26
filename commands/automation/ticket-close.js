const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');

const jsonStore = require('../../utils/jsonStore');
const {
    fetchAllMessages,
    buildTranscriptAttachments,
    postTranscriptToLogChannel,
} = require('../../utils/ticketTranscript');

function loadConfig() {
    if (!jsonStore.has('tickets')) {
        jsonStore.write('tickets', {});
        return {};
    }
    const data = jsonStore.read('tickets');
    if (Array.isArray(data)) {
        jsonStore.write('tickets', {});
        return {};
    }
    return data;
}

function saveConfig(config) {
    jsonStore.write('tickets', config);
}

/**
 * Save a transcript for a closing ticket.
 * Returns a promise that resolves when delivery is done (or fails).
 */
async function autoSaveTranscript({ client, guild, channel, ticket, closedByTag, transcriptChannelId }) {
    try {
        const messages = await fetchAllMessages(channel, { limit: 2000 });
        const opener = ticket?.userId ? await client.users.fetch(ticket.userId).catch(() => null) : null;
        const claimer = ticket?.claimedBy ? await client.users.fetch(ticket.claimedBy).catch(() => null) : null;

        const meta = {
            channelName:   channel.name,
            guildName:     guild.name,
            openerTag:     opener?.tag || ticket?.userId,
            openerId:      ticket?.userId,
            categoryLabel: ticket?.categoryLabel || 'N/A',
            createdAt:     ticket?.createdAt,
            closedAt:      Date.now(),
            closedBy:      closedByTag,
            claimedByTag:  claimer?.tag,
            addedMembers:  (ticket?.members || []).map(id => ({ id })),
            messageCount:  messages.length,
        };

        const attachments = buildTranscriptAttachments(messages, meta);
        await postTranscriptToLogChannel(guild, transcriptChannelId, attachments, meta);

        if (opener) {
            try {
                await opener.send({
                    content: `<:Clipboardalt:1473039555190849598> Your ticket **${channel.name}** in **${guild.name}** has been closed. A copy of the transcript is attached.`,
                    files: attachments
                });
            } catch { /* DMs closed — ignore */ }
        }
    } catch (err) {
        console.error(`[ticket-close] Auto-transcript failed: ${err.message}`);
    }
}

/** 30s budget so a stuck fetch never blocks ticket deletion forever. */
async function awaitTranscriptWithBudget(promise, budgetMs = 30_000) {
    return Promise.race([
        promise,
        new Promise(res => setTimeout(res, budgetMs))
    ]);
}

module.exports = {
    category: 'automation',
    data: new SlashCommandBuilder()
        .setName('ticket-close')
        .setDescription('Close the current ticket'),

    async execute(interaction) {
        try {
            const config = loadConfig();
            const guildConfig = config[interaction.guild.id];

            if (!guildConfig) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Ticket system is not configured!', flags: MessageFlags.Ephemeral });
            }

            const ticket = guildConfig.tickets?.[interaction.channel.id];
            if (!ticket) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> This is not a ticket channel!', flags: MessageFlags.Ephemeral });
            }

            // Permission check — owner, support role, or admin
            const isSupport = guildConfig.supportRoleId ? interaction.member.roles.cache.has(guildConfig.supportRoleId) : false;
            const isOwner   = ticket.userId === interaction.user.id;
            const isAdmin   = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!isSupport && !isOwner && !isAdmin) {
                return interaction.reply({ content: '<:Cancel:1473037949187657818> Only the ticket owner, support team, or admins can close tickets!', flags: MessageFlags.Ephemeral });
            }

            const tMode = guildConfig.transcriptMode || 'manual';
            const wantsAuto = (tMode === 'auto' || tMode === 'both') && !!guildConfig.transcriptChannelId;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Lock:1473038513749491773> Ticket Closed\n\n` +
                        `This ticket has been closed by **${interaction.user.username}**\n\n` +
                        (wantsAuto
                            ? `Saving transcript and deleting channel in 8 seconds...`
                            : `Channel will be deleted in 5 seconds...`)
                    )
                );

            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

            // Snapshot then remove from store
            const closingChannel = interaction.channel;
            const closingGuild   = interaction.guild;
            delete guildConfig.tickets[closingChannel.id];
            saveConfig(config);

            if (wantsAuto) {
                await awaitTranscriptWithBudget(autoSaveTranscript({
                    client:               interaction.client,
                    guild:                closingGuild,
                    channel:              closingChannel,
                    ticket,
                    closedByTag:          `${interaction.user.tag} (slash close)`,
                    transcriptChannelId:  guildConfig.transcriptChannelId,
                }));
                setTimeout(() => {
                    closingChannel.delete().catch(err => console.error(`Failed to delete ticket channel: ${err.message}`));
                }, 2000);
            } else {
                setTimeout(() => {
                    closingChannel.delete().catch(err => console.error(`Failed to delete ticket channel: ${err.message}`));
                }, 5000);
            }
        } catch (error) {
            console.error(`Ticket close error: ${error.message}`, error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> Failed to close ticket!', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message) {
        try {
            const config = loadConfig();
            const guildConfig = config[message.guild.id];

            if (!guildConfig) {
                return message.reply('<:Cancel:1473037949187657818> Ticket system is not configured!');
            }

            const ticket = guildConfig.tickets?.[message.channel.id];
            if (!ticket) {
                return message.reply('<:Cancel:1473037949187657818> This is not a ticket channel!');
            }

            const isSupport = guildConfig.supportRoleId ? message.member.roles.cache.has(guildConfig.supportRoleId) : false;
            const isOwner   = ticket.userId === message.author.id;
            const isAdmin   = message.member.permissions.has(PermissionFlagsBits.ManageGuild);

            if (!isSupport && !isOwner && !isAdmin) {
                return message.reply('<:Cancel:1473037949187657818> Only the ticket owner, support team, or admins can close tickets!');
            }

            const tMode = guildConfig.transcriptMode || 'manual';
            const wantsAuto = (tMode === 'auto' || tMode === 'both') && !!guildConfig.transcriptChannelId;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# <:Lock:1473038513749491773> Ticket Closed\n\n` +
                        `This ticket has been closed by **${message.author.username}**\n\n` +
                        (wantsAuto
                            ? `Saving transcript and deleting channel in 8 seconds...`
                            : `Channel will be deleted in 5 seconds...`)
                    )
                );

            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

            const closingChannel = message.channel;
            const closingGuild   = message.guild;
            delete guildConfig.tickets[closingChannel.id];
            saveConfig(config);

            if (wantsAuto) {
                await awaitTranscriptWithBudget(autoSaveTranscript({
                    client:              message.client,
                    guild:               closingGuild,
                    channel:             closingChannel,
                    ticket,
                    closedByTag:         `${message.author.tag} (prefix close)`,
                    transcriptChannelId: guildConfig.transcriptChannelId,
                }));
                setTimeout(() => {
                    closingChannel.delete().catch(err => console.error(`Failed to delete ticket channel: ${err.message}`));
                }, 2000);
            } else {
                setTimeout(() => {
                    closingChannel.delete().catch(err => console.error(`Failed to delete ticket channel: ${err.message}`));
                }, 5000);
            }
        } catch (error) {
            console.error(`Ticket close error: ${error.message}`, error);
        }
    }
};
