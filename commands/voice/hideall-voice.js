'use strict';

const { ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse } = require('../../utils/responseBuilder');

module.exports = {
    name: 'hideall-voice',
    prefix: 'hideall-voice',
    description: 'Hide all voice channels from a role (default: @everyone)',
    usage: 'hideall-voice [@role]',
    category: 'voice',
    aliases: ['hidevc', 'hideallvc'],
    permissions: ['ManageChannels'],

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const container = buildErrorResponse('Missing Permission', 'You need the **Manage Channels** permission.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // Resolve target role — mention, ID, or default to @everyone
        let targetRole = message.mentions.roles.first();
        if (!targetRole && args[0]) {
            const id = args[0].replace(/[<@&>]/g, '');
            if (/^\d{17,20}$/.test(id)) targetRole = message.guild.roles.cache.get(id);
        }
        const roleId = targetRole?.id || message.guild.id;
        const roleName = targetRole?.name || '@everyone';

        const voiceChannels = message.guild.channels.cache.filter(c =>
            c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
        );

        if (voiceChannels.size === 0) {
            const container = buildErrorResponse('No Channels', 'No voice channels found in this server.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let hidden = 0;
        for (const [, channel] of voiceChannels) {
            try {
                await channel.permissionOverwrites.edit(roleId, { ViewChannel: false });
                hidden++;
            } catch {
                // Skip channels we can't modify
            }
        }

        const container = buildSuccessResponse(
            'Voice Channels Hidden',
            `Successfully hidden **${hidden}/${voiceChannels.size}** voice channels from **${roleName}**.`,
            { 'Hidden': `${hidden}/${voiceChannels.size}`, 'Role': roleName, 'Effect': 'Cannot see channels', 'Moderator': message.author.username }
        );
        container.setAccentColor(0x5865F2);

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
