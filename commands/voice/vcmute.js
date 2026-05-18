const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcmute',
    prefix: 'vcmute',
    description: 'Server mute a user in voice',
    usage: 'vcmute <@user>',
    category: 'voice',
    aliases: ['voicemute', 'servermute'],
    permissions: ['MuteMembers'],
    
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Mute Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const member = message.mentions.members.first();
        if (!member) {
            const container = buildErrorResponse(
                'No User Mentioned',
                'Please mention a user to mute.',
                '**Example:** `vcmute @User`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!member.voice.channel) {
            const container = buildErrorResponse('Not in Voice', 'That user is not in a voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await member.voice.setMute(true);
            
            const container = buildSuccessResponse(
                'Voice Muted',
                `Successfully server muted **${member.user.username}**.`,
                { 'User': `${member}`, 'Channel': member.voice.channel.name, 'Moderator': message.author.username }
            );
            container.setAccentColor(0x57F287);
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Failed', 'Could not mute the user.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
