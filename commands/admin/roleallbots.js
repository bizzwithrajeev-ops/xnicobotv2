const { PermissionFlagsBits, SlashCommandBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, buildRoleHierarchyError, buildInvalidUsage, COLORS, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    description: 'Roleallbots',
    usage: 'roleallbots',
    category: 'admin',
    data: new SlashCommandBuilder()
        .setName('roleallbots')
        .setDescription('Add a role to all bot members in the server')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to give to all bots')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        try {
            const role = interaction.options.getRole('role');
            const guild = interaction.guild;

            if (role.id === guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot assign the @everyone role.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.position >= guild.members.me.roles.highest.position) {
                const container = buildRoleHierarchyError('assign this role');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.position >= interaction.member.roles.highest.position) {
                const container = buildErrorResponse('Insufficient Permissions', 'You cannot assign a role that is higher than or equal to your highest role.');
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            if (role.managed) {
                const container = buildErrorResponse('Managed Role', `**${role.name}** is managed by a bot/integration and cannot be assigned.`);
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const processingContainer = new ContainerBuilder()
                .setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <a:Load:1479681956273852607> Adding Role to Bots\n\n> **Role:** ${role}\n> Processing bot members...\n\n-# This may take a moment`)
                );

            await interaction.reply({ components: [processingContainer], flags: MessageFlags.IsComponentsV2 });

            const members = await guild.members.fetch();
            const bots = members.filter(m => m.user.bot);
            let added = 0;
            let skipped = 0;
            let failed = 0;

            for (const member of bots.values()) {
                if (member.roles.cache.has(role.id)) {
                    skipped++;
                    continue;
                }
                try {
                    await member.roles.add(role, `Role all bots by ${interaction.user.username}`);
                    added++;
                } catch (err) {
                    failed++;
                }
            }
            
            const resultContainer = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Role Added to All Bots\n\n> **Role:** ${role}\n> **Total Bots:** ${bots.size}\n\n### <:Bookopen:1473038576391557130> Results\n> **Added:** ${added} bots\n> **Already Had:** ${skipped} bots\n${failed > 0 ? `> **Failed:** ${failed} bots\n` : ''}\n**Moderator:** ${interaction.user.username}`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await interaction.editReply({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleAllBots] Slash Error:', error);
            const container = buildErrorResponse('Role All Bots Failed', 'An error occurred while adding the role.', `Error: ${error.message}`);
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

        try {
            const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
            if (!role) {
                const container = buildInvalidUsage('roleallbots', '-roleallbots @role', ['-roleallbots @BotRole']);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.id === message.guild.id) {
                const container = buildErrorResponse('Invalid Role', 'You cannot assign the @everyone role.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.position >= message.guild.members.me.roles.highest.position) {
                const container = buildRoleHierarchyError('assign this role');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.position >= message.member.roles.highest.position) {
                const container = buildErrorResponse('Insufficient Permissions', 'You cannot assign a role that is higher than or equal to your highest role.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            if (role.managed) {
                const container = buildErrorResponse('Managed Role', `**${role.name}** is managed by a bot/integration and cannot be assigned.`);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            const processingContainer = new ContainerBuilder()
                .setAccentColor(COLORS.WARNING)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <a:Load:1479681956273852607> Adding Role to Bots\n\n> **Role:** ${role}\n> Processing bot members...\n\n-# This may take a moment`)
                );

            const msg = await message.reply({ components: [processingContainer], flags: MessageFlags.IsComponentsV2 });

            const members = await message.guild.members.fetch();
            const bots = members.filter(m => m.user.bot);
            let added = 0;
            let skipped = 0;
            let failed = 0;

            for (const member of bots.values()) {
                if (member.roles.cache.has(role.id)) {
                    skipped++;
                    continue;
                }
                try {
                    await member.roles.add(role, `Role all bots by ${message.author.username}`);
                    added++;
                } catch (err) {
                    failed++;
                }
            }

            const resultContainer = new ContainerBuilder()
                .setAccentColor(COLORS.SUCCESS)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Checkedbox:1473038547165384804> Role Added to All Bots\n\n> **Role:** ${role}\n> **Total Bots:** ${bots.size}\n\n### <:Bookopen:1473038576391557130> Results\n> **Added:** ${added} bots\n> **Already Had:** ${skipped} bots\n${failed > 0 ? `> **Failed:** ${failed} bots\n` : ''}\n**Moderator:** ${message.author.username}`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await msg.edit({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[RoleAllBots] Error:', error);
            const container = buildErrorResponse('Role All Bots Failed', 'An error occurred while adding the role.', `Error: ${error.message}`);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
    }
};
