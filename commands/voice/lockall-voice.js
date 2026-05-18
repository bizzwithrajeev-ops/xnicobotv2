const { ContainerBuilder, TextDisplayBuilder, MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'lockall-voice',
    prefix: 'lockall-voice',
    description: 'Lock all voice channels in the server',
    usage: 'lockall-voice',
    category: 'voice',
    aliases: ['lockvc', 'lockallvc'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const voiceChannels = message.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice);

        if (voiceChannels.size === 0) {
            const container = buildErrorResponse('No Channels', 'No voice channels found in this server.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let locked = 0;
        for (const [, channel] of voiceChannels) {
            try {
                await channel.permissionOverwrites.edit(message.guild.id, { Connect: false });
                locked++;
            } catch (error) {
                // Skip channels we can't lock
            }
        }

        const container = buildSuccessResponse(
            'Voice Channels Locked',
            `Successfully locked **${locked}/${voiceChannels.size}** voice channels.`,
            { 'Locked': `${locked}/${voiceChannels.size}`, 'Effect': 'Members can no longer connect', 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
