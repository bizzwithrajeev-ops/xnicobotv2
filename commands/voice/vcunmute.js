const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
    name: 'vcunmute',
    prefix: 'vcunmute',
    description: 'Remove server mute from a user in voice',
    usage: 'vcunmute <@user>',
    category: 'voice',
    aliases: ['voiceunmute', 'serverunmute'],
    permissions: ['MuteMembers'],
    
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MuteMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Mute Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const resolvedUser = await resolveUser(message, args);
        const member = resolvedUser ? await message.guild.members.fetch(resolvedUser.id).catch(() => null) : null;
        if (!member) {
            const container = buildErrorResponse(
                'No User Mentioned',
                'Please mention a user to unmute.',
                '**Example:** `vcunmute @User`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!member.voice.channel) {
            const container = buildErrorResponse('Not in Voice', 'That user is not in a voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await member.voice.setMute(false);
            
            const container = buildSuccessResponse(
                'Voice Unmuted',
                `Successfully unmuted **${member.user.username}**.`,
                { 'User': `${member}`, 'Channel': member.voice.channel.name, 'Moderator': message.author.username }
            );
            container.setAccentColor(0x57F287);
            
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Failed', 'Could not unmute the user.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
