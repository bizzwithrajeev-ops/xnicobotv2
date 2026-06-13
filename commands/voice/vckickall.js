const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vckickall',
    prefix: 'vckickall',
    description: 'Kick all members from your current voice channel',
    usage: 'vckickall',
    category: 'voice',
    aliases: ['kickallvc', 'disconnectall'],
    permissions: ['MoveMembers'],
    
    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const channel = message.member.voice.channel;
        if (!channel) {
            const container = buildErrorResponse('Not in Voice', 'You must be in a voice channel to use this command.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const members = channel.members.filter(m => m.id !== message.author.id);
        if (members.size === 0) {
            const container = buildErrorResponse('No Members', 'There are no other members in your voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let content = `# <:History:1473037847568318605> Voice Kick All\n\n`;
        content += `**Channel:** ${channel.name}\n`;
        content += `**Members:** ${members.size}\n\n`;
        content += `<:Lightning:1473038797540298792> Kicking all members...`;

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.WARNING)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

        const msg = await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });

        let count = 0;
        for (const [, member] of members) {
            try {
                await member.voice.disconnect();
                count++;
            } catch (err) {
                // Skip members we can't kick
            }
        }

        const successContainer = buildSuccessResponse(
            'Voice Kick Complete',
            `Successfully kicked **${count}/${members.size}** members.`,
            { 'Channel': channel.name, 'Kicked': `${count}/${members.size}`, 'Moderator': message.author.username }
        );
        successContainer.setAccentColor(0x57F287);
        successContainer.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        msg.edit({ components: [successContainer], flags: MessageFlags.IsComponentsV2 });
    }
};
