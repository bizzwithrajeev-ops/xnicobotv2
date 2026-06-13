const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse } = require('../../utils/responseBuilder');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
    name: 'vckick',
    prefix: 'vckick',
    description: 'Kick a user from their voice channel',
    usage: 'vckick <@user>',
    category: 'voice',
    aliases: ['voicekick', 'disconnectvc'],
    permissions: ['MoveMembers'],
    
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const resolvedUser = await resolveUser(message, args);
        const member = resolvedUser ? await message.guild.members.fetch(resolvedUser.id).catch(() => null) : null;
        if (!member) {
            const container = buildErrorResponse(
                'No User Mentioned',
                'Please mention a user to kick from voice.',
                '**Example:** `vckick @User`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!member.voice.channel) {
            const container = buildErrorResponse('Not in Voice', 'That user is not in a voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channelName = member.voice.channel.name;

        try {
            await member.voice.disconnect();
            
            const container = buildSuccessResponse(
                'Voice Kicked',
                `Successfully kicked **${member.user.username}** from voice.`,
                { 'User': `${member}`, 'Channel': channelName, 'Moderator': message.author.username }
            );
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Failed', 'Could not kick the user from voice.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
