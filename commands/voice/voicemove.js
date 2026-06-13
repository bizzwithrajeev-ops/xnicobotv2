const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, COLORS } = require('../../utils/responseBuilder');

module.exports = {
    name: 'voicemove',
    prefix: 'voicemove',
    description: 'Move users between voice channels',
    usage: 'voicemove <source|all> <#destination>',
    category: 'voice',
    aliases: ['vmove', 'movevc'],
    permissions: ['MoveMembers'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.MoveMembers)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Move Members** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (args.length < 2) {
            let content = `# <:History:1473037847568318605> Voice Move\n\n`;
            content += `**Usage:** \`voicemove <source> <destination>\`\n\n`;
            content += `### Examples\n`;
            content += `> \`voicemove all #General\` - Move all users to General\n`;
            content += `> \`voicemove #AFK #General\` - Move users from AFK to General\n\n`;
            content += `**Note:** Use channel mentions or 'all' for source`;

            const container = new ContainerBuilder()
                .setAccentColor(COLORS.INFO)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const sourceArg = args[0].toLowerCase();
        const destinationChannel = message.mentions.channels.last() || message.guild.channels.cache.get(args[1]);

        if (!destinationChannel ||
            (destinationChannel.type !== ChannelType.GuildVoice &&
             destinationChannel.type !== ChannelType.GuildStageVoice)) {
            const container = buildErrorResponse('Invalid Channel', 'Please provide a valid destination voice channel.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let members = [];
        let sourceName = 'all channels';

        if (sourceArg === 'all') {
            message.guild.channels.cache
                .filter(ch => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)
                .forEach(ch => {
                    ch.members.forEach(member => members.push(member));
                });
        } else {
            const sourceChannel = message.mentions.channels.first();
            if (!sourceChannel ||
                (sourceChannel.type !== ChannelType.GuildVoice &&
                 sourceChannel.type !== ChannelType.GuildStageVoice)) {
                const container = buildErrorResponse('Invalid Source', 'Please provide a valid source voice channel.');
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
            members = Array.from(sourceChannel.members.values());
            sourceName = sourceChannel.name;
        }

        if (members.length === 0) {
            const container = buildErrorResponse('No Members', 'No members found in the source channel(s).');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let moved = 0;
        for (const member of members) {
            try {
                await member.voice.setChannel(destinationChannel);
                moved++;
            } catch (err) {
                // Skip members we can't move
            }
        }

        const container = buildSuccessResponse(
            'Voice Move Complete',
            `Successfully moved **${moved}/${members.length}** members.`,
            { 'From': sourceName, 'To': destinationChannel.name, 'Moved': `${moved}/${members.length}`, 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
