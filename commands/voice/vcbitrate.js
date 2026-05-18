const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, buildInvalidUsage, COLORS } = require('../../utils/responseBuilder');

const VALID_BITRATES = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384];

module.exports = {
    name: 'vcbitrate',
    prefix: 'vcbitrate',
    description: 'Set the audio bitrate of a voice channel',
    usage: 'vcbitrate <kbps> [#channel]',
    category: 'voice',
    aliases: ['voicebitrate', 'setbitrate'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            const container = buildInvalidUsage('vcbitrate', 'vcbitrate <kbps> [#channel]', [
                'vcbitrate 96',
                'vcbitrate 128 #Music',
                'vcbitrate 64 — Sets your current VC'
            ]);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const bitrate = parseInt(args[0]);
        if (isNaN(bitrate) || bitrate < 8 || bitrate > 384) {
            const container = buildErrorResponse('Invalid Bitrate', `Bitrate must be between **8** and **384** kbps.\nCommon values: ${VALID_BITRATES.map(b => `\`${b}\``).join(', ')}`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channel = message.mentions.channels.first() ||
            (args[1] ? message.guild.channels.cache.get(args[1]) : null) ||
            message.member.voice?.channel;

        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            const container = buildErrorResponse('No Voice Channel', 'Mention a voice channel or join one to set the bitrate.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Check server boost-level max bitrate
        const maxBitrate = message.guild.maximumBitrate / 1000;
        if (bitrate > maxBitrate) {
            const container = buildErrorResponse('Bitrate Too High', `This server's maximum bitrate is **${maxBitrate} kbps** (Boost Level ${message.guild.premiumTier}).`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const oldBitrate = channel.bitrate / 1000;
            await channel.setBitrate(bitrate * 1000);

            const container = buildSuccessResponse(
                'Bitrate Updated',
                `Updated audio quality for **${channel.name}**.`,
                {
                    'Channel': `#${channel.name}`,
                    'Old Bitrate': `${oldBitrate} kbps`,
                    'New Bitrate': `${bitrate} kbps`,
                    'Server Max': `${maxBitrate} kbps`,
                    'Moderator': message.author.username
                }
            );
            container.setAccentColor(0x57F287);

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            const container = buildErrorResponse('Failed', `Could not update bitrate: ${err.message}`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
