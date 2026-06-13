const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, buildInvalidUsage } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcrename',
    prefix: 'vcrename',
    description: 'Rename a voice channel',
    usage: 'vcrename [#channel] <new name>',
    category: 'voice',
    aliases: ['voicerename', 'renamevc'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            const container = buildInvalidUsage('vcrename', 'vcrename [#channel] <new name>', [
                'vcrename Gaming Lounge — Renames your current VC',
                'vcrename #General New Name — Renames a specific VC'
            ]);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let channel;
        let newName;

        // Check if first arg is a channel mention
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && (mentionedChannel.type === ChannelType.GuildVoice || mentionedChannel.type === ChannelType.GuildStageVoice)) {
            channel = mentionedChannel;
            newName = args.slice(1).join(' ');
        } else {
            // Use the user's current voice channel
            channel = message.member.voice?.channel;
            newName = args.join(' ');
        }

        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            const container = buildErrorResponse('No Voice Channel', 'Mention a voice channel or join one to rename it.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!newName || newName.length === 0) {
            const container = buildErrorResponse('No Name', 'Please provide a new name for the voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (newName.length > 100) {
            const container = buildErrorResponse('Name Too Long', 'Channel names must be **100 characters** or less.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const oldName = channel.name;

        try {
            await channel.setName(newName);

            const container = buildSuccessResponse(
                'Voice Channel Renamed',
                `Successfully renamed the voice channel.`,
                {
                    'Old Name': oldName,
                    'New Name': newName,
                    'Moderator': message.author.username
                }
            );
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            const container = buildErrorResponse('Failed', `Could not rename the channel: ${err.message}`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
