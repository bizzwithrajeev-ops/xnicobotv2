const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcstatus',
    prefix: 'vcstatus',
    description: 'Set or clear the status of a voice channel',
    usage: 'vcstatus <status text|clear> [#channel]',
    category: 'voice',
    aliases: ['voicestatus', 'setstatus'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            const container = buildInvalidUsage('vcstatus', 'vcstatus <status text|clear> [#channel]', [
                'vcstatus Playing Games',
                'vcstatus 🎵 Music Session',
                'vcstatus clear — Removes the status'
            ]);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Check if last arg is a channel mention
        const mentionedChannel = message.mentions.channels.first();
        let channel, statusText;

        if (mentionedChannel && (mentionedChannel.type === ChannelType.GuildVoice || mentionedChannel.type === ChannelType.GuildStageVoice)) {
            channel = mentionedChannel;
            // Remove the channel mention from args
            statusText = args.filter(a => !a.match(/<#\d+>/)).join(' ');
        } else {
            channel = message.member.voice?.channel;
            statusText = args.join(' ');
        }

        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            const container = buildErrorResponse('No Voice Channel', 'Mention a voice channel or join one to set the status.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const clearing = statusText.toLowerCase() === 'clear';

        try {
            // Voice channel status is set via the channel's status property
            if (typeof channel.setStatus === 'function') {
                await channel.setStatus(clearing ? '' : statusText);
            } else {
                // Fallback: edit topic for stage channels
                await channel.edit({ topic: clearing ? '' : statusText });
            }

            const container = buildSuccessResponse(
                clearing ? 'Status Cleared' : 'Status Updated',
                clearing
                    ? `Cleared the status of **${channel.name}**.`
                    : `Updated the status of **${channel.name}**.`,
                {
                    'Channel': `#${channel.name}`,
                    'Status': clearing ? 'None' : statusText,
                    'Moderator': message.author.username
                }
            );
            container.setAccentColor(0x57F287);

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            const container = buildErrorResponse('Failed', `Could not update voice status: ${err.message}`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
