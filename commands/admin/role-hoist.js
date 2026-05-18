const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, buildRoleHierarchyError, buildRoleNotFound, buildInvalidUsage, buildSuccessResponse, COLORS, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'role-hoist',
    prefix: 'role-hoist',
    description: 'Toggle role hoist (display separately)',
    category: 'admin',
    usage: 'role-hoist <@role> <on/off>',
    permissions: ['ManageRoles'],
    data: new SlashCommandBuilder()
        .setName('role-hoist')
        .setDescription('Toggle whether a role displays separately in the member list')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to toggle hoist for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('toggle')
                .setDescription('Enable or disable hoist')
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

            const hoist = toggle === 'on';
            await role.setHoist(hoist, `Changed by ${interaction.user.username}`);

            const container = buildSuccessResponse(
                'Role Hoist Updated',
                `${role} hoist is now **${hoist ? 'enabled' : 'disabled'}**.`,
                { 'Role': role.name, 'Hoist': hoist ? 'Enabled' : 'Disabled', 'Moderator': interaction.user.username },
                true
            );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleHoist] Slash Error:', error);
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
                const container = buildInvalidUsage('role-hoist', '-role-hoist @role <on/off>', ['-role-hoist @Members on', '-role-hoist @VIP off']);
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
                const container = buildInvalidUsage('role-hoist', '-role-hoist @role <on/off>', ['-role-hoist @Members on']);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const toggle = args[1].toLowerCase();
            if (toggle !== 'on' && toggle !== 'off') {
                const container = buildErrorResponse('Invalid Option', 'Please specify `on` or `off`.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const hoist = toggle === 'on';
            await role.setHoist(hoist, `Changed by ${message.author.username}`);

            const container = buildSuccessResponse(
                'Role Hoist Updated',
                `${role} hoist is now **${hoist ? 'enabled' : 'disabled'}**.`,
                { 'Role': role.name, 'Hoist': hoist ? 'Enabled' : 'Disabled', 'Moderator': message.author.username },
                true
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleHoist] Error:', error);
            const container = buildErrorResponse('Failed to Update Role', 'An error occurred while updating the role.', `Error: ${error.message}`);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
