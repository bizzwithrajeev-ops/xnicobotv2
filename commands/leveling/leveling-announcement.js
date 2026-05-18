const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../../utils/database');
const { buildPermissionDenied } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leveling-announcement')
        .setDescription('Configure level-up announcements')
        .addSubcommand(sub => sub.setName('toggle').setDescription('Enable or disable level-up announcements')
            .addStringOption(o => o.setName('status').setDescription('Enable or disable').setRequired(true).addChoices({ name: 'Enable', value: 'enable' }, { name: 'Disable', value: 'disable' })))
        .addSubcommand(sub => sub.setName('channel').setDescription('Set announcement channel')
            .addStringOption(o => o.setName('type').setDescription('Channel type').setRequired(true).addChoices({ name: 'Same Channel', value: 'same' }, { name: 'DM', value: 'dm' }, { name: 'Custom Channel', value: 'custom' }))
            .addChannelOption(o => o.setName('custom-channel').setDescription('Channel for custom type')))
        .addSubcommand(sub => sub.setName('message').setDescription('Set level-up message')
            .addStringOption(o => o.setName('text').setDescription('Custom message ({user}, {level}, {xp})').setRequired(true)))
        .addSubcommand(sub => sub.setName('view').setDescription('View current announcement settings')),
    name: 'leveling-announcement',
    prefix: 'leveling-announcement',
    description: 'Configure level-up announcements (prefix-only)',
    usage: 'leveling-announcement <toggle|channel|message> [options]',
    category: 'leveling',
    aliases: ['lvlannounce', 'levelannounce'],

    async execute(interaction) {
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '<:Cancel:1473037949187657818> You need **Administrator** permission!', flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildConfig = await getGuildConfig(interaction.guild.id);

        if (subcommand === 'toggle') {
            const status = interaction.options.getString('status');
            const enabled = status === 'enable';

            await updateGuildConfig(interaction.guild.id, {
                'leveling.announcements.enabled': enabled
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# ${enabled ? '<:Bullhorn:1473038903157199093>' : '<:Volumeoff:1473039301414621427>'} Level-Up Announcements ${enabled ? 'Enabled' : 'Disabled'}\n\n**Status:** ${enabled ? 'Users will be notified when they level up!' : 'Level-up announcements have been disabled.'}`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'channel') {
            const type = interaction.options.getString('type');
            const customChannel = interaction.options.getChannel('custom-channel');

            if (type === 'custom' && !customChannel) {
                return interaction.reply({
                    content: `<:Cancel:1473037949187657818> You must provide a custom channel when using custom type!`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const updates = {
                'leveling.announcements.channel': type
            };

            if (type === 'custom' && customChannel) {
                updates['leveling.announcements.customChannelId'] = customChannel.id;
                updates['leveling.announcementChannel'] = customChannel.id;
            } else {
                updates['leveling.announcementChannel'] = null;
            }

            await updateGuildConfig(interaction.guild.id, updates);

            const locationText = type === 'same' ? 'Same channel where user leveled up' :
                                 type === 'dm' ? 'Direct Messages' :
                                 `<#${customChannel.id}>`;

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Pin:1473038806612447500> Announcement Location Updated\n\n**Location:** ${locationText}\n\nLevel-up messages will be sent here.`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'message') {
            const text = interaction.options.getString('text');

            await updateGuildConfig(interaction.guild.id, {
                'leveling.announcements.message': text
            });

            const preview = text
                .replace('{user}', `<@${interaction.user.id}>`)
                .replace('{level}', '5')
                .replace('{xp}', '1000');

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Editalt:1473038138577256670> Announcement Message Updated\n\n**Preview:**\n${preview}\n\n**Available Placeholders:**\n• {user} - User mention\n• {level} - New level\n• {xp} - Total XP`)
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (subcommand === 'view') {
            const config = guildConfig.leveling?.announcements || {};
            const locationText = config.channel === 'same' ? 'Same Channel' :
                                 config.channel === 'dm' ? 'Direct Messages' :
                                 config.customChannelId ? `<#${config.customChannelId}>` : 'Not Set';

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `# <:Bullhorn:1473038903157199093> Announcement Configuration\n\n` +
                            `**Status:** ${config.enabled !== false ? '<:Checkedbox:1473038547165384804> Enabled' : '<:Cancel:1473037949187657818> Disabled'}\n` +
                            `**Location:** ${locationText}\n` +
                            `**Message:** ${config.message || 'GG {user}, you just advanced to **Level {level}**!'}`
                        )
                );

            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            const container = buildPermissionDenied('Administrator');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const guildConfig = await getGuildConfig(message.guild.id);
        const config = guildConfig.leveling?.announcements || {};
        const locationText = config.channel === 'same' ? 'Same Channel' :
                             config.channel === 'dm' ? 'Direct Messages' :
                             config.customChannelId ? `<#${config.customChannelId}>` : 'Not Set';

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder()
                    .setContent(
                        `# <:Bullhorn:1473038903157199093> Announcement Configuration\n\n` +
                        `**Status:** ${config.enabled !== false ? '<:Checkedbox:1473038547165384804> Enabled' : '<:Cancel:1473037949187657818> Disabled'}\n` +
                        `**Location:** ${locationText}\n` +
                        `**Message:** ${config.message || 'GG {user}, you just advanced to **Level {level}**!'}\n\n` +
                        `Use \`/leveling-announcement\` for configuration options.`
                    )
            );

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
