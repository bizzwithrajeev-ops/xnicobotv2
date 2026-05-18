const { SlashCommandBuilder, PermissionFlagsBits, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ChannelType, MessageFlags } = require('discord.js');
const { buildPermissionDenied, buildErrorResponse, buildLoadingResponse } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('channelclone')
        .setDescription('Clone a channel with all its settings')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to clone (defaults to current channel)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Name for the cloned channel (optional)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    prefix: 'channelclone',
    description: 'Clone a channel with all its settings',
    usage: 'channelclone [#channel] [name]',
    category: 'admin',

    async execute(interaction) {
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
        const customName = interaction.options.getString('name');

        const loadingContainer = buildLoadingResponse('Cloning Channel', 'Please wait...');
        await interaction.reply({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        try {
            const clonedChannel = await targetChannel.clone({
                name: customName || `${targetChannel.name}-clone`,
                reason: `Cloned by ${interaction.user.username}`
            });

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Channel Cloned`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**<:Folderopen:1473039552783323348> Original:** ${targetChannel}\n` +
                        `**<:Document:1473039496995143731> Clone:** ${clonedChannel}\n` +
                        `**<:User:1473038971398520977> Cloned By:** ${interaction.user.username}`
                    )
                );

            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Channel clone error:', error);
            const container = buildErrorResponse('Clone Failed', 'Failed to clone the channel.', `Error: ${error.message}`);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        if (!message.guild) return message.reply('<:Cancel:1473037949187657818> This command can only be used in a server.').catch(() => {});
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildPermissionDenied('Manage Channels');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const targetChannel = message.mentions.channels.first() || message.channel;
        const customName = args.filter(a => !a.startsWith('<#')).join(' ');

        const loadingContainer = buildLoadingResponse('<:Folderopen:1473039552783323348> Cloning Channel', 'Please wait...');
        const loadingMsg = await message.reply({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 });

        try {
            const clonedChannel = await targetChannel.clone({
                name: customName || `${targetChannel.name}-clone`,
                reason: `Cloned by ${message.author.username}`
            });

            const container = new ContainerBuilder()
                .setAccentColor(0xCAD7E6)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# <:Checkedbox:1473038547165384804> Channel Cloned`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**<:Folderopen:1473039552783323348> Original:** ${targetChannel}\n` +
                        `**<:Document:1473039496995143731> Clone:** ${clonedChannel}\n` +
                        `**<:User:1473038971398520977> Cloned By:** ${message.author.username}`
                    )
                );

            await loadingMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Channel clone error:', error);
            const container = buildErrorResponse('Clone Failed', 'Failed to clone the channel.', `Error: ${error.message}`);
            await loadingMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
