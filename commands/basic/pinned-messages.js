const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

async function buildPinnedMessages(channel) {
    const pinnedMessages = await channel.messages.fetchPinned();
    if (pinnedMessages.size === 0) return null;

    const allLines = [...pinnedMessages
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .values()]
        .map((msg, i) => {
            const text = msg.content.substring(0, 50) || '*[No text]*';
            const truncated = msg.content.length > 50 ? '...' : '';
            return `> \`${i + 1}.\` ${msg.author} - ${text}${truncated}`;
        });

    return paginate({
        header: `# <:Pin:1473038806612447500> Pinned Messages\n-# **${pinnedMessages.size}**/50 pins in ${channel}`,
        lines: allLines,
        perPage: 12,
        accentColor: COLORS.INFO
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pinned-messages')
        .setDescription('List all pinned messages in the channel'),

    prefix: 'pinned-messages',
    description: 'List all pinned messages in the channel',
    usage: 'pinned-messages',
    category: 'basic',
    aliases: ['pins', 'pinned'],

    async execute(interaction) {
        try {
            const result = await buildPinnedMessages(interaction.channel);
            if (!result) {
                const container = buildErrorResponse('No Pinned Messages', 'There are no pinned messages in this channel.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            const reply = await interaction.reply({ ...result, fetchReply: true });
            setupPaginationCollector(reply, result._pageData, interaction.user.id);
        } catch (error) {
            const container = buildErrorResponse('Failed to Fetch', 'Could not fetch pinned messages.', error.message);
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        try {
            const result = await buildPinnedMessages(message.channel);
            if (!result) {
                const container = buildErrorResponse('No Pinned Messages', 'There are no pinned messages in this channel.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            const reply = await message.reply(result);
            setupPaginationCollector(reply, result._pageData, message.author.id);
        } catch (error) {
            const container = buildErrorResponse('Failed to Fetch', 'Could not fetch pinned messages.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
