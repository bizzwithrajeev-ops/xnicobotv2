const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, buildRoleHierarchyError, buildRoleNotFound, buildInvalidUsage, buildSuccessResponse, COLORS, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'role-mentionable',
    prefix: 'role-mentionable',
    description: 'Toggle role mentionable status',
    category: 'admin',
    usage: 'role-mentionable <@role> <on/off>',
    permissions: ['ManageRoles'],
    data: new SlashCommandBuilder()
        .setName('role-mentionable')
        .setDescription('Toggle whether a role can be mentioned by everyone')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to toggle mentionable status for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('toggle')
                .setDescription('Enable or disable mentionable')
                .setRequired(true)
                .addChoices(
                    { name: 'On', value: 'on' },
                    { name: 'Off', value: 'off' }
                )),

    async execute(interaction) {
        try {
            const role = interaction.options.getRole('role');
            const toggle = interaction.options.getString('toggle');

            if (role.id === interaction.guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot modify the @everyone role.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.managed) {
                const container = buildErrorResponse('Managed Role', `**${role.name}** is managed by a bot/integration and cannot be modified.`);
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                const container = buildRoleHierarchyError('modify this role');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const mentionable = toggle === 'on';
            await role.setMentionable(mentionable, `Changed by ${interaction.user.username}`);

            const container = buildSuccessResponse(
                'Role Mentionable Updated',
                `${role} is now **${mentionable ? 'mentionable' : 'not mentionable'}**.`,
                { 'Role': role.name, 'Mentionable': mentionable ? 'Yes' : 'No', 'Moderator': interaction.user.username },
                true
            );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleMentionable] Slash Error:', error);
            const container = buildErrorResponse('Failed to Update Role', 'An error occurred while updating the role.', `Error: ${error.message}`);
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
            const role = message.mentions.roles.first();
            if (!role) {
                const container = buildInvalidUsage('role-mentionable', '-role-mentionable @role <on/off>', ['-role-mentionable @Members on', '-role-mentionable @VIP off']);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.id === message.guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot modify the @everyone role.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.managed) {
                const container = buildErrorResponse('Managed Role', `**${role.name}** is managed by a bot/integration and cannot be modified.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.position >= message.guild.members.me.roles.highest.position) {
                const container = buildRoleHierarchyError('modify this role');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (!args[1]) {
                const container = buildInvalidUsage('role-mentionable', '-role-mentionable @role <on/off>', ['-role-mentionable @Members on']);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const toggle = args[1].toLowerCase();
            if (toggle !== 'on' && toggle !== 'off') {
                const container = buildErrorResponse('Invalid Option', 'Please specify `on` or `off`.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const mentionable = toggle === 'on';
            await role.setMentionable(mentionable, `Changed by ${message.author.username}`);

            const container = buildSuccessResponse(
                'Role Mentionable Updated',
                `${role} is now **${mentionable ? 'mentionable' : 'not mentionable'}**.`,
                { 'Role': role.name, 'Mentionable': mentionable ? 'Yes' : 'No', 'Moderator': message.author.username },
                true
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleMentionable] Error:', error);
            const container = buildErrorResponse('Failed to Update Role', 'An error occurred while updating the role.', `Error: ${error.message}`);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
