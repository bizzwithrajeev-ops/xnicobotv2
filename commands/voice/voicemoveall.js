const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, buildInvalidUsage } = require('../../utils/responseBuilder');

module.exports = {
    name: 'voicemoveall',
    prefix: 'voicemoveall',
    description: 'Move all members from every voice channel to one destination',
    usage: 'voicemoveall <#destination>',
    category: 'voice',
    aliases: ['vmoveall', 'moveallvc'],
    permissions: ['MoveMembers'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            const container = buildInvalidUsage('voicemoveall', 'voicemoveall <#destination>', [
                'voicemoveall #General',
                'voicemoveall #Meeting'
            ]);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const destination = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);

        if (!destination || (destination.type !== ChannelType.GuildVoice && destination.type !== ChannelType.GuildStageVoice)) {
            const container = buildErrorResponse('Invalid Channel', 'Please mention a valid voice channel as the destination.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const allMembers = [];
        message.guild.channels.cache
            .filter(ch => (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) && ch.id !== destination.id)
            .forEach(ch => ch.members.forEach(m => allMembers.push(m)));

        if (allMembers.length === 0) {
            const container = buildErrorResponse('No Members', 'No members found in any voice channels to move.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let moved = 0, failed = 0;
        for (const member of allMembers) {
            try {
                await member.voice.setChannel(destination);
                moved++;
            } catch {
                failed++;
            }
        }

        const container = buildSuccessResponse(
            'Voice Move All Complete',
            `Moved all voice members to **${destination.name}**.`,
            {
                'Destination': `#${destination.name}`,
                'Moved': `${moved}/${allMembers.length}`,
                ...(failed ? { 'Failed': `${failed}` } : {}),
                'Moderator': message.author.username
            }
        );
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
