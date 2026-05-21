const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('massnick')
        .setDescription('Set or reset nicknames for all members or a specific role')
        .addStringOption(opt =>
            opt.setName('nickname')
                .setDescription('New nickname (use "reset" to clear nicknames)')
                .setRequired(true))
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('Only change nicknames for members with this role')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    prefix: 'massnick',
    description: 'Set or reset nicknames for all members or a specific role',
    usage: 'massnick <nickname/reset> [@role]',
    category: 'admin',

    async execute(interaction) {
        try {
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xED4245)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `# <:Cancel:1473037949187657818> Bot Missing Permissions\n\nI need the **Manage Nicknames** permission.`
                    ));
                return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
            }

            const nicknameInput = interaction.options.getString('nickname');
            const role = interaction.options.getRole('role');
            const nickname = nicknameInput.toLowerCase() === 'reset' ? null : nicknameInput;

            await interaction.deferReply();

            const members = role ? role.members : await interaction.guild.members.fetch();
            let changed = 0;
            let failed = 0;

            for (const [id, member] of members) {
                if (member.manageable) {
                    try {
                        await member.setNickname(nickname);
                        changed++;
                    } catch (err) {
                        failed++;
                    }
                } else {
                    failed++;
                }
            }

            const resultContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `# <:User:1473038971398520977> Mass Nickname Complete\n\n` +
                    `### <:Document:1473039496995143731> Results\n` +
                    `<:Checkedbox:1473038547165384804> **Changed:** ${changed} members\n` +
                    `<:Cancel:1473037949187657818> **Failed:** ${failed} members\n\n` +
                    `${nickname ? `**New Nickname:** ${nickname}` : '**Action:** Reset nicknames'}` +
                    `${role ? `\n**Role:** ${role.name}` : ''}`
                ));
            resultContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await interaction.editReply({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Massnick error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '<:Cancel:1473037949187657818> An error occurred!', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },

    async executePrefix(message, args) {
        try {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
                return message.reply('<:Cancel:1473037949187657818> You need Manage Nicknames permission to use this command!');
            }

            if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageNicknames)) {
                return message.reply('<:Cancel:1473037949187657818> I need Manage Nicknames permission!');
            }

            if (!args.length) {
                const container = new ContainerBuilder()
                    .setAccentColor(0xCAD7E6)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder()
                            .setContent(`# <:User:1473038971398520977> Mass Nickname\n\n### <:Document:1473039496995143731> Usage\n\`massnick <nickname> [@role]\`\n\n### <:Edit:1473037903625191580> Examples\n\`massnick VIP Member @VIP\` - Set nickname for all VIP role members\n\`massnick reset @Members\` - Reset nicknames for role members\n\`massnick [EVENT] @Everyone\` - Add prefix to all members\n\n-# Bot must have higher role than target members`)
                    )
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }

            // Parse nickname: everything except role mentions
            const role = message.mentions.roles.first();
            let nickname;
            if (args[0].toLowerCase() === 'reset') {
                nickname = null;
            } else {
                // Filter out role mention from args to get the nickname
                const nicknameArgs = args.filter(a => !a.match(/^<@&\d+>$/));
                nickname = nicknameArgs.join(' ') || null;
            }
            
            const members = role ? role.members : message.guild.members.cache;
            let changed = 0;
            let failed = 0;

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:User:1473038971398520977> Mass Nickname Processing\n\n<:Lightning:1473038797540298792> Changing nicknames for ${members.size} members...\n\n*This may take a moment*`)
                );

            const processingMsg = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

            for (const [id, member] of members) {
                if (member.manageable) {
                    try {
                        await member.setNickname(nickname);
                        changed++;
                    } catch (err) {
                        failed++;
                    }
                } else {
                    failed++;
                }
            }

            const resultContainer = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:User:1473038971398520977> Mass Nickname Complete\n\n### <:Document:1473039496995143731> Results\n<:Checkedbox:1473038547165384804> **Changed:** ${changed} members\n<:Cancel:1473037949187657818> **Failed:** ${failed} members\n\n${nickname ? `**New Nickname:** ${nickname}` : '**Action:** Reset nicknames'}${role ? `\n**Role:** ${role.name}` : ''}`)
                );
            resultContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            resultContainer.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            await processingMsg.edit({ components: [resultContainer], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Massnick error:', error);
        }
    }
};
