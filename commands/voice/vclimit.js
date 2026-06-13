const { ContainerBuilder, TextDisplayBuilder, MessageFlags, PermissionFlagsBits, ChannelType, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, buildInvalidUsage } = require('../../utils/responseBuilder');

module.exports = {
    name: 'vclimit',
    prefix: 'vclimit',
    description: 'Set the user limit on a voice channel',
    usage: 'vclimit <limit> [#channel]',
    category: 'voice',
    aliases: ['voicelimit', 'setlimit'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        if (!args.length) {
            const container = buildInvalidUsage('vclimit', 'vclimit <limit> [#channel]', [
                'vclimit 10',
                'vclimit 5 #Gaming',
                'vclimit 0 — Removes the limit'
            ]);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        const limit = parseInt(args[0]);
        if (isNaN(limit) || limit < 0 || limit > 99) {
            const container = buildErrorResponse('Invalid Limit', 'User limit must be a number between **0** and **99**.\nUse `0` to remove the limit.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Use mentioned channel, or user's current voice channel
        const channel = message.mentions.channels.first() ||
            (args[1] ? message.guild.channels.cache.get(args[1]) : null) ||
            message.member.voice?.channel;

        if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            const container = buildErrorResponse('No Voice Channel', 'Mention a voice channel or join one to set the limit.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            await channel.setUserLimit(limit);

            const container = buildSuccessResponse(
                'User Limit Updated',
                limit === 0
                    ? `Removed user limit from **${channel.name}**.`
                    : `Set user limit to **${limit}** in **${channel.name}**.`,
                {
                    'Channel': `#${channel.name}`,
                    'Limit': limit === 0 ? 'Unlimited' : `${limit} users`,
                    'Current Members': `${channel.members.size}`,
                    'Moderator': message.author.username
                }
            );
            container.setAccentColor(0x57F287);
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

            message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (err) {
            const container = buildErrorResponse('Failed', `Could not update user limit: ${err.message}`);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }
    }
};
