'use strict';

/**
 * channelinfo.js — prefix-only.
 * Displays metadata for the mentioned channel or the channel the
 * message was sent in.
 */

const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ChannelType, MessageFlags } = require('discord.js');

const CHANNEL_TYPES = {
    [ChannelType.GuildText]:         'Text Channel',
    [ChannelType.GuildVoice]:        'Voice Channel',
    [ChannelType.GuildCategory]:     'Category',
    [ChannelType.GuildAnnouncement]: 'Announcement Channel',
    [ChannelType.GuildStageVoice]:   'Stage Channel',
    [ChannelType.GuildForum]:        'Forum Channel'
};

function buildChannelInfo(channel) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# <:Pin:1473038806612447500> Channel Information: #${channel.name}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:Fileuser:1473039570630348810> **Channel ID:** \`${channel.id}\`\n` +
                `<:Copy:1473039575302803629> **Type:** ${CHANNEL_TYPES[channel.type] || 'Unknown'}\n` +
                `<:Clock:1473039102113878056> **Created:** <t:${Math.floor(channel.createdTimestamp / 1000)}:R>` +
                (channel.parent ? `\n<:Folderopen:1473039552783323348> **Category:** ${channel.parent.name}` : '')
            )
        );

    if (channel.type === ChannelType.GuildText) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:Edit:1473037903625191580> Text Channel Settings\n` +
                `<:Edit:1473037903625191580> **Topic:** ${channel.topic || 'No topic set'}\n` +
                `<:Commentblock:1473370739351490794> **NSFW:** ${channel.nsfw ? 'Yes' : 'No'}\n` +
                `<:Timer:1473039056710406204> **Slowmode:** ${channel.rateLimitPerUser ? `${channel.rateLimitPerUser}s` : 'Disabled'}`
            )
        );
    }

    if (channel.type === ChannelType.GuildVoice) {
        container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:Volumeup:1473039290136002844> Voice Channel Settings\n` +
                `<:User:1473038971398520977> **User Limit:** ${channel.userLimit || 'Unlimited'}\n` +
                `<:Volumeup:1473039290136002844> **Bitrate:** ${channel.bitrate / 1000}kbps\n` +
                `<:User:1473038971398520977> **Connected:** ${channel.members.size}`
            )
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# xNico </>`));

    return container;
}

module.exports = {
    name: 'channelinfo',
    prefix: 'channelinfo',
    aliases: ['channel-info', 'cinfo'],
    description: 'Display information about a channel',
    usage: 'channelinfo [#channel]',
    category: 'basic',

    async executePrefix(message) {
        try {
            const channel = message.mentions.channels.first() || message.channel;
            const container = buildChannelInfo(channel);
            await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        } catch (error) {
            console.error('[channelinfo]', error);
            await message.reply('<:Cancel:1473037949187657818> An error occurred while running this command.').catch(() => {});
        }
    }
};
