const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');
const { resolveUser } = require('../../utils/resolveUser');

module.exports = {
    name: 'vcundeafen',
    prefix: 'vcundeafen',
    description: 'Remove server deafen from a user in voice',
    usage: 'vcundeafen <@user>',
    category: 'voice',
    aliases: ['voiceundeafen', 'serverundeafen'],
    permissions: ['DeafenMembers'],
    
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Deafen Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const resolvedUser = await resolveUser(message, args);
        const member = resolvedUser ? await message.guild.members.fetch(resolvedUser.id).catch(() => null) : null;
        if (!member) {
            const container = buildErrorResponse(
                'No User Mentioned',
                'Please mention a user to undeafen.',
                '**Example:** `vcundeafen @User`'
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!member.voice.channel) {
            const container = buildErrorResponse('Not in Voice', 'That user is not in a voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await member.voice.setDeaf(false);
            
            const container = buildSuccessResponse(
                'Voice Undeafened',
                `Successfully undeafened **${member.user.username}**.`,
                { 'User': `${member}`, 'Channel': member.voice.channel.name, 'Moderator': message.author.username }
            );
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            const container = buildErrorResponse('Failed', 'Could not undeafen the user.', error.message);
            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
