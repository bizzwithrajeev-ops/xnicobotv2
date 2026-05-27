'use strict';

const { MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcdisconnectall',
    prefix: 'vcdisconnectall',
    description: 'Disconnect every member from every voice channel in the server',
    usage: 'vcdisconnectall',
    category: 'voice',
    aliases: ['vcdcall', 'disconnectallvc'],
    permissions: ['MoveMembers'],

    async executePrefix(message) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const voiceChannels = message.guild.channels.cache
            .filter(ch => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice);

        const occupiedChannels = voiceChannels.filter(ch => ch.members.size > 0);
        const allMembers = [];
        occupiedChannels.forEach(ch => ch.members.forEach(m => allMembers.push(m)));

        if (allMembers.length === 0) {
            const container = buildErrorResponse('No Members', 'No members are connected to any voice channels.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let disconnected = 0, failed = 0;
        for (const member of allMembers) {
            try {
                await member.voice.disconnect('vcdisconnectall by moderator');
                disconnected++;
            } catch {
                failed++;
            }
        }

        const container = buildSuccessResponse(
            'All Voice Disconnected',
            `Disconnected every member from voice across the server.`,
            {
                'Disconnected':      `${disconnected}/${allMembers.length}`,
                'Channels Cleared':  `${occupiedChannels.size}/${voiceChannels.size}`,
                ...(failed ? { 'Failed': `${failed}` } : {}),
                'Moderator':         message.author.username
            }
        );
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
