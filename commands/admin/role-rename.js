const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, buildRoleHierarchyError, buildRoleNotFound, buildInvalidUsage, buildSuccessResponse, COLORS, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'role-rename',
    prefix: 'role-rename',
    description: 'Rename a role',
    category: 'admin',
    usage: 'role-rename <@role> <new_name>',
    permissions: ['ManageRoles'],
    data: new SlashCommandBuilder()
        .setName('role-rename')
        .setDescription('Rename a role')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to rename')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('The new name for the role')
                .setRequired(true)),

    async execute(interaction) {
        try {
            const role = interaction.options.getRole('role');
            const newName = interaction.options.getString('name');

            if (role.id === interaction.guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot rename the @everyone role.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.managed) {
                const container = buildErrorResponse('Managed Role', `**${role.name}** is managed by a bot/integration and cannot be renamed.`);
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.position >= interaction.guild.members.me.roles.highest.position) {
                const container = buildRoleHierarchyError('rename this role');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const oldName = role.name;
            await role.setName(newName, `Renamed by ${interaction.user.username}`);

            const container = buildSuccessResponse(
                'Role Renamed',
                'Successfully renamed the role.',
                { 'Old Name': oldName, 'New Name': newName, 'Moderator': interaction.user.username },
                true
            );
            await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleRename] Slash Error:', error);
            const container = buildErrorResponse('Failed to Rename Role', 'An error occurred while renaming the role.', `Error: ${error.message}`);
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
                const container = buildInvalidUsage('role-rename', '-role-rename @role <new name>', ['-role-rename @Members Active Members']);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.id === message.guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot rename the @everyone role.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.managed) {
                const container = buildErrorResponse('Managed Role', `**${role.name}** is managed by a bot/integration and cannot be renamed.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.position >= message.guild.members.me.roles.highest.position) {
                const container = buildRoleHierarchyError('rename this role');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const newName = args.slice(1).join(' ');
            if (!newName) {
                const container = buildErrorResponse('Missing Name', 'Please provide a new name for the role.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const oldName = role.name;
            await role.setName(newName, `Renamed by ${message.author.username}`);

            const container = buildSuccessResponse(
                'Role Renamed',
                `Successfully renamed the role.`,
                { 'Old Name': oldName, 'New Name': newName, 'Moderator': message.author.username },
                true
            );
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleRename] Error:', error);
            const container = buildErrorResponse('Failed to Rename Role', 'An error occurred while renaming the role.', `Error: ${error.message}`);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
