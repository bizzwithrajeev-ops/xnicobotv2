const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcmuteall',
    prefix: 'vcmuteall',
    description: 'Server mute all members in your voice channel',
    usage: 'vcmuteall',
    category: 'voice',
    aliases: ['muteallvc', 'servermuteall'],
    permissions: ['MuteMembers'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Mute Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!message.member.voice.channel) {
            const container = buildErrorResponse('Not in Voice', 'You must be in a voice channel to use this command.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const voiceChannel = message.member.voice.channel;
        const members = voiceChannel.members.filter(m => !m.user.bot && !m.voice.serverMute);

        if (members.size === 0) {
            const container = buildErrorResponse('No Members', 'No unmuted members found in your voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let muted = 0;
        for (const [, member] of members) {
            try {
                await member.voice.setMute(true);
                muted++;
            } catch (error) {
                // Skip members we can't mute
            }
        }

        const container = buildSuccessResponse(
            'Voice Mute All Complete',
            `Successfully muted **${muted}/${members.size}** members.`,
            { 'Channel': voiceChannel.name, 'Muted': `${muted}/${members.size}`, 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
