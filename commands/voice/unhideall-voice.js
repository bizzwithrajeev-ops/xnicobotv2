'use strict';

const { ChannelType, PermissionFlagsBits, MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } = require('discord.js');
const { buildErrorResponse, buildSuccessResponse, BRANDING } = require('../../utils/responseBuilder');

module.exports = {
    name: 'unhideall-voice',
    prefix: 'unhideall-voice',
    description: 'Unhide all voice channels for a role (default: @everyone)',
    usage: 'unhideall-voice [@role]',
    category: 'voice',
    aliases: ['unhidevc', 'unhideallvc'],
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

        let unhidden = 0;
        for (const [, channel] of voiceChannels) {
            try {
                await channel.permissionOverwrites.edit(roleId, { ViewChannel: null });
                unhidden++;
            } catch {
                // Skip channels we can't modify
            }
        }

        const container = buildSuccessResponse(
            'Voice Channels Unhidden',
            `Successfully unhidden **${unhidden}/${voiceChannels.size}** voice channels for **${roleName}**.`,
            { 'Unhidden': `${unhidden}/${voiceChannels.size}`, 'Role': roleName, 'Effect': 'Can see channels again', 'Moderator': message.author.username }
        );
        container.setAccentColor(0x57F287);
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(BRANDING));

        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
