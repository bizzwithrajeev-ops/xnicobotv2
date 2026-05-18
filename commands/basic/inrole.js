const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

function buildInRole(role) {
    if (role.members.size === 0) return null;

    const allLines = role.members.map(m => `> ${m.user}`);

    return paginate({
        header: `# <:Userplus:1473038912212435086> Members with ${role.name}\n-# **${role.members.size}** member${role.members.size !== 1 ? 's' : ''}`,
        lines: allLines,
        perPage: 15,
        accentColor: role.color || COLORS.INFO
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('View members with a specific role')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to check').setRequired(true)),

    prefix: 'inrole',
    description: 'View members with a specific role',
    usage: 'inrole <@role>',
    category: 'basic',

    async execute(interaction) {
        const role = interaction.options.getRole('role');
        const result = buildInRole(role);
        if (!result) {
            const container = buildErrorResponse('<:Folderuser:1473039565869809746> No Members Found', `<:Folderuser:1473039565869809746> No members have the ${role} role.`);
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
        const reply = await interaction.reply({ ...result, fetchReply: true });
        setupPaginationCollector(reply, result._pageData, interaction.user.id);
    },

    async executePrefix(message, args) {
        try {
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);

            if (!role) {
                const container = buildInvalidUsage('inrole', '-inrole @role', ['-inrole @Member', '-inrole @VIP']);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const result = buildInRole(role);
            if (!result) {
                const container = buildErrorResponse('<:Folderuser:1473039565869809746> No Members Found', `<:Folderuser:1473039565869809746> No members have the ${role} role.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const reply = await message.reply(result);
            setupPaginationCollector(reply, result._pageData, message.author.id);
        } catch (error) {
            console.error(`[INROLE] Error:`, error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
