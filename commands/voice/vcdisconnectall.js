const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, buildInvalidUsage } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcdisconnectall',
    prefix: 'vcdisconnectall',
    description: 'Disconnect all members from all voice channels',
    usage: 'vcdisconnectall',
    category: 'voice',
    aliases: ['vcdcall', 'disconnectallvc'],
    permissions: ['MoveMembers'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const voiceChannels = message.guild.channels.cache
            .filter(ch => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice);

        const allMembers = [];
        voiceChannels.forEach(ch => ch.members.forEach(m => allMembers.push(m)));

        if (allMembers.length === 0) {
            const container = buildErrorResponse('No Members', 'No members are connected to any voice channels.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let disconnected = 0, failed = 0;
        for (const member of allMembers) {
            try {
                await member.voice.disconnect();
                disconnected++;
            } catch {
                failed++;
            }
        }

        const container = buildSuccessResponse(
            'All Voice Disconnected',
            `Disconnected all members from every voice channel.`,
            {
                'Disconnected': `${disconnected}/${allMembers.length}`,
                'Channels Affected': `${voiceChannels.filter(ch => ch.members.size > 0 || disconnected > 0).size}`,
                'Failed': `${failed}`,
                'Moderator': message.author.username
            }
        );
        container.setAccentColor(0x57F287);

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
