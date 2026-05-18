const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildPermissionDenied, buildLoadingResponse, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Clone and delete a channel (nuclear option)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to nuke')
                .addChannelTypes(ChannelType.GuildText)),
    
    prefix: 'nuke',
    description: 'Clone and delete a channel (nuclear option)',
    usage: 'nuke [#channel]',
    category: 'admin',
    
    async execute(interaction) {
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Bot Permission', 'I need the **Manage Channels** permission to nuke channels.');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const channel = interaction.options.getChannel('channel') || interaction.channel;

        if (channel.type !== ChannelType.GuildText) {
            const container = buildErrorResponse('Invalid Channel Type', 'You can only nuke text channels!');
            return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
        }

        const loadingContainer = buildLoadingResponse('Nuking Channel', 'Please wait while the channel is being nuked...');
        await interaction.reply({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

        try {
            const position = channel.position;
            const newChannel = await channel.clone();
            await newChannel.setPosition(position);
            await channel.delete();

            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Channel Nuked`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `<:Fire:1473038604812161218> **This channel has been completely reset!**\n\n` +
                            `### <:Document:1473039496995143731> Details\n` +
                            `> <:User:1473038971398520977> **Moderator:** ${interaction.user.username}\n` +
                            `> <:Alarm:1473039068546732214> **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`
                        )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            
            await newChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Nuke Error:', error);
            const container = buildErrorResponse('Nuke Failed', 'Failed to nuke the channel.', `Error: ${error.message}`);
            await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    },

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildPermissionDenied('Manage Channels');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Bot Permission', 'I need the **Manage Channels** permission to nuke channels.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channel = message.mentions.channels.first() || message.channel;

        if (channel.type !== ChannelType.GuildText) {
            const container = buildErrorResponse('Invalid Channel Type', 'You can only nuke text channels!');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const loadingContainer = buildLoadingResponse('Nuking Channel', 'Please wait while the channel is being nuked...');
        const loadingMsg = await message.reply({ components: [loadingContainer], flags: MessageFlags.IsComponentsV2 });

        try {
            const position = channel.position;
            const newChannel = await channel.clone();
            await newChannel.setPosition(position);
            await channel.delete();

            const container = new ContainerBuilder()
                .setAccentColor(0xED4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(`# <:Trash:1473038090074591293> Channel Nuked`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder()
                        .setContent(
                            `<:Fire:1473038604812161218> **This channel has been completely reset!**\n\n` +
                            `### <:Document:1473039496995143731> Details\n` +
                            `> <:User:1473038971398520977> **Moderator:** ${message.author.username}\n` +
                            `> <:Alarm:1473039068546732214> **Time:** <t:${Math.floor(Date.now() / 1000)}:R>`
                        )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));
            
            await newChannel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('Nuke Error:', error);
            const container = buildErrorResponse('Nuke Failed', 'Failed to nuke the channel.', `Error: ${error.message}`);
            try {
                await loadingMsg.edit({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch {
                // Channel was already deleted, can't edit the loading message
            }
        }
    }
};
