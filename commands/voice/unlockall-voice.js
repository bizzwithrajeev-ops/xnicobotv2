const { ContainerBuilder, TextDisplayBuilder, MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'unlockall-voice',
    prefix: 'unlockall-voice',
    description: 'Unlock all voice channels in the server',
    usage: 'unlockall-voice',
    category: 'voice',
    aliases: ['unlockvc', 'unlockallvc'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const voiceChannels = message.guild.channels.cache.filter(c =>
            c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
        );

        if (voiceChannels.size === 0) {
            const container = buildErrorResponse('No Channels', 'No voice channels found in this server.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let unlocked = 0;
        for (const [, channel] of voiceChannels) {
            try {
                await channel.permissionOverwrites.edit(message.guild.id, { Connect: null });
                unlocked++;
            } catch (error) {
                // Skip channels we can't unlock
            }
        }

        const container = buildSuccessResponse(
            'Voice Channels Unlocked',
            `Successfully unlocked **${unlocked}/${voiceChannels.size}** voice channels.`,
            { 'Unlocked': `${unlocked}/${voiceChannels.size}`, 'Effect': 'Members can now connect again', 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
