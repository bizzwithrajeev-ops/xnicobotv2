'use strict';

const { ChannelType, PermissionFlagsBits, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse } = require('../../utils/responseBuilder');

module.exports = {
    name: 'lockall-voice',
    prefix: 'lockall-voice',
    description: 'Lock all voice channels for a role (default: @everyone)',
    usage: 'lockall-voice [@role]',
    category: 'voice',
    aliases: ['lockvc', 'lockallvc'],
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
        const roleId = targetRole?.id || message.guild.id; // guild.id = @everyone
        const roleName = targetRole?.name || '@everyone';

        const voiceChannels = message.guild.channels.cache.filter(c =>
            c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice
        );

        if (voiceChannels.size === 0) {
            const container = buildErrorResponse('No Channels', 'No voice channels found in this server.');
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let locked = 0;
        for (const [, channel] of voiceChannels) {
            try {
                await channel.permissionOverwrites.edit(roleId, { Connect: false });
                locked++;
            } catch {
                // Skip channels we can't modify
            }
        }

        const container = buildSuccessResponse(
            'Voice Channels Locked',
            `Successfully locked **${locked}/${voiceChannels.size}** voice channels for **${roleName}**.`,
            { 'Locked': `${locked}/${voiceChannels.size}`, 'Role': roleName, 'Effect': 'Cannot connect', 'Moderator': message.author.username }
        );
        container.setAccentColor(0xED4245);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
