const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcundeafenall',
    prefix: 'vcundeafenall',
    description: 'Server undeafen all members in your voice channel',
    usage: 'vcundeafenall',
    category: 'voice',
    aliases: ['undeafenallvc'],
    permissions: ['DeafenMembers'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.DeafenMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Deafen Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!message.member.voice.channel) {
            const container = buildErrorResponse('Not in Voice', 'You must be in a voice channel to use this command.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const voiceChannel = message.member.voice.channel;
        const members = voiceChannel.members.filter(m => !m.user.bot && m.voice.serverDeaf);

        if (members.size === 0) {
            const container = buildErrorResponse('No Members', 'No deafened members found in your voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let undeafened = 0;
        for (const [, member] of members) {
            try {
                await member.voice.setDeaf(false);
                undeafened++;
            } catch (error) {
                // Skip members we can't undeafen
            }
        }

        const container = buildSuccessResponse(
            'Voice Undeafen All Complete',
            `Successfully undeafened **${undeafened}/${members.size}** members.`,
            { 'Channel': voiceChannel.name, 'Undeafened': `${undeafened}/${members.size}`, 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
