const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, COLORS } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

function getRoleLines(guild) {
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);
    return [...roles.values()].map(r => `> ${r} — **${r.members.size}** member${r.members.size !== 1 ? 's' : ''}`);
}

module.exports = {
    prefix: 'rolecount',
    description: 'View member count for each role',
    usage: 'rolecount',
    category: 'basic',
    aliases: ['rolemembercount', 'rolemembers'],

    data: new SlashCommandBuilder()
        .setName('rolecount')
        .setDescription('View member count for each role'),

    async execute(interaction) {
        try {
            const lines = getRoleLines(interaction.guild);
            const result = paginate({ header: `# <:Invoice:1473039492217835550> Role Member Counts\n-# **${lines.length}** roles`, lines, perPage: 15, accentColor: COLORS.INFO });
            const reply = await interaction.reply({ ...result, fetchReply: true });
            setupPaginationCollector(reply, result._pageData, interaction.user.id);
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch role data.', error.message);
            await interaction.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message) {
        try {
            const lines = getRoleLines(message.guild);
            const result = paginate({ header: `# <:Invoice:1473039492217835550> Role Member Counts\n-# **${lines.length}** roles`, lines, perPage: 15, accentColor: COLORS.INFO });
            const reply = await message.reply(result);
            setupPaginationCollector(reply, result._pageData, message.author.id);
        } catch (error) {
            const err = buildErrorResponse('Error', 'Failed to fetch role data.', error.message);
            await message.reply({ components: [err], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
