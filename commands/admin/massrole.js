const { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildPermissionDenied, buildErrorResponse, buildRoleHierarchyError, COLORS, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    prefix: 'massrole',
    description: 'Add or remove a role from multiple members',
    usage: 'massrole <add/remove> @role [@target-role]',
    category: 'admin',
    data: new SlashCommandBuilder()
        .setName('massrole')
        .setDescription('Add or remove a role from multiple members')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Whether to add or remove the role')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' }
                ))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to add or remove')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('target')
                .setDescription('Only affect members with this role (optional)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const action = interaction.options.getString('action');
            const role = interaction.options.getRole('role');
            const targetRole = interaction.options.getRole('target');
            const guild = interaction.guild;

            if (!role.editable) {
                const container = buildRoleHierarchyError('manage this role');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.position >= interaction.member.roles.highest.position) {
                const container = buildErrorResponse('Insufficient Permissions', 'You cannot manage a role that is higher than or equal to your highest role.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            await guild.members.fetch();
            const members = targetRole ? targetRole.members : guild.members.cache;

            const processingContainer = new ContainerBuilder()
                .setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <a:Loading:1485248248720658472> Mass Role Processing\n\n> ${action === 'add' ? 'Adding' : 'Removing'} ${role} for **${members.size}** members...\n\n-# This may take a moment`)
                );

            await interaction.reply({ components: [processingContainer], flags: MessageFlags.IsComponentsV2 });

            let changed = 0;
            let failed = 0;

            for (const [id, member] of members) {
                try {
                    if (action === 'add') {
                        if (!member.roles.cache.has(role.id)) {
                            await member.roles.add(role);
                            changed++;
                        }
                    } else {
                        if (member.roles.cache.has(role.id)) {
                            await member.roles.remove(role);
                            changed++;
                        }
                    }
                } catch (err) {
                    failed++;
                }
            }

            const resultContainer = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Mass Role Complete\n\n### Results\n> **Changed:** ${changed} members\n> **Failed:** ${failed} members\n\n**Action:** ${action === 'add' ? 'Added' : 'Removed'} ${role}\n${targetRole ? `**Target:** ${targetRole.name}` : '**Target:** All server members'}\n**Moderator:** ${interaction.user.username}`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await interaction.editReply({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[MassRole] Slash Error:', error);
            const container = buildErrorResponse('Mass Role Failed', 'An error occurred while processing mass role.', `Error: ${error.message}`);
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } else {
                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            const container = buildPermissionDenied('Manage Roles');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const action = args[0]?.toLowerCase();

        if (!action || !['add', 'remove'].includes(action) || !message.mentions.roles.size) {
            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Userplus:1473038912212435086> Mass Role\n\n### <:Document:1473039496995143731> Usage\n\`massrole <add/remove> @role [target]\`\n\n### <:Edit:1473037903625191580> Examples\n\`massrole add @Members\` - Add role to all server members\n\`massrole remove @Muted @Members\` - Remove role from members with another role\n\`massrole add @VIP @Active\` - Add VIP to all Active members\n\n-# Bot must have higher role than target role`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const role = message.mentions.roles.first();
        const targetRole = message.mentions.roles.size > 1 ? message.mentions.roles.last() : null;
        
        if (!role.editable) {
            const container = buildRoleHierarchyError('manage this role');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (role.position >= message.member.roles.highest.position) {
            const container = buildErrorResponse('Insufficient Permissions', 'You cannot manage a role that is higher than or equal to your highest role.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Fetch all guild members first to ensure we process everyone
        await message.guild.members.fetch();
        const members = targetRole ? targetRole.members : message.guild.members.cache;
        let changed = 0;
        let failed = 0;

        const container = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Userplus:1473038912212435086> Mass Role Processing\n\n<:Lightning:1473038797540298792> ${action === 'add' ? 'Adding' : 'Removing'} role for ${members.size} members...\n\n*This may take a moment*`)
            );

        const processingMsg = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        for (const [id, member] of members) {
            try {
                if (action === 'add') {
                    if (!member.roles.cache.has(role.id)) {
                        await member.roles.add(role);
                        changed++;
                    }
                } else {
                    if (member.roles.cache.has(role.id)) {
                        await member.roles.remove(role);
                        changed++;
                    }
                }
            } catch (err) {
                failed++;
            }
        }

        const resultContainer = new ContainerBuilder()
            .setAccentColor(0xCAD7E6)
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(`# <:Userplus:1473038912212435086> Mass Role Complete\n\n### <:Document:1473039496995143731> Results\n<:Checkedbox:1473038547165384804> **Changed:** ${changed} members\n<:Cancel:1473037949187657818> **Failed:** ${failed} members\n\n**Action:** ${action === 'add' ? 'Added' : 'Removed'} ${role}\n${targetRole ? `**Target:** ${targetRole.name}` : '**Target:** All server members'}`)
            );
        resultContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        await processingMsg.edit({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
    }
};
