const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vcdeafenall',
    prefix: 'vcdeafenall',
    description: 'Server deafen all members in your voice channel',
    usage: 'vcdeafenall',
    category: 'voice',
    aliases: ['deafenallvc', 'serverdeafenall'],
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
        const members = voiceChannel.members.filter(m => !m.user.bot && !m.voice.serverDeaf);

        if (members.size === 0) {
            const container = buildErrorResponse('No Members', 'No undeafened members found in your voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let deafened = 0;
        for (const [, member] of members) {
            try {
                await member.voice.setDeaf(true);
                deafened++;
            } catch (error) {
                // Skip members we can't deafen
            }
        }

        const container = buildSuccessResponse(
            'Voice Deafen All Complete',
            `Successfully deafened **${deafened}/${members.size}** members.`,
            { 'Channel': voiceChannel.name, 'Deafened': `${deafened}/${members.size}`, 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
