const { SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, COLORS, BRANDING } = require('../../utils/responseBuilder');
const { paginate, setupPaginationCollector } = require('../../utils/pagination');

module.exports = {
    name: 'members-without-role',
    prefix: 'members-without-role',
    description: 'List members without any roles',
    category: 'admin',
    usage: 'members-without-role',
    permissions: ['ManageRoles'],
    data: new SlashCommandBuilder()
        .setName('members-without-role')
        .setDescription('List members without any roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        try {
            const membersWithoutRoles = interaction.guild.members.cache.filter(m => 
                m.roles.cache.size === 1 && !m.user.bot
            );

            if (membersWithoutRoles.size === 0) {
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> No Roleless Members\n\nAll members have at least one role.`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const allLines = [...membersWithoutRoles.values()].map((m, i) =>
                `**${i + 1}.** ${m.user.username} — Joined: ${new Date(m.joinedTimestamp).toLocaleDateString()}`
            );

            const result = paginate({
                header: `# <:Bookopen:1473038576391557130> Members Without Roles (${membersWithoutRoles.size})`,
                lines: allLines,
                perPage: 20,
                accentColor: COLORS.PRIMARY,
                footer: BRANDING
            });

            const reply = await interaction.reply({ ...result, fetchReply: true });
            setupPaginationCollector(reply, result._pageData, interaction.user.id);
        } catch (error) {
            console.error('[MembersWithoutRole] Slash Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } else {
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            const container = buildPermissionDenied('Manage Roles');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const membersWithoutRoles = message.guild.members.cache.filter(m => 
                m.roles.cache.size === 1 && !m.user.bot
            );

            if (membersWithoutRoles.size === 0) {
                const container = new ContainerBuilder()
                    .setAccentColor(COLORS.PRIMARY)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Checkedbox:1473038547165384804> No Roleless Members\n\nAll members have at least one role.`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const allLines = [...membersWithoutRoles.values()].map((m, i) =>
                `**${i + 1}.** ${m.user.username} — Joined: ${new Date(m.joinedTimestamp).toLocaleDateString()}`
            );

            const result = paginate({
                header: `# <:Bookopen:1473038576391557130> Members Without Roles (${membersWithoutRoles.size})`,
                lines: allLines,
                perPage: 20,
                accentColor: COLORS.PRIMARY,
                footer: BRANDING
            });

            const reply = await message.reply(result);
            setupPaginationCollector(reply, result._pageData, message.author.id);
        } catch (error) {
            console.error('[MembersWithoutRole] Error:', error);
            const container = buildErrorResponse('Error', 'An error occurred while executing this command.', error.message);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
